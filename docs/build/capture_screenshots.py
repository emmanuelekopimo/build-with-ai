"""Start the detector, drive it with Playwright, and write annotated screenshots to docs/screenshots/.

    python docs/build/capture_screenshots.py

Needs: pip install playwright flask   (Chromium is found via CHROMIUM_PATH, PLAYWRIGHT_BROWSERS_PATH or
Playwright's own install). Also writes docs/screenshots/callouts.json (what was drawn where).
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

import screens

ROOT = Path(__file__).resolve().parents[2]
LAB = ROOT / "trojan-lab"
OUT = ROOT / "docs" / "screenshots"
PORT = int(os.environ.get("DOC_PORT", "8099"))
URL = f"http://127.0.0.1:{PORT}"

OVERLAY_JS = """
(items) => {
  document.getElementById('__ov')?.remove();
  const o = document.createElement('div'); o.id = '__ov';
  o.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;z-index:99999;pointer-events:none';
  document.body.appendChild(o);
  const missing = [];
  items.forEach(({sel, anchor}, i) => {
    const el = document.querySelector(sel);
    if (!el) { missing.push(sel); return; }
    const r = el.getBoundingClientRect(), x = r.left + scrollX, y = r.top + scrollY;
    const box = document.createElement('div');
    box.style.cssText = `position:absolute;left:${x-3}px;top:${y-3}px;width:${r.width+6}px;height:${r.height+6}px;` +
      'border:2px solid #e11d48;border-radius:6px;box-shadow:0 0 0 1px #fff';
    o.appendChild(box);
    const b = document.createElement('div'); b.textContent = i + 1;
    const bx = anchor === 'tr' ? x + r.width + 3 : anchor === 'l' ? x - 3 : x - 3;
    const by = anchor === 'l' ? y + r.height / 2 : y - 3;
    b.style.cssText = `position:absolute;left:${bx-13}px;top:${by-13}px;width:26px;height:26px;border-radius:50%;` +
      'background:#e11d48;color:#fff;font:700 14px/26px system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff';
    o.appendChild(b);
  });
  return missing;
}
"""

TRUNC_JS = """(n) => { const rows=[...document.querySelectorAll('#fnd tr')]; const hidden=rows.length-n;
                        rows.slice(n).forEach(r=>r.remove());
                        if (hidden>0) { const tr=document.createElement('tr'); tr.innerHTML=`<td colspan="6" class="mut">&hellip; ${hidden} more findings not shown</td>`; document.querySelector('#fnd').appendChild(tr); } }"""

UNION_JS = """
(sels) => {
  let l = 1e9, t = 1e9, r = 0, b = 0;
  for (const s of sels) {
    const e = document.querySelector(s); if (!e) throw new Error('missing clip ' + s);
    const q = e.getBoundingClientRect();
    l = Math.min(l, q.left + scrollX); t = Math.min(t, q.top + scrollY);
    r = Math.max(r, q.right + scrollX); b = Math.max(b, q.bottom + scrollY);
  }
  return {l, t, r, b};
}
"""


def post(path, **kw):
    req = urllib.request.Request(URL + path, method=kw.pop("method", "POST"), **kw)
    return urllib.request.urlopen(req, timeout=10).read()


def upload_baseline():
    """Prime the server's baseline by analysing the clean sample with the baseline file (multipart by hand)."""
    b = "----docboundary"
    def part(name, fname, data):
        return (f'--{b}\r\nContent-Disposition: form-data; name="{name}"; filename="{fname}"\r\n'
                f'Content-Type: text/csv\r\n\r\n').encode() + data + b"\r\n"
    body = part("flows", "c.csv", (LAB / "sample_data/clean_flows.csv").read_bytes()) + \
        part("baseline", "b.csv", (LAB / "sample_data/baseline_flows.csv").read_bytes()) + f"--{b}--\r\n".encode()
    post("/api/analyze", data=body, headers={"Content-Type": f"multipart/form-data; boundary={b}"})


