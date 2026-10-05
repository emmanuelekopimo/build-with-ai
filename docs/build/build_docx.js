/* Builds docs/IoT-Trojan-Detector-Project-Documentation.docx in the dissertation layout of the supplied example
 * (title page, acknowledgement, contents, numbered chapters, table/figure captions, references, appendices).
 *
 *   python docs/build/export_facts.py     # facts + diagrams from the code
 *   python docs/build/capture_screenshots.py   # screenshots (already committed)
 *   node   docs/build/build_docx.js       # -> .docx (two passes: the 2nd fills real page numbers into the contents page)
 *
 * Page numbers are measured by converting pass 1 to PDF with LibreOffice; if soffice/pdftotext are missing the
 * contents page is written without page numbers.
 */
const { ROOT, path, fs, runs, Doc, excerpt, fmtN, makeDocument, tocParagraphs, buildTwoPass, docx } = require('./docx_common');
const { Paragraph, TextRun, AlignmentType } = docx;
const OUT = path.join(ROOT, 'docs', 'IoT-Trojan-Detector-Project-Documentation.docx');
const facts = JSON.parse(fs.readFileSync(path.join(__dirname, '_facts.json'), 'utf8'));
const C = facts.constants;

const sevOrder = ['critical', 'high', 'medium', 'low'];
const sevText = Object.entries(facts.infected.severity_counts).sort((a, b) => sevOrder.indexOf(a[0]) - sevOrder.indexOf(b[0]))
  .map(([k, v]) => `${v} ${k}`).join(', ');
const inf = facts.infected, cln = facts.clean;
const garage = inf.devices.find((d) => d.status === 'compromised');

