/* ============================================================
   editor.js · 可视化公式编辑器
   职责：LaTeX 输入、KaTeX 实时预览、快捷结构插入、
         导出 LaTeX / MathML / Word 富文本、公式本
   ============================================================ */
window.FA = window.FA || {};

(function (FA) {
  'use strict';

  /* 快捷结构：{ 按钮文案, 插入片段, 光标回退位数 } */
  var TOOLS = [
    { t: '\\frac', s: '\\frac{}{}', b: 3 },
    { t: 'x²', s: '^{}', b: 1 },
    { t: 'xₙ', s: '_{}', b: 1 },
    { t: '√', s: '\\sqrt{}', b: 1 },
    { t: 'ⁿ√', s: '\\sqrt[n]{}', b: 1 },
    { t: '∫', s: '\\int_{}^{}', b: 5 },
    { t: '∑', s: '\\sum_{}^{}', b: 5 },
    { t: '∏', s: '\\prod_{}^{}', b: 5 },
    { t: 'lim', s: '\\lim_{x \\to }', b: 1 },
    { t: '∂', s: '\\partial ', b: 0 },
    { t: '∇', s: '\\nabla ', b: 0 },
    { t: '()', s: '\\left(\\right)', b: 9 },
    { t: '[]', s: '\\left[\\right]', b: 9 },
    { t: '{}', s: '\\left\\{\\right\\}', b: 9 },
    { t: '|x|', s: '\\left|\\right|', b: 8 },
    { t: '矩阵', s: '\\begin{pmatrix} & \\\\ & \\end{pmatrix}', b: 22 },
    { t: '方程组', s: '\\begin{cases} \\\\ \\end{cases}', b: 18 },
    { t: 'α', s: '\\alpha ', b: 0 },
    { t: 'β', s: '\\beta ', b: 0 },
    { t: 'γ', s: '\\gamma ', b: 0 },
    { t: 'π', s: '\\pi ', b: 0 },
    { t: 'θ', s: '\\theta ', b: 0 },
    { t: 'λ', s: '\\lambda ', b: 0 },
    { t: 'σ', s: '\\sigma ', b: 0 },
    { t: 'ω', s: '\\omega ', b: 0 },
    { t: '≤', s: '\\le ', b: 0 },
    { t: '≥', s: '\\ge ', b: 0 },
    { t: '≠', s: '\\ne ', b: 0 },
    { t: '≈', s: '\\approx ', b: 0 },
    { t: '≡', s: '\\equiv ', b: 0 },
    { t: '∈', s: '\\in ', b: 0 },
    { t: '⊂', s: '\\subset ', b: 0 },
    { t: '∪', s: '\\cup ', b: 0 },
    { t: '∩', s: '\\cap ', b: 0 },
    { t: '∀', s: '\\forall ', b: 0 },
    { t: '∃', s: '\\exists ', b: 0 },
    { t: '→', s: '\\to ', b: 0 },
    { t: '⇒', s: '\\Rightarrow ', b: 0 },
    { t: '∞', s: '\\infty ', b: 0 },
    { t: '·', s: '\\cdot ', b: 0 },
    { t: '×', s: '\\times ', b: 0 },
    { t: '±', s: '\\pm ', b: 0 },
    { t: 'log', s: '\\log ', b: 0 },
    { t: 'ln', s: '\\ln ', b: 0 },
    { t: 'sin', s: '\\sin ', b: 0 },
    { t: 'cos', s: '\\cos ', b: 0 },
    { t: 'tan', s: '\\tan ', b: 0 },
    { t: 'text', s: '\\text{}', b: 1 },
    { t: 'x̄', s: '\\overline{}', b: 1 },
    { t: 'x̂', s: '\\hat{}', b: 1 },
    { t: 'x⃗', s: '\\vec{}', b: 1 }
  ];

  var state = {
    current: null,       // 正在编辑的公式条目
    lib: [],
    timer: null
  };

  var el = {};

  /* ---------------- 初始化 ---------------- */
  function init() {
    el.input = document.getElementById('latexInput');
    el.preview = document.getElementById('latexPreview');
    el.toolbar = document.getElementById('mathTool');
    el.origin = document.getElementById('editorOrigin');
    el.libList = document.getElementById('libList');

    buildToolbar();
    bind();

    state.lib = FA.lsGet(FA.LS.LIB, []);
    renderLib();
    updatePreview();
  }

  function buildToolbar() {
    var frag = document.createDocumentFragment();
    TOOLS.forEach(function (tool) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = tool.t;
      b.title = '插入 ' + tool.s;
      b.addEventListener('click', function () { applyInsert(tool.s, tool.b); });
      frag.appendChild(b);
    });
    el.toolbar.appendChild(frag);
  }

  function bind() {
    el.input.addEventListener('input', function () {
      if (state.timer) clearTimeout(state.timer);
      state.timer = setTimeout(updatePreview, 120);
    });

    el.input.addEventListener('keydown', function (e) {
      /* Ctrl/Cmd + Enter 复制 LaTeX */
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onCopyLatex();
      }
      /* Tab 在空括号之间跳转 */
      if (e.key === 'Tab') {
        var pos = el.input.selectionStart;
        var i = el.input.value.indexOf('{}', pos);
        if (i !== -1) {
          e.preventDefault();
          el.input.setSelectionRange(i + 1, i + 1);
        }
      }
    });

    document.getElementById('btnCopyLatex').addEventListener('click', onCopyLatex);
    document.getElementById('btnCopyMathml').addEventListener('click', onCopyMathml);
    document.getElementById('btnCopyWord').addEventListener('click', onCopyWord);
    document.getElementById('btnSaveLib').addEventListener('click', saveToLib);
    document.getElementById('btnClearLib').addEventListener('click', clearLib);
  }

  /* 把片段插入到光标处；若存在选区则包裹选区 */
  function applyInsert(snippet, back) {
    var input = el.input;
    var start = input.selectionStart;
    var end = input.selectionEnd;
    var value = input.value;
    var selected = value.slice(start, end);

    var text = snippet;
    if (selected && snippet.indexOf('{}') !== -1) {
      text = snippet.replace('{}', selected);
      back = 0;
    }

    input.value = value.slice(0, start) + text + value.slice(end);
    var caret = start + text.length - (back || 0);
    input.focus();
    input.setSelectionRange(caret, caret);
    updatePreview();
  }

  /* ---------------- 预览 ---------------- */
  function updatePreview() {
    var tex = el.input.value.trim();
    if (!tex) {
      el.preview.innerHTML = '<span class="preview__placeholder">公式会在这里渲染</span>';
      return;
    }
    if (typeof window.katex === 'undefined') {
      el.preview.innerHTML = '<span class="preview__error">KaTeX 资源未加载完成，请检查网络后刷新</span>';
      return;
    }
    try {
      window.katex.render(tex, el.preview, {
        displayMode: true,
        throwOnError: true,
        strict: false,
        trust: false
      });
    } catch (err) {
      el.preview.innerHTML = '<span class="preview__error">LaTeX 语法错误：' +
        FA.escapeHtml(err.message || '') + '</span>';
    }
  }

  /* ---------------- 载入一条公式 ---------------- */
  function load(item) {
    state.current = item;
    el.input.value = item.tex;
    el.origin.textContent = '来源：' + sourceLabel(item.source) +
      (item.page ? ' · 第 ' + item.page + ' 页' : '') +
      (item.elementId ? ' · ' + item.elementId : '');
    if (FA.ui && FA.ui.markCurrent && item.index) FA.ui.markCurrent(item.index);
    updatePreview();
    el.input.focus();
    el.input.setSelectionRange(item.tex.length, item.tex.length);
  }

  function sourceLabel(src) {
    return { display: '独立公式', inline: '行内公式', table: '表格内公式', markdown: '全文补全' }[src] || '公式';
  }

  /* ---------------- 导出 ---------------- */
  function currentTex() {
    return el.input.value.trim();
  }

  function onCopyLatex() {
    var tex = currentTex();
    if (!tex) return FA.toast('编辑器里还没有内容', 'error');
    FA.copyPlain(tex).then(function (ok) {
      FA.toast(ok ? '已复制 LaTeX' : '复制失败，请手动选择复制', ok ? 'ok' : 'error');
    });
  }

  function onCopyMathml() {
    var tex = currentTex();
    if (!tex) return FA.toast('编辑器里还没有内容', 'error');
    var mathml = FA.renderMathML(tex, true);
    if (!mathml) return FA.toast('MathML 生成失败，请检查公式语法', 'error');
    FA.copyPlain(mathml).then(function (ok) {
      FA.toast(ok ? '已复制 MathML' : '复制失败', ok ? 'ok' : 'error');
    });
  }

  function onCopyWord() {
    var tex = currentTex();
    if (!tex) return FA.toast('编辑器里还没有内容', 'error');
    var mathml = FA.renderMathML(tex, false);
    if (!mathml) return FA.toast('MathML 生成失败，请检查公式语法', 'error');
    var html = '<p>' + mathml + '</p>';
    FA.copyRich(html, tex).then(function () {
      FA.toast('已复制，可直接粘贴到 Word');
    });
  }

  /* ---------------- 公式本 ---------------- */
  function saveToLib() {
    var tex = currentTex();
    if (!tex) return FA.toast('编辑器里还没有内容', 'error');
    if (state.lib.indexOf(tex) !== -1) return FA.toast('这条公式已经在公式本里了');

    state.lib.unshift(tex);
    if (state.lib.length > 60) state.lib = state.lib.slice(0, 60);
    FA.lsSet(FA.LS.LIB, state.lib);
    renderLib();
    FA.toast('已存入公式本');
  }

  function clearLib() {
    state.lib = [];
    FA.lsSet(FA.LS.LIB, []);
    renderLib();
    FA.toast('公式本已清空');
  }

  function renderLib() {
    if (!state.lib.length) {
      el.libList.innerHTML = '<span class="lib__empty">还没有收藏的公式</span>';
      return;
    }
    var frag = document.createDocumentFragment();
    state.lib.forEach(function (tex) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'lib__item';
      chip.title = tex;
      chip.innerHTML = '<span>' + FA.escapeHtml(tex) + '</span>';
      chip.addEventListener('click', function () {
        el.input.value = tex;
        el.origin.textContent = '来源：公式本';
        updatePreview();
      });
      frag.appendChild(chip);
    });
    el.libList.innerHTML = '';
    el.libList.appendChild(frag);
  }

  FA.editor = {
    init: init,
    load: load,
    sourceLabel: sourceLabel,
    setTex: function (tex) {
      el.input.value = tex;
      el.origin.textContent = '来源：手动输入';
      updatePreview();
    }
  };

})(window.FA);
