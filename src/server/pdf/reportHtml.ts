// ECEWS-headed HTML shell for report PDFs (same header language as the signed forms, AB-12).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fmtDateTime } from '../../shared/format';
import { esc } from '../email/templates';
import { now as clockNow } from '../lib/clock';

const require = createRequire(import.meta.url);
let cache: { logo: string; fonts: string } | null = null;
function assets() {
  if (!cache) {
    const font = (w: number) =>
      `@font-face{font-family:Inter;font-weight:${w};src:url(data:font/woff2;base64,${readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${w}-normal.woff2`)).toString('base64')}) format('woff2');}`;
    cache = { logo: `data:image/png;base64,${readFileSync(path.resolve('public/logo.png')).toString('base64')}`, fonts: [400, 600, 700].map(font).join('') };
  }
  return cache;
}

export function reportShell(o: { title: string; subtitle: string; body: string; landscape?: boolean }): string {
  const { logo, fonts } = assets();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(o.title)}</title><style>${fonts}
@page{size:A4 ${o.landscape ? 'landscape' : 'portrait'};margin:16mm 12mm 18mm}
*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;color:#111827;font-size:10px}
.head{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:10px;border-bottom:2px solid #096D49;margin-bottom:14px}
.head img{height:36px}.sub{font-size:9px;color:#6B7280;margin-top:3px}.ref{text-align:right}.ref b{display:block;font-size:15px}.ref span{color:#4B5563}
h1{font-size:14px;margin:0 0 2px}h2{font-size:12px;margin:18px 0 6px}.meta{color:#6B7280;margin-bottom:10px}
table{width:100%;border-collapse:collapse}thead{display:table-header-group}tr{page-break-inside:avoid}
th{background:#F9FAFB;text-align:left;font-size:8.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#4B5563;padding:6px;border:1px solid #E5E7EB}
td{padding:5px 6px;border:1px solid #E5E7EB;vertical-align:top}td.num{text-align:right;white-space:nowrap}
.note{margin-top:8px;color:#92400E;background:#FFFBEB;border:1px dashed #D97706;padding:6px 8px;border-radius:6px}
</style></head><body>
<div class="head"><div><img src="${logo}" alt="ECEWS-ITAMS"><div class="sub">Excellence Community Education Welfare Scheme · IT Asset Management</div></div>
<div class="ref"><b>${esc(o.title)}</b><span>Generated ${fmtDateTime(clockNow())} WAT</span></div></div>
<h1>${esc(o.title)}</h1><div class="meta">${esc(o.subtitle)}</div>${o.body}</body></html>`;
}
