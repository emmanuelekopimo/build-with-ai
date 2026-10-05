/* Builds docs/SIWES-Presentation-HiiT-Plc-IoT-Trojan-Detector.pptx: a slide deck summarising the SIWES report.
 *
 *   npm install pptxgenjs react react-dom react-icons sharp      # once, anywhere on NODE_PATH
 *   python docs/build/export_facts.py && node docs/build/build_siwes_pptx.js
 *
 * Structured deck: theme (applied after writing), named layouts with placeholders, sections, a native chart and speaker notes.
 * Things the student must supply are highlighted yellow in [brackets].
 */
const fs = require('fs');
const path = require('path');
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
  ph('title', 'title', { x: 0.7, y: 1.2, w: 5.9, h: 1.9, fontSize: 38, bold: true, color: C.background1, align: 'left', valign: 'bottom' }),
  ph('body', 'body', { x: 0.7, y: 3.3, w: 5.9, h: 0.9, fontSize: 18, color: C.background2, align: 'left', valign: 'top' })] });
pres.defineSlideMaster({ title: 'SECTION', objects: [bg(C.text2),
  ph('title', 'title', { x: 0.7, y: 1.6, w: 8.6, h: 1.3, fontSize: 44, bold: true, color: C.background1, align: 'left', valign: 'bottom' }),
  ph('body', 'body', { x: 0.7, y: 3.1, w: 8.6, h: 1.0, fontSize: 20, color: C.background2, align: 'left', valign: 'top' })] });
const contentFrame = (dark) => [...(dark ? [bg(C.text1)] : []),
  ph('title', 'title', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 34, bold: true, color: dark ? C.background1 : C.text1, align: 'left', valign: 'middle' }),
  { text: { text: FOOT, options: { x: 0.5, y: 5.2, w: 6, h: 0.25, fontSize: 10, color: C.accent6, margin: 0 } } }];
pres.defineSlideMaster({ title: 'CONTENT', objects: contentFrame(false), slideNumber: { x: 9.0, y: 5.2, w: 0.5, h: 0.25, fontSize: 10, color: HEX.accent6, align: 'right' } });
pres.defineSlideMaster({ title: 'CONTENT_DARK', objects: contentFrame(true), slideNumber: { x: 9.0, y: 5.2, w: 0.5, h: 0.25, fontSize: 10, color: HEX.accent6, align: 'right' } });

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
let slideNo = 0;
const add = (master, section) => { slideNo += 1; return pres.addSlide({ masterName: master, sectionTitle: section }); };

