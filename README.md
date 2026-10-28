# 公式觉醒工作台 · Formula Awakening Workbench

> 用 TextIn xParse 把沉睡在 PDF 里的公式唤醒成可编辑的 LaTeX。
>
> 参赛作品 · TextIn xParse「文档觉醒」AI 应用创新赛 · **实用价值赛道**

---

## 一句话说明

公式一旦被打印成 PDF 或扫描成图片，就变成了"死的像素"：想改一个下标、复制一条定理，
只能靠肉眼重敲一遍 LaTeX —— 一道大题十几分钟。

**公式觉醒工作台**把这一步交给 TextIn xParse：上传试卷 / 教材 / 论文，工作台读出版式、
读出正文里的行内公式、读出表格单元格里的公式，并把每一条公式连同**页码与坐标**一起取出来，
一键送进 KaTeX 可视化编辑器，改完直接复制成 MathML 粘到 Word。

---

## 为什么这是"必须用 TextIn xParse 才能做"的事

很多方案靠正则从纯文本里捞 `$...$`，这在真实文档上会大量失败：扫描件没有文本层、
行内公式与正文混排、表格里的公式、跨页断开的分式。TextIn xParse 返回的是**带结构的元素流**，
工作台正是建立在这些结构上：

| 能力开关 | 工作台怎么用 |
| --- | --- |
| `include_inline_objects` | 把段落里的行内公式拆成独立 `object`，带 `text_range` 与 `display_mode`，可定位回原文位置 |
| `include_hierarchy` + `title_tree` | 还原"第几章第几节"，公式带上章节归属 |
| `include_table_structure` | 读取单元格 `content_type`，识别表格里的公式（例如对照表、参数表） |
| `pages` | 每条公式都有页码，方便回原卷核对 |
| `config.engine_params.formula_level = 1` | 开启公式增强识别，提高分式、上下标、矩阵的还原率 |

公式提取采用**四路互补**：

1. `elements[].type === "Formula"` → 独立公式
2. `elements[].objects[].type === "formula"` → 行内公式
3. `Table.table_structure.cells[].content_type === "formula"` → 表格内公式
4. `markdown` 中的 `$...$` / `$$...$$` → 兜底补齐（并做归一化去重，避免同一条公式算两遍）

---

## 快速开始

1. 到 [TextIn 工作台 · 账号与开发者信息](https://www.textin.com/console/dashboard/setting)
   复制 `x-ti-app-id` 与 `x-ti-secret-code`。
2. 用浏览器打开 `index.html`（**无需安装任何依赖、无需起服务**）。
3. 点右上角「API 设置」，填入两个密钥，点「保存并测试连接」。
   这一步会发一次**无文件**的校验请求，只判断鉴权是否通过，不消耗解析页数。
4. 拖入一份含公式的 PDF / 图片 / Word，点「开始解析并唤醒公式」。
5. 左侧「公式清单」里点任意一条的「编辑」→ 右侧实时预览 → 「复制到 Word」。

每次成功解析都会自动记账，点右上角「调用凭证」可查看并导出 JSON：
里面包含 TextIn 原样返回的 `file_id`、`job_id`、`success_count`、`x_request_id`
以及本次请求的 `config`，可作文档解析确实发生过的证明。

---

## 目录结构

```
formula-awakening/
├── index.html          页面结构
├── css/app.css         样式（深色工作台 + 唤醒态高亮）
├── js/core.js          存储、提示、剪贴板、KaTeX 安全渲染
├── js/xparse.js        TextIn xParse 客户端（parse/sync + 密钥校验）
├── js/formulas.js      四路公式提取 + 自实现的 Markdown 渲染
├── js/editor.js        LaTeX 编辑器、快捷结构、LaTeX/MathML/Word 导出
├── js/ui.js            公式清单、全文、结构树、解析报告、凭证列表
└── js/main.js          主流程编排
```

外部依赖只有 CDN 上的 KaTeX 0.16.9（用于渲染与 MathML 生成），其余全部自实现。

---

## 技术要点

- **纯前端、零构建**：经典 `<script>` 加载，双击 `index.html` 即可运行；
  密钥只存在浏览器 `localStorage`，不上传任何第三方。
- **直连 TextIn**：`POST https://api.textin.com/api/v1/xparse/parse/sync`，
  请求头 `x-ti-app-id` / `x-ti-secret-code`，`multipart/form-data` 提交文件与 `config`。
  该接口开放 CORS，因此浏览器端可以直接调用，不需要自建后端代理。
- **Markdown 渲染器自实现**：标题、段落、列表、表格、引用、代码块、公式，
  正文内容全程 `escapeHtml` 后输出，避免文档里的 HTML 注入页面。
- **公式去重**：忽略 `\,` `\;` `\quad` `\left` `\right` 等排版差异后比较，
  同一条公式不会因为来源不同被重复计数。
- **导出三件套**：
  - 复制 LaTeX（给 LaTeX 用户）
  - 复制 MathML（给网页 / 排版系统）
  - 复制到 Word（把 MathML 以 `text/html` 写进剪贴板，Word 会识别为原生公式对象）

---

## 已验证（真实调用）

拿一份由本仓库 `samples/exam.html` 打印出的两页《高等数学（上）期中试卷》PDF，
用 `formula_level: 2` 真实调用 TextIn xParse：

| 项目 | 结果 |
| --- | --- |
| `success_count` / `page_count` | 2 / 2 |
| `schema_version` | 1.4.0 |
| `elements` | 40 |
| `file_id` | `a49d00693a6d42f29cf0e3b8ee01c114` |
| `job_id` | `cdaa643783fb4bccbfda0fd3a9cafd68` |
| `x_request_id` | `a57e8538784be4a7d55d13ef3e16df29` |
| 唤醒公式 | **31 条**（独立 4 · 行内 27） |
| 解析耗时 | 约 3.3 秒 |

完整响应原文保存在 `samples/xparse-result.json`，可自行核对。

`formula_level` 的对比很关键：同一份 PDF，`formula_level: 1` 只拿到 6 条，
且 `$` 被误识别成字母 `S`、`\left(1+\frac{1}{x}\right)` 还原成 `\{x\}\backslash \text {right})`；
换成 `formula_level: 2` 后拿到 31 条，`\int_{0}^{1}\frac{1}{1+x^{2}}\,\mathrm{d}x=\frac{\pi}{4}`
这类嵌套结构能正确还原。因此默认配置用的是 `formula_level: 2`。

已知的还原瑕疵（诚实记录）：`\lim\limits_{x \to 0}` 的下划线会丢，
`\le` 偶发识别成 `\1e`，表格单元格里的公式在增强模式下不返回 `content_type`，
所以「表格内公式」这一路本次为 0。前两路（元素 / 对象）在扫描件输入时仍会正常产出带页码的结果。

---

## 许可

MIT
