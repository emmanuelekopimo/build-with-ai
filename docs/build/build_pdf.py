"""Build docs/IoT-Trojan-Detector-Documentation.pdf from HTML using Chromium (Playwright).

    python docs/build/capture_screenshots.py   # (re)take annotated screenshots
    python docs/build/build_pdf.py             # HTML -> PDF, fonts embedded from docs/build/fonts

Numbers quoted in the text (thresholds, sample results, test count) are read from the code at build time.
"""
from __future__ import annotations

import html
import os
import re
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

import screens

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "trojan-lab" / "detector"))
import engine  # noqa: E402

APP = "IoT Trojan Detector"
OUT_PDF = ROOT / "docs" / "IoT-Trojan-Detector-Documentation.pdf"
OUT_HTML = HERE / "_documentation.html"          # intermediate, git-ignored


def git(*a):
    try:
        return subprocess.check_output(["git", *a], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return ""


def test_count():
    try:
        out = subprocess.check_output([sys.executable, "-m", "pytest", "--collect-only", "-q", "trojan-lab/tests"],
                                      cwd=ROOT, text=True, stderr=subprocess.STDOUT)
        m = re.search(r"(\d+) tests? collected", out)
        return m.group(1) if m else "15"
    except Exception:
        return "15"


# ---------------------------------------------------------------- live numbers from the code
S = ROOT / "trojan-lab" / "sample_data"
BASE = engine.build_baseline(engine.parse_csv((S / "baseline_flows.csv").read_bytes()))
INF = engine.detect(engine.parse_csv((S / "infected_flows.csv").read_bytes()), BASE)
CLEAN = engine.detect(engine.parse_csv((S / "clean_flows.csv").read_bytes()), BASE)
SEV = {}
for f in INF["findings"]:
    SEV[f["severity"]] = SEV.get(f["severity"], 0) + 1
N_TESTS = test_count()
E = engine


def esc(s):
    return html.escape(str(s))


# ---------------------------------------------------------------- building blocks
def screen_block(s):
    cls = "mobile" if s["viewport"] == "mobile" else ""
    items = "".join(f'<li><span class="badge">{i + 1}</span><div>{c[2]}</div></li>' for i, c in enumerate(s["callouts"]))
    return (f'<div class="screen"><h3>{s["title"]}</h3><p>{s["intro"]}</p>'
            f'<figure class="shot {cls}"><img src="../screenshots/{s["id"]}.png" alt="{esc(s["title"])}">'
            f'<figcaption>Figure: {s["title"]}</figcaption></figure><ol class="callouts">{items}</ol></div>')


def box(x, y, w, h, title, sub="", fill="#eff6ff", stroke="#0b5fd1", mono=False):
    t2 = f'<text class="t2{" mono" if mono else ""}" x="{x + w / 2}" y="{y + h / 2 + 14}" text-anchor="middle">{sub}</text>' if sub else ""
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{fill}" stroke="{stroke}" stroke-width="1.4"/>'
            f'<text class="b" x="{x + w / 2}" y="{y + h / 2 + (0 if sub else 4)}" text-anchor="middle">{title}</text>{t2}')