(async () => {
  // =========================================================== 1 title
  pres.addSection({ title: 'Introduction' });
  let s = add('TITLE_DARK', 'Introduction');
  s.addText('SIWES Report: Experiences at HiiT Plc', { placeholder: 'title' });
  s.addText('Mini project: network-flow-based Trojan Horse detection for IoT devices', { placeholder: 'body' });
  tx(s, [PH('Your name'), { text: '   ' }, PH('Reg. No.'), { text: '', options: { breakLine: true } },
    { text: 'Department of Computer Science, University of Uyo', options: { breakLine: true } }, PH('Month, Year')],
  { x: 0.7, y: 4.4, w: 7.5, h: 0.8, fontSize: 14, color: C.background2, valign: 'top', objectName: 'Presenter details' });
  s.addShape(pres.shapes.OVAL, { x: 7.0, y: 1.5, w: 2.3, h: 2.3, fill: { color: C.accent1 }, line: { color: C.accent1, width: 0 } });
  s.addImage({ data: await icon(fa.FaShieldAlt, 'FFFFFF'), x: 7.6, y: 2.1, w: 1.1, h: 1.1, altText: 'Shield icon' });
  s.addNotes('Introduce yourself, the scheme (SIWES) and the host organisation (HiiT Plc). One sentence on the mini project: a system that spots a Trojan Horse on IoT devices such as IP cameras by looking only at network flows.');

  // =========================================================== 2 agenda
  s = add('CONTENT', 'Introduction');
  s.addText('What this talk covers', { placeholder: 'title' });
  const agenda = [['SIWES and HiiT Plc', 'Scheme, company, placement'], ['Experience gained', 'Skills built during the training'], ['The mini project', 'Design of the Trojan detector'],
    ['Testing and results', 'What the tests and samples showed'], ['Lessons and limits', 'Defects found, what is left to do'], ['Conclusion', 'Summary and recommendations']];
  agenda.forEach(([t, d], i) => {
    const x = 0.5 + (i % 3) * 3.1, y = 1.5 + Math.floor(i / 3) * 1.75;
    card(s, x, y, 2.8, 1.5, C.background2, `Agenda card ${i + 1}`);
    s.addShape(pres.shapes.OVAL, { x: x + 0.2, y: y + 0.2, w: 0.5, h: 0.5, fill: { color: C.accent1 }, line: { color: C.accent1, width: 0 } });
    tx(s, String(i + 1), { x: x + 0.2, y: y + 0.2, w: 0.5, h: 0.5, fontSize: 16, bold: true, color: C.background1, align: 'center', valign: 'middle' });
    tx(s, t, { x: x + 0.85, y: y + 0.2, w: 1.8, h: 0.5, fontSize: 16, bold: true, color: C.text1, valign: 'middle' });
    tx(s, d, { x: x + 0.2, y: y + 0.85, w: 2.4, h: 0.55, fontSize: 14, color: C.text2, valign: 'top' });
  });
  s.addNotes('Six parts: the scheme and the company, what I learned, the mini project in detail, how I tested it, the problems I hit, and the conclusion. Roughly 15 minutes plus questions.');

  // =========================================================== 3 SIWES
  pres.addSection({ title: 'SIWES and HiiT Plc' });
  s = add('CONTENT', 'SIWES and HiiT Plc');
  s.addText('About SIWES', { placeholder: 'title' });
  tx(s, '1973', { x: 0.5, y: 1.45, w: 3.7, h: 1.2, fontSize: 72, bold: true, color: C.accent1, fontFace: THEME.headFontFace, valign: 'middle' });
  tx(s, 'The Industrial Training Fund launched SIWES so that graduates meet real working conditions before they leave university.', { x: 0.5, y: 2.75, w: 3.7, h: 1.4, fontSize: 16, color: C.text1, valign: 'top' });
  tx(s, 'The ITF itself was established in 1971.', { x: 0.5, y: 4.3, w: 3.7, h: 0.4, fontSize: 14, color: C.accent6, valign: 'top' });
  const who = [[fa.FaLandmark, 'ITF', 'administers and funds the scheme'], [fa.FaBalanceScale, 'NUC, NBTE, NCCE', 'set academic standards'], [fa.FaUniversity, 'Institution', 'places, supervises and assesses'],
    [fa.FaBuilding, 'Host organisation', 'trains and mentors the student'], [fa.FaUserGraduate, 'Student', 'keeps a logbook and writes the report']];
  for (let i = 0; i < who.length; i++) {
    const y = 1.4 + i * 0.7;
    await badge(s, who[i][0], 4.8, y, 0.5, i % 2 ? HEX.accent4 : HEX.accent1);
    tx(s, lead(who[i][1] + '  ', who[i][2]), { x: 5.5, y, w: 4.0, h: 0.5, fontSize: 15, color: C.text1, valign: 'middle' });
  }
  s.addNotes('SIWES began in 1973 because employers complained that graduates knew theory but lacked practical skill. Five parties make it work: the ITF, the academic regulators, the university, the host company and the student.');

  // =========================================================== 4 HiiT
  s = add('CONTENT', 'SIWES and HiiT Plc');
  s.addText('About HiiT Plc', { placeholder: 'title' });
  const stats = [['60,000+', 'graduates trained'], ['4', 'cities with CPN-accredited centres'], ['CPN', 'registered Nigerian IT company'], ['4', 'lines of business']];
  stats.forEach(([n, l], i) => {
    const x = 0.5 + i * 2.32;
    card(s, x, 1.4, 2.05, 1.75, C.background2, `HiiT stat ${i + 1}`);
    tx(s, n, { x: x + 0.15, y: 1.5, w: 1.75, h: 0.9, fontSize: 24, bold: true, color: C.accent1, fontFace: THEME.headFontFace, valign: 'middle' });
    tx(s, l, { x: x + 0.15, y: 2.4, w: 1.75, h: 0.65, fontSize: 14, color: C.text1, valign: 'top' });
  });
  tx(s, 'Lagos, Abuja, Ibadan and Kano; instructor-led online classes reach learners elsewhere.', { x: 0.5, y: 3.3, w: 9, h: 0.35, fontSize: 14, color: C.text2, valign: 'middle' });
  ['IT training', 'Software', 'Consultancy', 'Publishing', 'SIWES programme'].forEach((t, i) => {
    const x = 0.5 + i * 1.845;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 3.85, w: 1.62, h: 0.55, rectRadius: 0.12, fill: { color: i === 4 ? HEX.accent1 : HEX.dk2 }, line: { color: i === 4 ? HEX.accent1 : HEX.dk2, width: 0 }, objectName: `Business line ${i + 1}` });
    tx(s, t, { x, y: 3.85, w: 1.62, h: 0.55, fontSize: 14, bold: true, color: C.background1, align: 'center', valign: 'middle' });
  });
  tx(s, 'Sources: BusinessDay (2020); HiiT Plc company profile', { x: 0.5, y: 4.7, w: 9, h: 0.3, fontSize: 11, color: C.accent6, valign: 'middle' });
  s.addNotes('HiiT Plc is an indigenous Nigerian IT company with CPN-accredited centres in four cities and more than 60,000 graduates. It works in training, software, consultancy and publishing, and runs a SIWES programme, which is where I trained. Confirm the founding year and head office from the company profile before presenting.');

  // =========================================================== 5 placement
  s = add('CONTENT', 'SIWES and HiiT Plc');
  s.addText('My placement at HiiT', { placeholder: 'title' });
  card(s, 0.5, 1.4, 4.3, 3.5, C.background2, 'Placement details card');
  tx(s, 'Placement details', { x: 0.7, y: 1.55, w: 3.9, h: 0.4, fontSize: 18, bold: true, color: C.text1 });
  const det = [['Host', [{ text: 'HiiT Plc' }]], ['Branch', [PH('branch / centre')]], ['Unit', [PH('unit / department')]], ['Period', [PH('start date'), { text: ' to ' }, PH('end date')]],
    ['Supervisor', [PH('industry supervisor')]], ['University', [PH('institution supervisor')]]];
  det.forEach(([k, v], i) => {
    tx(s, k, { x: 0.7, y: 2.1 + i * 0.44, w: 1.2, h: 0.36, fontSize: 14, bold: true, color: C.accent1, valign: 'middle' });
    tx(s, v, { x: 1.95, y: 2.1 + i * 0.44, w: 2.7, h: 0.36, fontSize: 14, color: C.text1, valign: 'middle' });
  });
  tx(s, 'Work completed', { x: 5.2, y: 1.45, w: 4.3, h: 0.4, fontSize: 18, bold: true, color: C.text1 });
  const work = ['Flow-analysis engine in Python', 'Web interface and JSON API (Flask)', 'Docker camera laboratory', 'Harmless trojan and fake C2 server', `${NT} automated tests`, 'README, PDF and Word documentation'];
  const check = await icon(fa.FaCheckCircle, HEX.accent1);
  work.forEach((t, i) => {
    s.addImage({ data: check, x: 5.2, y: 2.0 + i * 0.48, w: 0.3, h: 0.3, altText: 'Done' });
    tx(s, t, { x: 5.65, y: 1.95 + i * 0.48, w: 3.85, h: 0.4, fontSize: 15, color: C.text1, valign: 'middle' });
  });
  s.addNotes('Fill in the highlighted details: branch, unit, dates and supervisors. The six work packages on the right all feed into the mini project that follows.');

  // =========================================================== 6 experience
  pres.addSection({ title: 'Experience' });
  s = add('CONTENT', 'Experience');
  s.addText('Experience gained', { placeholder: 'title' });
  const exp = [[fa.FaNetworkWired, 'Network flows', 'Reading traffic for behaviour, not content'], [fa.FaBug, 'IoT security', 'Trojans, C2 and MITRE ATT&CK'], [fa.FaDocker, 'Containers', 'An isolated Docker Compose lab'],
    [fa.FaPython, 'Python and Flask', 'Layered, testable code'], [fa.FaVial, 'Testing and Git', 'pytest, branches, pull request'], [fa.FaBook, 'Technical writing', 'README, PDF and Word reports']];
  for (let i = 0; i < exp.length; i++) {
    const x = 0.5 + (i % 3) * 3.1, y = 1.4 + Math.floor(i / 3) * 1.8;
    card(s, x, y, 2.8, 1.6, C.background2, `Skill card ${i + 1}`);
    await badge(s, exp[i][0], x + 0.2, y + 0.2, 0.55, i % 2 ? HEX.accent4 : HEX.accent1);
    tx(s, exp[i][1], { x: x + 0.9, y: y + 0.2, w: 1.8, h: 0.55, fontSize: 16, bold: true, color: C.text1, valign: 'middle' });
    tx(s, exp[i][2], { x: x + 0.2, y: y + 0.9, w: 2.45, h: 0.6, fontSize: 14, color: C.text2, valign: 'top' });
  }
  s.addNotes('Six areas of growth, all taken from building the mini project: flow analysis, IoT threats, containers, Python and Flask, testing with version control, and documentation. Add anything else you did at HiiT.');

  // =========================================================== 7 divider
  pres.addSection({ title: 'Mini project' });
  s = add('SECTION', 'Mini project');
  s.addText('Mini project', { placeholder: 'title' });
  s.addText('Design and implementation of a network-flow-based Trojan Horse detection system for IoT devices', { placeholder: 'body' });
  s.addNotes('Transition: from the placement overall to the main technical deliverable.');

  // =========================================================== 8 problem and aim
  s = add('CONTENT', 'Mini project');
  s.addText('The problem and the aim', { placeholder: 'title' });
  const prob = [[fa.FaLock, 'No on-device protection', 'Cameras cannot run security agents'], [fa.FaFingerprint, 'Signatures miss new variants', 'Behaviour lasts longer than hashes'],
    [fa.FaSyncAlt, 'Healthy traffic is periodic too', 'Naive beacon detection gives false alarms'], [fa.FaFlask, 'Safe evaluation needed', 'No real malware, no risk to real networks']];
  for (let i = 0; i < prob.length; i++) {
    const y = 1.4 + i * 0.88;
    await badge(s, prob[i][0], 0.5, y, 0.6, i % 2 ? HEX.accent4 : HEX.accent1);
    tx(s, prob[i][1], { x: 1.3, y, w: 4.4, h: 0.35, fontSize: 16, bold: true, color: C.text1, valign: 'middle' });
    tx(s, prob[i][2], { x: 1.3, y: y + 0.35, w: 4.4, h: 0.3, fontSize: 14, color: C.text2, valign: 'top' });
  }
  card(s, 6.0, 1.4, 3.5, 3.4, C.accent1, 'Aim card');
  tx(s, 'Aim', { x: 6.25, y: 1.6, w: 3.0, h: 0.45, fontSize: 22, bold: true, color: C.background1, fontFace: THEME.headFontFace });
  tx(s, 'Design, implement and test an agentless system that detects trojan-like behaviour from network-flow data, explains each finding and supports containment, with a safe laboratory to demonstrate it.', { x: 6.25, y: 2.15, w: 3.0, h: 2.5, fontSize: 16, color: C.background1, valign: 'top' });
  s.addNotes('Four problems: cameras cannot host security software, signatures lag behind new malware, healthy camera traffic is itself regular, and security demonstrations must be safe. The aim answers all four.');

  // =========================================================== 9 how it works
  s = add('CONTENT', 'Mini project');
  s.addText('How detection works', { placeholder: 'title' });
  s.addImage({ path: path.join(SHOTS, 'fig-pipeline.png'), x: 0.5, y: 1.3, w: 9, h: 9 * 284 / 1832, altText: 'Detection pipeline: flow CSV, parse, baseline, detect, score, JSON to UI' });
  const steps = [['1  Parse and normalise', 'Column aliases, ISO or epoch timestamps, and clear errors for bad files.'], ['2  Compare with a baseline', 'Known-good ports and peers per device decide what is normal.'], ['3  Score and report', 'Findings carry severity and ATT&CK; each device gets a 0 to 100 score.']];
  steps.forEach(([t, d], i) => {
    const x = 0.5 + i * 3.1;
    card(s, x, 3.05, 2.8, 1.85, C.background2, `Step card ${i + 1}`);
    tx(s, t, { x: x + 0.2, y: 3.2, w: 2.45, h: 0.4, fontSize: 16, bold: true, color: C.accent1, valign: 'middle' });
    tx(s, d, { x: x + 0.2, y: 3.7, w: 2.45, h: 1.1, fontSize: 14, color: C.text1, valign: 'top' });
  });
  s.addNotes('A flow CSV goes through three stages. Parsing makes different exports uniform. The optional baseline records what each device normally does. The rules then produce findings, each mapped to MITRE ATT&CK, and a risk score per device.');

  // =========================================================== 10 architecture
  s = add('CONTENT', 'Mini project');
  s.addText('System architecture', { placeholder: 'title' });
  s.addImage({ path: path.join(SHOTS, 'fig-architecture.png'), x: 0.5, y: 1.35, w: 5.6, h: 5.6 * 832 / 1832, altText: 'Architecture of the laboratory and detector' });
  ['Docker Compose', 'Flask + gunicorn', 'MediaMTX + ffmpeg'].forEach((t, i) => {
    const x = 0.5 + i * 1.9;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 4.1, w: 1.7, h: 0.5, rectRadius: 0.12, fill: { color: HEX.dk2 }, line: { color: HEX.dk2, width: 0 } });
    tx(s, t, { x, y: 4.1, w: 1.7, h: 0.5, fontSize: 12, bold: true, color: C.background1, align: 'center', valign: 'middle' });
  });
  tx(s, [
    { text: 'The lab network is internal: no route to the internet', options: { bullet: true, breakLine: true, paraSpaceAfter: 8 } },
    { text: "The trojan shares cam-garage's network namespace", options: { bullet: true, breakLine: true, paraSpaceAfter: 8 } },
    { text: 'A shared volume carries flows.csv and quarantine markers', options: { bullet: true, breakLine: true, paraSpaceAfter: 8 } },
    { text: 'Harmless: EICAR test string, fake C2, no payload', options: { bullet: true } }],
  { x: 6.4, y: 1.4, w: 3.1, h: 3.3, fontSize: 15, color: C.text1, valign: 'top' });
  s.addNotes('Everything runs in containers on an internal network with no route out. The trojan simulator shares the garage camera network namespace, so its beacons carry that camera address. Flow records go to a shared volume that the detector reads, and quarantining a device drops a marker file the simulator honours.');

  // =========================================================== 11 rules
  s = add('CONTENT', 'Mini project');
  s.addText('Detection rules', { placeholder: 'title' });
  const hdr = (t) => ({ text: t, options: { bold: true, color: C.background1, fill: { color: HEX.dk2 }, fontSize: 13 } });
  const sev = (t) => ({ text: t, options: { bold: true, color: t === 'Medium' ? '8A5A00' : HEX.accent2, align: 'center', fontSize: 12 } });
  const rule = (a, b, c, d) => [{ text: a, options: { bold: true, fontSize: 12 } }, { text: b, options: { fontSize: 12 } }, sev(c), { text: d, options: { fontSize: 12, align: 'center' } }];
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
  ], { x: 0.5, y: 1.3, w: 9, colW: [1.7, 4.6, 1.2, 1.5], rowH: 0.4, color: HEX.dk1, border: { type: 'solid', pt: 0.5, color: 'C5D0DC' }, valign: 'middle', margin: [0, 0.08, 0, 0.08], fontFace: THEME.bodyFontFace });
  s.addNotes('Eight rule families, each tied to a MITRE ATT&CK technique. The beaconing rule is the interesting one: it measures how regular the gaps between flows are using the coefficient of variation, and only applies to peers outside the device baseline. Thresholds are constants at the top of engine.py.');

  // =========================================================== 12 scoring and baselines
  s = add('CONTENT', 'Mini project');
  s.addText('Scoring and baselines', { placeholder: 'title' });
  s.addChart(pres.charts.BAR, [{ name: 'Weight per finding', labels: ['Critical', 'High', 'Medium', 'Low'], values: [40, 25, 10, 3] }], {
    x: 0.5, y: 1.3, w: 4.5, h: 2.7, barDir: 'col', chartColors: [HEX.accent2, HEX.accent3, HEX.accent4, HEX.accent6], showLegend: false,
    showTitle: true, title: 'Weight added per finding', titleFontSize: 14, titleColor: HEX.dk1, titleFontFace: '+mn-lt',
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 12, dataLabelColor: HEX.dk1, dataLabelFontFace: '+mn-lt',
    catAxisLabelColor: HEX.dk1, valAxisLabelColor: HEX.dk1, catAxisLabelFontSize: 12, valAxisLabelFontSize: 11, catAxisLabelFontFace: '+mn-lt', valAxisLabelFontFace: '+mn-lt',
    valGridLine: { color: 'D5DDE6', size: 0.5 }, catGridLine: { style: 'none' }, valAxisMaxVal: 50, valAxisMajorUnit: 10 });
  [['Clean', '< 10', HEX.accent5], ['Suspicious', '10 to 49', '8A5A00'], ['Compromised', '50 +', HEX.accent2]].forEach(([n, r, c], i) => {
    const x = 0.5 + i * 1.55;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 4.2, w: 1.45, h: 0.7, rectRadius: 0.1, fill: { color: c }, line: { color: c, width: 0 }, objectName: `Status ${n}` });
    tx(s, [{ text: n, options: { bold: true, breakLine: true } }, { text: r }], { x, y: 4.2, w: 1.45, h: 0.7, fontSize: 12, color: C.background1, align: 'center', valign: 'middle' });
  });
  card(s, 5.3, 1.3, 4.2, 3.6, C.background2, 'Baseline card');
  tx(s, 'Why a baseline?', { x: 5.55, y: 1.45, w: 3.7, h: 0.45, fontSize: 20, bold: true, color: C.text1, fontFace: THEME.headFontFace });
  tx(s, [
    { text: 'Healthy cameras are periodic too: video every ~10 s, NTP, heartbeats.', options: { breakLine: true, paraSpaceAfter: 8 } },
    { text: "Beaconing counts only for peers outside a device's baseline.", options: { breakLine: true, paraSpaceAfter: 8 } },
    { text: 'A 15 s beacon scores about 0.02 on jitter, far below the 0.25 limit.' }],
  { x: 5.55, y: 2.0, w: 3.7, h: 2.1, fontSize: 14, color: C.text1, valign: 'top' });
  tx(s, [{ text: '0 findings', options: { bold: true, color: HEX.accent5, fontSize: 22 } }, { text: '  on the clean capture', options: { fontSize: 14 } }], { x: 5.55, y: 4.3, w: 3.7, h: 0.45, color: C.text1, valign: 'middle' });
  s.addNotes('Each finding adds a weight: critical 40, high 25, medium 10, low 3. Scores are capped at 100. Under 10 is clean, 10 to 49 suspicious, 50 and above compromised. The baseline is what stops false alarms: regular traffic to known peers is ignored, regular traffic to a new peer is not.');

  // =========================================================== 13 UI
  s = add('CONTENT', 'Mini project');
  s.addText('The detector in action', { placeholder: 'title' });
  s.addImage({ path: path.join(SHOTS, '04-results.png'), x: 0.7, y: 1.3, w: 8.6, h: 8.6 * 878 / 2224, altText: 'Results screen: summary tiles and device table with cam-garage compromised' });
  tx(s, `Infected sample: cam-garage compromised (score ${garage.score}); other cameras clean.`, { x: 0.7, y: 4.78, w: 8.6, h: 0.3, fontSize: 13, color: C.text2, valign: 'middle' });
  s.addNotes('Live demo here if possible: load the infected sample. Point to the numbered callouts: summary tiles, status pill, risk score, bytes out and the Quarantine button.');

  // =========================================================== 14 findings + mobile
  s = add('CONTENT', 'Mini project');
  s.addText('Findings and mobile view', { placeholder: 'title' });
  s.addImage({ path: path.join(SHOTS, '05-findings.png'), x: 0.5, y: 1.3, w: 3.5 * 2224 / 1742, h: 3.5, altText: 'Findings table with severity, evidence and ATT&CK technique' });
  s.addImage({ path: path.join(SHOTS, 'm02-results.png'), x: 5.25, y: 1.3, w: 3.5 * 780 / 1346, h: 3.5, altText: 'Mobile view of summary tiles and device table' });
  tx(s, [
    { text: 'Severity, evidence and ATT&CK technique for every finding', options: { bullet: true, breakLine: true, paraSpaceAfter: 8 } },
    { text: 'Tables scroll inside their cards on a phone', options: { bullet: true, breakLine: true, paraSpaceAfter: 8 } },
    { text: 'One-click Quarantine and Release', options: { bullet: true } }],
  { x: 7.55, y: 1.4, w: 1.95, h: 3.4, fontSize: 14, color: C.text1, valign: 'top' });
  s.addNotes('The findings table explains each detection in plain words and in ATT&CK terms. The same page works on a phone, which suits on-call triage. The sample has 22 findings; the screenshot shows the first seven.');

  // =========================================================== 15 results
  s = add('CONTENT', 'Mini project');
  s.addText('Results', { placeholder: 'title' });
  const res = [[`${NT} / ${NT}`, 'automated tests pass'], [String(inf.summary.findings), `findings on the infected sample (${inf.severity_counts.critical} critical, ${inf.severity_counts.high} high, ${inf.severity_counts.medium} medium)`],
    [String(cln.summary.findings), 'findings on the clean capture'], [String(garage.score), 'risk score of cam-garage']];
  res.forEach(([n, l], i) => {
    const x = 0.5 + i * 2.32;
    card(s, x, 1.4, 2.05, 1.9, C.background2, `Result stat ${i + 1}`);
    tx(s, n, { x: x + 0.15, y: 1.5, w: 1.75, h: 0.75, fontSize: 32, bold: true, color: i === 3 ? C.accent2 : C.accent1, fontFace: THEME.headFontFace, valign: 'middle' });
    tx(s, l, { x: x + 0.15, y: 2.3, w: 1.75, h: 0.95, fontSize: 13, color: C.text1, valign: 'top' });
  });
  const devs = [['cam-garage', `compromised, score ${garage.score}`, HEX.accent2], ['cam-lobby', 'clean, score 0', HEX.accent5], ['cam-office', 'clean, score 0', HEX.accent5]];
  devs.forEach(([n, d, c], i) => {
    const x = 0.5 + i * 3.1;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 3.55, w: 2.8, h: 0.9, rectRadius: 0.12, fill: { color: c }, line: { color: c, width: 0 }, objectName: `Device ${n}` });
    tx(s, [{ text: n, options: { bold: true, fontSize: 16, breakLine: true } }, { text: d, options: { fontSize: 14 } }], { x, y: 3.55, w: 2.8, h: 0.9, color: C.background1, align: 'center', valign: 'middle' });
  });
  tx(s, `Infected sample: ${nf(inf.summary.flows)} flows from 3 cameras.  Clean sample: ${nf(cln.summary.flows)} flows.`, { x: 0.5, y: 4.65, w: 9, h: 0.35, fontSize: 13, color: C.text2, valign: 'middle' });
  s.addNotes('All tests pass. The infected capture produces 22 findings, all on cam-garage, which scores 100. The clean capture is just as regular but produces no findings, which is the evidence that the baseline logic avoids false positives. Positive, negative and laboratory tests are in Chapter Four of the report.');

  // =========================================================== 16 defects
  s = add('CONTENT', 'Mini project');
  s.addText('Defects and lessons', { placeholder: 'title' });
  const defs = [['False alarms on healthy traffic', 'Video, NTP and heartbeats looked like beacons.', 'Beaconing is now judged against a per-device baseline.', 'Fixed', HEX.accent5],
    ['Lab hosts seen as private', "Python's is_private also covers documentation ranges, so the 8.5 MB upload was ignored.", 'LAN ranges are listed explicitly.', 'Fixed', HEX.accent5],
    ['Baseline kept in memory', 'Lost on restart and may not be shared between workers.', 'Documented; use one worker or shared storage.', 'Open', HEX.accent2]];
  defs.forEach(([t, p, f, st, c], i) => {
    const x = 0.5 + i * 3.1;
    card(s, x, 1.4, 2.8, 3.5, C.background2, `Defect card ${i + 1}`);
    tx(s, t, { x: x + 0.2, y: 1.55, w: 2.4, h: 0.65, fontSize: 16, bold: true, color: C.text1, valign: 'top' });
    tx(s, p, { x: x + 0.2, y: 2.25, w: 2.4, h: 1.0, fontSize: 14, color: C.text2, valign: 'top' });
    tx(s, f, { x: x + 0.2, y: 3.25, w: 2.4, h: 0.8, fontSize: 14, color: C.text1, valign: 'top' });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x + 0.2, y: 4.2, w: 1.0, h: 0.4, rectRadius: 0.1, fill: { color: c }, line: { color: c, width: 0 }, objectName: `Status ${st} ${i + 1}` });
    tx(s, st, { x: x + 0.2, y: 4.2, w: 1.0, h: 0.4, fontSize: 14, bold: true, color: C.background1, align: 'center', valign: 'middle' });
  });
  s.addNotes('Testing paid for itself: two of the three defects changed the design. A failing test is information about the design, not just an obstacle. The third item is an honest limitation that is recorded in the report.');

  // =========================================================== 17 limits and next
  s = add('CONTENT', 'Mini project');
  s.addText('Limits and next steps', { placeholder: 'title' });
  card(s, 0.5, 1.4, 4.4, 3.5, C.background2, 'Limitations card');
  tx(s, 'Limitations', { x: 0.75, y: 1.55, w: 3.9, h: 0.45, fontSize: 20, bold: true, color: C.text1, fontFace: THEME.headFontFace });
  const bl = (arr) => arr.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < arr.length - 1, paraSpaceAfter: 8 } }));
  tx(s, bl(['Heuristic rules, tested on simulated data', 'Encrypted payloads cannot be inspected', 'No built-in authentication', 'Docker layer not yet run end to end']), { x: 0.75, y: 2.1, w: 3.9, h: 2.6, fontSize: 15, color: C.text1, valign: 'top' });
  card(s, 5.1, 1.4, 4.4, 3.5, C.accent1, 'Next steps card');
  tx(s, 'Next steps', { x: 5.35, y: 1.55, w: 3.9, h: 0.45, fontSize: 20, bold: true, color: C.background1, fontFace: THEME.headFontFace });
  tx(s, bl(['Ingest Zeek, Suricata or NetFlow data', 'Persistent, shared baselines', 'Connect quarantine to a firewall or NAC', 'Tune thresholds on real traffic']), { x: 5.35, y: 2.1, w: 3.9, h: 2.6, fontSize: 15, color: C.background1, valign: 'top' });
  s.addNotes('Be upfront about limits: the rules are heuristic and tuned on simulated data, and the Docker layer still needs an end-to-end run on a machine with Docker. Next steps are real telemetry, persistent baselines, real containment and tuning on real traffic.');

  // =========================================================== 18 conclusion
  pres.addSection({ title: 'Wrap-up' });
  s = add('CONTENT_DARK', 'Wrap-up');
  s.addText('Conclusion', { placeholder: 'title' });
  card(s, 0.5, 1.4, 4.4, 3.5, C.text2, 'Achievements card');
  tx(s, 'What I achieved', { x: 0.75, y: 1.55, w: 3.9, h: 0.45, fontSize: 20, bold: true, color: C.background1, fontFace: THEME.headFontFace });
  tx(s, bl(['A working, tested Trojan detector for IoT flows', 'A safe, repeatable camera laboratory', 'Practical skills in security, containers, Python and documentation']), { x: 0.75, y: 2.1, w: 3.9, h: 2.6, fontSize: 15, color: C.background1, valign: 'top' });
  card(s, 5.1, 1.4, 4.4, 3.5, C.accent1, 'Recommendations card');
  tx(s, 'Recommendations', { x: 5.35, y: 1.55, w: 3.9, h: 0.45, fontSize: 20, bold: true, color: C.background1, fontFace: THEME.headFontFace });
  const rec = [['HiiT: ', 'a written task schedule and a named reviewer for each intern'], ['University: ', 'earlier security and DevOps content, more supervisory visits'], ['ITF: ', 'prompt allowances and closer placement monitoring']];
  tx(s, rec.flatMap(([b, r], i) => [{ text: b, options: { bold: true, bullet: true } }, { text: r, options: { breakLine: i < rec.length - 1, paraSpaceAfter: 10 } }]),
    { x: 5.35, y: 2.1, w: 3.9, h: 2.6, fontSize: 15, color: C.background1, valign: 'top' });
  s.addNotes('Summarise: the system works on the samples, the laboratory makes it demonstrable, and I gained practical skills. Recommendations: the company should give interns written task schedules and reviewers; the university should bring security and DevOps content earlier and visit more; the ITF should pay allowances promptly and monitor placements.');

  // =========================================================== 19 thank you
  s = add('TITLE_DARK', 'Wrap-up');
  s.addText('Thank you', { placeholder: 'title' });
  s.addText('Questions?', { placeholder: 'body' });
  tx(s, 'Code, tests and documentation: github.com/emmanuelekopimo/build-with-ai', { x: 0.7, y: 4.6, w: 8.6, h: 0.4, fontSize: 14, color: C.background2, valign: 'middle' });
  s.addShape(pres.shapes.OVAL, { x: 7.0, y: 1.5, w: 2.3, h: 2.3, fill: { color: C.accent1 }, line: { color: C.accent1, width: 0 } });
  s.addImage({ data: await icon(fa.FaShieldAlt, 'FFFFFF'), x: 7.6, y: 2.1, w: 1.1, h: 1.1, altText: 'Shield icon' });
  s.addNotes('Invite questions. Likely ones: why not signatures, how false positives are avoided (the baseline), and whether the trojan is real (no, it is a harmless simulator on an isolated network).');

  // =========================================================== write + theme
  await pres.writeFile({ fileName: OUT });
  const skillDirs = [process.env.PPTX_SKILL_DIR, ...(fs.existsSync('/root/.claude/skills/synced') ? fs.readdirSync('/root/.claude/skills/synced').map((d) => path.join('/root/.claude/skills/synced', d, 'pptx')) : [])].filter(Boolean);
  const applyPath = skillDirs.map((d) => path.join(d, 'scripts', 'apply_theme.js')).find((f) => fs.existsSync(f));
  if (applyPath) await require(applyPath).applyTheme(OUT, THEME);
  else console.warn('apply_theme.js not found (set PPTX_SKILL_DIR): theme colours were NOT written, scheme colours will look like the Office default');
  console.log('wrote', OUT, `(${slideNo} slides)`);
})();
