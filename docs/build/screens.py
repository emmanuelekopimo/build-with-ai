"""Single source of truth for every documented screen.

capture_screenshots.py reads this to take + annotate the screenshots; build_pdf.py reads it to write the
numbered explanation under each image, so the numbers in the picture and the text can never drift apart.

Callout = (css selector, anchor, explanation). Numbers are assigned in list order starting at 1.
anchor: where the numbered badge sits on the element's outline: tl, tr, l.
"""

DESKTOP = {"width": 1180, "height": 900}
MOBILE = {"width": 390, "height": 844}

SCREENS = [
    {
        "id": "01-landing", "viewport": "desktop", "title": "Upload screen (landing page)",
        "clip": ["main > .card:nth-of-type(1)"],
        "intro": "The detector is a single page. It opens on the upload card, where every analysis starts.",
        "callouts": [
            ("#flows", "tl", "<b>Capture to analyse (required).</b> The flow CSV to inspect: one row per network flow, exported from Zeek, Suricata, a router or the lab simulators."),
            ("#baseline", "tl", "<b>Known-good baseline (optional).</b> A CSV of normal traffic. It teaches the engine each device's usual ports and destinations; without it only built-in rules apply."),
            ("#f button", "tr", "<b>Analyse.</b> Uploads both files to <code>POST /api/analyze</code> and renders the result below the card."),
            ("main > .card:nth-of-type(1) p.mut", "tl", "<b>Schema hint.</b> The seven required columns are generated from <code>engine.REQUIRED</code>; common aliases and ISO or epoch timestamps are also accepted."),
            ("[data-s=infected]", "tl", "<b>Load sample: infected / clean.</b> Runs a bundled capture against the bundled baseline, so you can try the tool with no files."),
            ("#live", "tl", "<b>Analyse live lab capture.</b> Reads <code>flows.csv</code> written by the Docker lab's simulated cameras and trojan."),
            ("#base", "tl", "<b>Freeze live capture as baseline.</b> Declares the traffic seen so far as &ldquo;known good&rdquo;; used in step 2 of the demo, before the trojan starts."),
        ],
    },
    {
        "id": "02-files-selected", "viewport": "desktop", "title": "Files selected, ready to analyse",
        "clip": ["main > .card:nth-of-type(1)"],
        "intro": "Choosing files only fills the form; nothing is sent until <b>Analyse</b> is pressed. Here the infected sample capture and the baseline are chosen.",
        "callouts": [
            ("#flows", "tl", "The capture file is attached (<code>infected_flows.csv</code>)."),
            ("#baseline", "tl", "The baseline file is attached (<code>baseline_flows.csv</code>). Leave this empty to reuse the last baseline or run rules only."),
            ("#f button", "tr", "Press <b>Analyse</b> to send both files. Uploads are limited to 25 MB."),
        ],
    },
    {
        "id": "03-error", "viewport": "desktop", "title": "Validation error",
        "clip": ["main > .card:nth-of-type(1)"],
        "intro": "A CSV that lacks required columns is rejected with a specific, readable message instead of a stack trace.",
        "callouts": [
            ("#err", "tl", "<b>Error banner.</b> Names the missing column(s) and lists the columns that were found, so the CSV can be fixed quickly. The server returns HTTP 400 with <code>{&quot;error&quot;: &hellip;}</code>."),
            ("#flows", "tl", "The offending file is still selected; fix it and press Analyse again."),
        ],
    },
    {
        "id": "04-results", "viewport": "desktop", "title": "Results: summary tiles and device table",
        "clip": ["#out > .card:nth-of-type(1)", "#out > .card:nth-of-type(2)"],
        "intro": "After analysis the page shows an at-a-glance summary and one row per device. The infected sample contains one trojan-like device among three cameras.",
        "callouts": [
            ("#tiles", "tl", "<b>Summary tiles.</b> Flows analysed, devices seen, total findings, how many devices are compromised or suspicious, and whether a baseline was used."),
            ("#devs tr:first-child td:nth-child(2)", "tl", "<b>Status pill.</b> <i>clean</i> (score &lt; 10), <i>suspicious</i> (10&ndash;49) or <i>compromised</i> (50+). Rows are sorted riskiest first."),
            ("#devs tr:first-child td:nth-child(3)", "tl", "<b>Risk score</b> (0&ndash;100): the sum of finding weights (critical 40, high 25, medium 10, low 3), capped at 100."),
            ("#devs tr:first-child td:nth-child(5)", "tl", "<b>Bytes out.</b> Total data the device sent; a quick sanity check next to the exfiltration findings."),
            ("#devs tr:first-child td:nth-child(7)", "tl", "<b>Quarantine.</b> Response action, shown only for devices that are not clean."),
        ],
    },
    {
        "id": "05-findings", "viewport": "desktop", "title": "Findings table", "truncate_findings": 7,
        "clip": ["#out > .card:nth-of-type(3)"],
        "intro": "Every detection becomes one finding with a severity, a human explanation, a MITRE ATT&amp;CK technique and the time window it covers. The screenshot shows the first seven rows; the sample capture produces 22 findings in total.",
        "callouts": [
            ("#fnd tr:first-child td:nth-child(1)", "tl", "<b>Severity.</b> Critical and high findings come first. Colour and text both carry the severity, so it is readable without colour."),
            ("#fnd tr:first-child td:nth-child(3)", "tl", "<b>Finding.</b> What was detected, e.g. contact with a known-bad IP or periodic beaconing."),
            ("#fnd tr:first-child td:nth-child(4)", "tl", "<b>Detail.</b> The evidence behind it: flow counts, mean beacon interval, jitter, megabytes sent."),
            ("#fnd tr:first-child td:nth-child(5)", "tl", "<b>ATT&amp;CK.</b> The MITRE technique the behaviour maps to, handy for SOC reports."),
            ("#fnd tr:first-child td:nth-child(6)", "tl", "<b>Window (UTC).</b> First and last time the behaviour was seen in the capture."),
        ],
    },
    {
        "id": "06-live", "viewport": "desktop", "title": "Live lab capture",
        "clip": ["#out > .card:nth-of-type(1)", "#out > .card:nth-of-type(2)"],
        "intro": "In the Docker lab the cameras and the trojan simulator append flow rows to a shared <code>flows.csv</code>. <b>Analyse live lab capture</b> reads that file, using whichever baseline was frozen earlier.",
        "callouts": [
            ("#live", "tl", "Reads the live <code>flows.csv</code> instead of an upload."),
            ("#tiles .tile:nth-child(6)", "tl", "<b>Baseline: yes.</b> Confirms the comparison used a known-good profile, which enables the &ldquo;new destination&rdquo; and &ldquo;beacon outside baseline&rdquo; logic."),
            ("#devs tr:first-child td:nth-child(1)", "tl", "The infected camera is identified by device name and source IP."),
        ],
    },
    {
        "id": "07-clean", "viewport": "desktop", "title": "A clean capture",
        "clip": ["#out > .card:nth-of-type(1)", "#out > .card:nth-of-type(2)", "#out > .card:nth-of-type(3)"],
        "intro": "Normal camera traffic (RTSP video, NTP, DNS, cloud heartbeat) produces zero findings, even though that traffic is itself periodic. This is what keeps false positives low.",
        "callouts": [
            ("#tiles .tile:nth-child(3)", "tl", "<b>0 findings.</b>"),
            ("#devs tr:first-child td:nth-child(2)", "tl", "Every device is <i>clean</i> with a risk score of 0, so no Quarantine button is offered."),
            ("#fnd td", "tl", "The findings table states that nothing was found."),
        ],
    },
    {
        "id": "08-quarantine", "viewport": "desktop", "title": "Quarantine and release",
        "clip": ["#out > .card:nth-of-type(2)"],
        "intro": "Pressing <b>Quarantine</b> calls <code>POST /api/quarantine/&lt;device&gt;</code>. In the lab this writes a marker file that the trojan simulator notices, after which it deletes its persistence files and exits.",
        "callouts": [
            ("#devs tr:first-child td:nth-child(2)", "tl", "The device is still reported as compromised: quarantine is a response action, not a verdict change."),
            ("#devs tr:first-child td:nth-child(7)", "tl", "<b>Release</b> replaces the Quarantine button and calls <code>DELETE /api/quarantine/&lt;device&gt;</code>, which removes the marker."),
        ],
    },
    {
        "id": "m01-landing", "viewport": "mobile", "title": "Mobile: upload screen",
        "clip": ["main > .card:nth-of-type(1)"],
        "intro": "On a phone the layout is a single column. File pickers and buttons wrap, and the page never scrolls sideways.",
        "callouts": [
            ("#flows", "tl", "The two file pickers stack vertically."),
            ("#f button", "tr", "<b>Analyse</b> keeps a full-size tap target."),
            ("[data-s=infected]", "tl", "The sample, live and baseline buttons wrap onto extra rows."),
        ],
    },
    {
        "id": "m02-results", "viewport": "mobile", "title": "Mobile: summary and devices",
        "clip": ["#out > .card:nth-of-type(1)", "#out > .card:nth-of-type(2)"],
        "intro": "Summary tiles reflow into a two-column grid. The device table sits in a horizontally scrollable container, so only the table scrolls, not the page.",
        "callouts": [
            ("#tiles", "tl", "Tiles reflow to two columns."),
            ("#devs tr:first-child td:nth-child(1)", "tl", "Device name and source IP are in the first column; swipe the table sideways to reach status, risk, bytes out and the Quarantine action. The page itself does not scroll sideways."),
        ],
    },
    {
        "id": "m03-findings", "viewport": "mobile", "title": "Mobile: findings", "truncate_findings": 4,
        "clip": ["#out > .card:nth-of-type(3)"],
        "intro": "The findings table also scrolls inside its own card; severity and finding title are visible first.",
        "callouts": [
            ("#fnd tr:first-child td:nth-child(1)", "tl", "Severity pill."),
            ("#fnd tr:first-child td:nth-child(3)", "tl", "Finding title; swipe left for detail, ATT&amp;CK mapping and time window."),
        ],
    },
]