// ------------------------------------------------------------------ the document
function build(pages) {
  const d = Doc(pages);

  // ---- Front matter
  const front = [];
  front.push(new Paragraph({ style: 'Title', children: [new TextRun('PROJECT DOCUMENTATION')] }));
  front.push(new Paragraph({ style: 'Subtitle', children: [new TextRun('Design and Implementation of a Network-Flow-Based Trojan Horse Detection System for IoT Devices, with a Simulated IP-Camera Laboratory')] }));
  const meta = [
    ['Project type', 'Cybersecurity Software Design, Implementation and Simulation (Python, Flask, Docker Compose)'],
    ['Course context', '[Course and level, e.g. Final-Year Project / Dissertation]'],
    ['Department', '[Department, Institution]'],
    ['Location', '[City, Country]'],
    ['Prepared by', '[Student name and matriculation number]'],
    ['Supervisor', '[Supervisor name]'],
    ['Platform', 'Python 3.11+, Flask, Docker Compose, MediaMTX/ffmpeg; Playwright and Chromium for the documentation tooling'],
    ['Project files', 'trojan-lab/ (detector, camera, trojan_sim, c2, rtsp, sample_data, tests); docs/ (this document, the PDF edition, screenshots and build scripts); README.md; Makefile'],
    ['Repository', 'github.com/emmanuelekopimo/build-with-ai, branch claude/iot-trojan-detection-system-usk45t' + (facts.commit ? ` (revision ${facts.commit})` : '')],
  ];
  for (const [k, v] of meta) front.push(new Paragraph({ style: 'BodyText', alignment: AlignmentType.LEFT, children: [new TextRun({ text: k + ': ', bold: true }), new TextRun(v)] }));

  d.h1('ACKNOWLEDGEMENT');
  d.p('I wish to express my sincere appreciation to my lecturers and project supervisors in [Department, Institution] for their guidance, constructive criticism and patience throughout the design and implementation of this project. Their insistence on measurable evidence, rather than assertion, shaped the testing and verification approach adopted in Chapter Five.', 'FirstParagraph');
  d.p('I also acknowledge the maintainers of the open-source tools on which the laboratory depends, in particular Flask, Docker, MediaMTX, ffmpeg and Playwright, and the MITRE ATT&CK knowledge base, which gave the detection findings a common vocabulary. Finally, I thank my family, friends and classmates for their encouragement and for the many discussions that helped refine the ideas presented here.');

  // ---- CHAPTER ONE
  d.h1('CHAPTER ONE: INTRODUCTION');
  d.h2('1.1 Background of the Study');
  d.p('Internet of Things (IoT) devices such as IP cameras, door controllers and environmental sensors are now embedded in homes, hospitals, factories and city infrastructure. They are inexpensive, permanently powered, always connected and, in many cases, shipped with default credentials and firmware that is rarely updated. These properties make them attractive to attackers. The Mirai botnet of 2016 demonstrated the scale of the problem: it recruited several hundred thousand cameras, digital video recorders and routers simply by logging in with a short list of factory-default usernames and passwords, and then used them to launch some of the largest denial-of-service attacks recorded at the time (Antonakakis et al., 2017).', 'FirstParagraph');
  d.p('A trojan on such a device is difficult to detect from the inside. The device usually has no antivirus agent, limited storage, a closed operating system and no spare processing capacity for monitoring software. It continues to perform its normal function, for example streaming video, while quietly contacting a command-and-control (C2) server, scanning neighbouring hosts or uploading data. The malicious behaviour is, however, visible from the outside, because it must cross the network. A device that suddenly contacts an address it has never used, at perfectly regular intervals, on an unusual port, leaves a pattern in network-flow records that does not depend on knowing the malware family in advance.');
  d.p('This project therefore designs, implements and demonstrates a detection system that works on network-flow records only. Because demonstrating a detector against real malware on real cameras would be risky, expensive and hard to repeat, the project also includes a laboratory in which simulated IP cameras, a harmless trojan stand-in and a fake C2 server run in isolated containers, so that infection, detection and containment can be shown repeatably and safely.');
  d.h2('1.2 Problem Statement');
  d.p('When securing a fleet of IoT cameras against trojans, three fundamental problems must be solved:', 'FirstParagraph');
  d.bullets([
    ['Absence of on-device protection', 'Cameras and similar devices cannot run endpoint security agents, so detection must happen outside the device, using the traffic it produces.'],
    ['Signature dependence', 'Signature-based detection recognises only malware that has already been analysed. Variants appear faster than signatures, so behaviour (beaconing, scanning, exfiltration) is a more durable indicator than file hashes.'],
    ['Distinguishing malicious from legitimate regularity', 'Legitimate camera traffic (video chunks, NTP, DNS and cloud heartbeats) is itself highly periodic. A detector that flags every regular flow would drown analysts in false positives; it must separate a heartbeat to a known peer from a beacon to a new one.'],
    ['Safe, repeatable evaluation', 'Detection logic must be demonstrated without handling real malware and without any risk of traffic leaving the test network.'],
  ]);
  d.p('This study addresses the research question: **How can a lightweight, agentless system detect trojan-like behaviour on IoT devices from network-flow data alone, explain what it found in standard terms, and allow the affected device to be contained, while being demonstrable in a safe laboratory?**');
  d.h2('1.3 Aim and Objectives');
  d.p('The primary aim of this project is to design, implement and evaluate a network-flow-based Trojan Horse detection system for IoT devices, together with a simulated camera laboratory for safe demonstration.', 'FirstParagraph');
  d.p('To achieve this aim, the following specific objectives were formulated:');
  d.bullets([
    'To define a simple, tool-neutral flow-record schema (timestamp, device, source and destination IP, destination port, protocol, bytes out) that can be produced from Zeek, Suricata or router exports and uploaded as a CSV file.',
    `To implement a detection engine in pure Python that identifies known-bad destinations, suspicious and unusual ports, periodic beaconing, scan bursts and large outbound transfers, and maps each finding to a MITRE ATT&CK technique.`,
    'To support an optional known-good baseline per device so that legitimate periodic traffic is not reported as beaconing.',
    'To compute a per-device risk score and status (clean, suspicious or compromised) that an analyst can act on quickly.',
    'To provide a web interface and JSON API for uploading CSV files, viewing findings and quarantining or releasing a device.',
    'To build an isolated Docker laboratory containing simulated IP cameras, a looping RTSP video stream, a harmless trojan simulator and a fake C2 listener.',
    'To verify the system with automated tests and with positive and negative functional tests, and to document the results.',
  ]);
  d.h2('1.4 Scope and Limitations');
  d.p('The scope covers analysis of flow records for IP cameras and similar IoT devices, the web interface and API, the quarantine action, and the simulation laboratory. The detection logic is heuristic and rule-based; it does not use machine learning, deep packet inspection or payload analysis, and it cannot see inside encrypted traffic. It reasons about who talks to whom, how often, on which port and how many bytes.', 'FirstParagraph');
  d.p('Flow telemetry in the laboratory is produced by the simulators themselves, not captured from a wire; a production deployment would feed the same CSV schema from Zeek, Suricata or NetFlow/IPFIX exporters. The quarantine action in the laboratory is a marker file that the trojan simulator honours; on a real network it would call a firewall or network-access-control API. The baseline is held in process memory. The Docker container layer could not be started in the authoring environment because no Docker daemon was available, so the simulators were additionally exercised directly as Python processes (Section 5.5). The trojan is a simulator: it contains no payload, and the laboratory network has no route to the internet.');

  // ---- CHAPTER TWO
  d.h1('CHAPTER TWO: LITERATURE REVIEW AND THEORETICAL BACKGROUND');
  d.h2('2.1 Introduction');
  d.p('This chapter reviews the concepts on which the system rests: the IoT threat landscape, trojan and command-and-control behaviour, network-flow telemetry, behavioural indicators and baselining, the MITRE ATT&CK framework, and the use of containers for safe security laboratories.', 'FirstParagraph');
  d.h2('2.2 IoT Devices and Their Threat Landscape');
  d.p('IoT cameras typically run a stripped-down Linux system with a web administration page, an RTSP or ONVIF video service and, often, a Telnet or SSH service. Weak or hard-coded credentials appear first in the OWASP Internet of Things Top 10, and were the infection vector for Mirai, which scanned the internet for devices with open Telnet ports and tried a dictionary of default logins (Antonakakis et al., 2017). Once infected, a device is typically used for three purposes: to await commands from a C2 server, to scan for further victims, and to participate in attacks or relay traffic. Each of these produces network behaviour that differs from the device\'s ordinary role.', 'FirstParagraph');
  d.h2('2.3 Trojans and Command-and-Control Communication');
  d.p('A trojan is malware that presents itself as, or hides inside, legitimate functionality while performing hidden actions. On an IoT device, a trojan commonly establishes persistence (for example through a start-up script or a scheduled job), then contacts a C2 server to receive instructions. To avoid maintaining a permanent connection, many implants "beacon": they connect at a fixed interval, often with a small random jitter, send a short status message and receive a reply. This regularity is useful to defenders because human and application traffic is much burstier than a timer-driven implant.', 'FirstParagraph');
  d.h2('2.4 Network Flow Records');
  d.p('A flow record summarises a conversation between two endpoints: its start time, source and destination addresses and ports, protocol, and the number of bytes and packets in each direction. Flow export is standardised by NetFlow version 9 (RFC 3954) and IPFIX (RFC 7011), and equivalent logs are produced by network security monitors such as Zeek (originally Bro; Paxson, 1999) and Suricata. Flow data is attractive for IoT monitoring because it is compact, it does not require decrypting traffic, and it can be collected at a router or switch without touching the devices.', 'FirstParagraph');
  d.h2('2.5 Behavioural Indicators: Beaconing, Scanning and Exfiltration');
  d.p('Three behaviours are especially visible in flow data. **Beaconing** appears as many flows to one destination and port with near-constant gaps and near-constant sizes. It can be quantified with the coefficient of variation (CV), the standard deviation divided by the mean, of the inter-arrival times: a timer-driven beacon has a CV close to zero, whereas interactive traffic has a CV of one or more. **Scanning** appears as a burst of connections to many different hosts or ports in a short window, as a worm looks for further victims. **Exfiltration** appears as an unusually large volume sent to an external address that the device does not normally use.', 'FirstParagraph');
  d.h2('2.6 Baselining and Anomaly Detection');
  d.p('Because legitimate IoT traffic is also regular (a camera streams video to a recorder every few seconds and synchronises its clock at fixed intervals), regularity alone is not evidence of compromise. A baseline of known-good traffic per device records which destinations, ports and (destination, port) pairs are normal, together with the mean and standard deviation of flow sizes. A flow is then judged against this profile: periodic traffic to a baseline peer is ignored, whereas the same periodicity to a new external peer is suspicious.', 'FirstParagraph');
  d.h2('2.7 The MITRE ATT&CK Framework');
  d.p('MITRE ATT&CK is a publicly maintained knowledge base of adversary tactics and techniques. Mapping each finding to a technique identifier, for example T1071 (Application Layer Protocol), T1571 (Non-Standard Port), T1046 (Network Service Discovery) or T1041 (Exfiltration Over C2 Channel), lets analysts relate alerts to known attacker behaviour and to reporting conventions used in security operations centres.', 'FirstParagraph');
  d.h2('2.8 Containers and Safe Emulation of Malicious Behaviour');
  d.p('Demonstrating detection does not require real malware. A harmless program can reproduce the observable indicators (a suspiciously named process, a hidden file, a scheduled-job entry, regular outbound connections and a scan-like burst) so that the detector is exercised on the same patterns. The EICAR anti-malware test file is a standard harmless string that security products are designed to recognise, and frameworks such as Atomic Red Team and MITRE Caldera execute documented attacker techniques in a controlled way. Docker networks marked "internal" have no route to the outside world, which keeps such a laboratory isolated from real networks.', 'FirstParagraph');
  d.h2('2.9 Related Tools');
  d.caption('Table 2.1: Related Network-Monitoring Tools and the Position of This Project');
  d.table(['Tool', 'Primary function', 'Relationship to this project'], [
    ['Zeek', 'Network analysis framework that writes rich protocol logs, including connection records (conn.log).', 'A suitable producer of the flow CSV consumed here; this project adds baseline-aware behavioural rules, scoring and a response action.'],
    ['Suricata', 'Intrusion detection and prevention engine using signatures, with flow and alert logging.', 'Signature-based and complementary; its flow logs can feed the detector, which targets signature-less behavioural patterns.'],
    ['Wireshark', 'Packet capture and interactive protocol analyser.', 'Used for manual inspection; it does not automatically score or contain devices.'],
    ['This project', 'Agentless, CSV-driven behavioural detector with a simulated IoT laboratory.', 'Lightweight and easy to demonstrate; heuristic rules rather than learned models.'],
  ], [1300, 3300, 4426]);

  // ---- CHAPTER THREE
  d.h1('CHAPTER THREE: SYSTEM DESIGN');
  d.h2('3.1 Methodological Design Approach');
  d.p('A structured, top-down methodology was adopted. The behaviours to be detected were first derived from the literature (Chapter Two) and written as requirements; each requirement was then mapped to a rule in the engine, a data field it needs, and a test that demonstrates it. The user interface, laboratory and tests were designed afterwards around that core.', 'FirstParagraph');
  d.caption('Table 3.1: Requirements and the Design Decisions That Satisfy Them');
  d.table(['Requirement', 'Design decision', 'Where implemented'], [
    ['Work without software on the device', 'Analyse flow records only, exported from the network.', 'engine.py (pure Python), CSV schema'],
    ['Accept data from many tools', 'Column aliases and ISO-8601 or epoch timestamps are normalised on input.', 'engine.parse_csv'],
    ['Avoid false positives on regular traffic', 'Baseline of ports, destinations and (IP, port) pairs; beaconing applies only to peers outside the baseline.', 'engine.build_baseline, rule 4'],
    ['Explain findings in standard terms', 'Every finding carries a severity, evidence and a MITRE ATT&CK technique.', 'engine._finding'],
    ['Let an analyst triage quickly', 'Per-device 0-100 score and clean / suspicious / compromised status.', 'engine.detect'],
    ['Contain a compromised device', 'Quarantine and release endpoints and buttons.', 'app.py, index.html'],
    ['Demonstrate safely and repeatably', 'Internal Docker network, harmless trojan simulator, deterministic sample data.', 'docker-compose.yml, flowgen.py'],
  ], [2700, 3926, 2400]);
  d.h2('3.2 System Architecture');
  d.p('The system has three layers. The **laboratory layer** contains the simulated cameras, the RTSP stream, the fake C2 server and the trojan simulator, all on an internal Docker network (10.50.0.0/24). The **telemetry layer** is a shared volume on which the cameras and the simulator append flow records to a CSV file, standing in for a Zeek or Suricata export. The **analysis layer** is the detector: a Flask application that reads uploaded or live CSV files, runs the engine and presents the result. Figure 3.1 shows the components and the data that flows between them.', 'FirstParagraph');
  d.figure('fig-architecture.png', 'Figure 3.1: Architecture of the laboratory and the detector', 560);
  d.p('Figure 3.2 shows the processing pipeline inside the detector. A CSV file is parsed and normalised; an optional baseline is built from known-good traffic; six families of rules are evaluated per device; findings are scored; and a JSON result is returned to the interface.');
  d.figure('fig-pipeline.png', 'Figure 3.2: Detection pipeline from flow CSV to scored result', 560);
  d.h2('3.3 Component and Technology Selection');
  d.caption('Table 3.2: Components, Technologies and Roles');
  d.table(['Component', 'Technology', 'Role'], [
    ['detector', 'Python 3.11+, Flask, gunicorn', 'Serves the web interface and JSON API, runs the analysis engine, writes quarantine markers.'],
    ['engine', 'Python standard library only', 'Parsing, baseline construction, detection rules and scoring; independently testable.'],
    ['cam-lobby, cam-garage', 'Python, Flask', 'Simulated IP cameras with a deliberately weak admin login and realistic background flows.'],
    ['rtsp', 'MediaMTX with ffmpeg', 'Publishes a looping test pattern as a live RTSP stream at rtsp://localhost:8554/cam.'],
    ['trojan', 'Python', 'Harmless trojan stand-in sharing cam-garage\'s network namespace, so its beacons carry the camera\'s IP address.'],
    ['c2', 'Python sockets', 'Fake C2 listener on TCP 4444 that logs each beacon and replies ACK.'],
    ['Orchestration', 'Docker Compose', 'Defines services, an internal lab network, an edge network for browser access and a shared data volume.'],
    ['Documentation', 'Playwright, Chromium, docx', 'Annotated screenshots, PDF and Word documentation generated from scripts.'],
  ], [1900, 2400, 4726]);
  d.h2('3.4 Data Model and Addressing Plan');
  d.caption('Table 3.3: Flow Record Schema (Input CSV)');
  d.table(['Field', 'Type', 'Required', 'Notes'], [
    ['timestamp', 'ISO-8601 or epoch seconds', 'Yes', 'Stored internally as a float (ts); rows are sorted by time.'],
    ['device', 'string', 'Yes', 'Grouping key for all per-device logic.'],
    ['src_ip, dst_ip', 'string', 'Yes', 'Addresses are classed as LAN or external using the RFC 1918, loopback, link-local and multicast ranges.'],
    ['dst_port', 'integer', 'Yes', 'Destination port.'],
    ['protocol', 'string', 'Yes', 'Upper-cased (TCP, UDP and so on).'],
    ['bytes_out', 'integer', 'Yes', 'Bytes sent by the device in the flow.'],
    ['bytes_in, packets, duration', 'number', 'No', 'Optional; bytes_in is parsed, the others are accepted for compatibility.'],
  ], [2100, 1900, 1100, 3926]);
  d.p('Common aliases are mapped to these names (for example ts to timestamp, device_id to device, dport to dst_port, proto to protocol and bytes to bytes_out), so exports from different tools can be uploaded with little or no editing. The output of the engine has the following structure:');
  d.code([
    'finding = { device, rule, severity, title, detail, mitre,',
    '            evidence: {dst_ip, dst_port, flows, interval_s, jitter_cv, ...},',
    '            first_seen, last_seen }',
    'device  = { device, flows, bytes_out, src_ips[], score, status, findings }',
    'result  = { summary: {flows, devices, findings, compromised, suspicious, with_baseline},',
    '            devices[], findings[], quarantined[] }',
  ]);
  d.caption('Table 3.4: Laboratory Addressing Plan');
  d.table(['Host', 'IP address', 'Networks', 'Published port'], [
    ['rtsp', '10.50.0.2', 'lab, edge', '8554 (RTSP)'],
    ['cam-lobby', '10.50.0.11', 'lab, edge', '8081 (admin page)'],
    ['cam-garage (and trojan sidecar)', '10.50.0.12', 'lab only', 'none'],
    ['c2', '10.50.0.66', 'lab only', 'none'],
    ['detector', '10.50.0.100', 'lab, edge', '8080 (web interface)'],
  ], [3100, 1900, 1800, 2226]);
  d.p('The lab network is declared with internal: true, so no container on it can reach the internet; the edge network exists only so that a browser on the host can reach the three published ports. Cam-garage and the C2 server are on the lab network only.');
  d.h2('3.5 Detection Rule Design');
  d.caption('Table 3.5: Detection Rules, Thresholds and ATT&CK Mapping');
  d.table(['Rule', 'Severity', 'Fires when', 'ATT&CK'], facts.rules, [1500, 1000, 5226, 1300]);
  d.p('Thresholds are constants at the top of engine.py so that they can be tuned without changing the logic. Two design decisions deserve emphasis. First, beaconing is evaluated only for peers that are not part of the device\'s baseline; when no baseline exists, regular traffic on well-known service ports (53, 80, 123, 443, 554 and so on) is ignored unless the peer is on the known-bad list. Second, an address is treated as LAN-side only if it falls in an explicitly listed private range, because the standard library\'s notion of "private" also includes the documentation ranges that the laboratory uses to stand in for internet hosts (Section 5.1.2).');
  d.h2('3.6 Risk Scoring');
  d.p(`Each finding adds a weight according to severity: critical ${facts.severity_score.critical}, high ${facts.severity_score.high}, medium ${facts.severity_score.medium} and low ${facts.severity_score.low}. A device's score is the sum, capped at 100. A device with a score below 10 is **clean**, from 10 to 49 is **suspicious**, and 50 or more is **compromised**. One critical and one high finding (65) are therefore enough to mark a device compromised, whereas a single unusual port (10) only raises suspicion.`, 'FirstParagraph');

  // ---- CHAPTER FOUR
  d.h1('CHAPTER FOUR: STAGE-BY-STAGE IMPLEMENTATION');
  d.h2('Stage 1: Repository Layout and Environment');
  d.p('The project is organised so that the laboratory, the detector and the documentation can be used independently. The directory trojan-lab contains the detector, the simulators, sample data and tests; docs contains the generated documentation and its build scripts. A Makefile provides the common commands (install, run, test, sample-data, lab-up, lab-infect, lab-down, screenshots, pdf and docs). Python dependencies are limited to Flask and gunicorn for the detector, with pytest for testing.', 'FirstParagraph');
  d.h2('Stage 2: Flow Parser');
  d.p('The function [[parse_csv]] matches column names case-insensitively against the canonical names and their aliases, then converts each row to typed values. Rows that cannot be parsed are skipped, and parsing aborts after 50 bad rows. If a required column is missing the function raises a [[FlowError]] that names the missing columns and lists those found, which the interface displays directly.', 'FirstParagraph');
  d.code(excerpt('trojan-lab/detector/engine.py', 'cols = {c.strip().lower()', 12));
  d.h2('Stage 3: Baseline Builder');
  d.p('[[build_baseline]] summarises known-good traffic per device: the set of destination ports, the set of destination addresses, the set of (address, port) pairs, and the mean and standard deviation of bytes per flow. This profile is the input that lets the engine separate a legitimate heartbeat from a beacon.', 'FirstParagraph');
  d.h2('Stage 4: Detection Rules');
  d.p('[[detect]] groups flows by device and evaluates the rule families in turn: known-bad addresses and suspicious ports; unusual ports; new external destinations; beaconing; scan bursts; and exfiltration. The beaconing rule is the most subtle. Flows to the same destination and port are collected; peers inside the baseline are skipped; and the remaining groups are tested for regular timing and size:', 'FirstParagraph');
  d.code(excerpt('trojan-lab/detector/engine.py', 'for (ip, port), fs in groups.items():', 17));
  d.p('Scan detection uses a sliding window over the time-ordered flows: for each flow the window start is advanced until the window spans at most 60 seconds, and the number of distinct destination hosts (or ports) in the window is compared with the threshold of ' + C.SCAN_MIN_TARGETS + '.');
  d.h2('Stage 5: Scoring, Status and the JSON Result');
  d.code(excerpt('trojan-lab/detector/engine.py', 'devices = []', 8));
  d.h2('Stage 6: Web Application and API');
  d.p('The Flask application in app.py exposes the interface and the JSON endpoints listed in Table 4.1. Uploads are limited to 25 MB, and validation errors from the engine are returned as HTTP 400 with a JSON error message. Device names passed to the quarantine endpoints are validated against a strict pattern before they are used as file names.', 'FirstParagraph');
  d.caption('Table 4.1: HTTP Endpoints');
  d.table(['Endpoint', 'Purpose'], [
    ['GET /', 'Single-page user interface.'],
    ['POST /api/analyze', 'Multipart upload of [[flows]] and an optional [[baseline]]; returns the result JSON. 400 on bad CSV, 413 above 25 MB.'],
    ['POST /api/analyze/sample', 'Runs the bundled infected or clean sample against the bundled baseline.'],
    ['POST /api/analyze/live', 'Analyses the live capture file written by the laboratory.'],
    ['POST /api/baseline/live', 'Freezes the current live capture as the baseline.'],
    ['POST, DELETE /api/quarantine/<device>', 'Creates or removes the quarantine marker for a device.'],
    ['GET /health', 'Liveness check.'],
  ], [3200, 5826]);
  d.code(excerpt('trojan-lab/detector/app.py', '@app.post("/api/quarantine/<device>")', 8));
  d.h2('Stage 7: User Interface');
  d.p('The interface is a single HTML page with vanilla JavaScript. It contains the upload card, summary tiles, a device table with Quarantine and Release buttons, and a findings table. All values inserted into the page are escaped, and the layout is responsive so that it can be used on a phone. Chapter Four-A walks through each screen.', 'FirstParagraph');
  d.h2('Stage 8: Camera Simulator and RTSP Stream');
  d.p('Each simulated camera is a small Flask application whose admin page accepts the deliberately weak credentials admin/admin, as many real cheap cameras do. A background thread appends realistic flow records every ten seconds (about 2 MB of video to the recorder on port 554) and, every minute, an NTP query, a DNS query and a cloud heartbeat over TLS. A separate MediaMTX container runs ffmpeg to publish a looping synthetic test pattern as a live RTSP stream, so that the lab also behaves like a camera on the video side.', 'FirstParagraph');
  d.h2('Stage 9: Trojan Simulator and Fake C2');
  d.p('The trojan simulator reproduces indicators only. On start it drops a hidden file containing the EICAR test string and a cron.d entry as simulated persistence. It then beacons to the fake C2 every 15 seconds with a small random jitter, performs a short scan-like burst of connection attempts with a 0.2-second timeout to a few lab addresses on port 23, and writes one flow record representing a large upload (no data is sent). Before each cycle it checks for a quarantine marker; if one exists it deletes its files and exits.', 'FirstParagraph');
  d.code(excerpt('trojan-lab/trojan_sim/kworker_upd.py', 'def beacon():', 10));
  d.p('The fake C2 server is a threaded TCP listener on port 4444 that logs each message and replies with the text ACK.');
  d.h2('Stage 10: Orchestration with Docker Compose');
  d.p('Docker Compose defines the services and the two networks. The trojan service shares the network namespace of cam-garage, so every connection it makes originates from that camera\'s address, exactly as a trojan running on the device would appear. It sits behind a Compose profile so that the laboratory starts clean and the infection is a deliberate step.', 'FirstParagraph');
  d.code(excerpt('trojan-lab/docker-compose.yml', '  trojan:', 9).concat([''], excerpt('trojan-lab/docker-compose.yml', 'networks:\n'.trim(), 1).length ? ['networks:', '  lab: { driver: bridge, internal: true, ipam: { config: [{ subnet: 10.50.0.0/24 }] } }', '  edge: { driver: bridge }'] : []));
  d.h2('Stage 11: Sample Data Generator');
  d.p('[[flowgen.py]] produces three deterministic CSV files from a fixed random seed: a one-hour baseline of normal traffic for three cameras, a clean capture of the same kind, and an infected capture in which cam-garage beacons to 203.0.113.66 on port 4444 every 15 seconds with about 4 percent jitter, scans 30 hosts and 12 ports, and sends 8.5 MB to 198.51.100.77. The addresses are from the reserved documentation ranges, so they cannot belong to real hosts.', 'FirstParagraph');

  // ---- CHAPTER FOUR-A
  d.h1('CHAPTER FOUR-A: USER INTERFACE AND SCREEN WALKTHROUGH');
  d.p('This chapter walks through every state of the interface in the order a demonstration visits them. Red numbered boxes on each figure correspond to the numbered explanations beneath it. The screenshots were captured automatically with Playwright and Chromium from the running application.', 'FirstParagraph');
  let figNo = 0, mobile = false;
  const desk = facts.screens.filter((s) => s.viewport === 'desktop'), mob = facts.screens.filter((s) => s.viewport === 'mobile');
  const screenBlock = (s, label, width) => {
    d.h2(label);
    d.p(s.intro);
    figNo += 1;
    d.figure(`${s.id}.png`, `Figure 4A.${figNo}: ${s.title}`, width);
    d.numbered(s.callouts, 'num' + figNo);
  };
  desk.forEach((s, i) => screenBlock(s, `4A.${i + 1} ${s.title}`, 560));
  d.h2(`4A.${desk.length + 1} Mobile View`);
  d.p('The interface is responsive down to phone width (captured at 390 by 844 CSS pixels). Cards stack in a single column, summary tiles reflow into two columns, and wide tables scroll inside their own card so that the page itself never scrolls sideways; the capture script verifies this by comparing the document scroll width with the viewport width.');
  mob.forEach((s) => { d.h3(s.title); d.p(s.intro); figNo += 1; d.figure(`${s.id}.png`, `Figure 4A.${figNo}: ${s.title}`, 230); d.numbered(s.callouts, 'num' + figNo); });

  // ---- CHAPTER FIVE
  d.h1('CHAPTER FIVE: TESTING AND RESULTS');
  d.h2('5.1 Verification Methodology');
  d.p('Testing was carried out in three categories:', 'FirstParagraph');
  d.bullets([
    ['Positive testing', 'Validating that the infected sample is detected, that detections carry the expected evidence, and that legitimate operations (upload, baseline, quarantine, release) succeed.'],
    ['Negative testing', 'Proving that malformed input is rejected with a clear message, that normal traffic produces no findings, and that unsafe input such as path-traversal device names is refused.'],
    ['Laboratory run', 'Running the simulators together and confirming that their traffic is detected and that quarantine stops the simulator.'],
  ]);
  d.h3('5.1.1 Automated Test Suite');
  d.p(`The suite contains ${facts.tests.length} pytest tests that run in under a second without Docker (command: python -m pytest trojan-lab/tests). Table 5.1 lists them with the behaviour each proves; all ${facts.tests.length} passed at the time of writing.`, 'FirstParagraph');
  const purpose = {
    test_upload_with_baseline: ['Analysing the infected sample with a baseline upload returns one compromised device and with_baseline = true.', 'Positive'],
    test_upload_rejects_bad_csv: ['A CSV without the required columns returns HTTP 400 and a "missing required column" message.', 'Negative'],
    test_no_file: ['A request with no file returns HTTP 400.', 'Negative'],
    test_sample_and_quarantine_roundtrip: ['Sample analysis finds one compromised device; an invalid sample name is rejected; quarantine and release create and remove the marker.', 'Both'],
    test_quarantine_rejects_traversal: ['A path-traversal device name is not accepted.', 'Negative'],
    test_clean_capture_has_no_findings: ['The clean capture produces no findings and every device is clean, with and without a baseline.', 'Negative'],
    test_infected_device_flagged_others_clean: ['Only cam-garage is compromised; beaconing, known-bad IP, suspicious port, host scan and exfiltration rules all fire; the other cameras stay clean.', 'Positive'],
    test_beacon_interval_reported: ['The reported beacon destination is 203.0.113.66 and the interval is between 14 and 16 seconds.', 'Positive'],
    test_column_aliases_and_epoch: ['A CSV using aliases (ts, device_id, dport, proto, bytes) and epoch timestamps is parsed and a beacon is detected.', 'Positive'],
    test_missing_columns_message: ['The error message names the missing column dst_port.', 'Negative'],
    test_empty_or_headers_only: ['An empty file and a headers-only file are rejected with a FlowError.', 'Negative'],
    test_irregular_traffic_not_beacon: ['Thirty flows with random gaps and sizes are not reported as beaconing.', 'Negative'],
  };
  const seen = new Set(), rows = [];
  for (const t of facts.tests) {
    const base = t.replace(/\[.*$/, ''); if (seen.has(base)) continue; seen.add(base);
    const n = facts.tests.filter((x) => x.replace(/\[.*$/, '') === base).length;
    const [desc, kind] = purpose[base] || ['', ''];
    rows.push([base + (n > 1 ? ` (x${n})` : ''), kind, desc]);
  }
  d.caption('Table 5.1: Automated Tests and What They Prove');
  d.table(['Test', 'Type', 'Behaviour verified'], rows, [3000, 1150, 4876]);
  d.h3('5.1.2 Defects Found During Development and Their Remediation');
  d.p('Three defects were found while building and testing the system. Two were corrected; the third is a known limitation that is documented rather than fixed.');
  d.caption('Table 5.2: Defects, Remediation and Status');
  d.table(['#', 'Severity', 'Defect', 'Remediation / status'], [
    ['1', 'High', 'The first version of the beaconing rule reported legitimate periodic traffic (video to the recorder, NTP and cloud heartbeats) as beacons, so the clean capture produced findings and unrelated cameras were flagged.', 'Beaconing now applies only to peers outside the device baseline (or, with no baseline, off well-known service ports). The clean capture produces zero findings in both modes. Fixed.'],
    ['2', 'High', 'The large-transfer rule did not fire on the 8.5 MB upload because Python\'s ipaddress.is_private also classes the documentation ranges 198.51.100.0/24 and 203.0.113.0/24 as private, so the lab\'s stand-in internet hosts were treated as LAN addresses.', 'LAN membership is decided by an explicit list of RFC 1918, loopback, link-local and multicast ranges. The exfiltration rule now fires. Fixed.'],
    ['3', 'Medium', 'The baseline is stored in process memory, so it is lost on restart and, with two gunicorn workers, may not be visible to every request.', 'Documented as a limitation. Recommended remedies: a single worker or shared storage (Section 6.3). Open.'],
  ], [450, 900, 4200, 3476], { center: [0, 1] });
  d.h2('5.2 Detection Results on the Sample Captures');
  d.p(`The infected sample (${fmtN(inf.summary.flows)} flows across ${inf.summary.devices} cameras) was analysed against the baseline. The engine reported ${inf.summary.findings} findings (${sevText}), all on cam-garage, which received a risk score of ${garage.score} and the status compromised. Table 5.3 shows one finding for each rule that fired, and Table 5.4 compares the per-device outcome for the infected and clean captures.`, 'FirstParagraph');
  d.caption('Table 5.3: One Finding per Rule from the Infected Sample');
  d.table(['Severity', 'Finding', 'Evidence', 'ATT&CK'], inf.per_rule, [900, 2400, 4226, 1500]);
  d.caption('Table 5.4: Per-Device Results, Infected and Clean Captures');
  const devRows = [];
  for (const dv of inf.devices) devRows.push(['Infected', dv.device, fmtN(dv.flows), String(dv.score), dv.status, String(dv.findings)]);
  for (const dv of cln.devices) devRows.push(['Clean', dv.device, fmtN(dv.flows), String(dv.score), dv.status, String(dv.findings)]);
  d.table(['Capture', 'Device', 'Flows', 'Risk score', 'Status', 'Findings'], devRows, [1300, 1900, 1100, 1300, 1900, 1526], { center: [2, 3, 5] });
  d.h2('5.3 Positive Functional Test Results');
  d.caption('Table 5.5: Positive Test Cases');
  d.table(['#', 'Test case', 'Expected result', 'Outcome'], [
    ['P1', 'Analyse the infected sample with the baseline.', 'cam-garage compromised; two other cameras clean.', 'Pass'],
    ['P2', 'Analyse the clean sample with and without the baseline.', 'Zero findings, all devices clean.', 'Pass'],
    ['P3', 'Upload the infected capture and the baseline through the API.', 'HTTP 200; one compromised device; with_baseline true.', 'Pass'],
    ['P4', 'Upload a CSV using column aliases and epoch timestamps.', 'Parsed correctly; beacon detected.', 'Pass'],
    ['P5', 'Check the reported beacon.', 'Destination 203.0.113.66, interval 14 to 16 s (about 15 s).', 'Pass'],
    ['P6', 'Quarantine cam-garage, then release it.', 'Marker created and listed as quarantined; marker removed on release.', 'Pass'],
    ['P7', 'Run the simulators locally and analyse the live capture (Section 5.5).', 'Flows detected; quarantine stops the simulator.', 'Pass'],
  ], [600, 3600, 3826, 1000], { center: [0, 3] });
  d.h2('5.4 Negative Test Results');
  d.caption('Table 5.6: Negative Test Cases');
  d.table(['#', 'Test case', 'Expected result', 'Outcome'], [
    ['N1', 'Upload a CSV missing required columns.', 'HTTP 400 with a message naming the missing columns.', 'Pass'],
    ['N2', 'Upload an empty file or a headers-only file.', 'Rejected with a FlowError message.', 'Pass'],
    ['N3', 'Call the analyse endpoint with no file.', 'HTTP 400.', 'Pass'],
    ['N4', 'Request a sample with an invalid name (../etc/passwd).', 'HTTP 400; no file access.', 'Pass'],
    ['N5', 'Quarantine a device name containing a path-traversal sequence.', 'Request refused.', 'Pass'],
    ['N6', 'Analyse thirty flows with irregular gaps and sizes.', 'No beaconing finding.', 'Pass'],
    ['N7', 'Analyse the clean capture.', 'No findings (no false positives).', 'Pass'],
  ], [600, 3600, 3826, 1000], { center: [0, 3] });
  d.h2('5.5 Laboratory Run of the Simulators');
  d.p('Because no Docker daemon was available in the authoring environment, the laboratory logic was exercised by running the simulators directly as Python processes on one machine. The fake C2 server listened on a local port; the trojan simulator was started with a one-second interval so that the run completed quickly; and flow records were written to the shared CSV file. The fake C2 logged the beacons, the file contained 21 flow records, and the engine, run without a baseline, reported five findings on the device (a known-bad address, suspicious port 23, a scan burst across ten or more hosts, a large transfer to 198.51.100.77 and an unusual port) and marked it compromised. A beaconing finding was not among them in this accelerated run; the 15-second cadence of the real simulator is covered by the sample-data tests (test P5). When the quarantine marker was then created, the simulator reported that it had detected quarantine, removed its two persistence files and exited. The container layer itself (networking, RTSP, volume sharing) has not been run and should be validated with docker compose up --build before relying on it.', 'FirstParagraph');

  // ---- CHAPTER SIX
  d.h1('CHAPTER SIX: DISCUSSION, CONCLUSION AND RECOMMENDATIONS');
  d.h2('6.1 Engineering Discussion');
  d.p('The project shows that useful detection of trojan-like behaviour on IoT devices is possible from flow data alone. No single rule is proof of compromise: a connection to an unusual port may be a mistake, and a periodic flow may be a heartbeat. The strength of the design lies in the combination. In the infected sample the same device simultaneously contacts a known-bad address, beacons at a fixed interval to a peer it never used before, scans the network and sends a large volume to an unknown host, and the risk score reflects that accumulation.', 'FirstParagraph');
  d.p('The most important engineering lesson concerned false positives. A naive beacon detector flags a healthy camera, because video, NTP and heartbeats are all regular. Combining the timing test with a baseline, so that regularity matters only for new peers, removed those false positives while keeping the detection of the simulated implant. The second lesson was that apparently harmless library conventions can hide assumptions: treating documentation address ranges as private silently disabled the exfiltration rule until LAN membership was defined explicitly.');
  d.p('The main limitations are that the rules are heuristic and tuned on simulated data, that a patient attacker could vary beacon intervals and sizes beyond the thresholds, that encrypted traffic prevents payload inspection, that the baseline is in memory, and that the container layer has not been run end to end.');
  d.h2('6.2 Conclusion');
  d.p('This project designed, implemented and tested an agentless, flow-based Trojan Horse detection system for IoT devices, together with a safe Docker laboratory in which infection, detection and containment can be demonstrated repeatably. The engine detects known-bad contact, suspicious and unusual ports, baseline-aware beaconing, scan bursts and large outbound transfers; maps each finding to MITRE ATT&CK; scores each device; and supports quarantine through a web interface and API. All ' + facts.tests.length + ' automated tests pass, the clean capture produces no false positives, and the infected capture is identified with one compromised device and no collateral flags. The system therefore meets the objectives set in Chapter One, subject to the limitations stated above.', 'FirstParagraph');
  d.h2('6.3 Recommendations for Production Deployment');
  d.bullets([
    ['Real telemetry', 'Feed the detector from Zeek conn.log, Suricata flow records or NetFlow/IPFIX exports, mapping IP addresses to device names from DHCP or an asset inventory.'],
    ['Persistent, shared baseline', 'Store per-device baselines in a database or file so they survive restarts and are shared across workers, and refresh them on a schedule.'],
    ['Authentication and authorisation', 'The application has no built-in login; place it behind a TLS reverse proxy with single sign-on or a VPN, and restrict the quarantine endpoint.'],
    ['Real containment', 'Replace the marker file with a call to a firewall, switch or network-access-control system that blocks or isolates the device.'],
    ['Threat intelligence', 'Load reputable threat-intelligence feeds into the known-bad list and review thresholds against the real environment.'],
    ['Defence in depth', 'Combine detection with removing default credentials, segmenting cameras into their own VLAN and keeping firmware up to date.'],
    ['Further research', 'Evaluate on public IoT traffic datasets, add learned baselines and streaming analysis, and measure detection rates and false-positive rates quantitatively.'],
  ]);

  // ---- References and appendices
  d.h1('REFERENCES');
  d.bullets([
    'Antonakakis, M., April, T., Bailey, M., et al. Understanding the Mirai Botnet. Proceedings of the 26th USENIX Security Symposium, Vancouver, 2017.',
    'Claise, B. (Ed.). RFC 3954: Cisco Systems NetFlow Services Export Version 9. Internet Engineering Task Force, 2004.',
    'Claise, B., Trammell, B., and Aitken, P. (Eds.). RFC 7011: Specification of the IP Flow Information Export (IPFIX) Protocol. Internet Engineering Task Force, 2013.',
    'Paxson, V. Bro: A System for Detecting Network Intruders in Real Time. Computer Networks, 31(23-24), 1999.',
    'MITRE Corporation. MITRE ATT&CK. https://attack.mitre.org',
    'OWASP Foundation. OWASP Internet of Things Top 10 (2018). https://owasp.org',
    'EICAR. Anti-Malware Testing Standard File. https://www.eicar.org',
    'Docker, Inc. Docker and Docker Compose Documentation. https://docs.docker.com',
    'Pallets Projects. Flask Documentation. https://flask.palletsprojects.com',
    'bluenviron. MediaMTX: ready-to-use SRT / WebRTC / RTSP / RTMP / LL-HLS media server. https://github.com/bluenviron/mediamtx',
  ]);
  d.h1('APPENDIX A: Master File Summary');
  d.p('The complete project consists of the following files and directories:', 'FirstParagraph');
  d.bullets([
    ['trojan-lab/detector/engine.py', 'Parsing, baseline, detection rules and scoring (pure Python).'],
    ['trojan-lab/detector/app.py', 'Flask web application and JSON API.'],
    ['trojan-lab/detector/templates/index.html', 'Single-page user interface.'],
    ['trojan-lab/detector/flowgen.py', 'Deterministic sample-data generator.'],
    ['trojan-lab/camera, rtsp, trojan_sim, c2, common', 'Laboratory simulators and the shared flow logger.'],
    ['trojan-lab/docker-compose.yml', 'Services, internal lab network, edge network and shared volume.'],
    ['trojan-lab/sample_data/*.csv', 'Baseline, clean and infected flow captures.'],
    ['trojan-lab/tests', 'Automated test suite (' + facts.tests.length + ' tests).'],
    ['docs/IoT-Trojan-Detector-Documentation.pdf', 'PDF edition of the documentation with annotated screenshots and a presentation script.'],
    ['docs/IoT-Trojan-Detector-Project-Documentation.docx', 'This document.'],
    ['docs/build', 'Scripts that regenerate the screenshots, the PDF and this document, plus the embedded fonts.'],
    ['README.md, Makefile', 'Quick start and task runner.'],
  ]);
  d.h1('APPENDIX B: Glossary of Technical Acronyms');
  d.table(['Acronym', 'Definition'], [
    ['ATT&CK', 'Adversarial Tactics, Techniques and Common Knowledge (MITRE)'],
    ['C2', 'Command and Control'],
    ['CV', 'Coefficient of Variation (standard deviation divided by mean)'],
    ['EICAR', 'European Institute for Computer Antivirus Research (test file standard)'],
    ['IDS / IPS', 'Intrusion Detection System / Intrusion Prevention System'],
    ['IoT', 'Internet of Things'],
    ['IPFIX', 'IP Flow Information Export'],
    ['NAC', 'Network Access Control'],
    ['NTP', 'Network Time Protocol'],
    ['NVR', 'Network Video Recorder'],
    ['ONVIF', 'Open Network Video Interface Forum (camera interoperability standard)'],
    ['RTSP', 'Real Time Streaming Protocol'],
    ['SIEM', 'Security Information and Event Management'],
    ['TLS', 'Transport Layer Security'],
  ], [2000, 7026]);
  d.h1('APPENDIX C: Running and Rebuilding the Project');
  d.p('Detector only (no Docker):', 'FirstParagraph');
  d.code(['make install', 'make run            # http://localhost:8080 ; click "Load sample: infected"', 'make test']);
  d.p('Full laboratory (requires Docker):');
  d.code(['make lab-up         # cameras, RTSP, fake C2, detector', '# wait about one minute, then click "Freeze live capture as baseline"', 'make lab-infect     # start the harmless trojan simulator on cam-garage', '# after about two minutes click "Analyse live lab capture", then Quarantine', 'make lab-down']);
  d.p('Rebuilding the documentation (needs Chromium for Playwright, LibreOffice and pdftotext for the contents page numbers):');
  d.code(['make docs                              # screenshots + PDF', 'python docs/build/export_facts.py          # facts and diagrams for the Word edition', 'node docs/build/build_docx.js            # Word edition']);

  // ---- TOC (static entries with measured page numbers, as in the example)
  const tocParas = tocParagraphs(d.toc, pages);
  const ackEnd = 3;   // acknowledgement heading + 2 paragraphs
  const body = [...front, ...d.blocks.slice(0, ackEnd), ...tocParas, ...d.blocks.slice(ackEnd)];
  return { doc: makeDocument({ title: 'Project Documentation: Network-Flow-Based Trojan Horse Detection System for IoT Devices', creator: 'Project author', body }), toc: d.toc };
}

buildTwoPass(build, OUT);