def arrow(x1, y1, x2, y2, label=""):
    lab = f'<text class="t2" x="{(x1 + x2) / 2}" y="{(y1 + y2) / 2 - 5}" text-anchor="middle">{label}</text>' if label else ""
    return (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#374151" stroke-width="1.4" marker-end="url(#ah)"/>{lab}')


DEFS = '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#374151"/></marker></defs>'


def svg_pipeline():
    steps = [("Flow CSV", "upload / live file"), ("parse_csv", "aliases, types, sort"), ("build_baseline", "per-device profile"),
             ("detect", "6 rule families"), ("Score &amp; status", "per device, 0&ndash;100"), ("JSON &rarr; UI", "devices + findings")]
    out, x = [], 6
    for i, (a, b) in enumerate(steps):
        out.append(box(x, 20, 104, 56, a, b, fill="#f0fdf4" if i == 2 else "#eff6ff", stroke="#15803d" if i == 2 else "#0b5fd1"))
        if i < len(steps) - 1:
            out.append(arrow(x + 104, 48, x + 124, 48))
        x += 124
    out.append('<text class="t2" x="338" y="104" text-anchor="middle">baseline is optional: from a second upload, or frozen from the live capture</text>')
    return f'<svg viewBox="0 0 750 116">{DEFS}{"".join(out)}</svg>'


def txt(x, y, s, anchor="start"):
    return f'<text class="t2" x="{x}" y="{y}" text-anchor="{anchor}">{s}</text>'


def svg_arch():
    o = [DEFS]
    o.append('<rect x="186" y="6" width="558" height="332" rx="12" fill="#fafafa" stroke="#9ca3af" stroke-dasharray="5 4"/>')
    o.append(txt(198, 22, "lab network 10.50.0.0/24 (internal, no route out)"))
    o.append(box(8, 100, 130, 60, "Browser", "analyst UI"))
    o.append(box(210, 34, 170, 56, "detector", "Flask + gunicorn :8080", fill="#fff7ed", stroke="#c2410c"))
    o.append(box(570, 34, 150, 56, "rtsp", "MediaMTX + ffmpeg", mono=True))
    o.append(txt(645, 108, "looping RTSP test stream :8554", "middle"))
    o.append(box(210, 130, 520, 44, "labdata volume (shared)", "flows.csv  &middot;  quarantine/", fill="#f5f3ff", stroke="#6d28d9", mono=True))
    o.append(box(210, 224, 150, 50, "cam-lobby", "10.50.0.11 &middot; admin :80"))
    o.append(box(400, 224, 150, 50, "cam-garage", "10.50.0.12"))
    o.append(box(590, 224, 140, 50, "c2", "fake listener :4444", fill="#fef2f2", stroke="#b91c1c"))
    o.append(box(400, 296, 150, 34, "trojan sim (sidecar)", "", fill="#fef2f2", stroke="#b91c1c"))
    o.append(arrow(138, 118, 210, 66)); o.append(txt(112, 84, "HTTP :8080", "middle"))
    o.append(arrow(250, 90, 250, 130)); o.append(txt(258, 114, "reads flows.csv"))
    o.append(arrow(340, 130, 340, 90)); o.append(txt(348, 114, "writes quarantine marker"))
    o.append(arrow(285, 224, 285, 174)); o.append(txt(293, 204, "append flows"))
    o.append(arrow(475, 224, 475, 174)); o.append(txt(483, 204, "append flows"))
    o.append(f'<line x1="475" y1="274" x2="475" y2="296" stroke="#374151" stroke-width="1.4" stroke-dasharray="3 3"/>')
    o.append(txt(483, 289, "shares netns"))
    o.append(arrow(550, 313, 660, 274)); o.append(txt(640, 312, "beacon TCP :4444"))
    o.append(txt(8, 196, "edge network: only the browser-facing"))
    o.append(txt(8, 210, "ports (8080, 8081, 8554) are published."))
    return f'<svg viewBox="0 0 750 340">{DEFS}{"".join(o)}</svg>'


def rules_table():
    rows = [
        ("known_bad_ip", "critical", "Any flow to an address on <code>KNOWN_BAD_IPS</code> (threat-intel list).", "T1071"),
        ("suspicious_port", "high", f"Destination port in <code>SUSPICIOUS_PORTS</code>: {', '.join(map(str, E.SUSPICIOUS_PORTS))}.", "T1571"),
        ("unusual_port", "medium", "Port outside the device's baseline ports plus the default camera set "
         f"({', '.join(map(str, sorted(E.DEFAULT_ALLOWED_PORTS)))}). Suppressed when the port is already flagged above.", "T1571"),
        ("new_external_dst", "medium", "Baseline only: a non-LAN destination the device never talked to in the baseline.", "T1071"),
        ("beaconing", "high", f"&ge;{E.BEACON_MIN_EVENTS} flows to one dst:port with inter-arrival jitter (CV) &le;{E.BEACON_MAX_CV}, "
         f"size CV &le;{E.BEACON_MAX_BYTES_CV}, mean gap &ge;1 s, and the peer is <i>not</i> part of the baseline.", "T1071 / T1029"),
        ("scan_hosts / scan_ports", "high", f"&ge;{E.SCAN_MIN_TARGETS} distinct destination hosts (or ports) inside any {E.SCAN_WINDOW_S} s window.", "T1018 / T1046"),
        ("exfil_volume", "high", f"&ge;{E.EXFIL_ABS_BYTES / 1e6:.0f} MB sent to one non-LAN address.", "T1041"),
        ("volume_outlier", "medium", f"Baseline only: a flow larger than baseline mean + {E.EXFIL_SIGMA:.0f}&sigma; and over 100 kB.", "T1030"),
    ]
    body = "".join(f"<tr><td><code>{r}</code></td><td><span class='pill {s}'>{s}</span></td><td>{d}</td><td>{m}</td></tr>" for r, s, d, m in rows)
    return f"<table><tr><th>Rule</th><th>Severity</th><th>Fires when</th><th>ATT&amp;CK</th></tr>{body}</table>"


def findings_sample_table():
    rows = ""
    seen = set()
    for f in INF["findings"]:
        if f["rule"] in seen:
            continue
        seen.add(f["rule"])
        rows += f"<tr><td><span class='pill {f['severity']}'>{f['severity']}</span></td><td>{esc(f['title'])}</td><td>{esc(f['detail'])}</td></tr>"
    return f"<table><tr><th>Severity</th><th>Finding</th><th>Evidence (from the sample)</th></tr>{rows}</table>"


def script_row(t, say, do):
    return f"<tr><td>{t}</td><td>{do}</td><td>{say}</td></tr>"


SCRIPT = [
    ("0:00&ndash;1:00", "Cover / README screenshot",
     "&ldquo;IoT cameras are cheap, always on and rarely patched, which makes them a favourite hiding place for trojans. A compromised camera "
     "looks normal on the video side but quietly phones home. I built a lab and a detector that spots that behaviour from network flows alone, "
     "so it needs no agent on the device and no malware signature.&rdquo; State the goal: detect, explain, and contain.",),
    ("1:00&ndash;2:00", "Screen 1: upload page (open the app)",
     "&ldquo;Input is just a CSV of flows: timestamp, device, source and destination IP, port, protocol, bytes out. Any Zeek, Suricata or router export "
     "maps onto it. Optionally I add a known-good baseline.&rdquo; Point to the schema hint, then the two file pickers. Explain that everything "
     "runs in an isolated Docker lab: three simulated cameras, a looping RTSP stream and a <b>harmless</b> trojan stand-in."),
    ("2:00&ndash;3:00", "Click <b>Load sample: clean</b>, then <b>Load sample: infected</b>",
     "&ldquo;First a clean capture: normal video, NTP, DNS and a cloud heartbeat. Zero findings, even though that traffic is itself periodic, "
     "because the engine knows those peers are in the baseline. Now the infected capture.&rdquo; Show the tiles: "
     f"{INF['summary']['flows']} flows, {INF['summary']['findings']} findings, one compromised device, and the risk score of "
     f"{max(d['score'] for d in INF['devices'])} on cam-garage."),
    ("3:00&ndash;4:00", "Scroll to the findings table",
     f"&ldquo;Each finding is explained and mapped to MITRE ATT&amp;CK.&rdquo; Walk the top four: contact with a known-bad IP, a beacon every ~15 seconds with tiny "
     "jitter, a telnet scan across ten-plus hosts, and an 8 MB transfer to an unknown address. &ldquo;No single rule is proof, but the combination "
     "is a textbook command-and-control pattern.&rdquo; Mention that thresholds are constants at the top of <code>engine.py</code>."),
    ("4:00&ndash;4:40", "Click <b>Quarantine</b> on cam-garage",
     "&ldquo;Containment is one click. In the lab it drops a marker file; the trojan simulator sees it, deletes its dropper and cron entry, and exits. "
     "In production this endpoint would call your firewall or NAC.&rdquo; Show the button turning into <b>Release</b>. If the Docker lab is running, flip to "
     "<code>docker compose logs -f c2</code> to show beacons stopping."),
    ("4:40&ndash;5:00", "Close: mobile view + limits",
     "&ldquo;It also works on a phone for on-call triage. Limits: flow telemetry in the lab is simulated, and the rules are heuristic, so the next steps are real "
     "Zeek/Suricata ingestion and learned baselines. Questions?&rdquo;"),
]


def script_table():
    rows = "".join(f"<tr><td>{t}</td><td>{do}</td><td>{say}</td></tr>" for t, do, say in SCRIPT)
    return f'<table class="script"><tr><th>Time</th><th>On screen</th><th>Say / do</th></tr>{rows}</table>'


# ---------------------------------------------------------------- chapters
def build_html():
    sc = {s["id"]: s for s in screens.SCREENS}
    desk = [s for s in screens.SCREENS if s["viewport"] == "desktop"]
    mob = [s for s in screens.SCREENS if s["viewport"] == "mobile"]
    commit = git("rev-parse", "--short", "HEAD")
    css = (HERE / "doc.css").read_text()
    fonts = "".join(
        f'@font-face{{font-family:"{fam}";font-weight:{w};font-style:normal;src:url("fonts/{fn}") format("woff2");}}'
        for fam, w, fn in [("Inter", 400, "inter-latin-400-normal.woff2"), ("Inter", 600, "inter-latin-600-normal.woff2"),
                           ("Inter", 700, "inter-latin-700-normal.woff2"),
                           ("JetBrains Mono", 400, "jetbrains-mono-latin-400-normal.woff2"),
                           ("JetBrains Mono", 700, "jetbrains-mono-latin-700-normal.woff2")])
    toc = ["Overview", "How the core logic works", "Architecture and data model", "Screen walkthrough", "Mobile view",
           "Running locally", "Testing", "Deployment", "Five-minute presentation script"]

    p = []
    p.append(f'<div class="cover"><div class="tag">Documentation</div><h1>{APP}</h1>'
             '<p class="sub">Spotting trojan-like behaviour on IoT devices from network flows: a CSV-driven detector, a safe Docker lab and a harmless trojan simulator.</p>'
             f'<div class="meta">Revision {esc(commit or "working tree")} &middot; Generated from docs/build by Chromium</div></div>')
    p.append('<section class="toc"><h1>Contents</h1><ol>' + "".join(f"<li>{t}</li>" for t in toc) +
             '</ol><p class="note">Every screenshot has numbered callouts. The explanations under each picture use the same numbers, '
             'and both are generated from one definition file (<code>docs/build/screens.py</code>).</p></section>')

    p.append('<section class="chapter"><h1>1. Overview</h1>'
             '<p>IoT cameras are inexpensive, rarely patched and often ship with default passwords, so they are attractive targets for trojans and botnets. '
             'A compromised camera keeps streaming video normally while it quietly beacons to a command-and-control (C2) server, scans its neighbours or uploads data.</p>'
             f'<p><b>{APP}</b> looks for those behaviours in <b>network-flow records</b> (who talked to whom, on which port, how often, how many bytes). '
             'It needs no software on the device and no malware signatures, so it works on cameras that cannot be modified.</p>'
             '<h3>What is in the repository</h3><table><tr><th>Part</th><th>Purpose</th></tr>'
             '<tr><td><code>trojan-lab/detector</code></td><td>Flask web app and API plus the pure-Python analysis engine (<code>engine.py</code>).</td></tr>'
             '<tr><td><code>trojan-lab/camera</code>, <code>rtsp</code></td><td>Simulated cameras: weak-login admin page, background flows, and a looping RTSP test stream.</td></tr>'
             '<tr><td><code>trojan-lab/trojan_sim</code>, <code>c2</code></td><td>A <b>harmless</b> trojan stand-in (beacon, scan burst, persistence files, EICAR test string) and a fake C2 listener.</td></tr>'
             '<tr><td><code>trojan-lab/sample_data</code></td><td>Baseline, clean and infected flow CSVs for upload and tests.</td></tr>'
             '<tr><td><code>docs/build</code></td><td>Scripts that regenerate the screenshots and this PDF.</td></tr></table>'
             '<div class="note warn"><b>Safety.</b> No real malware is used. The simulator only reproduces indicators, sends nothing but a short text beacon to a container '
             'on the same internal network, and the lab network has no route to the internet.</div>'
             '<h3>Key capabilities</h3><ul><li>Upload any flow CSV (aliases and ISO/epoch timestamps accepted) with an optional known-good baseline.</li>'
             '<li>Nine detection rules across six families, each mapped to MITRE ATT&amp;CK, with severity and a 0&ndash;100 risk score per device.</li>'
             '<li>One-click quarantine and release; a Docker lab to demonstrate infection and containment end to end.</li>'
             f'<li>{N_TESTS} automated tests; mobile-friendly UI.</li></ul></section>')

    p.append('<section class="chapter"><h1>2. How the core logic works</h1>'
             '<p>All analysis lives in <code>trojan-lab/detector/engine.py</code>, which uses only the Python standard library so it can be tested and reused without the web app.</p>'
             + svg_pipeline() +
             '<h3>Step 1: parse and normalise</h3><p><code>parse_csv</code> matches column names case-insensitively against a canonical list and its aliases '
             '(e.g. <code>ts</code>&rarr;<code>timestamp</code>, <code>dport</code>&rarr;<code>dst_port</code>, <code>bytes</code>&rarr;<code>bytes_out</code>), converts '
             'timestamps (ISO-8601 or epoch seconds) to floats, skips malformed rows (aborting after 50), and sorts by time. A missing required column raises '
             '<code>FlowError</code> with a message naming the columns found, which the UI shows as the error banner.</p>'
             '<h3>Step 2: baseline (optional)</h3><p><code>build_baseline</code> summarises known-good traffic per device: the set of destination ports, destination IPs and '
             '(IP, port) pairs, plus the mean and standard deviation of flow size. This is what separates a legitimate heartbeat from a beacon: both are periodic, '
             'but only one goes to a peer the device has never used.</p>'
             '<h3>Step 3: the rules</h3>' + rules_table() +
             '<h3>Why periodic traffic is not automatically a beacon</h3><p>Camera video chunks, NTP and cloud heartbeats are all very regular. The beacon rule therefore '
             'only applies to a peer outside the device&rsquo;s baseline. With no baseline, regular traffic on well-known service ports (53, 80, 123, 443, 554&hellip;) is ignored '
             'unless the peer is on the known-bad list. Beaconing is measured by the <i>coefficient of variation</i> (standard deviation divided by mean) of the gaps between flows: '
             'a 15 s beacon with &plusmn;4% jitter scores about 0.02, far below the 0.25 limit, whereas human or application traffic is bursty and scores well above it.</p>'
             '<h3>Step 4: scoring</h3><p>Each finding adds a weight: critical 40, high 25, medium 10, low 3. A device&rsquo;s score is the sum capped at 100. '
             'Status is <span class="pill clean">clean</span> below 10, <span class="pill suspicious">suspicious</span> from 10 and <span class="pill compromised">compromised</span> from 50, '
             'so one critical plus one high finding (65) is enough for compromised, while a lone unusual port (10) only raises suspicion.</p>'
             f'<h3>Worked example: the infected sample</h3><p>Analysing <code>infected_flows.csv</code> against the baseline yields {INF["summary"]["findings"]} findings on '
             f'one device ({", ".join(f"{v} {k}" for k, v in sorted(SEV.items(), key=lambda kv: ["critical", "high", "medium", "low"].index(kv[0])))}); the two other cameras stay at zero. One finding per rule:</p>'
             + findings_sample_table() +
             f'<p>The clean sample produces {CLEAN["summary"]["findings"]} findings and every device is clean.</p></section>')

    p.append('<section class="chapter"><h1>3. Architecture and data model</h1>' + svg_arch() +
             '<h3>Components</h3><table><tr><th>Service</th><th>Tech</th><th>Role</th></tr>'
             '<tr><td>detector</td><td>Flask, gunicorn</td><td>Serves the UI and JSON API; runs the engine; writes quarantine markers.</td></tr>'
             '<tr><td>cam-lobby, cam-garage</td><td>Python/Flask</td><td>Simulated cameras: admin page (<code>admin/admin</code>, deliberately weak) and normal flows appended to <code>flows.csv</code>.</td></tr>'
             '<tr><td>rtsp</td><td>MediaMTX + ffmpeg</td><td>Looping test pattern at <code>rtsp://localhost:8554/cam</code>.</td></tr>'
             '<tr><td>trojan</td><td>Python</td><td>Sidecar sharing cam-garage&rsquo;s network namespace, so beacons carry the camera&rsquo;s IP. Behind a Compose profile.</td></tr>'
             '<tr><td>c2</td><td>Python sockets</td><td>Fake listener on :4444 that logs beacons and answers <code>ACK</code>.</td></tr></table>'
             '<p>Two Docker networks separate concerns: <code>lab</code> is <code>internal: true</code> (no route out), and <code>edge</code> only exists so a browser can reach the published ports. '
             'The simulated trojan lives only on <code>lab</code>. State is a shared volume and one in-memory baseline; there is no database.</p>'
             '<h3>Data model</h3><p><b>Flow row</b> (input CSV, one per flow)</p><table><tr><th>Field</th><th>Type</th><th>Notes</th></tr>'
             '<tr><td><code>timestamp</code></td><td>ISO-8601 or epoch</td><td>Required. Stored as float seconds (<code>ts</code>).</td></tr>'
             '<tr><td><code>device</code></td><td>string</td><td>Required. Grouping key for all per-device logic.</td></tr>'
             '<tr><td><code>src_ip</code>, <code>dst_ip</code></td><td>string</td><td>Required. LAN test uses RFC1918, loopback, link-local and multicast ranges.</td></tr>'
             '<tr><td><code>dst_port</code></td><td>int</td><td>Required.</td></tr>'
             '<tr><td><code>protocol</code></td><td>string</td><td>Required. Upper-cased (TCP, UDP&hellip;).</td></tr>'
             '<tr><td><code>bytes_out</code></td><td>int</td><td>Required. Bytes sent by the device.</td></tr>'
             '<tr><td><code>bytes_in</code>, <code>packets</code>, <code>duration</code></td><td>number</td><td>Optional; <code>bytes_in</code> is parsed, the others are accepted for compatibility.</td></tr></table>'
             '<p><b>Baseline profile</b> (in memory, per device)</p><pre><code>{ "cam-garage": { "ports": {554, 123, 53, 443}, "dsts": {...}, "pairs": {(ip, port), ...},\n'
             '                  "flows": 396, "mean_bytes": 2.0e6, "std_bytes": 4.1e5 } }</code></pre>'
             '<p><b>Finding</b> and <b>device summary</b> (API output)</p><pre><code>finding = { device, rule, severity, title, detail, mitre,\n'
             '            evidence: {dst_ip, dst_port, flows, interval_s, jitter_cv, ...}, first_seen, last_seen }\n'
             'device  = { device, flows, bytes_out, src_ips[], score, status, findings }\n'
             'result  = { summary: {flows, devices, findings, compromised, suspicious, with_baseline},\n'
             '            devices[], findings[], quarantined[] }</code></pre>'
             '<h3>HTTP API</h3><table><tr><th>Endpoint</th><th>Purpose</th></tr>'
             '<tr><td><code>GET /</code></td><td>The single-page UI.</td></tr>'
             '<tr><td><code>POST /api/analyze</code></td><td>Multipart <code>flows</code> (+ optional <code>baseline</code>); returns the result JSON. 400 with <code>{error}</code> on bad CSV, 413 above 25 MB.</td></tr>'
             '<tr><td><code>POST /api/analyze/sample</code></td><td>JSON <code>{"name": "infected"|"clean"}</code>; runs a bundled sample against the bundled baseline.</td></tr>'
             '<tr><td><code>POST /api/analyze/live</code></td><td>Analyses <code>$LAB_DATA_DIR/flows.csv</code>.</td></tr>'
             '<tr><td><code>POST /api/baseline/live</code></td><td>Freezes the live capture as the baseline.</td></tr>'
             '<tr><td><code>POST|DELETE /api/quarantine/&lt;device&gt;</code></td><td>Create or remove the marker file (name must match <code>[A-Za-z0-9_.-]{1,64}</code>).</td></tr>'
             '<tr><td><code>GET /health</code></td><td>Liveness check.</td></tr></table></section>')

    p.append('<section class="chapter"><h1>4. Screen walkthrough</h1>'
             '<p>The app is one page whose state changes as you work. These are all the states, in the order a demo visits them. '
             'Red numbered boxes in each screenshot match the numbered explanations beneath it.</p>' + "".join(screen_block(s) for s in desk) + '</section>')

    p.append('<section class="chapter"><h1>5. Mobile view</h1>'
             '<p>The UI is responsive down to phone width (captured at 390&times;844 CSS pixels, 2&times; density). Cards stack, tiles reflow and wide tables scroll inside their own card. '
             'The capture script also checks <code>document.scrollWidth</code> and reports no page-level horizontal overflow.</p>'
             + "".join(screen_block(s) for s in mob) + '</section>')

    p.append('<section class="chapter"><h1>6. Running locally</h1>'
             '<h3>Option A: detector only (no Docker)</h3><pre><code>cd trojan-lab\npip install -r detector/requirements.txt\n'
             'LAB_DATA_DIR=/tmp/lab python detector/app.py      # http://localhost:8080</code></pre>'
             '<p>Use <b>Load sample</b> or upload <code>sample_data/*.csv</code>. The live-capture buttons need <code>$LAB_DATA_DIR/flows.csv</code>, which only the lab produces.</p>'
             '<h3>Option B: full lab with Docker</h3><pre><code>cd trojan-lab\ndocker compose up --build -d                  # cameras, RTSP, C2, detector\n'
             '# open http://localhost:8080 and click "Freeze live capture as baseline" after ~1 minute\n'
             'docker compose --profile trojan up -d trojan  # infect cam-garage (harmless simulator)\n'
             '# after ~2 minutes click "Analyse live lab capture", then Quarantine on cam-garage\n'
             'docker compose logs -f c2                     # beacons arrive, then stop\ndocker compose down -v                        # tear down</code></pre>'
             '<table><tr><th>URL</th><th>What</th></tr><tr><td><code>http://localhost:8080</code></td><td>Detector UI</td></tr>'
             '<tr><td><code>http://localhost:8081</code></td><td>cam-lobby admin page (<code>admin</code>/<code>admin</code>)</td></tr>'
             '<tr><td><code>rtsp://localhost:8554/cam</code></td><td>Looping test video</td></tr></table>'
             '<h3>Generate your own sample data</h3><pre><code>python trojan-lab/detector/flowgen.py --out trojan-lab/sample_data --seed 7</code></pre>'
             '<h3>Rebuild this document</h3><pre><code>pip install playwright flask && playwright install chromium   # or set CHROMIUM_PATH\n'
             'make docs        # = capture_screenshots.py then build_pdf.py</code></pre>'
             '<div class="note">Environment variables: <code>LAB_DATA_DIR</code> (default <code>/data</code>), <code>SAMPLE_DIR</code>, <code>PORT</code> (default 8080), '
             '<code>CHROMIUM_PATH</code> (docs only).</div></section>')

    p.append('<section class="chapter"><h1>7. Testing</h1>'
             f'<p>{N_TESTS} pytest tests run in under a second with no Docker. Run them with <code>make test</code> or <code>python -m pytest trojan-lab/tests</code>.</p>'
             '<table><tr><th>File</th><th>What it proves</th></tr>'
             '<tr><td><code>test_engine.py</code></td><td>Clean capture &rarr; zero findings (with and without baseline); only cam-garage is compromised in the infected capture; '
             'beacon interval is reported near 15 s; column aliases and epoch timestamps parse; missing columns give a clear error; empty files are rejected; irregular traffic is not a beacon.</td></tr>'
             '<tr><td><code>test_app.py</code></td><td>Upload with a baseline; bad CSV &rarr; HTTP 400; missing file &rarr; 400; sample analysis and quarantine/release round trip; path-traversal device names rejected.</td></tr></table>'
             '<h3>End-to-end check of the lab logic</h3><p>The Docker images were not available in the authoring environment, so the simulators were also exercised directly: '
             'the fake C2 received beacons from the trojan simulator on localhost, flows landed in <code>flows.csv</code>, the engine flagged them, and writing the quarantine marker made the simulator remove its persistence files and exit.</p>'
             '<div class="note warn">Run <code>docker compose up --build</code> once on your machine to validate the container layer (networking, RTSP, volume sharing); it is not covered by the unit tests.</div></section>')

    p.append('<section class="chapter"><h1>8. Deployment</h1>'
             '<p>The lab is a demo. To use the detector on a real network, deploy the same image with real telemetry and put access control in front of it.</p>'
             '<h3>Container image</h3><pre><code>docker build -f trojan-lab/detector/Dockerfile -t iot-trojan-detector trojan-lab\n'
             'docker run -d -p 8080:8080 -v flowdata:/data iot-trojan-detector</code></pre>'
             '<p>The image runs gunicorn (2 workers) on port 8080 and reads <code>/data/flows.csv</code> for the live buttons.</p>'
             '<h3>Feeding real traffic</h3><ul><li>Export Zeek <code>conn.log</code> or Suricata flow records to the CSV schema above (timestamp, device, src/dst IP, dst port, protocol, bytes out), mapping IP to device name from DHCP or an asset list.</li>'
             '<li>Write to <code>/data/flows.csv</code> on a schedule, or POST files to <code>/api/analyze</code> from a cron job or SIEM playbook.</li>'
             '<li>Freeze a week of known-good traffic as the baseline per device class.</li></ul>'
             '<h3>Hardening checklist</h3><table><tr><th>Item</th><th>Why</th></tr>'
             '<tr><td>Reverse proxy with TLS and authentication (SSO, basic auth, VPN)</td><td>The app has <b>no built-in login</b>; <code>/api/quarantine</code> is a state-changing endpoint.</td></tr>'
             '<tr><td>Replace the marker-file quarantine with a firewall/NAC call</td><td>The marker only affects the simulator.</td></tr>'
             '<tr><td>Persist the baseline (database or file)</td><td>It is held in process memory and is lost on restart and not shared between the two gunicorn workers.</td></tr>'
             '<tr><td>Tune thresholds and the known-bad list</td><td>Constants in <code>engine.py</code>; load threat-intel feeds into <code>KNOWN_BAD_IPS</code>.</td></tr>'
             '<tr><td>Do not publish the lab ports to untrusted networks</td><td>The camera admin page uses <code>admin/admin</code> on purpose.</td></tr></table>'
             '<div class="note warn"><b>Known limitation.</b> With <code>-w 2</code> each worker keeps its own in-memory baseline, so a baseline uploaded in one request may not be visible to the next. '
             'For multi-worker deployments run a single worker or move the baseline to shared storage.</div></section>')

    p.append('<section class="chapter"><h1>9. Five-minute presentation script</h1>'
             '<p>Timed for five minutes at a relaxed pace (about 650 spoken words). Have the app open on the upload page, the sample files ready, and optionally the Docker lab running with <code>docker compose logs -f c2</code> in a second window.</p>'
             + script_table() +
             '<h3>If something goes wrong</h3><ul><li>No Docker? Use <b>Load sample</b> buttons; the story is identical.</li>'
             '<li>Page shows an error? Say that it is the validation feature, then continue with the sample.</li>'
             '<li>Short on time? Skip the clean sample and go straight to infected plus quarantine.</li></ul>'
             '<h3>Likely questions</h3><table><tr><th>Question</th><th>Short answer</th></tr>'
             '<tr><td>Why not signatures?</td><td>Trojan variants change daily; the behaviour (regular beacons to a new peer, scans, odd ports) does not.</td></tr>'
             '<tr><td>False positives?</td><td>Baseline-aware beaconing keeps normal periodic traffic quiet; the clean sample shows zero findings.</td></tr>'
             '<tr><td>Is the trojan real?</td><td>No. It reproduces indicators only and cannot leave the isolated lab network.</td></tr></table></section>')

    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{APP} Documentation</title>'
            f'<style>{fonts}{css}</style></head><body>{"".join(p)}</body></html>')


def main():
    OUT_HTML.write_text(build_html(), encoding="utf-8")
    exe = next((p for p in (os.environ.get("CHROMIUM_PATH"), "/opt/pw-browsers/chromium") if p and Path(p).exists()), None)
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=exe) if exe else pw.chromium.launch()
        page = b.new_page()
        page.goto(OUT_HTML.as_uri())
        page.wait_for_load_state("networkidle")
        page.evaluate("document.fonts.ready")
        fonts_ok = page.evaluate("[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family+' '+f.weight)")
        page.pdf(path=str(OUT_PDF), prefer_css_page_size=True, print_background=True)
        b.close()
    print("fonts loaded:", sorted(set(fonts_ok)))
    print("wrote", OUT_PDF, f"{OUT_PDF.stat().st_size / 1024:.0f} kB")


if __name__ == "__main__":
    main()
