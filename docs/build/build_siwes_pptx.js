/* Builds docs/SIWES-Presentation-HiiT-Plc-IoT-Trojan-Detector.pptx: the full SIWES defence deck --
 * placement at HiiT Plc, skills acquired, problem statement, aim & objectives, the mini project, and
 * dedicated snapshot evidence for the automated, positive and negative test cases.
 *
 *   npm install pptxgenjs react react-dom react-icons sharp      # once, anywhere on NODE_PATH
 *   python docs/build/export_facts.py && node docs/build/build_siwes_pptx.js
 *
 * Structured deck: theme (applied after writing), named layouts with placeholders, sections, a native
 * chart and speaker notes on every slide. Things the student must supply are highlighted yellow in [brackets].
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
pres.defineSlideMaster({ title: 'SECTION', objects: [bg(C.text2),
  ph('title', 'title', { x: 0.7, y: 1.6, w: 8.6, h: 1.3, fontSize: 42, bold: true, color: C.background1, align: 'left', valign: 'bottom' }),
  ph('body', 'body', { x: 0.7, y: 3.1, w: 8.6, h: 1.0, fontSize: 19, color: C.background2, align: 'left', valign: 'top' })] });
const contentFrame = (dark) => [...(dark ? [bg(C.text1)] : []),
  ph('title', 'title', { x: 0.5, y: 0.3, w: 9, h: 0.75, fontSize: 30, bold: true, color: dark ? C.background1 : C.text1, align: 'left', valign: 'middle' }),
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
  const agenda = [['SIWES and HiiT Plc', 'The scheme, the company, my placement'], ['Skills acquired', 'What the training built in me'],
    ['The mini project', 'Problem, aim, design and how it works'], ['Live demonstration', 'The lab and an infection you can watch'],
    ['Testing and evidence', 'Automated, positive and negative test results'], ['Conclusion', 'Results, lessons and recommendations']];
  agenda.forEach(([t, d], i) => {
    const x = 0.5 + (i % 3) * 3.1, y = 1.5 + Math.floor(i / 3) * 1.75;
    card(s, x, y, 2.8, 1.5, C.background2, `Agenda card ${i + 1}`);
    s.addShape(pres.shapes.OVAL, { x: x + 0.2, y: y + 0.2, w: 0.5, h: 0.5, fill: { color: C.accent1 }, line: { color: C.accent1, width: 0 } });
    tx(s, String(i + 1), { x: x + 0.2, y: y + 0.2, w: 0.5, h: 0.5, fontSize: 16, bold: true, color: C.background1, align: 'center', valign: 'middle' });
    tx(s, t, { x: x + 0.85, y: y + 0.2, w: 1.8, h: 0.5, fontSize: 15, bold: true, color: C.text1, valign: 'middle' });
    tx(s, d, { x: x + 0.2, y: y + 0.85, w: 2.4, h: 0.55, fontSize: 13, color: C.text2, valign: 'top' });
  });
  s.addNotes('Six parts: the scheme and the company; what I learned; the project itself, including its problem and aim; a live demo of the lab; test evidence with real screenshots; and the conclusion.');

  // =========================================================== 3 SIWES
  pres.addSection({ title: 'SIWES & HiiT Plc' });
  s = add('CONTENT', 'SIWES & HiiT Plc');
  s.addText('About SIWES', { placeholder: 'title' });
  tx(s, '1973', { x: 0.5, y: 1.4, w: 3.7, h: 1.1, fontSize: 68, bold: true, color: C.accent1, fontFace: THEME.headFontFace, valign: 'middle' });
  tx(s, 'The Industrial Training Fund launched SIWES so that graduates meet real working conditions before they leave university.', { x: 0.5, y: 2.6, w: 3.7, h: 1.4, fontSize: 15, color: C.text1, valign: 'top' });
  tx(s, 'The ITF itself was established in 1971.', { x: 0.5, y: 4.2, w: 3.7, h: 0.4, fontSize: 13, color: C.accent6, valign: 'top' });
  const who = [[fa.FaLandmark, 'ITF', 'administers and funds the scheme'], [fa.FaBalanceScale, 'NUC, NBTE, NCCE', 'set academic standards'], [fa.FaUniversity, 'Institution', 'places, supervises and assesses'],
    [fa.FaBuilding, 'Host organisation', 'trains and mentors the student'], [fa.FaUserGraduate, 'Student', 'keeps a logbook and writes the report']];
  for (let i = 0; i < who.length; i++) {
    const y = 1.35 + i * 0.68;
    await badge(s, who[i][0], 4.8, y, 0.48, i % 2 ? HEX.accent4 : HEX.accent1);
    tx(s, lead(who[i][1] + '  ', who[i][2]), { x: 5.45, y, w: 4.05, h: 0.48, fontSize: 14, color: C.text1, valign: 'middle' });
  }
  s.addNotes('SIWES began in 1973 because employers complained that graduates knew theory but lacked practical skill. Five parties make it work: the ITF, the academic regulators, the university, the host company and the student.');

  // =========================================================== 4 HiiT
  s = add('CONTENT', 'SIWES & HiiT Plc');
  s.addText('About HiiT Plc, the host organisation', { placeholder: 'title' });
  const stats = [['60,000+', 'graduates trained'], ['4', 'cities with CPN-accredited centres'], ['CPN', 'registered Nigerian IT company'], ['4', 'lines of business']];
  stats.forEach(([n, l], i) => {
    const x = 0.5 + i * 2.32;
    card(s, x, 1.35, 2.05, 1.65, C.background2, `HiiT stat ${i + 1}`);
    tx(s, n, { x: x + 0.15, y: 1.45, w: 1.75, h: 0.8, fontSize: 22, bold: true, color: C.accent1, fontFace: THEME.headFontFace, valign: 'middle' });
    tx(s, l, { x: x + 0.15, y: 2.25, w: 1.75, h: 0.65, fontSize: 13, color: C.text1, valign: 'top' });
  });
  tx(s, 'Lagos, Abuja, Ibadan and Kano; instructor-led online classes reach learners elsewhere.', { x: 0.5, y: 3.15, w: 9, h: 0.35, fontSize: 13, color: C.text2, valign: 'middle' });
  ['IT training', 'Software', 'Consultancy', 'Publishing', 'SIWES programme'].forEach((t, i) => {
    const x = 0.5 + i * 1.845;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 3.65, w: 1.62, h: 0.52, rectRadius: 0.12, fill: { color: i === 4 ? HEX.accent1 : HEX.dk2 }, line: { color: i === 4 ? HEX.accent1 : HEX.dk2, width: 0 }, objectName: `Business line ${i + 1}` });
    tx(s, t, { x, y: 3.65, w: 1.62, h: 0.52, fontSize: 13, bold: true, color: C.background1, align: 'center', valign: 'middle' });
  });
  tx(s, 'Sources: BusinessDay (2020); HiiT Plc company profile', { x: 0.5, y: 4.45, w: 9, h: 0.3, fontSize: 10.5, color: C.accent6, valign: 'middle' });
  s.addNotes('HiiT Plc is an indigenous Nigerian IT company with CPN-accredited centres in four cities and more than 60,000 graduates. It works in training, software, consultancy and publishing, and runs a SIWES programme, which is where I trained. Confirm the founding year and head office from the company profile before presenting.');

  // =========================================================== 5 placement
  s = add('CONTENT', 'SIWES & HiiT Plc');
  s.addText('My placement at HiiT Plc', { placeholder: 'title' });
  card(s, 0.5, 1.3, 4.3, 3.6, C.background2, 'Placement details card');
  tx(s, 'Placement details', { x: 0.7, y: 1.45, w: 3.9, h: 0.4, fontSize: 17, bold: true, color: C.text1 });
  const det = [['Host', [{ text: 'HiiT Plc' }]], ['Branch', [PH('branch / centre')]], ['Unit', [PH('unit / department')]], ['Period', [PH('start date'), { text: ' to ' }, PH('end date')]],
    ['Supervisor', [PH('industry supervisor')]], ['Institution', [PH('institution supervisor')]]];
  det.forEach(([k, v], i) => {
    tx(s, k, { x: 0.7, y: 2.0 + i * 0.43, w: 1.2, h: 0.36, fontSize: 13, bold: true, color: C.accent1, valign: 'middle' });
    tx(s, v, { x: 1.95, y: 2.0 + i * 0.43, w: 2.7, h: 0.36, fontSize: 13, color: C.text1, valign: 'middle' });
  });
  tx(s, 'Work completed', { x: 5.2, y: 1.35, w: 4.3, h: 0.4, fontSize: 17, bold: true, color: C.text1 });
  const work = ['Flow-analysis engine in Python', 'Web interface and JSON API (Flask)', 'Docker camera laboratory', 'Harmless trojan and fake C2 server', `${NT} automated tests, all passing`, 'README, PDF, Word and slide documentation'];
  const check = await icon(fa.FaCheckCircle, HEX.accent1);
  work.forEach((t, i) => {
    s.addImage({ data: check, x: 5.2, y: 1.92 + i * 0.46, w: 0.28, h: 0.28, altText: 'Done' });
    tx(s, t, { x: 5.62, y: 1.88 + i * 0.46, w: 3.88, h: 0.38, fontSize: 14, color: C.text1, valign: 'middle' });
  });
  s.addNotes('Fill in the highlighted details: branch, unit, dates and supervisors. The six work packages on the right all feed into the mini project that follows, and are the evidence base for the SIWES logbook.');

  // =========================================================== 6 skills acquired
  pres.addSection({ title: 'Skills Acquired' });
  s = add('CONTENT', 'Skills Acquired');
  s.addText('Skills acquired during the placement', { placeholder: 'title' });
  const exp = [[fa.FaNetworkWired, 'Network flow analysis', 'Reading traffic for behaviour, not content'], [fa.FaBug, 'IoT & cyber security', 'Trojans, command-and-control, MITRE ATT&CK'], [fa.FaDocker, 'Containers & Windows', 'Docker Compose lab; a Windows-compatible fallback'],
    [fa.FaPython, 'Python & Flask', 'Layered, testable backend and web API'], [fa.FaVial, 'Testing & Git', `${NT} pytest cases; branches and a pull request`], [fa.FaFileAlt, 'Technical writing', 'README, PDF, Word report and slide decks, all generated from the code']];
  for (let i = 0; i < exp.length; i++) {
    const x = 0.5 + (i % 3) * 3.1, y = 1.35 + Math.floor(i / 3) * 1.75;
    card(s, x, y, 2.8, 1.55, C.background2, `Skill card ${i + 1}`);
    await badge(s, exp[i][0], x + 0.2, y + 0.2, 0.52, i % 2 ? HEX.accent4 : HEX.accent1);
    tx(s, exp[i][1], { x: x + 0.88, y: y + 0.2, w: 1.75, h: 0.52, fontSize: 14.5, bold: true, color: C.text1, valign: 'middle' });
    tx(s, exp[i][2], { x: x + 0.2, y: y + 0.85, w: 2.45, h: 0.6, fontSize: 12.5, color: C.text2, valign: 'top' });
  }
  s.addNotes('Six areas of growth, all built while making the mini project: flow analysis, IoT security concepts, containers plus a Windows fallback, Python and Flask, testing with version control, and technical documentation generated straight from the code so it never goes stale.');

  // =========================================================== 7 divider
  pres.addSection({ title: 'Mini Project' });
  s = add('SECTION', 'Mini Project');
  s.addText('The Mini Project', { placeholder: 'title' });
  s.addText('Design and implementation of a network-flow-based Trojan Horse detection system for IoT devices', { placeholder: 'body' });
  s.addNotes('Transition from the placement overall to the main technical deliverable: the detector itself.');

  // =========================================================== 8 problem statement
  s = add('CONTENT', 'Mini Project');
  s.addText('Problem statement', { placeholder: 'title' });
  const probs = [[fa.FaLock, 'No on-device protection', 'IoT devices cannot run endpoint security agents, so detection has to happen on the network, not on the device.'],
    [fa.FaFingerprint, 'Signatures miss new malware', 'Antivirus signatures only catch malware already analysed; a Trojan variant slips straight past them.'],
    [fa.FaSyncAlt, 'Healthy traffic looks regular too', 'A camera streams video on a fixed schedule already, so a naive "regular = suspicious" rule floods analysts with false alarms.'],
    [fa.FaFlask, 'Testing needs to be safe', 'Demonstrating detection must not involve real malware or put a real network at risk.']];
  for (let i = 0; i < probs.length; i++) {
    const y = 1.3 + i * 0.95;
    await badge(s, probs[i][0], 0.5, y, 0.56, i % 2 ? HEX.accent4 : HEX.accent1);
    tx(s, probs[i][1], { x: 1.25, y, w: 8.1, h: 0.36, fontSize: 16, bold: true, color: C.text1, valign: 'middle' });
    tx(s, probs[i][2], { x: 1.25, y: y + 0.36, w: 8.1, h: 0.5, fontSize: 13, color: C.text2, valign: 'top' });
  }
  s.addNotes('Four problems drove the design: cameras cannot host security software; malware signatures lag behind new variants; legitimate camera traffic is itself periodic, so naive rules misfire; and any demonstration must be safe.');

  // =========================================================== 9 aim and objectives
  s = add('CONTENT', 'Mini Project');
  s.addText('Aim and objectives', { placeholder: 'title' });
  card(s, 0.5, 1.3, 9, 1.15, C.accent1, 'Aim card');
  tx(s, [{ text: 'Aim:  ', options: { bold: true } }, { text: 'design, implement and test a lightweight, agentless system that detects Trojan-like behaviour on IoT devices from network-flow data, explains each finding, and supports containment -- with a safe laboratory to demonstrate it.' }],
    { x: 0.75, y: 1.45, w: 8.5, h: 0.9, fontSize: 15, color: C.background1, valign: 'middle' });
  const objs = ['Define a flow-record schema any tool (Zeek, Suricata, routers) can produce', 'Detect known-bad contacts, odd ports, beaconing, scans and large transfers',
    'Use a per-device baseline, so legitimate periodic traffic is never reported', 'Map every finding to MITRE ATT&CK and give each device a 0-100 risk score',
    'Provide a web interface and API to upload, review and quarantine', 'Build an isolated test lab with simulated cameras and a harmless trojan', 'Verify everything with automated, positive, negative and lab tests'];
  const colL = objs.slice(0, 4), colR = objs.slice(4);
  colL.forEach((t, i) => tx(s, [{ text: `${i + 1}. `, options: { bold: true, color: HEX.accent1 } }, { text: t }], { x: 0.5, y: 2.65 + i * 0.57, w: 4.5, h: 0.55, fontSize: 13, color: C.text1, valign: 'top' }));
  colR.forEach((t, i) => tx(s, [{ text: `${colL.length + i + 1}. `, options: { bold: true, color: HEX.accent1 } }, { text: t }], { x: 5.1, y: 2.65 + i * 0.57, w: 4.4, h: 0.55, fontSize: 13, color: C.text1, valign: 'top' }));
  s.addNotes('The aim in one sentence: a lightweight, agentless Trojan detector that explains its findings and supports containment, demonstrable in a safe lab. Seven objectives operationalise it, from the flow schema through to the four kinds of testing in a few slides\' time.');

  // =========================================================== 10 how it works
  s = add('CONTENT', 'Mini Project');
  s.addText('How detection works', { placeholder: 'title' });
  s.addImage({ path: path.join(SHOTS, 'fig-pipeline.png'), x: 0.5, y: 1.25, w: 9, h: 9 * 284 / 1832, altText: 'Detection pipeline: flow CSV, parse, baseline, detect, score, JSON to UI' });
  const steps = [['1  Parse and normalise', 'Column aliases, ISO or epoch timestamps, and clear errors for bad files.'], ['2  Compare with a baseline', 'Known-good ports and peers per device decide what is normal.'], ['3  Score and report', 'Findings carry severity and ATT&CK; each device gets a 0-100 score.']];
  steps.forEach(([t, d], i) => {
    const x = 0.5 + i * 3.1;
    card(s, x, 2.95, 2.8, 1.9, C.background2, `Step card ${i + 1}`);
    tx(s, t, { x: x + 0.2, y: 3.1, w: 2.45, h: 0.4, fontSize: 15, bold: true, color: C.accent1, valign: 'middle' });
    tx(s, d, { x: x + 0.2, y: 3.58, w: 2.45, h: 1.15, fontSize: 13, color: C.text1, valign: 'top' });
  });
  s.addNotes('A flow CSV goes through three stages. Parsing makes different exports uniform. The optional baseline records what each device normally does. The rules then produce findings, each mapped to MITRE ATT&CK, and a risk score per device.');

  // =========================================================== 11 architecture
  s = add('CONTENT', 'Mini Project');
  s.addText('System architecture', { placeholder: 'title' });
  s.addImage({ path: path.join(SHOTS, 'fig-architecture.png'), x: 0.5, y: 1.3, w: 5.6, h: 5.6 * 832 / 1832, altText: 'Architecture of the laboratory and detector' });
  ['Docker Compose', 'Flask + gunicorn', 'MediaMTX + ffmpeg'].forEach((t, i) => {
    const x = 0.5 + i * 1.9;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 4.0, w: 1.7, h: 0.48, rectRadius: 0.12, fill: { color: HEX.dk2 }, line: { color: HEX.dk2, width: 0 } });
    tx(s, t, { x, y: 4.0, w: 1.7, h: 0.48, fontSize: 11.5, bold: true, color: C.background1, align: 'center', valign: 'middle' });
  });
  tx(s, bl(['The lab network is internal: no route to the internet', "The trojan shares a camera's network namespace", 'A shared volume carries flows.csv and quarantine markers', 'Harmless: EICAR test string, fake C2, no real payload'], 9),
    { x: 6.4, y: 1.35, w: 3.1, h: 2.6, fontSize: 14, color: C.text1, valign: 'top' });
  s.addNotes('Everything runs in containers on an internal network with no route out. The trojan simulator shares a camera\'s network namespace, so its beacons carry that camera\'s address. Flow records go to a shared volume that the detector reads, and quarantining a device drops a marker file the simulator honours.');

  // =========================================================== 12 cam-vault: watch an infection (incl. recent upgrades)
  s = add('CONTENT_DARK', 'Mini Project');
  s.addText('Watch an infection happen', { placeholder: 'title' });
  s.addImage({ path: path.join(SHOTS, 'cam-vault-clean.jpg'), x: 0.5, y: 1.25, w: 4.0, h: 4.0 * 360 / 640, altText: 'Clean camera feed' });
  s.addImage({ path: path.join(SHOTS, 'cam-vault-infected.jpg'), x: 5.1, y: 1.25, w: 4.0, h: 4.0 * 360 / 640, altText: 'Infected camera feed, glitching, showing fake hacker activity' });
  tx(s, 'Before: normal video', { x: 0.5, y: 3.62, w: 4.0, h: 0.32, fontSize: 13, bold: true, color: C.background1, align: 'center' });
  tx(s, 'After: feed glitches, virus activity overlaid', { x: 5.1, y: 3.62, w: 4.0, h: 0.32, fontSize: 13, bold: true, color: C.background2, align: 'center' });
  tx(s, 'A new camera, "cam-vault", starts already infected. Its picture visibly breaks up and shows the virus\'s real activity (connections, file drops) -- so an audience can SEE the infection.', { x: 0.5, y: 4.05, w: 9, h: 0.5, fontSize: 12.5, color: C.background2, valign: 'top' });
  ['Windows support', 'Live streaming video', 'Pre-infected camera', 'Ready to host online'].forEach((t, i) => {
    const x = 0.5 + i * 2.28;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 4.62, w: 2.08, h: 0.42, rectRadius: 0.1, fill: { color: HEX.accent1 }, line: { color: HEX.accent1, width: 0 } });
    tx(s, t, { x, y: 4.62, w: 2.08, h: 0.42, fontSize: 11, bold: true, color: C.background1, align: 'center', valign: 'middle' });
  });
  s.addNotes('The newest addition: a camera called cam-vault that starts already infected. Instead of just a score on a dashboard, its video feed itself glitches and overlays the virus\'s real fake activity. Also recently added: the whole lab now runs on Windows with one command, the cameras stream real-looking live video, and the detector is ready to be hosted online for a demo link.');

  // =========================================================== 13 rules
  s = add('CONTENT', 'Mini Project');
  s.addText('Detection rules', { placeholder: 'title' });
  const hdr = (t) => ({ text: t, options: { bold: true, color: C.background1, fill: { color: HEX.dk2 }, fontSize: 12.5 } });
  const sev = (t) => ({ text: t, options: { bold: true, color: t === 'Medium' ? '8A5A00' : HEX.accent2, align: 'center', fontSize: 11.5 } });
  const rule = (a, b, c, d) => [{ text: a, options: { bold: true, fontSize: 11.5 } }, { text: b, options: { fontSize: 11.5 } }, sev(c), { text: d, options: { fontSize: 11.5, align: 'center' } }];
  s.addTable([
    [hdr('Rule'), hdr('Fires when'), { ...hdr('Severity'), options: { ...hdr('').options, align: 'center' } }, { ...hdr('ATT&CK'), options: { ...hdr('').options, align: 'center' } }],
    rule('Known-bad IP', 'Contact with a threat-intelligence listed address', 'Critical', 'T1071'),
    rule('Suspicious port', 'Ports such as 23, 4444, 6667 and 31337', 'High', 'T1571'),
    rule('Unusual port', 'Port outside the baseline and camera defaults', 'Medium', 'T1571'),
    rule('New external peer', 'Destination never seen in the baseline', 'Medium', 'T1071'),
    rule('Beaconing', `${K.BEACON_MIN_EVENTS}+ flows, jitter CV <= ${K.BEACON_MAX_CV}, peer outside baseline`, 'High', 'T1029'),
    rule('Scan burst', `${K.SCAN_MIN_TARGETS}+ hosts or ports within ${K.SCAN_WINDOW_S} s`, 'High', 'T1018 / T1046'),
    rule('Large transfer', `${K.EXFIL_ABS_BYTES / 1e6} MB or more to one external address`, 'High', 'T1041'),
    rule('Size outlier', `Flow above baseline mean + ${K.EXFIL_SIGMA} sigma`, 'Medium', 'T1030'),
  ], { x: 0.5, y: 1.25, w: 9, colW: [1.7, 4.6, 1.2, 1.5], rowH: 0.4, color: HEX.dk1, border: { type: 'solid', pt: 0.5, color: 'C5D0DC' }, valign: 'middle', margin: [0, 0.08, 0, 0.08], fontFace: THEME.bodyFontFace });
  s.addNotes('Eight rule families, each tied to a MITRE ATT&CK technique. Beaconing is the interesting one: it measures how regular the gaps between flows are, using the coefficient of variation, and only applies to peers outside the device baseline. Thresholds are constants at the top of engine.py.');

  // =========================================================== 14 scoring and baselines
  s = add('CONTENT', 'Mini Project');
  s.addText('Scoring and baselines', { placeholder: 'title' });
  s.addChart(pres.charts.BAR, [{ name: 'Weight per finding', labels: ['Critical', 'High', 'Medium', 'Low'], values: [40, 25, 10, 3] }], {
    x: 0.5, y: 1.25, w: 4.5, h: 2.6, barDir: 'col', chartColors: [HEX.accent2, HEX.accent3, HEX.accent4, HEX.accent6], showLegend: false,
    showTitle: true, title: 'Weight added per finding', titleFontSize: 13, titleColor: HEX.dk1, titleFontFace: '+mn-lt',
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 11, dataLabelColor: HEX.dk1, dataLabelFontFace: '+mn-lt',
    catAxisLabelColor: HEX.dk1, valAxisLabelColor: HEX.dk1, catAxisLabelFontSize: 11, valAxisLabelFontSize: 10, catAxisLabelFontFace: '+mn-lt', valAxisLabelFontFace: '+mn-lt',
    valGridLine: { color: 'D5DDE6', size: 0.5 }, catGridLine: { style: 'none' }, valAxisMaxVal: 50, valAxisMajorUnit: 10 });
  [['Clean', '< 10', HEX.accent5], ['Suspicious', '10-49', '8A5A00'], ['Compromised', '50+', HEX.accent2]].forEach(([n, r, c], i) => {
    const x = 0.5 + i * 1.55;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 4.0, w: 1.45, h: 0.65, rectRadius: 0.1, fill: { color: c }, line: { color: c, width: 0 }, objectName: `Status ${n}` });
    tx(s, [{ text: n, options: { bold: true, breakLine: true } }, { text: r }], { x, y: 4.0, w: 1.45, h: 0.65, fontSize: 11.5, color: C.background1, align: 'center', valign: 'middle' });
  });
  card(s, 5.3, 1.25, 4.2, 3.4, C.background2, 'Baseline card');
  tx(s, 'Why a baseline?', { x: 5.55, y: 1.38, w: 3.7, h: 0.42, fontSize: 18, bold: true, color: C.text1, fontFace: THEME.headFontFace });
  tx(s, bl(['Healthy cameras are periodic too: video every ~10 s, NTP, heartbeats.', "Beaconing counts only for peers outside a device's baseline.", 'A 15 s beacon scores about 0.02 on jitter, far below the 0.25 limit.'], 7),
    { x: 5.55, y: 1.88, w: 3.7, h: 1.95, fontSize: 13, color: C.text1, valign: 'top' });
  tx(s, [{ text: '0 findings', options: { bold: true, color: HEX.accent5, fontSize: 20 } }, { text: '  on the clean capture', options: { fontSize: 13 } }], { x: 5.55, y: 4.0, w: 3.7, h: 0.5, color: C.text1, valign: 'middle' });
  s.addNotes('Each finding adds a weight: critical 40, high 25, medium 10, low 3, capped at 100. Under 10 is clean, 10-49 suspicious, 50+ compromised. The baseline is what stops false alarms: regular traffic to known peers is ignored, regular traffic to a new peer is not.');

  // =========================================================== 15 UI
  s = add('CONTENT', 'Mini Project');
  s.addText('The detector in action', { placeholder: 'title' });
  s.addImage({ path: path.join(SHOTS, '04-results.png'), x: 0.7, y: 1.25, w: 8.6, h: 8.6 * 878 / 2224, altText: 'Results screen: summary tiles and device table with cam-garage compromised' });
  tx(s, `Infected sample: cam-garage compromised (score ${garage.score}); other cameras clean.`, { x: 0.7, y: 4.72, w: 8.6, h: 0.3, fontSize: 12.5, color: C.text2, valign: 'middle' });
  s.addNotes('Live demo here if possible: load the infected sample. Point to the numbered callouts: summary tiles, status pill, risk score, bytes out and the Quarantine button.');

  // =========================================================== 16 findings + mobile
  s = add('CONTENT', 'Mini Project');
  s.addText('Findings explained, and on a phone', { placeholder: 'title' });
  s.addImage({ path: path.join(SHOTS, '05-findings.png'), x: 0.5, y: 1.25, w: 3.5 * 2224 / 1742, h: 3.5, altText: 'Findings table with severity, evidence and ATT&CK technique' });
  s.addImage({ path: path.join(SHOTS, 'm02-results.png'), x: 5.25, y: 1.25, w: 3.5 * 780 / 1346, h: 3.5, altText: 'Mobile view of summary tiles and device table' });
  tx(s, bl(['Severity, evidence and ATT&CK technique for every finding', 'Tables scroll inside their cards on a phone', 'One-click Quarantine and Release'], 8), { x: 7.55, y: 1.35, w: 1.95, h: 3.3, fontSize: 13, color: C.text1, valign: 'top' });
  s.addNotes('The findings table explains each detection in plain words and in ATT&CK terms. The same page works on a phone, which suits on-call triage. The sample has 22 findings; the screenshot shows the first seven.');

  // =========================================================== 17 divider: testing & evidence
  pres.addSection({ title: 'Testing & Evidence' });
  s = add('SECTION', 'Testing & Evidence');
  s.addText('Testing & Evidence', { placeholder: 'title' });
  s.addText('Three kinds of proof: an automated test suite, and real screenshots of positive and negative cases', { placeholder: 'body' });
  s.addNotes('Three kinds of evidence follow: the automated pytest suite running green, then real screenshots proving the positive cases (it catches the infected camera) and the negative cases (it leaves healthy traffic and bad input alone).');

  // =========================================================== 18 automated test evidence (real terminal output)
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

  // =========================================================== 19 positive test evidence
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

  // =========================================================== 20 negative test evidence
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

  // =========================================================== 21 results summary
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

  // =========================================================== 22 defects & limitations (merged)
  s = add('CONTENT', 'Testing & Evidence');
  s.addText('What testing found, and current limits', { placeholder: 'title' });
  card(s, 0.5, 1.3, 4.4, 3.5, C.background2, 'Defects card');
  tx(s, 'Defects found & fixed', { x: 0.75, y: 1.43, w: 3.9, h: 0.42, fontSize: 18, bold: true, color: C.text1, fontFace: THEME.headFontFace });
  tx(s, bl(['Healthy traffic was first mistaken for beaconing -> fixed with the baseline', "Lab's test IPs were treated as private -> LAN ranges now listed explicitly", 'Baseline lives in memory -> noted as an open item'], 8),
    { x: 0.75, y: 1.95, w: 3.9, h: 2.7, fontSize: 13.5, color: C.text1, valign: 'top' });
  card(s, 5.1, 1.3, 4.4, 3.5, C.accent1, 'Limits card');
  tx(s, 'Current limitations', { x: 5.35, y: 1.43, w: 3.9, h: 0.42, fontSize: 18, bold: true, color: C.background1, fontFace: THEME.headFontFace });
  tx(s, bl(['Heuristic rules, tuned on simulated data', 'Cannot inspect encrypted payloads', 'No built-in login -- do not expose it publicly as-is', 'Docker layer still needs a run on a Docker host'], 8),
    { x: 5.35, y: 1.95, w: 3.9, h: 2.7, fontSize: 13.5, color: C.background1, valign: 'top' });
  s.addNotes('Testing paid for itself: two of the three defects found changed the design before anyone else could hit them. To be upfront: the rules are heuristic, it cannot see inside encrypted traffic, it has no login screen, and the Docker layer still needs a run on a machine with Docker.');

  // =========================================================== 23 conclusion
  pres.addSection({ title: 'Conclusion' });
  s = add('CONTENT_DARK', 'Conclusion');
  s.addText('Conclusion & recommendations', { placeholder: 'title' });
  card(s, 0.5, 1.3, 4.4, 3.6, C.text2, 'Achievements card');
  tx(s, 'What I achieved', { x: 0.75, y: 1.43, w: 3.9, h: 0.42, fontSize: 18, bold: true, color: C.background1, fontFace: THEME.headFontFace });
  tx(s, bl(['A working, tested Trojan detector for IoT flows', 'A safe, repeatable camera lab -- now with a camera you can watch get hacked', `${NT}/${NT} automated tests, plus real positive and negative evidence`, 'Practical skills in security, containers, Python, Windows and documentation'], 8),
    { x: 0.75, y: 1.95, w: 3.9, h: 2.9, fontSize: 13.5, color: C.background1, valign: 'top' });
  card(s, 5.1, 1.3, 4.4, 3.6, C.accent1, 'Recommendations card');
  tx(s, 'Recommendations', { x: 5.35, y: 1.43, w: 3.9, h: 0.42, fontSize: 18, bold: true, color: C.background1, fontFace: THEME.headFontFace });
  const rec = [['HiiT: ', 'a written task schedule and a named reviewer for each intern'], ['University: ', 'earlier security and DevOps content, more supervisory visits'], ['ITF: ', 'prompt allowances and closer placement monitoring']];
  tx(s, rec.flatMap(([b, r], i) => [{ text: b, options: { bold: true, bullet: true } }, { text: r, options: { breakLine: i < rec.length - 1, paraSpaceAfter: 10 } }]),
    { x: 5.35, y: 1.95, w: 3.9, h: 2.9, fontSize: 13.5, color: C.background1, valign: 'top' });
  s.addNotes('Summarise: the system works on the samples, the lab makes it demonstrable and now visible, and I gained real practical skills. Recommendations: HiiT should give interns written task schedules and reviewers; the university should bring security and DevOps content earlier; the ITF should pay allowances promptly and monitor placements.');

  // =========================================================== 24 thank you
  s = add('TITLE_DARK', 'Conclusion');
  s.addText('Thank you', { placeholder: 'title' });
  s.addText('Questions?', { placeholder: 'body' });
  tx(s, 'Code, tests and documentation: github.com/emmanuelekopimo/build-with-ai', { x: 0.7, y: 4.5, w: 8.6, h: 0.4, fontSize: 13, color: C.background2, valign: 'middle' });
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
