/* ============================================================
   main.js · 主流程
   职责：初始化、文件投递、解析编排、视图切换、密钥管理、调用凭证
   ============================================================ */
window.FA = window.FA || {};

(function (FA) {
  'use strict';

  var app = {
    file: null,
    result: null,
    analysis: null,
    parsing: false
  };

  var el = {};

  /* ---------------- 启动 ---------------- */
  function boot() {
    el = {
      dropzone: document.getElementById('dropzone'),
      fileInput: document.getElementById('fileInput'),
      dropzoneText: document.getElementById('dropzoneText'),
      fileCard: document.getElementById('fileCard'),
      fileName: document.getElementById('fileName'),
      fileMeta: document.getElementById('fileMeta'),
      progress: document.getElementById('progress'),
      progressBar: document.getElementById('progressBar'),
      btnParse: document.getElementById('btnParse'),
      btnDemo: document.getElementById('btnDemo'),
      keyChip: document.getElementById('keyChip'),
      keyChipText: document.getElementById('keyChipText'),
      tabs: document.getElementById('resultTabs')
    };

    FA.ui.init();
    FA.editor.init();

    bindUpload();
    bindTabs();
    bindSettings();
    bindProof();
    bindToolbar();

    refreshKeyChip();
    FA.ui.resetMetrics();
    FA.ui.renderProofs(FA.lsGet(FA.LS.PROOFS, []));

    if (!FA.xparse.hasKey()) {
      FA.ui.showAlert('info', '还没有连接 TextIn xParse。点击右上角「API 设置」填入 app_id 与 secret_code 即可开始；密钥只保存在本机浏览器。');
    }
  }

  /* ---------------- 上传 ---------------- */
  function bindUpload() {
    el.dropzone.addEventListener('click', function () { el.fileInput.click(); });

    el.fileInput.addEventListener('change', function () {
      if (el.fileInput.files && el.fileInput.files[0]) acceptFile(el.fileInput.files[0]);
    });

    ['dragenter', 'dragover'].forEach(function (evt) {
      el.dropzone.addEventListener(evt, function (e) {
        e.preventDefault();
        el.dropzone.classList.add('is-over');
      });
    });

    ['dragleave', 'drop'].forEach(function (evt) {
      el.dropzone.addEventListener(evt, function (e) {
        e.preventDefault();
        el.dropzone.classList.remove('is-over');
      });
    });

    el.dropzone.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) acceptFile(f);
    });

    el.btnParse.addEventListener('click', startParse);
    el.btnDemo.addEventListener('click', loadDemo);
  }

  /* ---------------- 示例结果（无需 API Key） ---------------- */
  function loadDemo() {
    if (el.btnDemo.disabled) return;
    el.btnDemo.disabled = true;
    el.btnDemo.textContent = '正在载入示例…';

    fetch('samples/xparse-result.json').then(function (res) {
      if (!res.ok) throw new Error('示例文件读取失败（HTTP ' + res.status + '）');
      return res.json();
    }).then(function (json) {
      if (!json || json.code !== 200 || !json.data) throw new Error('示例数据格式不正确');

      var meta = json.data.metadata || {};
      var result = {
        data: json.data,
        elapsedMs: null,
        requestId: json.x_request_id || '',
        endpoint: FA.xparse.ENDPOINT,
        requestConfig: null,
        finishedAt: null
      };
      var file = {
        name: meta.filename || '高等数学-期中试卷.pdf',
        size: 72052
      };

      var analysis = FA.formulas.analyze(json.data);
      app.result = result;
      app.analysis = analysis;
      app.file = file;

      FA.ui.renderMetrics(analysis.stats, null);
      FA.ui.renderDocInfo(result, file);
      FA.ui.renderFormulaList(analysis.items);
      FA.ui.renderMarkdown(analysis.markdown);
      FA.ui.renderElementTree(analysis.elements);

      if (analysis.items.length) FA.editor.load(analysis.items[0]);

      FA.ui.showAlert('ok', '这是内置示例：一份真实调用 TextIn xParse 解析过的两页《高等数学》期中试卷，' +
        '共唤醒 ' + analysis.items.length + ' 条公式。所有数据来自真实接口响应，未做任何改写；' +
        '配置自己的 API Key 后即可解析你自己的文档。');
    }).catch(function (err) {
      FA.ui.showAlert('error', '示例数据加载失败：' + FA.escapeHtml(err.message || '未知错误'));
    }).then(function () {
      el.btnDemo.disabled = false;
      el.btnDemo.textContent = '载入示例结果（无需 API Key）';
    });
  }

  function acceptFile(file) {
    if (file.size > 500 * 1024 * 1024) {
      FA.ui.showAlert('error', '文件超过 TextIn xParse 的 500MB 上限，请拆分后再试。');
      return;
    }
    app.file = file;
    FA.ui.hideAlert();
    el.fileName.textContent = file.name;
    el.fileMeta.textContent = FA.formatBytes(file.size) + ' · ' + (file.type || '未知类型');
    el.fileCard.hidden = false;
    el.btnParse.disabled = false;
    el.btnParse.textContent = '开始解析并唤醒公式';
  }

  /* ---------------- 解析 ---------------- */
  function startParse() {
    if (app.parsing) return;
    if (!app.file) return FA.toast('请先选择一份文档', 'error');
    if (!FA.xparse.hasKey()) {
      FA.ui.showAlert('error', '还没有配置 API Key，无法调用 TextIn xParse。请点击右上角「API 设置」填写。');
      openModal('settingsModal');
      return;
    }

    app.parsing = true;
    el.btnParse.disabled = true;
    el.btnParse.textContent = '正在解析…';
    el.progress.hidden = false;
    el.progressBar.style.width = '6%';
    FA.ui.hideAlert();

    FA.xparse.parseFile(app.file, {
      onProgress: function (p) { el.progressBar.style.width = p + '%'; }
    }).then(function (result) {
      app.result = result;
      onParsed(result);
    }).catch(function (err) {
      onParseFailed(err);
    }).then(function () {
      app.parsing = false;
      el.btnParse.disabled = false;
      el.btnParse.textContent = '开始解析并唤醒公式';
      setTimeout(function () {
        el.progress.hidden = true;
        el.progressBar.style.width = '0';
      }, 700);
    });
  }

  function onParsed(result) {
    var analysis = FA.formulas.analyze(result.data);
    app.analysis = analysis;

    FA.ui.renderMetrics(analysis.stats, result.elapsedMs);
    FA.ui.renderDocInfo(result, app.file);
    FA.ui.renderFormulaList(analysis.items);
    FA.ui.renderMarkdown(analysis.markdown);
    FA.ui.renderElementTree(analysis.elements);

    if (analysis.items.length) {
      FA.editor.load(analysis.items[0]);
      FA.ui.showAlert('ok', '解析完成：' + (result.data.success_count || 0) + ' 页成功，唤醒 ' +
        analysis.items.length + ' 条公式（独立 ' + analysis.stats.display + ' · 行内 ' +
        analysis.stats.inline + ' · 表格 ' + analysis.stats.table + '）。已自动载入第 1 条到编辑器。');
    } else {
      FA.ui.showAlert('info', '解析完成，但这份文档里没有识别到公式。可以换一份含公式的试卷或教材页试试。');
    }

    recordProof(result, analysis);
  }

  function onParseFailed(err) {
    var msg = err && err.message ? err.message : '解析失败';
    if (msg === 'NO_KEY') msg = '还没有配置 API Key。';
    FA.ui.showAlert('error', FA.escapeHtml(msg) + (err && err.code ? '（错误码 ' + err.code + '）' : ''));
    FA.toast('解析失败', 'error');
  }

  /* ---------------- 调用凭证 ---------------- */
  function recordProof(result, analysis) {
    var data = result.data || {};
    var meta = data.metadata || {};
    var proofs = FA.lsGet(FA.LS.PROOFS, []);

    proofs.unshift({
      time: result.finishedAt,
      filename: meta.filename || (app.file && app.file.name) || '',
      fileSize: app.file ? app.file.size : 0,
      pageCount: meta.page_count || 0,
      successCount: data.success_count || 0,
      fileId: data.file_id || '',
      jobId: data.job_id || '',
      requestId: result.requestId || '',
      schemaVersion: data.schema_version || '',
      formulaCount: analysis.items.length,
      formulaBySource: analysis.stats,
      elapsedMs: result.elapsedMs,
      endpoint: result.endpoint,
      requestConfig: result.requestConfig,
      engine: 'TextIn xParse · parse/sync'
    });

    proofs = proofs.slice(0, 30);
    FA.lsSet(FA.LS.PROOFS, proofs);
    FA.ui.renderProofs(proofs);
  }

  function bindProof() {
    document.getElementById('btnProof').addEventListener('click', function () {
      var proofs = FA.lsGet(FA.LS.PROOFS, []);
      FA.ui.renderProofs(proofs);
      openModal('proofModal');
    });

    document.getElementById('btnExportProof').addEventListener('click', function () {
      var proofs = FA.lsGet(FA.LS.PROOFS, []);
      if (!proofs.length) return FA.toast('还没有调用记录', 'error');
      var payload = {
        project: '公式觉醒工作台 Formula Awakening Workbench',
        competition: 'TextIn xParse「文档觉醒」AI 应用创新赛 · 实用价值赛道',
        service: 'TextIn xParse 智能文档解析（parse/sync）',
        endpoint: FA.xparse.ENDPOINT,
        exportedAt: FA.formatTime(Date.now()),
        totalCalls: proofs.length,
        records: proofs
      };
      FA.download('textin-xparse-调用凭证.json', JSON.stringify(payload, null, 2), 'application/json');
      FA.toast('凭证已导出');
    });
  }

  /* ---------------- 视图切换 ---------------- */
  function bindTabs() {
    el.tabs.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab');
      if (!btn) return;
      var view = btn.dataset.view;

      Array.prototype.forEach.call(el.tabs.querySelectorAll('.tab'), function (t) {
        t.classList.toggle('is-active', t === btn);
      });
      ['formulas', 'markdown', 'elements'].forEach(function (v) {
        document.getElementById('pane-' + v).classList.toggle('is-active', v === view);
      });
    });
  }

  /* ---------------- 工具条 ---------------- */
  function bindToolbar() {
    document.getElementById('formulaFilter').addEventListener('input', function (e) {
      FA.ui.setFilter(e.target.value);
    });

    document.getElementById('formulaSource').addEventListener('change', function (e) {
      FA.ui.setSource(e.target.value);
    });

    document.getElementById('btnExportAll').addEventListener('click', function () {
      if (!app.analysis || !app.analysis.items.length) return FA.toast('还没有公式可导出', 'error');
      var lines = [];
      lines.push('% 公式觉醒工作台 · 由 TextIn xParse 解析导出');
      lines.push('% 文档：' + ((app.result && app.result.data.metadata && app.result.data.metadata.filename) || (app.file && app.file.name) || ''));
      lines.push('% 时间：' + FA.formatTime(Date.now()));
      lines.push('');
      app.analysis.items.forEach(function (it) {
        lines.push('% [' + it.index + '] ' + FA.editor.sourceLabel(it.source) +
          (it.page ? ' · p' + it.page : ''));
        lines.push(it.displayMode ? '$$' + it.tex + '$$' : '$' + it.tex + '$');
        lines.push('');
      });
      FA.download('awakened-formulas.tex', lines.join('\n'), 'text/plain;charset=utf-8');
      FA.toast('已导出 ' + app.analysis.items.length + ' 条公式');
    });
  }

  /* ---------------- 密钥设置 ---------------- */
  function bindSettings() {
    document.getElementById('btnSettings').addEventListener('click', function () {
      var key = FA.xparse.readKey();
      document.getElementById('inAppId').value = key.appId || '';
      document.getElementById('inSecret').value = key.secret || '';
      document.getElementById('keyAlert').hidden = true;
      openModal('settingsModal');
    });

    document.getElementById('btnSaveKey').addEventListener('click', function () {
      var appId = document.getElementById('inAppId').value.trim();
      var secret = document.getElementById('inSecret').value.trim();
      var box = document.getElementById('keyAlert');
      var btn = document.getElementById('btnSaveKey');

      if (!appId || !secret) {
        box.hidden = false;
        box.setAttribute('data-type', 'error');
        box.textContent = 'app_id 与 secret_code 都要填写。';
        return;
      }

      FA.lsSet(FA.LS.APP_ID, appId);
      FA.lsSet(FA.LS.SECRET, secret);
      refreshKeyChip();

      btn.disabled = true;
      btn.textContent = '正在测试…';
      box.hidden = false;
      box.setAttribute('data-type', 'info');
      box.textContent = '正在用这对密钥向 TextIn 发送一次无文件的校验请求（不计费）…';

      FA.xparse.verifyKey().then(function (r) {
        box.setAttribute('data-type', 'ok');
        box.textContent = '密钥已通过校验并保存。服务端返回：' + (r.message || '参数校验通过') +
          (r.requestId ? '（x_request_id: ' + r.requestId + '）' : '');
        FA.toast('密钥校验通过');
        FA.ui.hideAlert();
      }).catch(function (err) {
        box.setAttribute('data-type', 'error');
        box.textContent = err.message || '校验失败';
        FA.toast('密钥校验失败', 'error');
      }).then(function () {
        btn.disabled = false;
        btn.textContent = '保存并测试连接';
      });
    });

    document.getElementById('btnClearKey').addEventListener('click', function () {
      FA.lsDel(FA.LS.APP_ID);
      FA.lsDel(FA.LS.SECRET);
      document.getElementById('inAppId').value = '';
      document.getElementById('inSecret').value = '';
      refreshKeyChip();
      FA.toast('已清除本机密钥');
    });

    /* 弹层关闭 */
    document.querySelectorAll('[data-close]').forEach(function (btn) {
      btn.addEventListener('click', function () { closeModal(btn.dataset.close); });
    });
    document.querySelectorAll('.modal').forEach(function (m) {
      m.addEventListener('click', function (e) {
        if (e.target === m) closeModal(m.id);
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeModal('settingsModal');
        closeModal('proofModal');
      }
    });
  }

  function refreshKeyChip() {
    var has = FA.xparse.hasKey();
    el.keyChip.setAttribute('data-state', has ? 'on' : 'off');
    el.keyChipText.textContent = has ? 'TextIn 已连接' : '未配置 API Key';
  }

  /* ---------------- 弹层 ---------------- */
  function openModal(id) {
    var m = document.getElementById(id);
    if (m) m.hidden = false;
  }

  function closeModal(id) {
    var m = document.getElementById(id);
    if (m) m.hidden = true;
  }

  /* 暴露给自测脚本 */
  FA.app = app;
  FA.openModal = openModal;
  FA.closeModal = closeModal;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window.FA);
