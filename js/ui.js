/* ============================================================
   ui.js · 界面渲染
   职责：公式清单、Markdown 全文、结构树、文档报告、指标条、凭证列表
   ============================================================ */
window.FA = window.FA || {};

(function (FA) {
  'use strict';

  var el = {};
  var cache = { items: [], filter: '', source: 'all', currentIndex: null };

  function init() {
    el.list = document.getElementById('formulaList');
    el.markdown = document.getElementById('markdownBody');
    el.tree = document.getElementById('elementTree');
    el.docInfo = document.getElementById('docInfo');
    el.docInfoCard = document.getElementById('docInfoCard');
    el.tabCount = document.getElementById('tabCount');
    el.alert = document.getElementById('alertBox');
    el.proofList = document.getElementById('proofList');
    el.filterInput = document.getElementById('formulaFilter');
    el.sourceSelect = document.getElementById('formulaSource');
  }

  /* ---------------- 提示 ---------------- */
  function showAlert(type, html) {
    el.alert.setAttribute('data-type', type);
    el.alert.innerHTML = html;
    el.alert.hidden = false;
  }

  function hideAlert() {
    el.alert.hidden = true;
    el.alert.innerHTML = '';
  }

  /* ---------------- 指标 ---------------- */
  function renderMetrics(stats, elapsedMs) {
    document.getElementById('mPages').textContent = stats.pages || '—';
    document.getElementById('mFormulas').textContent = stats.total;
    document.getElementById('mDisplay').textContent = stats.display;
    document.getElementById('mInline').textContent = stats.inline;
    document.getElementById('mTable').textContent = stats.table;
    document.getElementById('mCost').textContent = elapsedMs ? (elapsedMs / 1000).toFixed(2) + 's' : '—';
  }

  function resetMetrics() {
    ['mPages', 'mFormulas', 'mDisplay', 'mInline', 'mTable', 'mCost'].forEach(function (id) {
      var node = document.getElementById(id);
      if (node) node.textContent = '—';
    });
  }

  /* ---------------- 文档报告 ---------------- */
  function renderDocInfo(result, file) {
    var data = result.data || {};
    var meta = data.metadata || {};
    var rows = [
      ['文件名', meta.filename || file.name],
      ['文件大小', FA.formatBytes(file.size)],
      ['页数', (meta.page_count || 0) + ' 页'],
      ['成功解析', (data.success_count || 0) + ' 页'],
      ['file_id', data.file_id || '—'],
      ['job_id', data.job_id || '—'],
      ['schema', data.schema_version || '—'],
      ['x_request_id', result.requestId || '—'],
      ['解析耗时', result.elapsedMs ? (result.elapsedMs / 1000).toFixed(2) + ' 秒' : '—'],
      ['调用时间', result.finishedAt ? FA.formatTime(result.finishedAt) : '—']
    ];

    el.docInfo.innerHTML = rows.map(function (r) {
      return '<dt>' + FA.escapeHtml(r[0]) + '</dt><dd>' + FA.escapeHtml(r[1]) + '</dd>';
    }).join('');
    el.docInfoCard.hidden = false;
  }

  /* ---------------- 公式清单 ---------------- */
  function renderFormulaList(items, stats) {
    cache.items = items;
    el.tabCount.textContent = items.length;
    drawList();
    return stats;
  }

  function drawList() {
    var q = cache.filter.trim().toLowerCase();
    var src = cache.source;

    var visible = cache.items.filter(function (it) {
      if (src !== 'all' && it.source !== src) return false;
      if (!q) return true;
      return it.tex.toLowerCase().indexOf(q) !== -1 || (it.context || '').toLowerCase().indexOf(q) !== -1;
    });

    if (!visible.length) {
      el.list.innerHTML = '<div class="empty"><div class="empty__art">∅</div><h3>没有匹配的公式</h3><p>换个关键词，或把来源筛选改成「全部来源」。</p></div>';
      return;
    }

    var frag = document.createDocumentFragment();
    visible.forEach(function (it) {
      frag.appendChild(buildCard(it));
    });
    el.list.innerHTML = '';
    el.list.appendChild(frag);
  }

  function buildCard(it) {
    var card = document.createElement('div');
    card.className = 'fitem';
    if (cache.currentIndex === it.index) card.classList.add('is-current');
    card.dataset.index = it.index;

    var tags = '<span class="fitem__tag fitem__tag--' + it.source + '">' +
      FA.editor.sourceLabel(it.source) + '</span>' +
      (it.page ? '<span class="fitem__tag">第 ' + it.page + ' 页</span>' : '') +
      (it.elementId ? '<span class="fitem__tag">' + FA.escapeHtml(it.elementId) + '</span>' : '');

    card.innerHTML =
      '<div class="fitem__idx">' + it.index + '</div>' +
      '<div class="fitem__body">' +
        '<div class="fitem__meta">' + tags + '</div>' +
        '<div class="fitem__tex" title="' + FA.escapeHtml(it.tex) + '">' + FA.escapeHtml(it.tex) + '</div>' +
        '<div class="fitem__preview">' + FA.renderMath(it.tex, true) + '</div>' +
      '</div>' +
      '<div class="fitem__act">' +
        '<button class="btn btn--tiny" data-act="edit">编辑</button>' +
        '<button class="btn btn--tiny" data-act="copy">复制</button>' +
      '</div>';

    card.querySelector('[data-act="edit"]').addEventListener('click', function () {
      FA.editor.load(it);
      markCurrent(it.index);
      FA.toast('已载入编辑器');
      /* 窄屏下编辑器在下方，直接把视图带过去，省掉一次手动滚动 */
      if (window.innerWidth <= 1280) {
        var editorCol = document.querySelector('.col--editor');
        if (editorCol) editorCol.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    card.querySelector('[data-act="copy"]').addEventListener('click', function () {
      FA.copyPlain(it.tex).then(function (ok) {
        FA.toast(ok ? '已复制 LaTeX' : '复制失败', ok ? 'ok' : 'error');
      });
    });

    return card;
  }

  function setFilter(value) { cache.filter = value; drawList(); }
  function setSource(value) { cache.source = value; drawList(); }

  /* 标记当前已载入编辑器的公式，滚动列表时也能看出改的是哪一条 */
  function markCurrent(index) {
    cache.currentIndex = index;
    Array.prototype.forEach.call(el.list.querySelectorAll('.fitem'), function (node) {
      node.classList.toggle('is-current', Number(node.dataset.index) === index);
    });
  }

  /* ---------------- Markdown ---------------- */
  function renderMarkdown(md) {
    if (!md) {
      el.markdown.innerHTML = '<div class="empty"><p>本次解析没有返回 Markdown 内容。</p></div>';
      return;
    }
    el.markdown.innerHTML = FA.formulas.renderMarkdown(md);
  }

  /* ---------------- 结构树 ---------------- */
  function renderElementTree(elements) {
    if (!elements || !elements.length) {
      el.tree.innerHTML = '<div class="empty"><p>本次解析没有返回 elements 结构。</p></div>';
      return;
    }

    var frag = document.createDocumentFragment();
    elements.slice(0, 600).forEach(function (el0) {
      var row = document.createElement('div');
      row.className = 'eitem';
      var text = el0.text || '';
      if (el0.type === 'Table') text = '（表格，' +
        ((el0.table_structure && el0.table_structure.rows) || '?') + ' 行 × ' +
        ((el0.table_structure && el0.table_structure.cols) || '?') + ' 列）';
      if (el0.type === 'Formula') text = FA.formulas.normalizeTex(text);

      row.innerHTML =
        '<span class="eitem__page">p' + (el0.page_number || '?') + '</span>' +
        '<span class="eitem__type" data-t="' + FA.escapeHtml(el0.type || '') + '">' +
          FA.escapeHtml(el0.type || '—') + '</span>' +
        '<span class="eitem__text" title="' + FA.escapeHtml(text) + '">' +
          FA.escapeHtml(text.slice(0, 140)) + '</span>';
      frag.appendChild(row);
    });

    if (elements.length > 600) {
      var more = document.createElement('div');
      more.className = 'eitem';
      more.innerHTML = '<span class="eitem__page">…</span><span class="eitem__type">提示</span>' +
        '<span class="eitem__text">共 ' + elements.length + ' 个元素，最多展示前 600 个</span>';
      frag.appendChild(more);
    }

    el.tree.innerHTML = '';
    el.tree.appendChild(frag);
  }

  /* ---------------- 凭证 ---------------- */
  function renderProofs(proofs) {
    if (!proofs || !proofs.length) {
      el.proofList.innerHTML = '<span class="lib__empty">暂无调用记录，成功解析一次后会自动记账。</span>';
      return;
    }
    el.proofList.innerHTML = proofs.map(function (p) {
      return '<div class="proof">' +
        '<div class="proof__top"><span class="proof__name">' + FA.escapeHtml(p.filename) + '</span>' +
        '<span class="proof__time">' + FA.formatTime(p.time) + '</span></div>' +
        '<div class="proof__kv">' +
          '<span>file_id</span><b>' + FA.escapeHtml(p.fileId || '—') + '</b>' +
          '<span>job_id</span><b>' + FA.escapeHtml(p.jobId || '—') + '</b>' +
          '<span>success_count</span><b>' + FA.escapeHtml(String(p.successCount)) + ' 页</b>' +
          '<span>公式数</span><b>' + FA.escapeHtml(String(p.formulaCount)) + ' 条</b>' +
          '<span>x_request_id</span><b>' + FA.escapeHtml(p.requestId || '—') + '</b>' +
          '<span>耗时</span><b>' + FA.escapeHtml((p.elapsedMs / 1000).toFixed(2)) + ' 秒</b>' +
          '<span>endpoint</span><b>' + FA.escapeHtml(p.endpoint || '') + '</b>' +
        '</div></div>';
    }).join('');
  }

  FA.ui = {
    init: init,
    showAlert: showAlert,
    hideAlert: hideAlert,
    renderMetrics: renderMetrics,
    resetMetrics: resetMetrics,
    renderDocInfo: renderDocInfo,
    renderFormulaList: renderFormulaList,
    markCurrent: markCurrent,
    setFilter: setFilter,
    setSource: setSource,
    renderMarkdown: renderMarkdown,
    renderElementTree: renderElementTree,
    renderProofs: renderProofs
  };

})(window.FA);
