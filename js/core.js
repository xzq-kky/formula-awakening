/* ============================================================
   core.js · 基础能力
   职责：全局命名空间、本地存储、提示条、剪贴板、通用工具
   ============================================================ */
window.FA = window.FA || {};

(function (FA) {
  'use strict';

  /* ---------------- 常量 ---------------- */
  var LS = {
    APP_ID: 'fa_textin_app_id_v1',
    SECRET: 'fa_textin_secret_v1',
    LIB: 'fa_formula_lib_v1',
    PROOFS: 'fa_proofs_v1',
    THEME: 'fa_theme_v1'
  };

  /* ---------------- 本地存储 ---------------- */
  function lsGet(key, def) {
    try {
      var raw = localStorage.getItem(key);
      return raw === null ? def : JSON.parse(raw);
    } catch (e) {
      return def;
    }
  }

  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 隐私模式下静默失败 */ }
  }

  function lsDel(key) {
    try { localStorage.removeItem(key); } catch (e) { /* 忽略 */ }
  }

  /* ---------------- 提示条 ---------------- */
  var toastTimer = null;

  function toast(message, type) {
    var el = document.getElementById('toast');
    var txt = document.getElementById('toastText');
    if (!el || !txt) return;
    txt.textContent = message;
    el.setAttribute('data-type', type === 'error' ? 'error' : 'ok');
    el.classList.add('is-show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-show'); }, 1900);
  }

  /* ---------------- 剪贴板 ---------------- */
  function copyPlain(text) {
    if (!text) return Promise.resolve(false);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text)
        .then(function () { return true; })
        .catch(function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  /* 以 text/html 写入剪贴板 —— Word 会按 MathML 解析成原生公式 */
  function copyRich(html, plain) {
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      try {
        var item = new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' })
        });
        return navigator.clipboard.write([item])
          .then(function () { return true; })
          .catch(function () { return copyPlain(plain); });
      } catch (e) {
        return copyPlain(plain);
      }
    }
    return copyPlain(plain);
  }

  /* ---------------- 通用工具 ---------------- */
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatBytes(n) {
    if (!n && n !== 0) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  function formatTime(ts) {
    var d = new Date(ts);
    function p(x) { return x < 10 ? '0' + x : '' + x; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
      p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
  }

  /* ---------------- 安全渲染 KaTeX ---------------- */
  function renderMath(tex, displayMode) {
    if (typeof window.katex === 'undefined') {
      return '<code>' + escapeHtml(tex) + '</code>';
    }
    try {
      return window.katex.renderToString(tex, {
        displayMode: !!displayMode,
        throwOnError: false,
        strict: false,
        trust: false,
        output: 'html'
      });
    } catch (e) {
      return '<code>' + escapeHtml(tex) + '</code>';
    }
  }

  function renderMathML(tex, displayMode) {
    if (typeof window.katex === 'undefined') return '';
    try {
      return window.katex.renderToString(tex, {
        displayMode: !!displayMode,
        throwOnError: false,
        strict: false,
        output: 'mathml'
      });
    } catch (e) {
      return '';
    }
  }

  FA.LS = LS;
  FA.lsGet = lsGet;
  FA.lsSet = lsSet;
  FA.lsDel = lsDel;
  FA.toast = toast;
  FA.copyPlain = copyPlain;
  FA.copyRich = copyRich;
  FA.escapeHtml = escapeHtml;
  FA.formatBytes = formatBytes;
  FA.formatTime = formatTime;
  FA.download = download;
  FA.renderMath = renderMath;
  FA.renderMathML = renderMathML;

})(window.FA);
