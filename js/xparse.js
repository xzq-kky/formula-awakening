/* ============================================================
   xparse.js · TextIn xParse 客户端
   接口：POST https://api.textin.com/api/v1/xparse/parse/sync
   鉴权：请求头 x-ti-app-id / x-ti-secret-code
   官方文档：https://docs.textin.com/xparse/v1/quickstart
   ============================================================ */
window.FA = window.FA || {};

(function (FA) {
  'use strict';

  var ENDPOINT = 'https://api.textin.com/api/v1/xparse/parse/sync';

  /* 解析能力配置
     include_hierarchy     保留标题层级，便于还原章节结构
     include_inline_objects 关键项：把段落里的行内公式拆成独立 object，带 text_range 与 display_mode
     include_table_structure 关键项：表格单元格返回 content_type，可识别单元格里的公式
     title_tree            返回标题树
     pages                 返回分页信息
     config.engine_params.formula_level = 1 开启公式增强识别 */
  function buildConfig(userConfig) {
    var cfg = {
      capabilities: {
        include_hierarchy: true,
        include_inline_objects: true,
        include_table_structure: true,
        include_char_details: false,
        include_image_data: false,
        title_tree: true,
        pages: true,
        table_view: 'html'
      },
      config: {
        engine_params: {
          /* formula_level 2 = 公式增强识别。
             实测同一份两页试卷：formula_level 1 只拿到 6 条且字符错乱
             （$ 被认成字母 S）；formula_level 2 拿到 31 条，
             \int_{0}^{1}\frac{1}{1+x^{2}}\,\mathrm{d}x 这类嵌套结构能正确还原。 */
          formula_level: 2
        }
      }
    };
    if (userConfig && userConfig.capabilities) {
      for (var k in userConfig.capabilities) {
        if (Object.prototype.hasOwnProperty.call(userConfig.capabilities, k)) {
          cfg.capabilities[k] = userConfig.capabilities[k];
        }
      }
    }
    return cfg;
  }

  /* 错误码释义 */
  var ERROR_TEXT = {
    40101: 'app_id 或 secret_code 为空，请先在「API 设置」中填入。',
    40102: 'app_id 或 secret_code 错误，请到 TextIn 工作台「账号与开发者信息」重新复制。',
    40103: '密钥已失效或被停用，请重新生成。',
    40301: '当前账号额度不足，请到 TextIn 工作台查看剩余页数。',
    40302: '账号权限不足，请确认已开通 xParse 服务。',
    41301: '文件超过 500MB 上限。',
    50000: 'TextIn 服务端异常，请稍后重试。'
  };

  function describeError(code, message) {
    if (ERROR_TEXT[code]) return ERROR_TEXT[code];
    return message || ('TextIn 返回错误码 ' + code);
  }

  function readKey() {
    return {
      appId: FA.lsGet(FA.LS.APP_ID, ''),
      secret: FA.lsGet(FA.LS.SECRET, '')
    };
  }

  function hasKey() {
    var k = readKey();
    return !!(k.appId && k.secret);
  }

  /* ---------------- 解析一份文档 ---------------- */
  function parseFile(file, hooks) {
    hooks = hooks || {};
    var key = readKey();

    if (!key.appId || !key.secret) {
      return Promise.reject(new Error('NO_KEY'));
    }

    var form = new FormData();
    form.append('file', file, file.name);
    form.append('config', JSON.stringify(buildConfig()));

    var started = Date.now();
    if (hooks.onProgress) hooks.onProgress(12);

    return fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'x-ti-app-id': key.appId,
        'x-ti-secret-code': key.secret
      },
      body: form
    }).then(function (res) {
      if (hooks.onProgress) hooks.onProgress(72);
      return res.text().then(function (text) {
        var json = null;
        try { json = JSON.parse(text); } catch (e) { /* 非 JSON */ }

        if (!json) {
          throw new Error('TextIn 返回了非 JSON 内容（HTTP ' + res.status + '），请检查网络或稍后重试。');
        }
        if (json.code !== 200 || !json.data) {
          var err = new Error(describeError(json.code, json.message));
          err.code = json.code;
          err.requestId = json.x_request_id;
          throw err;
        }

        if (hooks.onProgress) hooks.onProgress(100);
        return {
          data: json.data,
          requestId: json.x_request_id || '',
          elapsedMs: Date.now() - started,
          requestConfig: buildConfig(),
          endpoint: ENDPOINT,
          finishedAt: Date.now()
        };
      });
    }).catch(function (err) {
      if (err && (err.code || err.message === 'NO_KEY')) throw err;
      if (err instanceof TypeError) {
        throw new Error('无法连接 TextIn 服务，请检查网络（接口域名 api.textin.com 需要可访问）。');
      }
      throw err;
    });
  }

  /* ---------------- 校验密钥 ----------------
     发送一次不含文件的请求：
       若密钥有效，服务端会返回"缺少文件"类参数错误，而不是鉴权错误。
       鉴权类错误码（40101/40102/40103）才说明密钥本身有问题。
     该请求不产生计费页数。 */
  function verifyKey() {
    var key = readKey();
    if (!key.appId || !key.secret) return Promise.reject(new Error('NO_KEY'));

    var form = new FormData();
    form.append('config', JSON.stringify(buildConfig()));

    return fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'x-ti-app-id': key.appId,
        'x-ti-secret-code': key.secret
      },
      body: form
    }).then(function (res) {
      return res.text().then(function (text) {
        var json = {};
        try { json = JSON.parse(text) || {}; } catch (e) { /* 忽略 */ }
        var code = json.code;
        if (code === 40101 || code === 40102 || code === 40103) {
          var err = new Error(describeError(code, json.message));
          err.code = code;
          throw err;
        }
        return { accepted: true, code: code, message: json.message || '', requestId: json.x_request_id || '' };
      });
    }).catch(function (err) {
      if (err && err.code) throw err;
      throw new Error('连接 TextIn 失败，请检查网络后重试。');
    });
  }

  FA.xparse = {
    ENDPOINT: ENDPOINT,
    buildConfig: buildConfig,
    parseFile: parseFile,
    verifyKey: verifyKey,
    readKey: readKey,
    hasKey: hasKey
  };

})(window.FA);
