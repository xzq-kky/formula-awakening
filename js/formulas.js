/* ============================================================
   formulas.js · 公式提取与 Markdown 渲染
   提取来源（四路互补，全部来自 TextIn xParse 的结构化返回）：
     1. elements[].type === "Formula"            独立公式元素
     2. elements[].objects[].type === "formula"  行内公式对象（需开启 include_inline_objects）
     3. Table.table_structure.cells[].content_type === "formula"  表格单元格内的公式
     4. markdown 中的 $...$ / $$...$$ 兜底补齐
   ============================================================ */
window.FA = window.FA || {};

(function (FA) {
  'use strict';

  /* 解码 TextIn 返回文本里的 HTML 实体。
     实测：markdown 中的公式定界符会被转义成 &#36;，或全角的 ＄，
     不解码就完全匹配不到 $...$，公式会整批漏掉。 */
  function decodeEntities(s) {
    return String(s == null ? '' : s)
      .replace(/&#36;|&#x24;|＄/gi, '$')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');
  }

  /* 去掉 LaTeX 的定界符：$ / $$ / \( \) / \[ \] */
  function normalizeTex(raw) {
    if (!raw) return '';
    var s = decodeEntities(raw).trim();
    s = s.replace(/^\$\$?/, '').replace(/\$\$?$/, '');
    s = s.replace(/^\\\[/, '').replace(/\\\]$/, '');
    s = s.replace(/^\\\(/, '').replace(/\\\)$/, '');
    return s.trim();
  }

  function truncate(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  /* 去重键：忽略 \\, \\! 等间距命令与 \\left \\right，避免同一条公式因排版差异被算两遍 */
  function dedupeKey(tex) {
    return String(tex)
      .replace(/\\left|\\right/g, '')
      .replace(/\\[,;:!]/g, '')
      .replace(/\\quad|\\qquad/g, '')
      .replace(/\s+/g, '');
  }

  /* 从 elements 中抽取公式，返回带来源与位置的条目 */
  function extractFromElements(elements) {
    var out = [];
    var seen = Object.create(null);

    function push(tex, source, page, elementId, context, displayMode) {
      tex = normalizeTex(tex);
      if (!tex) return;
      var key = source + '|' + page + '|' + dedupeKey(tex);
      if (seen[key]) return;
      seen[key] = 1;
      out.push({
        index: out.length + 1,
        tex: tex,
        source: source,                 // display | inline | table
        displayMode: displayMode || (source === 'display'),
        page: page || 0,
        elementId: elementId || '',
        context: truncate(context || '', 90),
        origin: 'element'
      });
    }

    (elements || []).forEach(function (el) {
      var page = el.page_number || 0;
      var eid = el.element_id || '';
      var text = el.text || '';

      /* 1) 独立公式元素 */
      if (el.type === 'Formula') {
        push(text, 'display', page, eid, text, true);
      }

      /* 2) 行内公式对象 */
      if (el.objects && el.objects.length) {
        el.objects.forEach(function (ob) {
          if (!ob || ob.type !== 'formula') return;
          var mode = ob.metadata && ob.metadata.display_mode;
          var isDisplay = mode === 'display';
          push(ob.text, isDisplay ? 'display' : 'inline', page, eid, text, isDisplay);
        });
      }

      /* 3) 表格单元格里的公式 */
      if (el.type === 'Table' && el.table_structure && el.table_structure.cells) {
        el.table_structure.cells.forEach(function (cell) {
          if (!cell || cell.content_type !== 'formula' || !cell.text) return;
          push(cell.text, 'table', page, eid, '表格单元格 r' + (cell.row || '?') + 'c' + (cell.col || '?'), false);
        });
      }
    });

    return out;
  }

  /* 从 Markdown 兜底补齐，只补 elements 里没有的 */
  function extractFromMarkdown(md, existing) {
    if (!md) return [];
    md = decodeEntities(md);
    var have = Object.create(null);
    existing.forEach(function (it) { have[dedupeKey(it.tex)] = 1; });

    var out = [];
    var patterns = [
      { re: /\$\$([\s\S]{1,600}?)\$\$/g, source: 'display', display: true },
      { re: /(?<!\$)\$([^\$\n]{1,300}?)\$(?!\$)/g, source: 'inline', display: false }
    ];

    patterns.forEach(function (p) {
      var m;
      while ((m = p.re.exec(md)) !== null) {
        var tex = normalizeTex(m[1]);
        if (!tex) continue;
        var key = dedupeKey(tex);
        if (have[key]) continue;
        have[key] = 1;
        out.push({
          index: 0,
          tex: tex,
          source: p.source,
          displayMode: p.display,
          page: 0,
          elementId: '',
          context: truncate(md.slice(Math.max(0, m.index - 40), m.index), 60),
          origin: 'markdown'
        });
      }
    });

    return out;
  }

  /* 统一入口 */
  function analyze(data) {
    var elements = (data && data.elements) || [];
    var md = (data && data.markdown) || '';

    var items = extractFromElements(elements);
    var extra = extractFromMarkdown(md, items);
    items = items.concat(extra);

    items.forEach(function (it, i) { it.index = i + 1; });

    var stats = {
      total: items.length,
      display: 0,
      inline: 0,
      table: 0,
      fallback: 0,
      pages: (data && data.metadata && data.metadata.page_count) || 0
    };
    items.forEach(function (it) {
      if (stats[it.source] !== undefined) stats[it.source] += 1;
      if (it.origin === 'markdown') stats.fallback += 1;
    });

    return { items: items, stats: stats, markdown: md, elements: elements };
  }

  /* ============================================================
     Markdown 渲染（自实现，零依赖；公式段交给 KaTeX）
     ============================================================ */
  var TOKEN = '\u0001M\u0001';

  function protectMath(md) {
    var store = [];
    var s = decodeEntities(md);

    s = s.replace(/\$\$([\s\S]+?)\$\$/g, function (_, tex) {
      store.push({ tex: normalizeTex(tex), display: true });
      return TOKEN + (store.length - 1) + '\u0001';
    });
    s = s.replace(/\\\[([\s\S]+?)\\\]/g, function (_, tex) {
      store.push({ tex: normalizeTex(tex), display: true });
      return TOKEN + (store.length - 1) + '\u0001';
    });
    s = s.replace(/\$([^\$\n]+?)\$/g, function (_, tex) {
      store.push({ tex: normalizeTex(tex), display: false });
      return TOKEN + (store.length - 1) + '\u0001';
    });

    return { text: s, store: store };
  }

  function restoreMath(html, store) {
    return html.replace(/\u0001M\u0001(\d+)\u0001/g, function (_, i) {
      var item = store[Number(i)];
      if (!item) return '';
      return FA.renderMath(item.tex, item.display);
    });
  }

  function inlineFormat(text) {
    var s = FA.escapeHtml(text);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }

  function isTableSeparator(line) {
    return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
  }

  function splitRow(line) {
    var s = line.trim();
    if (s.charAt(0) === '|') s = s.slice(1);
    if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
    return s.split('|').map(function (c) { return c.trim(); });
  }

  function renderMarkdown(md) {
    var packed = protectMath(md);
    var lines = packed.text.split(/\r?\n/);
    var out = [];
    var i = 0;

    function flushParagraph(buf) {
      if (!buf.length) return;
      out.push('<p>' + buf.map(inlineFormat).join('<br>') + '</p>');
      buf.length = 0;
    }

    var para = [];

    while (i < lines.length) {
      var line = lines[i];
      var trimmed = line.trim();

      /* 空行 */
      if (trimmed === '') { flushParagraph(para); i++; continue; }

      /* 代码块 */
      if (/^```/.test(trimmed)) {
        flushParagraph(para);
        var code = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i].trim())) { code.push(lines[i]); i++; }
        i++;
        out.push('<pre><code>' + FA.escapeHtml(code.join('\n')) + '</code></pre>');
        continue;
      }

      /* 分隔线 */
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        flushParagraph(para);
        out.push('<hr>');
        i++;
        continue;
      }

      /* 标题 */
      var h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
      if (h) {
        flushParagraph(para);
        var lv = Math.min(h[1].length, 6);
        out.push('<h' + lv + '>' + inlineFormat(h[2]) + '</h' + lv + '>');
        i++;
        continue;
      }

      /* 表格 */
      if (trimmed.indexOf('|') === 0 && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        flushParagraph(para);
        var head = splitRow(trimmed);
        i += 2;
        var rows = [];
        while (i < lines.length && lines[i].indexOf('|') !== -1 && lines[i].trim() !== '') {
          rows.push(splitRow(lines[i]));
          i++;
        }
        var html = '<table><thead><tr>';
        head.forEach(function (c) { html += '<th>' + inlineFormat(c) + '</th>'; });
        html += '</tr></thead><tbody>';
        rows.forEach(function (r) {
          html += '<tr>';
          for (var c = 0; c < head.length; c++) html += '<td>' + inlineFormat(r[c] || '') + '</td>';
          html += '</tr>';
        });
        html += '</tbody></table>';
        out.push(html);
        continue;
      }

      /* 引用 */
      if (/^>\s?/.test(trimmed)) {
        flushParagraph(para);
        var quote = [];
        while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
          quote.push(lines[i].trim().replace(/^>\s?/, ''));
          i++;
        }
        out.push('<blockquote>' + quote.map(inlineFormat).join('<br>') + '</blockquote>');
        continue;
      }

      /* 列表 */
      if (/^([-*+]|\d+\.)\s+/.test(trimmed)) {
        flushParagraph(para);
        var ordered = /^\d+\./.test(trimmed);
        var lis = [];
        while (i < lines.length && /^([-*+]|\d+\.)\s+/.test(lines[i].trim())) {
          lis.push(lines[i].trim().replace(/^([-*+]|\d+\.)\s+/, ''));
          i++;
        }
        var tag = ordered ? 'ol' : 'ul';
        out.push('<' + tag + '>' + lis.map(function (t) { return '<li>' + inlineFormat(t) + '</li>'; }).join('') + '</' + tag + '>');
        continue;
      }

      para.push(trimmed);
      i++;
    }

    flushParagraph(para);
    return restoreMath(out.join('\n'), packed.store);
  }

  FA.formulas = {
    analyze: analyze,
    normalizeTex: normalizeTex,
    renderMarkdown: renderMarkdown
  };

})(window.FA);