def find_chromium():
    for p in (os.environ.get("CHROMIUM_PATH"), "/opt/pw-browsers/chromium"):
        if p and Path(p).exists():
            return p
    return None


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    data_dir = Path(tempfile.mkdtemp(prefix="labdata-"))
    shutil.copy(LAB / "sample_data/infected_flows.csv", data_dir / "flows.csv")   # stand-in for the live capture
    env = {**os.environ, "LAB_DATA_DIR": str(data_dir), "SAMPLE_DIR": str(LAB / "sample_data"), "PORT": str(PORT)}
    srv = subprocess.Popen([sys.executable, str(LAB / "detector/app.py")], env=env, cwd=LAB / "detector",
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(URL + "/health", timeout=1); break
            except Exception:
                time.sleep(0.2)
        else:
            raise RuntimeError("detector did not start")
        record = {}
        with sync_playwright() as p:
            exe = find_chromium()
            browser = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()
            ctxs = {k: browser.new_context(viewport=v, device_scale_factor=2, color_scheme="light")
                    for k, v in (("desktop", screens.DESKTOP), ("mobile", screens.MOBILE))}
            pages = {k: c.new_page() for k, c in ctxs.items()}
            for pg in pages.values():
                pg.goto(URL)

            def fresh(pg):
                pg.goto(URL); pg.wait_for_selector("#f")

            def results(pg, name):
                pg.click(f"[data-s={name}]"); pg.wait_for_selector("#out:not([hidden])")

            def setup(sid, pg):
                if sid == "01-landing":
                    fresh(pg)
                elif sid == "02-files-selected":
                    fresh(pg)
                    pg.set_input_files("#flows", str(LAB / "sample_data/infected_flows.csv"))
                    pg.set_input_files("#baseline", str(LAB / "sample_data/baseline_flows.csv"))
                elif sid == "03-error":
                    fresh(pg)
                    pg.set_input_files("#flows", files=[{"name": "my_flows.csv", "mimeType": "text/csv",
                                                         "buffer": b"time,host,dst,bytes\n1,a,b,2\n"}])
                    pg.click("#f button"); pg.wait_for_function("document.querySelector('#err').textContent.length>0")
                elif sid in ("04-results", "05-findings"):
                    fresh(pg); results(pg, "infected")
                elif sid == "06-live":
                    fresh(pg); upload_baseline(); pg.click("#live"); pg.wait_for_selector("#out:not([hidden])")
                elif sid == "07-clean":
                    fresh(pg); results(pg, "clean")
                elif sid == "08-quarantine":
                    fresh(pg); results(pg, "infected")
                    pg.click("[data-q=cam-garage]"); pg.wait_for_selector("[data-r=cam-garage]")
                elif sid == "m01-landing":
                    fresh(pg)
                elif sid in ("m02-results", "m03-findings"):
                    post("/api/quarantine/cam-garage", method="DELETE")
                    fresh(pg); results(pg, "infected")

            for s in screens.SCREENS:
                pg = pages[s["viewport"]]
                setup(s["id"], pg)
                if s.get("truncate_findings"):   # keep the screenshot page-sized; the table is long
                    pg.evaluate(TRUNC_JS, s["truncate_findings"])
                missing = pg.evaluate(OVERLAY_JS, [{"sel": c[0], "anchor": c[1]} for c in s["callouts"]])
                if missing:
                    raise RuntimeError(f"{s['id']}: selectors not found: {missing}")
                u = pg.evaluate(UNION_JS, s["clip"])
                pad = 22
                x0, y0 = max(0, u["l"] - pad), max(0, u["t"] - pad)
                vw = screens.DESKTOP["width"] if s["viewport"] == "desktop" else screens.MOBILE["width"]
                clip = {"x": x0, "y": y0, "width": min(vw, u["r"] + pad) - x0, "height": u["b"] + pad - y0}
                pg.screenshot(path=str(OUT / f"{s['id']}.png"), full_page=True, clip=clip)
                if s["viewport"] == "mobile":
                    record[s["id"] + "_overflow_x"] = pg.evaluate("document.documentElement.scrollWidth > innerWidth")
                record[s["id"]] = [{"n": i + 1, "selector": c[0]} for i, c in enumerate(s["callouts"])]
                print("captured", s["id"])
            # plain (un-annotated) hero shot for the README
            fresh(pages["desktop"]); results(pages["desktop"], "infected")
            pages["desktop"].evaluate(TRUNC_JS, 6)
            h = pages["desktop"].evaluate(UNION_JS, ["main > h1", "#out > .card:nth-of-type(3)"])
            pages["desktop"].screenshot(path=str(OUT / "readme-dashboard.png"), full_page=True,
                                        clip={"x": 0, "y": 0, "width": screens.DESKTOP["width"], "height": h["b"] + 24})
            browser.close()
        (OUT / "callouts.json").write_text(json.dumps(record, indent=2))
        print("mobile horizontal overflow:", {k: v for k, v in record.items() if k.endswith("_overflow_x")})
    finally:
        srv.terminate()
        shutil.rmtree(data_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
