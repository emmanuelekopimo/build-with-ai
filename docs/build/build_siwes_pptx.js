/* Builds docs/SIWES-Presentation-HiiT-Plc-IoT-Trojan-Detector.pptx: a 15-slide SIWES defence deck --
 * placement at HiiT Plc, skills acquired, problem/aim, the mini project, and dedicated snapshot
 * evidence for the automated, positive and negative test cases. Kept to 15 slides by merging related
 * topics onto one slide each (e.g. SIWES+HiiT, problem+aim, rules+scoring) rather than dropping content.
 *
 *   npm install pptxgenjs react react-dom react-icons sharp      # once, anywhere on NODE_PATH
 *   python docs/build/export_facts.py && node docs/build/build_siwes_pptx.js
 *
 * Structured deck: theme (applied after writing), named layouts with placeholders, sections (metadata
 * only -- no dedicated divider slides, to keep the count down), a native chart and speaker notes on
 * every slide. Things the student must supply are highlighted yellow in [brackets].
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const pptxgen = require('pptxgenjs');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const sharp = require('sharp');
const fa = require('react-icons/fa');

const ROOT = path.resolve(__dirname, '..', '..');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const OUT = path.join(ROOT, 'docs', 'SIWES-Presentation-HiiT-Plc-IoT-Trojan-Detector.pptx');
const facts = JSON.parse(fs.readFileSync(path.join(__dirname, '_facts.json'), 'utf8'));
const K = facts.constants, inf = facts.infected, cln = facts.clean, NT = facts.tests.length;
const garage = inf.devices.find((d) => d.status === 'compromised');
const nf = (n) => Number(n).toLocaleString('en-GB');

// Real, freshly captured pytest output -- this is actual evidence, not invented numbers. Build fails loudly
// rather than silently showing stale or fabricated results if the suite is not currently green.
let PYTEST_LOG;
try {
  PYTEST_LOG = execSync('python3 -m pytest -v trojan-lab/tests', { cwd: ROOT, stdio: 'pipe' }).toString();
} catch (e) {
  throw new Error('pytest is failing right now -- fix before building the evidence slide:\n' + (e.stdout || e.message));
}
const PYTEST_LINES = PYTEST_LOG.split('\n').filter((l) => l.includes('PASSED') || l.includes('FAILED'));
const PYTEST_SUMMARY = (PYTEST_LOG.split('\n').find((l) => /passed/.test(l)) || '').trim();
if (!PYTEST_LINES.length || PYTEST_LINES.some((l) => l.includes('FAILED'))) throw new Error('pytest has failing tests -- the evidence slide must show a real, fully green run');

const THEME = {
  name: 'Cyber Lab', headFontFace: 'Cambria', bodyFontFace: 'Calibri',
  colors: { dk1: '0B1F33', lt1: 'FFFFFF', dk2: '12385C', lt2: 'EAF0F6', accent1: '0E7C86', accent2: 'E4572E', accent3: 'F2A541',
    accent4: '3A6EA5', accent5: '2F6F4E', accent6: '8A99A8', hlink: '0E7C86', folHlink: '8A99A8' },
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';                          // 10 x 5.625 in
pres.title = 'SIWES Report: HiiT Plc, Network-Flow-Based Trojan Horse Detection for IoT Devices';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

// ------------------------------------------------------------------ layouts (one per slide frame)
const FOOT = 'SIWES Report  |  HiiT Plc  |  IoT Trojan Detector';
const bg = (c) => ({ rect: { x: 0, y: 0, w: 10, h: 5.625, fill: { color: c } } });
const ph = (name, type, o) => ({ placeholder: { options: { name, type, margin: 0, ...o }, text: '' } });

pres.defineSlideMaster({ title: 'TITLE_DARK', objects: [bg(C.text1),
  ph('title', 'title', { x: 0.7, y: 1.1, w: 5.9, h: 1.9, fontSize: 36, bold: true, color: C.background1, align: 'left', valign: 'bottom' }),
  ph('body', 'body', { x: 0.7, y: 3.15, w: 5.9, h: 0.9, fontSize: 17, color: C.background2, align: 'left', valign: 'top' })] });
const contentFrame = (dark) => [...(dark ? [bg(C.text1)] : []),
  ph('title', 'title', { x: 0.5, y: 0.3, w: 9, h: 0.75, fontSize: 28, bold: true, color: dark ? C.background1 : C.text1, align: 'left', valign: 'middle' }),
  { text: { text: FOOT, options: { x: 0.5, y: 5.2, w: 6, h: 0.25, fontSize: 9.5, color: C.accent6, margin: 0 } } }];
pres.defineSlideMaster({ title: 'CONTENT', objects: contentFrame(false), slideNumber: { x: 9.0, y: 5.2, w: 0.5, h: 0.25, fontSize: 9.5, color: HEX.accent6, align: 'right' } });
pres.defineSlideMaster({ title: 'CONTENT_DARK', objects: contentFrame(true), slideNumber: { x: 9.0, y: 5.2, w: 0.5, h: 0.25, fontSize: 9.5, color: HEX.accent6, align: 'right' } });

// ------------------------------------------------------------------ helpers
async function icon(Comp, hex, px = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: '#' + hex, size: String(px) }));
  return 'image/png;base64,' + (await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64');
}
const tx = (s, text, o) => s.addText(text, { isTextBox: true, margin: 0, ...o });
const card = (s, x, y, w, h, fill, name) => s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: fill }, line: { color: fill, width: 0 }, objectName: name });
const PH = (t) => ({ text: '[' + t + ']', options: { highlight: 'FFFF00', color: HEX.dk1 } });
async function badge(s, Comp, x, y, d, fill, iconHex = 'FFFFFF') {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill, width: 0 } });
  const pad = d * 0.25;
  s.addImage({ data: await icon(Comp, iconHex), x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad, altText: '' });
}
const lead = (b, rest, o = {}) => [{ text: b, options: { bold: true, ...o } }, { text: rest, options: { ...o } }];
const bl = (arr, size) => arr.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < arr.length - 1, paraSpaceAfter: size || 8 } }));
let slideNo = 0, PASS_ICON;
const add = (master, section) => { slideNo += 1; return pres.addSlide({ masterName: master, sectionTitle: section }); };
// A small "PASS" chip used on every evidence slide, so test outcomes read the same way everywhere.
async function passChip(s, x, y, label = 'PASS') {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 0.95, h: 0.32, rectRadius: 0.08, fill: { color: HEX.accent5 }, line: { color: HEX.accent5, width: 0 } });
  s.addImage({ data: PASS_ICON, x: x + 0.06, y: y + 0.06, w: 0.2, h: 0.2, altText: 'check' });
  tx(s, label, { x: x + 0.28, y, w: 0.65, h: 0.32, fontSize: 11, bold: true, color: C.background1, valign: 'middle' });
}

(async () => {
  PASS_ICON = await icon(fa.FaCheck, 'FFFFFF');

  // =========================================================== 1 title
  pres.addSection({ title: 'Introduction' });
  let s = add('TITLE_DARK', 'Introduction');
  s.addText('SIWES Report: Experience at HiiT Plc', { placeholder: 'title' });
  s.addText('Mini project: a network-flow-based Trojan Horse detection system for IoT devices', { placeholder: 'body' });
  tx(s, [PH('Your name'), { text: '   ' }, PH('Reg. No.'), { text: '', options: { breakLine: true } },
    { text: 'Department of Computer Science, University of Uyo', options: { breakLine: true } }, PH('Month, Year')],
  { x: 0.7, y: 4.35, w: 7.5, h: 0.8, fontSize: 13, color: C.background2, valign: 'top', objectName: 'Presenter details' });
  s.addShape(pres.shapes.OVAL, { x: 7.0, y: 1.4, w: 2.3, h: 2.3, fill: { color: C.accent1 }, line: { color: C.accent1, width: 0 } });
  s.addImage({ data: await icon(fa.FaShieldAlt, 'FFFFFF'), x: 7.6, y: 2.0, w: 1.1, h: 1.1, altText: 'Shield icon' });
  s.addNotes('Introduce yourself, SIWES, and the host organisation, HiiT Plc. One sentence on the mini project: a system that spots a Trojan Horse on IoT devices such as cameras by watching their network traffic, nothing else.');

  // =========================================================== 2 agenda
  s = add('CONTENT', 'Introduction');
  s.addText('What this presentation covers', { placeholder: 'title' });
  const agenda = [['SIWES, HiiT & my placement', 'The scheme, the company, skills acquired'], ['The mini project', 'Problem, aim and how it works'], ['Live demonstration', 'The lab and an infection you can watch'],
    ['Testing and evidence', 'Automated, positive and negative test results'], ['Results', 'What the samples showed'], ['Conclusion', 'Lessons and recommendations']];
  agenda.forEach(([t, d], i) => {
    const x = 0.5 + (i % 3) * 3.1, y = 1.5 + Math.floor(i / 3) * 1.75;
    card(s, x, y, 2.8, 1.5, C.background2, `Agenda card ${i + 1}`);
    s.addShape(pres.shapes.OVAL, { x: x + 0.2, y: y + 0.2, w: 0.5, h: 0.5, fill: { color: C.accent1 }, line: { color: C.accent1, width: 0 } });
    tx(s, String(i + 1), { x: x + 0.2, y: y + 0.2, w: 0.5, h: 0.5, fontSize: 16, bold: true, color: C.background1, align: 'center', valign: 'middle' });
    tx(s, t, { x: x + 0.85, y: y + 0.2, w: 1.8, h: 0.5, fontSize: 15, bold: true, color: C.text1, valign: 'middle' });
    tx(s, d, { x: x + 0.2, y: y + 0.85, w: 2.4, h: 0.55, fontSize: 13, color: C.text2, valign: 'top' });
  });
  s.addNotes('Six parts, compressed into fifteen slides: the scheme, company and skills together; the project itself; a live demo; test evidence with real screenshots; results; and the conclusion.');

  // =========================================================== 3 SIWES & HiiT Plc (merged, HiiT history trimmed)
  pres.addSection({ title: 'SIWES & HiiT Plc' });
  s = add('CONTENT', 'SIWES & HiiT Plc');
  s.addText('SIWES & HiiT Plc', { placeholder: 'title' });
  // left: SIWES, compact
  tx(s, 'About SIWES', { x: 0.5, y: 1.2, w: 4.3, h: 0.4, fontSize: 17, bold: true, color: C.accent1 });
  tx(s, '1973', { x: 0.5, y: 1.55, w: 4.3, h: 0.75, fontSize: 42, bold: true, color: C.accent1, fontFace: THEME.headFontFace, valign: 'middle' });
  tx(s, 'The Industrial Training Fund launched SIWES so graduates meet real working conditions before leaving university.', { x: 0.5, y: 2.35, w: 4.3, h: 0.8, fontSize: 13, color: C.text1, valign: 'top' });
  tx(s, bl(['ITF administers and funds the scheme', 'The university places and supervises', 'The host company trains and mentors'], 6),
    { x: 0.5, y: 3.2, w: 4.3, h: 1.5, fontSize: 12.5, color: C.text2, valign: 'top' });
  // right: HiiT Plc, trimmed to a 2x2 stat grid + one line (no business-line pill row)
  tx(s, 'About HiiT Plc (host organisation)', { x: 5.1, y: 1.2, w: 4.4, h: 0.4, fontSize: 17, bold: true, color: C.accent1 });
  const stats = [['60,000+', 'graduates trained'], ['4', 'CPN-accredited cities'], ['CPN', 'registered Nigerian IT firm'], ['4', 'lines of business']];
  stats.forEach(([n, l], i) => {
    const x = 5.1 + (i % 2) * 2.2, y = 1.7 + Math.floor(i / 2) * 1.0;
    card(s, x, y, 2.0, 0.85, C.background2, `HiiT stat ${i + 1}`);
    tx(s, n, { x: x + 0.12, y: y + 0.06, w: 1.76, h: 0.42, fontSize: 18, bold: true, color: C.accent1, fontFace: THEME.headFontFace, valign: 'middle' });
    tx(s, l, { x: x + 0.12, y: y + 0.46, w: 1.76, h: 0.35, fontSize: 10.5, color: C.text1, valign: 'top' });
  });
  tx(s, 'Training, software, consultancy & publishing -- Lagos, Abuja, Ibadan, Kano.', { x: 5.1, y: 3.75, w: 4.4, h: 0.35, fontSize: 11.5, color: C.text2, valign: 'middle' });
  tx(s, 'Source: BusinessDay (2020); HiiT Plc company profile', { x: 5.1, y: 4.1, w: 4.4, h: 0.3, fontSize: 10, color: C.accent6, valign: 'middle' });
  s.addNotes('SIWES began in 1973 so graduates meet real working conditions before leaving university. HiiT Plc, the host, is an indigenous Nigerian IT company: CPN-registered, centres in four cities, over 60,000 graduates, working in training, software, consultancy and publishing. Confirm the founding year and head office from the company profile before presenting.');

  // =========================================================== 4 placement & skills (merged)
  s = add('CONTENT', 'SIWES & HiiT Plc');
  s.addText('My placement, and skills acquired', { placeholder: 'title' });
  card(s, 0.5, 1.25, 4.3, 3.65, C.background2, 'Placement details card');
  tx(s, 'Placement details', { x: 0.7, y: 1.38, w: 3.9, h: 0.38, fontSize: 16, bold: true, color: C.text1 });
  const det = [['Host', [{ text: 'HiiT Plc' }]], ['Branch', [PH('branch / centre')]], ['Period', [PH('start date'), { text: ' to ' }, PH('end date')]],
    ['Supervisor', [PH('industry supervisor')]], ['Institution', [PH('institution supervisor')]]];
  det.forEach(([k, v], i) => {
    tx(s, k, { x: 0.7, y: 1.88 + i * 0.44, w: 1.2, h: 0.38, fontSize: 13, bold: true, color: C.accent1, valign: 'middle' });
    tx(s, v, { x: 1.95, y: 1.88 + i * 0.44, w: 2.7, h: 0.38, fontSize: 13, color: C.text1, valign: 'middle' });
  });
  tx(s, [{ text: `${NT} automated tests, all passing`, options: { bold: true, color: HEX.accent5 } }], { x: 0.7, y: 4.25, w: 3.9, h: 0.3, fontSize: 12.5, valign: 'middle' });
  tx(s, 'Skills acquired during the placement', { x: 5.1, y: 1.25, w: 4.4, h: 0.4, fontSize: 16, bold: true, color: C.text1 });
  const exp = [[fa.FaNetworkWired, 'Network flow analysis'], [fa.FaBug, 'IoT & cyber security'], [fa.FaDocker, 'Containers & Windows'],
    [fa.FaPython, 'Python & Flask'], [fa.FaVial, 'Testing & Git'], [fa.FaFileAlt, 'Technical writing']];
  for (let i = 0; i < exp.length; i++) {
    const y = 1.75 + i * 0.5;
    await badge(s, exp[i][0], 5.1, y, 0.4, i % 2 ? HEX.accent4 : HEX.accent1);
    tx(s, exp[i][1], { x: 5.62, y, w: 3.9, h: 0.4, fontSize: 13.5, bold: true, color: C.text1, valign: 'middle' });
  }
  s.addNotes('Fill in the highlighted placement details. Six skill areas were built while making the mini project: flow analysis, IoT security concepts, containers plus a Windows fallback, Python and Flask, testing with version control, and technical documentation generated straight from the code.');

  // =========================================================== 5 problem & aim (merged)
  pres.addSection({ title: 'Mini Project' });
  s = add('CONTENT', 'Mini Project');
  s.addText('The mini project: problem & aim', { placeholder: 'title' });
  const probs = [[fa.FaLock, 'No on-device protection', 'IoT devices cannot run security agents.'],
    [fa.FaFingerprint, 'Signatures miss new malware', 'A Trojan variant slips past them.'],
    [fa.FaSyncAlt, 'Healthy traffic looks regular too', '"Regular = suspicious" causes false alarms.'],
    [fa.FaFlask, 'Testing must be safe', 'No real malware, no risk to a real network.']];
  for (let i = 0; i < probs.length; i++) {
    const y = 1.25 + i * 0.86;
    await badge(s, probs[i][0], 0.5, y, 0.5, i % 2 ? HEX.accent4 : HEX.accent1);
    tx(s, probs[i][1], { x: 1.15, y, w: 3.65, h: 0.32, fontSize: 14, bold: true, color: C.text1, valign: 'middle' });
    tx(s, probs[i][2], { x: 1.15, y: y + 0.32, w: 3.65, h: 0.4, fontSize: 11.5, color: C.text2, valign: 'top' });
  }
  card(s, 5.1, 1.25, 4.4, 3.45, C.accent1, 'Aim card');
  tx(s, 'Aim', { x: 5.35, y: 1.38, w: 3.9, h: 0.36, fontSize: 17, bold: true, color: C.background1, fontFace: THEME.headFontFace });
  tx(s, 'Design, implement and test a lightweight, agentless system that detects Trojan-like behaviour on IoT devices from network flows, explains each finding, and supports containment.',
    { x: 5.35, y: 1.76, w: 3.9, h: 1.0, fontSize: 12, color: C.background1, valign: 'top' });
  tx(s, bl(['Detect known-bad contacts, odd ports, beaconing, scans & large transfers', 'Use a per-device baseline so legitimate traffic is never reported', 'Map findings to MITRE ATT&CK with a 0-100 risk score', 'Verify with automated, positive, negative and lab tests'], 6),
    { x: 5.35, y: 2.85, w: 3.9, h: 1.78, fontSize: 11.5, color: C.background1, valign: 'top' });
  s.addNotes('Four problems drove the design: cameras cannot host security software, signatures lag behind new malware, legitimate camera traffic is itself periodic so naive rules misfire, and testing must be safe. The aim, and four key objectives, answer all four.');

  // =========================================================== 6 how it works + architecture (merged)
  s = add('CONTENT', 'Mini Project');
  s.addText('How it works, and the lab architecture', { placeholder: 'title' });
  s.addImage({ path: path.join(SHOTS, 'fig-pipeline.png'), x: 0.5, y: 1.2, w: 9, h: 9 * 284 / 1832, altText: 'Detection pipeline: flow CSV, parse, baseline, detect, score, JSON to UI' });
  s.addImage({ path: path.join(SHOTS, 'fig-architecture.png'), x: 0.5, y: 2.75, w: 4.7, h: 4.7 * 832 / 1832, altText: 'Architecture of the laboratory and detector' });
  tx(s, bl(['Parse the CSV, then compare each flow with a per-device baseline', 'Score and report: findings carry severity & ATT&CK, 0-100 per device', "Lab network is internal -- no route to the internet", 'Harmless: EICAR test string, fake C2, no real payload'], 7),
    { x: 5.4, y: 2.8, w: 4.1, h: 2.0, fontSize: 12.5, color: C.text1, valign: 'top' });
  s.addNotes('A flow CSV is parsed, compared with an optional per-device baseline, then scored -- findings carry severity and MITRE ATT&CK, each device gets a 0-100 score. Everything runs in containers on an internal network with no route out; the lab is harmless by design.');

  // =========================================================== 7 cam-vault: watch an infection (incl. recent upgrades)
  s = add('CONTENT_DARK', 'Mini Project');
  s.addText('Watch an infection happen', { placeholder: 'title' });
  s.addImage({ path: path.join(SHOTS, 'cam-vault-clean.jpg'), x: 0.5, y: 1.25, w: 4.0, h: 4.0 * 360 / 640, altText: 'Clean camera feed' });
  s.addImage({ path: path.join(SHOTS, 'cam-vault-infected.jpg'), x: 5.1, y: 1.25, w: 4.0, h: 4.0 * 360 / 640, altText: 'Infected camera feed, glitching, showing fake hacker activity' });
  tx(s, 'Before: normal video', { x: 0.5, y: 3.62, w: 4.0, h: 0.32, fontSize: 13, bold: true, color: C.background1, align: 'center' });
  tx(s, 'After: feed glitches, virus activity overlaid', { x: 5.1, y: 3.62, w: 4.0, h: 0.32, fontSize: 13, bold: true, color: C.background2, align: 'center' });
  tx(s, 'A new camera, "cam-vault", starts already infected. Its picture visibly breaks up and shows the virus\'s real activity -- so an audience can SEE the infection.', { x: 0.5, y: 4.05, w: 9, h: 0.5, fontSize: 12.5, color: C.background2, valign: 'top' });
  ['Windows support', 'Live streaming video', 'Pre-infected camera', 'Ready to host online'].forEach((t, i) => {
    const x = 0.5 + i * 2.28;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 4.62, w: 2.08, h: 0.42, rectRadius: 0.1, fill: { color: HEX.accent1 }, line: { color: HEX.accent1, width: 0 } });
    tx(s, t, { x, y: 4.62, w: 2.08, h: 0.42, fontSize: 11, bold: true, color: C.background1, align: 'center', valign: 'middle' });
  });
  s.addNotes('The newest addition: a camera called cam-vault that starts already infected. Instead of just a score on a dashboard, its video feed itself glitches and overlays the virus\'s real fake activity. Also recently added: the whole lab now runs on Windows with one command, the cameras stream real-looking live video, and the detector is ready to be hosted online for a demo link.');

  // =========================================================== 8 rules + scoring (merged)
  s = add('CONTENT', 'Mini Project');
  s.addText('Detection rules & scoring', { placeholder: 'title' });
  const hdr = (t) => ({ text: t, options: { bold: true, color: C.background1, fill: { color: HEX.dk2 }, fontSize: 11.5 } });
  const sev = (t) => ({ text: t, options: { bold: true, color: t === 'Medium' ? '8A5A00' : HEX.accent2, align: 'center', fontSize: 10.5 } });
  const rule = (a, b, c, d) => [{ text: a, options: { bold: true, fontSize: 10.5 } }, { text: b, options: { fontSize: 10.5 } }, sev(c), { text: d, options: { fontSize: 10.5, align: 'center' } }];
  s.addTable([
    [hdr('Rule'), hdr('Fires when'), { ...hdr('Severity'), options: { ...hdr('').options, align: 'center' } }, { ...hdr('ATT&CK'), options: { ...hdr('').options, align: 'center' } }],
    rule('Known-bad IP', 'Contact with a threat-intelligence listed address', 'Critical', 'T1071'),
    rule('Suspicious port', 'Ports such as 23, 4444, 6667, 31337', 'High', 'T1571'),
    rule('Unusual port', 'Port outside the baseline / camera defaults', 'Medium', 'T1571'),
    rule('Beaconing', `${K.BEACON_MIN_EVENTS}+ flows, jitter CV <= ${K.BEACON_MAX_CV}, new peer`, 'High', 'T1029'),
    rule('Scan burst', `${K.SCAN_MIN_TARGETS}+ hosts/ports within ${K.SCAN_WINDOW_S} s`, 'High', 'T1018/T1046'),
    rule('Large transfer', `${K.EXFIL_ABS_BYTES / 1e6} MB+ to one external address`, 'High', 'T1041'),
  ], { x: 0.5, y: 1.2, w: 9, colW: [1.7, 4.6, 1.2, 1.5], rowH: 0.32, color: HEX.dk1, border: { type: 'solid', pt: 0.5, color: 'C5D0DC' }, valign: 'middle', margin: [0, 0.08, 0, 0.08], fontFace: THEME.bodyFontFace });
  [['Clean', '< 10', HEX.accent5], ['Suspicious', '10-49', '8A5A00'], ['Compromised', '50+', HEX.accent2]].forEach(([n, r, c], i) => {
    const x = 0.5 + i * 3.03;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 4.1, w: 2.85, h: 0.5, rectRadius: 0.1, fill: { color: c }, line: { color: c, width: 0 }, objectName: `Status ${n}` });
    tx(s, [{ text: n + '  ', options: { bold: true } }, { text: r }], { x, y: 4.1, w: 2.85, h: 0.5, fontSize: 13, color: C.background1, align: 'center', valign: 'middle' });
  });
  tx(s, 'Each finding adds a weight (critical 40, high 25, medium 10); baseline-aware beaconing keeps the clean sample at 0 findings.', { x: 0.5, y: 4.72, w: 9, h: 0.35, fontSize: 11.5, italic: true, color: C.text2, valign: 'middle' });
  s.addNotes('Six of the eight rule families shown, each tied to a MITRE ATT&CK technique. Each finding adds a weight toward a 0-100 score: under 10 clean, 10-49 suspicious, 50+ compromised. Beaconing only counts for peers outside the device baseline, which is why the clean capture scores zero.');

  // =========================================================== 9 UI in action
  s = add('CONTENT', 'Mini Project');
  s.addText('The detector in action', { placeholder: 'title' });
  s.addImage({ path: path.join(SHOTS, '04-results.png'), x: 0.7, y: 1.3, w: 8.6, h: 8.6 * 878 / 2224, altText: 'Results screen: summary tiles and device table with cam-garage compromised' });
  tx(s, `Infected sample: cam-garage compromised (score ${garage.score}); other cameras clean. The same page works on a phone.`, { x: 0.7, y: 4.82, w: 8.6, h: 0.3, fontSize: 12.5, color: C.text2, valign: 'middle' });
  s.addNotes('Live demo here if possible: load the infected sample. Point to the summary tiles, status pill, risk score and the Quarantine button. Every finding also carries its evidence and ATT&CK technique, and the same page works on a phone for on-call triage.');

  // =========================================================== 10 automated test evidence (real terminal output)
  pres.addSection({ title: 'Testing & Evidence' });
  s = add('CONTENT_DARK', 'Testing & Evidence');
  s.addText('Evidence 1: automated test suite', { placeholder: 'title' });
  tx(s, `Every one of the ${NT} tests, not a sample -- real output, captured just now`, { x: 0.6, y: 1.0, w: 8.8, h: 0.28, fontSize: 12.5, italic: true, color: C.accent6, valign: 'middle' });

  // --- geometry first (nothing drawn yet), so the card can be drawn before -- and so stay behind -- its contents.
  // Each test name gets its OWN text box, one line each, at an explicit row pitch (ROWH) that we choose --
  // rather than one big auto-flowing paragraph block, whose real rendered line pitch for Courier New turned
  // out to be hard to predict from font metrics and kept overflowing its allotted height. A single line in its
  // own box just renders at its natural glyph size from the anchor point: as long as ROWH comfortably exceeds
  // that glyph height, rows cannot visually collide, and the total height is now exact arithmetic, not a guess.
  const FONT = 7, ROWH = 0.125; // ROWH checked against FONT's natural single-line height with margin to spare
  const termTop = 1.32, promptY = termTop + 0.08, linesTop = termTop + 0.38;
  const shortNames = PYTEST_LINES.map((l) => l.replace('trojan-lab/tests/', '').replace(/\s+PASSED.*$/, '').trim());
  const padTo = Math.min(70, Math.max(...shortNames.map((n) => n.length)) + 2);
  const linesH = shortNames.length * ROWH;
  const summaryY = linesTop + linesH + 0.06, summaryH = 0.26;
  const termBottom = summaryY + summaryH + 0.08, termH = termBottom - termTop;
  if (termBottom > 5.15) throw new Error(`terminal card (bottom ${termBottom.toFixed(2)}) would crowd the footer at 5.2 -- shrink FONT/ROWH or show fewer lines`);

  // --- now draw, back to front: card, then everything on top of it.
  card(s, 0.6, termTop, 8.8, termH, '0D1117', 'Terminal window');
  ['E74C3C', 'F1C40F', '2ECC71'].forEach((c, i) => s.addShape(pres.shapes.OVAL, { x: 0.8 + i * 0.26, y: termTop + 0.13, w: 0.16, h: 0.16, fill: { color: c }, line: { color: c, width: 0 } }));
  tx(s, 'python -m pytest -v trojan-lab/tests', { x: 1.7, y: promptY, w: 6.0, h: 0.26, fontSize: 11, color: '8B949E', fontFace: 'Courier New' });
  shortNames.forEach((n, i) => {
    tx(s, [{ text: n.padEnd(padTo, '.'), options: { color: '6E7681' } }, { text: 'PASS', options: { color: '3FB950', bold: true } }],
      { x: 0.85, y: linesTop + i * ROWH, w: 8.2, h: ROWH, fontSize: FONT, fontFace: 'Courier New', valign: 'top' });
  });
  tx(s, PYTEST_SUMMARY || `${NT} passed`, { x: 0.85, y: summaryY, w: 6.3, h: summaryH, fontSize: 12, bold: true, color: '3FB950', fontFace: 'Courier New', valign: 'middle' });
  await passChip(s, 7.75, summaryY, `${NT}/${NT}`);
  s.addNotes(`This is a real, just-captured pytest run, not a mock-up -- every one of the ${NT} tests is listed here, not a sample, and all ${NT} pass. It covers the detection engine's rules, the web API, the Windows-compatible flow logger, and the live camera stream.`);

  // =========================================================== 11 positive test evidence
  s = add('CONTENT', 'Testing & Evidence');
  s.addText('Evidence 2: positive test cases', { placeholder: 'title' });
  tx(s, 'Proving the detector catches what it should', { x: 0.5, y: 1.0, w: 9, h: 0.3, fontSize: 13, italic: true, color: C.accent6, valign: 'middle' });
  const pos = [['04-results.png', 2224, 878, 'P1: infected sample', `cam-garage flagged compromised, score ${garage.score}`],
    ['08-quarantine.png', 2224, 654, 'P6: quarantine action', 'One click removes the simulated persistence'],
    ['06-live.png', 2224, 550, 'P7: live lab capture', 'Reads flows.csv written by the running lab']];
  const pw = 2.85;
  for (let i = 0; i < pos.length; i++) {
    const [file, iw, ih, label, desc] = pos[i];
    const x = 0.5 + i * 3.05, ph_ = pw * ih / iw;
    s.addImage({ path: path.join(SHOTS, file), x, y: 1.45, w: pw, h: ph_, altText: label });
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.45, w: pw, h: ph_, fill: { type: 'none' }, line: { color: HEX.accent5, width: 1.5 } });
    tx(s, label, { x, y: 1.45 + ph_ + 0.08, w: pw, h: 0.3, fontSize: 13, bold: true, color: C.text1, valign: 'top' });
    tx(s, desc, { x, y: 1.45 + ph_ + 0.38, w: pw, h: 0.5, fontSize: 11.5, color: C.text2, valign: 'top' });
    await passChip(s, x, 1.45 + ph_ + 0.9);
  }
  s.addNotes('Three positive cases, each a real screenshot of the running app: the infected sample is caught and scored; the Quarantine button actually removes the simulator\'s persistence files; and the live lab capture is read correctly while the lab is running.');

  // =========================================================== 12 negative test evidence
  s = add('CONTENT', 'Testing & Evidence');
  s.addText('Evidence 3: negative test cases', { placeholder: 'title' });
  tx(s, 'Proving it rejects bad input and does not cry wolf', { x: 0.5, y: 1.0, w: 9, h: 0.3, fontSize: 13, italic: true, color: C.accent6, valign: 'middle' });
  const neg = [['03-error.png', 2224, 1230, 'N1: malformed CSV', 'Missing columns -> HTTP 400 with a clear message, not a crash'],
    ['07-clean.png', 2224, 878, 'N7: clean traffic', `0 findings on ${nf(cln.summary.flows)} healthy flows -- no false alarms`]];
  const pw2 = 4.3;
  for (let i = 0; i < neg.length; i++) {
    const [file, iw, ih, label, desc] = neg[i];
    const x = 0.5 + i * 4.6, ph_ = pw2 * ih / iw;
    s.addImage({ path: path.join(SHOTS, file), x, y: 1.45, w: pw2, h: Math.min(ph_, 2.9), altText: label, sizing: { type: 'crop', w: pw2, h: Math.min(ph_, 2.9) } });
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.45, w: pw2, h: Math.min(ph_, 2.9), fill: { type: 'none' }, line: { color: HEX.accent2, width: 1.5 } });
    tx(s, label, { x, y: 1.45 + Math.min(ph_, 2.9) + 0.1, w: pw2, h: 0.32, fontSize: 14, bold: true, color: C.text1, valign: 'top' });
    tx(s, desc, { x, y: 1.45 + Math.min(ph_, 2.9) + 0.44, w: pw2, h: 0.55, fontSize: 12, color: C.text2, valign: 'top' });
    await passChip(s, x, 1.45 + Math.min(ph_, 2.9) + 1.0);
  }
  s.addNotes('Two negative cases: a malformed CSV is rejected with a readable error instead of crashing, and the clean traffic sample -- which is just as regular as the infected one -- produces zero false alarms, because of the baseline logic shown earlier.');

  // =========================================================== 13 results summary
  s = add('CONTENT', 'Testing & Evidence');
  s.addText('Results at a glance', { placeholder: 'title' });
  const res = [[`${NT}/${NT}`, 'automated tests pass'], [String(inf.summary.findings), `findings on the infected sample`],
    [String(cln.summary.findings), 'false alarms on clean traffic'], [String(garage.score), 'risk score given to the infected camera']];
  res.forEach(([n, l], i) => {
    const x = 0.5 + i * 2.32;
    card(s, x, 1.3, 2.05, 1.85, C.background2, `Result stat ${i + 1}`);
    tx(s, n, { x: x + 0.15, y: 1.4, w: 1.75, h: 0.75, fontSize: 30, bold: true, color: i === 2 ? C.accent5 : (i === 3 ? C.accent2 : C.accent1), fontFace: THEME.headFontFace, valign: 'middle' });
    tx(s, l, { x: x + 0.15, y: 2.18, w: 1.75, h: 0.9, fontSize: 12.5, color: C.text1, valign: 'top' });
  });
  const devs = [['cam-garage', `compromised, score ${garage.score}`, HEX.accent2], ['cam-lobby', 'clean, score 0', HEX.accent5], ['cam-office', 'clean, score 0', HEX.accent5]];
  devs.forEach(([n, d, c], i) => {
    const x = 0.5 + i * 3.1;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 3.35, w: 2.8, h: 0.85, rectRadius: 0.12, fill: { color: c }, line: { color: c, width: 0 }, objectName: `Device ${n}` });
    tx(s, [{ text: n, options: { bold: true, fontSize: 15, breakLine: true } }, { text: d, options: { fontSize: 13 } }], { x, y: 3.35, w: 2.8, h: 0.85, color: C.background1, align: 'center', valign: 'middle' });
  });
  tx(s, `Infected sample: ${nf(inf.summary.flows)} flows from 3 cameras.  Clean sample: ${nf(cln.summary.flows)} flows.  Same engine, same thresholds -- just different input.`, { x: 0.5, y: 4.4, w: 9, h: 0.45, fontSize: 12.5, color: C.text2, valign: 'middle' });
  s.addNotes('All tests pass. The infected capture produces 22 findings, all on cam-garage, which scores 100. The clean capture is just as regular but produces no findings -- evidence that the baseline avoids false positives.');

  // =========================================================== 14 conclusion (achievements + limits + recommendations, merged)
  pres.addSection({ title: 'Conclusion' });
  s = add('CONTENT_DARK', 'Conclusion');
  s.addText('Conclusion', { placeholder: 'title' });
  card(s, 0.5, 1.2, 4.4, 3.65, C.text2, 'Achievements card');
  tx(s, 'What I achieved', { x: 0.75, y: 1.33, w: 3.9, h: 0.4, fontSize: 17, bold: true, color: C.background1, fontFace: THEME.headFontFace });
  tx(s, bl(['A working, tested Trojan detector for IoT flows', 'A safe lab -- now with a camera you can watch get hacked', `${NT}/${NT} tests, plus real positive & negative evidence`, 'Practical skills: security, containers, Python, Windows, docs'], 11),
    { x: 0.75, y: 1.8, w: 3.9, h: 2.9, fontSize: 12.5, color: C.background1, valign: 'top' });
  card(s, 5.1, 1.2, 4.4, 3.65, C.accent1, 'Recommendations card');
  tx(s, 'Recommendations', { x: 5.35, y: 1.33, w: 3.9, h: 0.4, fontSize: 17, bold: true, color: C.background1, fontFace: THEME.headFontFace });
  const rec = [['HiiT: ', 'a written task schedule and a named reviewer for each intern'], ['University: ', 'earlier security and DevOps content, more supervisory visits'], ['ITF: ', 'prompt allowances and closer placement monitoring']];
  tx(s, rec.flatMap(([b, r], i) => [{ text: b, options: { bold: true, bullet: true } }, { text: r, options: { breakLine: i < rec.length - 1, paraSpaceAfter: 10 } }]),
    { x: 5.35, y: 1.78, w: 3.9, h: 2.0, fontSize: 13.5, color: C.background1, valign: 'top' });
  s.addNotes('Summarise: the system works on the samples, the lab makes it demonstrable and now visible, and I gained real practical skills -- alongside honest limits (heuristic rules, no login screen yet, Docker layer untested end to end). Recommendations: HiiT should give interns written task schedules and reviewers; the university should bring security and DevOps content earlier; the ITF should pay allowances promptly and monitor placements.');

  // =========================================================== 15 thank you
  s = add('TITLE_DARK', 'Conclusion');
  s.addText('Thank you', { placeholder: 'title' });
  s.addText('Questions?', { placeholder: 'body' });
  tx(s, 'github.com/emmanuelekopimo/build-with-ai', { x: 0.7, y: 4.55, w: 6.0, h: 0.3, fontSize: 11, color: C.accent6, valign: 'middle' });
  s.addShape(pres.shapes.OVAL, { x: 7.0, y: 1.4, w: 2.3, h: 2.3, fill: { color: C.accent1 }, line: { color: C.accent1, width: 0 } });
  s.addImage({ data: await icon(fa.FaShieldAlt, 'FFFFFF'), x: 7.6, y: 2.0, w: 1.1, h: 1.1, altText: 'Shield icon' });
  s.addNotes('Invite questions. Likely ones: why not signatures, how false positives are avoided (the baseline), and whether the trojan is real (no -- it is a harmless simulator on an isolated network).');

  // =========================================================== write + theme
  await pres.writeFile({ fileName: OUT });
  const skillDirs = [process.env.PPTX_SKILL_DIR, ...(fs.existsSync('/root/.claude/skills/synced') ? fs.readdirSync('/root/.claude/skills/synced').map((d) => path.join('/root/.claude/skills/synced', d, 'pptx')) : [])].filter(Boolean);
  const applyPath = skillDirs.map((d) => path.join(d, 'scripts', 'apply_theme.js')).find((f) => fs.existsSync(f));
  if (applyPath) await require(applyPath).applyTheme(OUT, THEME);
  else console.warn('apply_theme.js not found (set PPTX_SKILL_DIR): theme colours were NOT written, scheme colours will look like the Office default');
  console.log('wrote', OUT, `(${slideNo} slides)`);
})();
