const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, Footer, PageNumber, AlignmentType,
  LevelFormat, WidthType, ShadingType, BorderStyle, PositionalTab, PositionalTabAlignment, PositionalTabRelativeTo,
  PositionalTabLeader, VerticalAlign, Tab, TabStopType, LeaderType,
} = require('docx');

const ROOT = path.resolve(__dirname, '..', '..');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const FONT = 'Times New Roman';
const W = 9026; // A4 text width in DXA (1" margins)

// ------------------------------------------------------------------ inline markup: **bold**, [[code]]
function runs(text, base = {}) {
  // **bold**, [[code]], <<placeholder>> (shown as [placeholder] with yellow highlight so it is easy to find and replace)
  const out = [];
  for (const part of String(text).split(/(\*\*.+?\*\*|\[\[.+?\]\]|<<.+?>>)/g)) {
    if (!part) continue;
    if (part.startsWith('**')) out.push(new TextRun({ text: part.slice(2, -2), bold: true, ...base }));
    else if (part.startsWith('[[')) out.push(new TextRun({ ...base, text: part.slice(2, -2), font: 'Courier New', size: (base.size || 24) - 2 }));
    else if (part.startsWith('<<')) out.push(new TextRun({ ...base, text: '[' + part.slice(2, -2) + ']', highlight: 'yellow' }));
    else out.push(new TextRun({ text: part, ...base }));
  }
  return out;
}

// ------------------------------------------------------------------ block builders (collect headings for the TOC)
function Doc(pages) {
  const blocks = [], toc = [];
  const add = (...b) => blocks.push(...b);
  const api = {
    blocks, toc,
    h1(t, opts = {}) { toc.push({ level: 1, text: t }); add(new Paragraph({ style: 'Heading1', children: [new TextRun(t)], ...opts })); },
    h2(t) { toc.push({ level: 2, text: t }); add(new Paragraph({ style: 'Heading2', children: [new TextRun(t)] })); },
    h3(t) { add(new Paragraph({ style: 'Heading3', children: [new TextRun(t)] })); },
    p(t, style = 'BodyText') { add(new Paragraph({ style, children: runs(t) })); },
    bullets(items) {
      for (const it of items) {
        const [lead, rest] = Array.isArray(it) ? it : [null, it];
        add(new Paragraph({ style: 'Compact', numbering: { reference: 'bul', level: 0 },
          children: [...(lead ? [new TextRun({ text: lead + ': ', bold: true })] : []), ...runs(rest)] }));
      }
    },
    numbered(items, ref = 'num') {
      for (const it of items) add(new Paragraph({ style: 'Compact', numbering: { reference: ref, level: 0 }, children: runs(it) }));
    },
    code(lines) {
      for (const l of lines) add(new Paragraph({ style: 'SourceCode', children: [new TextRun({ text: l.replace(/\t/g, '    ') || ' ' })] }));
      add(new Paragraph({ style: 'Compact', children: [] }));
    },
    caption(t) { add(new Paragraph({ style: 'BodyText', keepNext: true, alignment: AlignmentType.LEFT, children: [new TextRun({ text: t, bold: true })] })); },
    table(headers, rows, widths, opts = {}) {
      const sum = widths.reduce((a, b) => a + b, 0);
      if (sum !== W) widths = widths.map((w) => Math.round((w * W) / sum)), widths[widths.length - 1] += W - widths.reduce((a, b) => a + b, 0);
      const border = { style: BorderStyle.SINGLE, size: 4, color: '7F7F7F' };
      const borders = { top: border, bottom: border, left: border, right: border };
      const cell = (txt, i, head) => new TableCell({
        width: { size: widths[i], type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.CENTER,
        margins: { top: 40, bottom: 40, left: 90, right: 90 },
        shading: head ? { type: ShadingType.CLEAR, fill: 'D9D9D9', color: 'auto' } : undefined,
        children: [new Paragraph({ style: 'Compact', spacing: { before: 0, after: 0, line: 276, lineRule: 'auto' },
          alignment: head ? AlignmentType.CENTER : (opts.center && opts.center.includes(i) ? AlignmentType.CENTER : AlignmentType.LEFT),
          children: head ? [new TextRun({ text: String(txt), bold: true, size: 20 })] : runs(txt, { size: 20 }) })],
      });
      add(new Table({
        width: { size: W, type: WidthType.DXA }, columnWidths: widths, alignment: AlignmentType.CENTER,
        rows: [new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((h, i) => cell(h, i, true)) }),
          ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false)) }))],
      }));
      add(new Paragraph({ style: 'Compact', children: [] }));
    },
    figure(file, cap, widthPx) {
      const buf = fs.readFileSync(path.join(SHOTS, file));
      const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
      add(new Paragraph({ style: 'BodyText', keepNext: true, alignment: AlignmentType.CENTER, spacing: { before: 0, after: 60, line: 240, lineRule: 'auto' },
        children: [new ImageRun({ type: 'png', data: buf, transformation: { width: widthPx, height: Math.round((widthPx * h) / w) },
          altText: { title: cap, description: cap, name: file } })] }));
      add(new Paragraph({ style: 'ImageCaption', children: [new TextRun(cap)] }));
    },
  };
  return api;
}

