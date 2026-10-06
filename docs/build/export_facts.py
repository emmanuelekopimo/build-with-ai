"""Export numbers, tables and diagram images that build_docx.js needs.

    python docs/build/export_facts.py      # writes docs/build/_facts.json and docs/screenshots/fig-*.png

Everything quoted in the Word document (thresholds, sample results, test names) comes from the code here,
so the .docx cannot drift from the implementation.
"""
from __future__ import annotations

import html
import json
import os
import re
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

import build_pdf as bp          # re-uses engine import, SVG diagrams and sample results
import screens

HERE = Path(__file__).resolve().parent
ROOT = bp.ROOT
E = bp.E
OUT = ROOT / "docs" / "screenshots"


def plain(s: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def rules():
    ports = ", ".join(map(str, E.SUSPICIOUS_PORTS))
    allowed = ", ".join(map(str, sorted(E.DEFAULT_ALLOWED_PORTS)))
    return [
        ["known_bad_ip", "Critical", "Any flow to an address on the KNOWN_BAD_IPS threat-intelligence list.", "T1071"],
        ["suspicious_port", "High", f"Destination port in SUSPICIOUS_PORTS ({ports}).", "T1571"],
        ["unusual_port", "Medium", f"Destination port outside the device baseline plus the default camera set ({allowed}); suppressed if already flagged.", "T1571"],
        ["new_external_dst", "Medium", "Baseline only: non-LAN destination never seen in the baseline.", "T1071"],
        ["beaconing", "High", f"At least {E.BEACON_MIN_EVENTS} flows to one destination:port with inter-arrival jitter (CV) <= {E.BEACON_MAX_CV}, size CV <= {E.BEACON_MAX_BYTES_CV}, mean gap >= 1 s, and a peer outside the baseline.", "T1071 / T1029"],
        ["scan_hosts / scan_ports", "High", f"At least {E.SCAN_MIN_TARGETS} distinct destination hosts (or ports) within any {E.SCAN_WINDOW_S}-second window.", "T1018 / T1046"],
        ["exfil_volume", "High", f"At least {E.EXFIL_ABS_BYTES / 1e6:.0f} MB sent to a single non-LAN address.", "T1041"],
        ["volume_outlier", "Medium", f"Baseline only: a flow above baseline mean + {E.EXFIL_SIGMA:.0f} standard deviations and above 100 kB.", "T1030"],
    ]


def tests():
    out = subprocess.check_output([sys.executable, "-m", "pytest", "--collect-only", "-q", "trojan-lab/tests"],
                                  cwd=ROOT, text=True, stderr=subprocess.STDOUT)
    return [l.split("::", 1)[1] for l in out.splitlines() if "::" in l]


def first_per_rule(res):
    seen, rows = set(), []
    for f in res["findings"]:
        if f["rule"] in seen:
            continue
        seen.add(f["rule"])
        rows.append([f["severity"].capitalize(), f["title"], f["detail"], f["mitre"]])
    return rows


def render_diagrams():
    css = (HERE / "doc.css").read_text()
    fonts = "".join(
        f'@font-face{{font-family:"{fam}";font-weight:{w};src:url("fonts/{fn}") format("woff2");}}'
        for fam, w, fn in [("Inter", 400, "inter-latin-400-normal.woff2"), ("Inter", 700, "inter-latin-700-normal.woff2"),
                           ("JetBrains Mono", 400, "jetbrains-mono-latin-400-normal.woff2")])
    page = (f"<!doctype html><meta charset=utf-8><style>{fonts}{css}body{{background:#fff;margin:0;padding:12px;width:940px}}"
            f"svg{{width:916px;margin:0 0 4px}}</style><div id=a>{bp.svg_arch()}</div><div id=p>{bp.svg_pipeline()}</div>")
    tmp = HERE / "_diagrams.html"
    tmp.write_text(page, encoding="utf-8")
    exe = next((p for p in (os.environ.get("CHROMIUM_PATH"), "/opt/pw-browsers/chromium") if p and Path(p).exists()), None)
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=exe) if exe else pw.chromium.launch()
        pg = b.new_page(device_scale_factor=2)
        pg.goto(tmp.as_uri()); pg.wait_for_load_state("networkidle")
        pg.locator("#a").screenshot(path=str(OUT / "fig-architecture.png"))
        pg.locator("#p").screenshot(path=str(OUT / "fig-pipeline.png"))
        b.close()
    tmp.unlink()


def main():
    facts = {
        "constants": {k: getattr(E, k) for k in ("BEACON_MIN_EVENTS", "BEACON_MAX_CV", "BEACON_MAX_BYTES_CV", "SCAN_WINDOW_S",
                                                 "SCAN_MIN_TARGETS", "EXFIL_ABS_BYTES", "EXFIL_SIGMA")},
        "severity_score": E.SEVERITY_SCORE,
        "suspicious_ports": {str(k): v for k, v in E.SUSPICIOUS_PORTS.items()},
        "allowed_ports": sorted(E.DEFAULT_ALLOWED_PORTS),
        "rules": rules(),
        "tests": tests(),
        "infected": {"summary": bp.INF["summary"], "devices": bp.INF["devices"], "per_rule": first_per_rule(bp.INF),
                     "severity_counts": bp.SEV},
        "clean": {"summary": bp.CLEAN["summary"], "devices": bp.CLEAN["devices"]},
        "screens": [{"id": s["id"], "viewport": s["viewport"], "title": plain(s["title"]), "intro": plain(s["intro"]),
                     "callouts": [plain(c[2]) for c in s["callouts"]]} for s in screens.SCREENS],
        "commit": bp.git("rev-parse", "--short", "HEAD"),
    }
    (HERE / "_facts.json").write_text(json.dumps(facts, indent=1), encoding="utf-8")
    render_diagrams()
    print("facts:", len(facts["tests"]), "tests,", facts["infected"]["summary"]["findings"], "findings; diagrams written")


if __name__ == "__main__":
    main()