// ------------------------------------------------------------------ source excerpts (taken from the repo at build time)
function excerpt(file, startSub, n) {
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
  const i = lines.findIndex((l) => l.includes(startSub));
  if (i < 0) throw new Error(`excerpt start not found: ${startSub} in ${file}`);
  const slice = lines.slice(i, i + n);
  const indent = Math.min(...slice.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return slice.map((l) => l.slice(indent));
}

// ------------------------------------------------------------------ source excerpts (taken from the repo at build time)
function excerpt(file, startSub, n) {
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
  const i = lines.findIndex((l) => l.includes(startSub));
  if (i < 0) throw new Error(`excerpt start not found: ${startSub} in ${file}`);
  const slice = lines.slice(i, i + n);
  const indent = Math.min(...slice.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return slice.map((l) => l.slice(indent));
}

const fmtN = (n) => Number(n).toLocaleString('en-GB');

// ------------------------------------------------------------------ the Word document shell (styles copied from the example)
function makeDocument({ title, creator, body }) {
  // numbered-list configs: one per figure so numbering restarts
  const numCfg = [];
  for (let i = 1; i <= 30; i++) numCfg.push({ reference: 'num' + i, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '(%1)', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 540 } } } }] });
  const f = (size) => ({ font: FONT, size });
  const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 24 })] })] });
  return new Document({
      creator: creator || 'Project author', title,
      features: {},
      styles: {
        default: { document: { run: { font: FONT, size: 24 }, paragraph: { spacing: { after: 200 } } } },
        paragraphStyles: [
          { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'BodyText', quickFormat: true, run: { ...f(36), bold: true, color: '000000' }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 280, line: 276, lineRule: 'auto' }, keepNext: true } },
          { id: 'Subtitle', name: 'Subtitle', basedOn: 'Title', next: 'BodyText', quickFormat: true, run: { ...f(28), bold: true, color: '000000' }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 600, line: 276, lineRule: 'auto' } } },
          { id: 'Heading1', name: 'heading 1', basedOn: 'Normal', next: 'BodyText', quickFormat: true, run: { ...f(28), bold: true, color: '000000' }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 320, line: 276, lineRule: 'auto' }, keepNext: true, keepLines: true, pageBreakBefore: true, outlineLevel: 0 } },
          { id: 'Heading2', name: 'heading 2', basedOn: 'Normal', next: 'BodyText', quickFormat: true, run: { ...f(24), bold: true, color: '000000' }, paragraph: { alignment: AlignmentType.LEFT, spacing: { before: 320, after: 160, line: 276, lineRule: 'auto' }, keepNext: true, keepLines: true, outlineLevel: 1 } },
          { id: 'Heading3', name: 'heading 3', basedOn: 'Normal', next: 'BodyText', quickFormat: true, run: { ...f(24), bold: true, italics: true, color: '000000' }, paragraph: { alignment: AlignmentType.LEFT, spacing: { before: 240, after: 120, line: 276, lineRule: 'auto' }, keepNext: true, keepLines: true, outlineLevel: 2 } },
          { id: 'BodyText', name: 'Body Text', basedOn: 'Normal', quickFormat: true, run: { ...f(24), color: '000000' }, paragraph: { alignment: AlignmentType.JUSTIFIED, spacing: { before: 0, after: 160, line: 276, lineRule: 'auto' } } },
          { id: 'FirstParagraph', name: 'First Paragraph', basedOn: 'BodyText', next: 'BodyText', quickFormat: true },
          { id: 'Compact', name: 'Compact', basedOn: 'BodyText', quickFormat: true, paragraph: { spacing: { before: 0, after: 80, line: 276, lineRule: 'auto' } } },
          { id: 'ImageCaption', name: 'Image Caption', basedOn: 'Normal', run: { ...f(24), italics: true, color: '000000' }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 80, after: 280, line: 276, lineRule: 'auto' } } },
          { id: 'ContentsHeading', name: 'Contents Heading', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { ...f(28), bold: true }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 320, line: 276, lineRule: 'auto' }, keepNext: true, pageBreakBefore: true } },
          { id: 'TOC1', name: 'toc 1', basedOn: 'Normal', next: 'Normal', run: { ...f(24), bold: true }, paragraph: { spacing: { before: 120, after: 30, line: 276, lineRule: 'auto' }, indent: { left: 0, right: 0 }, tabStops: [{ type: TabStopType.RIGHT, position: 9026, leader: LeaderType.DOT }] } },
          { id: 'TOC2', name: 'toc 2', basedOn: 'Normal', next: 'Normal', run: f(24), paragraph: { spacing: { before: 0, after: 20, line: 276, lineRule: 'auto' }, indent: { left: 360, right: 0 }, tabStops: [{ type: TabStopType.RIGHT, position: 9026, leader: LeaderType.DOT }] } },
          { id: 'SourceCode', name: 'Source Code', basedOn: 'Normal', run: { font: 'Courier New', size: 17 },
            paragraph: { alignment: AlignmentType.LEFT, spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' }, keepLines: true,
              shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' },
              border: { top: { style: BorderStyle.SINGLE, size: 4, space: 4, color: 'A6A6A6' }, left: { style: BorderStyle.SINGLE, size: 4, space: 4, color: 'A6A6A6' }, bottom: { style: BorderStyle.SINGLE, size: 4, space: 4, color: 'A6A6A6' }, right: { style: BorderStyle.SINGLE, size: 4, space: 4, color: 'A6A6A6' } } } },
        ],
      },
      numbering: { config: [
        { reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        ...numCfg,
      ] },
      sections: [{
        properties: { titlePage: true, page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, footer: 720, header: 720 } } },
        footers: { default: footer, first: new Footer({ children: [new Paragraph({ children: [] })] }) },
        children: body,
      }],
    });
}

// docx-js writes <w:pBdr> children as top,bottom,left,right; the schema requires top,left,bottom,right.
async function save(doc, OUT) {
  const JSZip = require(require.resolve('jszip', { paths: [require.resolve('docx')] }));
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  let xml = await zip.file('word/styles.xml').async('string');
  xml = xml.replace(/<w:pBdr>(<w:top [^>]*\/>)(<w:bottom [^>]*\/>)(<w:left [^>]*\/>)(<w:right [^>]*\/>)<\/w:pBdr>/g, '<w:pBdr>$1$3$2$4</w:pBdr>');
  zip.file('word/styles.xml', xml);
  // docx-js emits <w:highlightCs/> after <w:highlight/>, which the schema does not allow in that position; the highlight itself is enough.
  const docXml = (await zip.file('word/document.xml').async('string')).replace(/<w:highlightCs [^>]*\/>/g, '');
  zip.file('word/document.xml', docXml);
  fs.writeFileSync(OUT, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

// ------------------------------------------------------------------ two passes
function measurePages(docxPath, toc) {
  try {
    const dir = path.dirname(docxPath);
    execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', dir, docxPath], { stdio: 'ignore', timeout: 180000 });
    const pdf = docxPath.replace(/\.docx$/, '.pdf');
    const n = parseInt(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [pdf]).toString())[1], 10);
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const text = [];
    for (let i = 1; i <= n; i++) text.push(norm(execFileSync('pdftotext', ['-f', String(i), '-l', String(i), pdf, '-']).toString()));
    const pages = {};
    for (const e of toc) {
      const key = norm(e.text).slice(0, 38);
      for (let i = n - 1; i >= 0; i--) if (text[i].includes(key)) { pages[e.text] = i + 1; break; }   // last occurrence = the heading, not the contents entry
    }
    fs.unlinkSync(pdf);
    return pages;
  } catch (e) {
    console.warn('page measurement skipped:', e.message.split('\n')[0]);
    return null;
  }
}


function tocParagraphs(toc, pages) {
  const out = [new Paragraph({ style: 'ContentsHeading', children: [new TextRun('TABLE OF CONTENTS')] })];
  for (const e of toc) {
    const pg = pages && pages[e.text] ? String(pages[e.text]) : '';
    out.push(new Paragraph({ style: e.level === 1 ? 'TOC1' : 'TOC2', children: [new TextRun({ children: [e.text, new Tab(), pg] })] }));
  }
  return out;
}

// build(pages) -> { doc, toc }. Pass 1 has no page numbers; pass 2 uses numbers measured from a LibreOffice render.
async function buildTwoPass(build, OUT) {
  let { doc, toc } = build(null);
  await save(doc, OUT);
  const pages = measurePages(OUT, toc);
  if (pages) { ({ doc } = build(pages)); await save(doc, OUT); }
  console.log('wrote', OUT, pages ? `(contents page numbers filled for ${Object.keys(pages).length}/${toc.length} headings)` : '(no page numbers)');
}

module.exports = { fs, path, ROOT, SHOTS, FONT, W, runs, Doc, excerpt, fmtN, makeDocument, save, measurePages, tocParagraphs, buildTwoPass,
  docx: require('docx') };
