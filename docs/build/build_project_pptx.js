/* Builds docs/IoT-Trojan-Detector-Overview.pptx: a short (<=15 slide), plain-language walkthrough of the whole project,
 * including the newest additions (Windows support, live cameras, the pre-infected cam-vault).
 *
 *   npm install pptxgenjs react react-dom react-icons sharp      # once, anywhere on NODE_PATH
 *   python docs/build/export_facts.py && node docs/build/build_project_pptx.js
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
const OUT = path.join(ROOT, 'docs', 'IoT-Trojan-Detector-Overview.pptx');
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
pres.layout = 'LAYOUT_16x9';
pres.title = 'IoT Trojan Detector — Project Overview';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

const FOOT = 'IoT Trojan Detector  |  Project Overview';
const bg = (c) => ({ rect: { x: 0, y: 0, w: 10, h: 5.625, fill: { color: c } } });
const ph = (name, type, o) => ({ placeholder: { options: { name, type, margin: 0, ...o }, text: '' } });

pres.defineSlideMaster({ title: 'TITLE_DARK', objects: [bg(C.text1),
  ph('title', 'title', { x: 0.7, y: 1.2, w: 6.1, h: 1.9, fontSize: 40, bold: true, color: C.background1, align: 'left', valign: 'bottom' }),
  ph('body', 'body', { x: 0.7, y: 3.3, w: 6.1, h: 0.9, fontSize: 18, color: C.background2, align: 'left', valign: 'top' })] });
pres.defineSlideMaster({ title: 'SECTION', objects: [bg(C.text2),
  ph('title', 'title', { x: 0.7, y: 1.6, w: 8.6, h: 1.3, fontSize: 42, bold: true, color: C.background1, align: 'left', valign: 'bottom' }),
  ph('body', 'body', { x: 0.7, y: 3.1, w: 8.6, h: 1.0, fontSize: 18, color: C.background2, align: 'left', valign: 'top' })] });
const contentFrame = (dark) => [...(dark ? [bg(C.text1)] : []),
  ph('title', 'title', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 32, bold: true, color: dark ? C.background1 : C.text1, align: 'left', valign: 'middle' }),
  { text: { text: FOOT, options: { x: 0.5, y: 5.2, w: 6, h: 0.25, fontSize: 10, color: C.accent6, margin: 0 } } }];
pres.defineSlideMaster({ title: 'CONTENT', objects: contentFrame(false), slideNumber: { x: 9.0, y: 5.2, w: 0.5, h: 0.25, fontSize: 10, color: HEX.accent6, align: 'right' } });
pres.defineSlideMaster({ title: 'CONTENT_DARK', objects: contentFrame(true), slideNumber: { x: 9.0, y: 5.2, w: 0.5, h: 0.25, fontSize: 10, color: HEX.accent6, align: 'right' } });

async function icon(Comp, hex, px = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: '#' + hex, size: String(px) }));
  return 'image/png;base64,' + (await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64');
}
const tx = (s, text, o) => s.addText(text, { isTextBox: true, margin: 0, ...o });
const card = (s, x, y, w, h, fill, name) => s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: fill }, line: { color: fill, width: 0 }, objectName: name });
async function badge(s, Comp, x, y, d, fill, iconHex = 'FFFFFF') {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill, width: 0 } });
  const pad = d * 0.25;
  s.addImage({ data: await icon(Comp, iconHex), x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad, altText: '' });
}
const bl = (arr, size) => arr.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < arr.length - 1, paraSpaceAfter: size || 10 } }));
let slideNo = 0;
const add = (master, section) => { slideNo += 1; return pres.addSlide({ masterName: master, sectionTitle: section }); };

(async () => {
  // 1. Title
  pres.addSection({ title: 'Intro' });
  let s = add('TITLE_DARK', 'Intro');
  s.addText('IoT Trojan Detector', { placeholder: 'title' });
  s.addText('Catching a hidden virus on a smart camera by watching its internet traffic', { placeholder: 'body' });
  s.addShape(pres.shapes.OVAL, { x: 7.1, y: 1.6, w: 2.1, h: 2.1, fill: { color: C.accent1 }, line: { color: C.accent1, width: 0 } });
  s.addImage({ data: await icon(fa.FaShieldAlt, 'FFFFFF'), x: 7.65, y: 2.15, w: 1.0, h: 1.0, altText: 'Shield' });
  s.addNotes('Title slide. One line: this project finds a hidden Trojan on a smart camera by watching the camera\'s network traffic, not by touching the camera itself.');

  // 2. The problem, in plain words
  s = add('CONTENT', 'Intro');
  s.addText('The problem', { placeholder: 'title' });
  const probs = [[fa.FaVideo, 'Smart cameras are everywhere', 'Cheap, always on, rarely updated'], [fa.FaKey, 'Weak default passwords', 'Many still use admin/admin'],
    [fa.FaBug, 'A virus can hide inside one', 'It still shows video, but secretly "calls home"'], [fa.FaBan, 'It can\'t run antivirus', 'Too small, too simple to protect itself']];
  for (let i = 0; i < probs.length; i++) {
    const x = 0.5 + (i % 2) * 4.6, y = 1.4 + Math.floor(i / 2) * 1.8;
    card(s, x, y, 4.3, 1.6, C.background2, `Problem ${i + 1}`);
    await badge(s, probs[i][0], x + 0.2, y + 0.2, 0.55, i % 2 ? HEX.accent4 : HEX.accent1);
    tx(s, probs[i][1], { x: x + 0.9, y: y + 0.2, w: 3.2, h: 0.55, fontSize: 16, bold: true, color: C.text1, valign: 'middle' });
    tx(s, probs[i][2], { x: x + 0.2, y: y + 0.9, w: 3.9, h: 0.6, fontSize: 14, color: C.text2, valign: 'top' });
  }
  s.addNotes('Smart cameras are a favourite target: cheap, always online, often still using the factory password. A hidden virus (a "Trojan") can infect one and keep streaming video normally while secretly talking to an attacker. The camera itself has no room to run security software.');

  // 3. The idea
  s = add('CONTENT', 'Intro');
  s.addText('The idea: watch the traffic, not the camera', { placeholder: 'title' });
  card(s, 0.5, 1.4, 9, 1.3, C.background2, 'Idea card');
  tx(s, 'A camera leaves a trail even if nobody looks at the video: who it talks to, how often, on what "door" (port), and how much data.', { x: 0.75, y: 1.6, w: 8.5, h: 0.9, fontSize: 18, color: C.text1, valign: 'middle' });
  const flow = ['Normal camera', 'sends video\nto its recorder', 'Infected camera', 'ALSO talks to a\nstranger, on a timer'];
  const boxX = [0.5, 3.0, 5.5, 8.0];
  for (let i = 0; i < 4; i += 2) {
    card(s, boxX[i], 3.0, 2.2, 1.7, i === 0 ? HEX.accent5 : HEX.accent2, `Flow ${i}`);
    tx(s, [{ text: flow[i], options: { bold: true, breakLine: true } }, { text: flow[i + 1] }], { x: boxX[i], y: 3.0, w: 2.2, h: 1.7, fontSize: 15, color: C.background1, align: 'center', valign: 'middle' });
  }
  tx(s, 'This project reads that trail (a CSV of flow records) and flags the difference.', { x: 0.5, y: 4.9, w: 9, h: 0.4, fontSize: 14, color: C.text2, valign: 'middle' });
  s.addNotes('Instead of inspecting the camera, we look at its network traffic: every connection leaves a record of who it talked to, how often and how much data moved. A normal camera only talks to its recorder and a few known services. An infected one also beacons to a stranger on a timer. This project reads those records and spots the difference.');

  // 4. What the tool does
  s = add('CONTENT', 'Intro');
  s.addText('What the tool does', { placeholder: 'title' });
  const feats = [[fa.FaFileUpload, 'Upload your traffic', 'A CSV file, or use the sample / live lab'], [fa.FaSearch, '9 warning signs', 'Odd ports, repeated "beacons", scans, big uploads'],
    [fa.FaChartBar, 'A score per device', '0 to 100: clean, suspicious, or compromised'], [fa.FaLock, 'One-click quarantine', 'Cut off a suspect device'],
    [fa.FaDesktop, 'A safe mini lab', 'Fake cameras + a harmless pretend virus to test it on'], [fa.FaMobileAlt, 'Works on phones too', 'Same page, smaller screen']];
  for (let i = 0; i < feats.length; i++) {
    const x = 0.5 + (i % 3) * 3.1, y = 1.4 + Math.floor(i / 3) * 1.8;
    card(s, x, y, 2.8, 1.6, C.background2, `Feature ${i + 1}`);
    await badge(s, feats[i][0], x + 0.2, y + 0.2, 0.55, i % 2 ? HEX.accent4 : HEX.accent1);
    tx(s, feats[i][1], { x: x + 0.2, y: y + 0.85, w: 2.45, h: 0.38, fontSize: 14.5, bold: true, color: C.text1, valign: 'top' });
    tx(s, feats[i][2], { x: x + 0.2, y: y + 1.26, w: 2.45, h: 0.3, fontSize: 12, color: C.text2, valign: 'top' });
  }
  s.addNotes('Six things the tool does: take a traffic file as input; look for nine warning signs; turn that into a simple score and status per device; let you quarantine a bad device with one click; and it all runs in a safe mini lab with fake cameras, so nobody needs a real camera or a real virus. It also works on a phone.');

  // 5. How it decides (in plain terms)
  s = add('CONTENT', 'Intro');
  s.addText('How it decides', { placeholder: 'title' });
  s.addImage({ path: path.join(SHOTS, 'fig-pipeline.png'), x: 0.5, y: 1.3, w: 9, h: 9 * 284 / 1832, altText: 'Pipeline: CSV in, rules applied, score out' });
  const steps = [['1. Read the file', 'Clean up dates, names and numbers'], ['2. Know what\'s normal', 'Learn each camera\'s usual habits (optional)'], ['3. Spot and score', 'Flag anything odd, add up a risk score']];
  steps.forEach(([t, d], i) => {
    const x = 0.5 + i * 3.1;
    card(s, x, 3.05, 2.8, 1.85, C.background2, `Step ${i + 1}`);
    tx(s, t, { x: x + 0.2, y: 3.2, w: 2.45, h: 0.4, fontSize: 16, bold: true, color: C.accent1, valign: 'middle' });
    tx(s, d, { x: x + 0.2, y: 3.7, w: 2.45, h: 1.1, fontSize: 14, color: C.text1, valign: 'top' });
  });
  s.addNotes('Three simple steps: read and clean the uploaded file; optionally learn what\'s normal for each camera, so a routine check-in isn\'t mistaken for a virus; then check for nine warning signs and add up a score.');

  // 6. The 9 warning signs (simple list, no jargon-heavy table)
  s = add('CONTENT', 'Intro');
  s.addText('The 9 warning signs', { placeholder: 'title' });
  const signs = [
    ['Known-bad address', 'Talking to an address already on a blocklist'], ['Suspicious door (port)', 'Using a port hackers commonly use'],
    ['Unusual door (port)', 'Using a door it never used before'], ['New stranger', 'Talking to someone it never talked to before'],
    ['"Beaconing"', 'Checking in like clockwork — a sign of remote control'], ['Scanning', 'Knocking on many doors or many neighbours fast'],
    ['Big upload', 'Sending a large amount of data out at once'], ['Size doesn\'t match', 'A single transfer far bigger than its usual habit'],
  ];
  const col = (x, items) => items.forEach(([t, d], i) => {
    tx(s, [{ text: t + ': ', options: { bold: true, color: HEX.accent1 } }, { text: d }], { x, y: 1.35 + i * 0.95, w: 4.2, h: 0.85, fontSize: 14, color: C.text1, valign: 'top' });
  });
  col(0.5, signs.slice(0, 4)); col(5.1, signs.slice(4, 8));
  s.addNotes('Nine checks in plain terms: a known-bad address, an unusual or suspicious port, a brand-new contact, regular check-ins (beaconing — a classic remote-control sign), scanning many hosts or ports fast, and anything about data volume that is unusually large.');

  // 7. One click doesn't mean guilty — the baseline
  s = add('CONTENT', 'Intro');
  s.addText('Why it doesn\'t cry wolf', { placeholder: 'title' });
  card(s, 0.5, 1.4, 4.4, 3.5, C.background2, 'Why card');
  tx(s, 'The trap', { x: 0.75, y: 1.55, w: 3.9, h: 0.45, fontSize: 20, bold: true, color: C.text1, fontFace: THEME.headFontFace });
  tx(s, bl(['A healthy camera is ALSO regular: it streams video every 10 seconds and checks the clock', 'A simple "regular = suspicious" rule would flag every normal camera'], 10), { x: 0.75, y: 2.1, w: 3.9, h: 2.6, fontSize: 15, color: C.text1, valign: 'top' });
  card(s, 5.1, 1.4, 4.4, 3.5, C.accent1, 'Fix card');
  tx(s, 'The fix', { x: 5.35, y: 1.55, w: 3.9, h: 0.45, fontSize: 20, bold: true, color: C.background1, fontFace: THEME.headFontFace });
  tx(s, bl(['Teach the tool who each camera normally talks to (a "baseline")', 'Only a check-in to a NEW, unknown address counts as suspicious', `Result: the clean sample gets ${cln.summary.findings} false alarms`], 10), { x: 5.35, y: 2.1, w: 3.9, h: 2.6, fontSize: 15, color: C.background1, valign: 'top' });
  s.addNotes('A normal camera is itself very regular, so a naive "regular traffic = virus" rule would flag every healthy camera. The fix is a baseline: teach the tool who each camera normally talks to. A regular check-in to a known address is ignored; the same regularity to a brand-new address is flagged. Result: zero false alarms on the clean sample.');

  // 8. The safe test lab
  pres.addSection({ title: 'Seeing it work' });
  s = add('SECTION', 'Seeing it work');
  s.addText('A safe lab to test it in', { placeholder: 'title' });
  s.addText('Pretend cameras + a harmless pretend virus — nothing real is ever at risk', { placeholder: 'body' });
  s.addNotes('To show the tool working, the project includes a small safe lab: pretend cameras and a harmless pretend virus, so nothing real is ever touched.');

  // 9. Architecture, simplified
  s = add('CONTENT', 'Seeing it work');
  s.addText('What\'s in the lab', { placeholder: 'title' });
  s.addImage({ path: path.join(SHOTS, 'fig-architecture.png'), x: 0.4, y: 1.35, w: 5.9, h: 5.9 * 832 / 1832, altText: 'Lab layout diagram' });
  tx(s, bl(['3 pretend cameras — one is already infected on startup', 'A pretend "attacker" server the virus checks in with', 'The detector, reading everyone\'s traffic', 'Sealed off from the internet — nothing can leak out'], 10),
    { x: 6.5, y: 1.4, w: 3.0, h: 3.4, fontSize: 14, color: C.text1, valign: 'top' });
  s.addNotes('The lab has three pretend cameras, a pretend attacker server, and the detector watching everyone\'s traffic. It is sealed off from the real internet, so nothing can ever get out.');

  // 10. NEW: the pre-infected camera you can SEE
  s = add('CONTENT_DARK', 'Seeing it work');
  s.addText('New: watch an infection happen', { placeholder: 'title' });
  s.addImage({ path: path.join(SHOTS, 'cam-vault-clean.jpg'), x: 0.5, y: 1.3, w: 3.9, h: 3.9 * 360 / 640, altText: 'Clean camera feed' });
  s.addImage({ path: path.join(SHOTS, 'cam-vault-infected.jpg'), x: 5.1, y: 1.3, w: 3.9, h: 3.9 * 360 / 640, altText: 'Infected camera feed, glitching, showing fake hacker activity' });
  tx(s, 'Before: normal video', { x: 0.5, y: 3.65, w: 3.9, h: 0.35, fontSize: 14, bold: true, color: C.background1, align: 'center' });
  tx(s, 'After: screen glitches + shows what the virus is doing', { x: 5.1, y: 3.65, w: 3.9, h: 0.35, fontSize: 14, bold: true, color: C.background2, align: 'center' });
  tx(s, 'A new camera, "cam-vault", starts already infected. Its picture visibly breaks up and overlays the virus\'s real activity (fake connections, fake file drops) — so you can SEE the infection, not just read about it.', { x: 0.5, y: 4.25, w: 9, h: 0.7, fontSize: 13, color: C.background2, valign: 'top' });
  s.addNotes('This is the newest piece: a third camera called cam-vault that starts already infected. Instead of just a score on a dashboard, its video feed itself visibly glitches and shows an overlay of the pretend virus\'s real activity — the fake process, its fake connections, the fake scan. It makes the infection visible, not just reported.');

  // 11. The detector screen
  s = add('CONTENT', 'Seeing it work');
  s.addText('What you see in the detector', { placeholder: 'title' });
  s.addImage({ path: path.join(SHOTS, '04-results.png'), x: 0.7, y: 1.3, w: 8.6, h: 8.6 * 878 / 2224, altText: 'Detector results: 3 cameras, one compromised' });
  tx(s, `Test run: one camera (cam-garage) is flagged compromised with a risk score of ${garage.score}; the other two stay clean.`, { x: 0.7, y: 4.8, w: 8.6, h: 0.35, fontSize: 14, color: C.text2, valign: 'middle' });
  s.addNotes('This is the actual detector screen after analysing a test capture: one camera flagged compromised with a risk score of 100, the other two cameras stay clean.');

  // 12. Results (numbers, kept to the essentials)
  s = add('CONTENT', 'Seeing it work');
  s.addText('Does it actually work?', { placeholder: 'title' });
  const res = [[`${NT}/${NT}`, 'automated checks pass'], [String(inf.summary.findings), 'warnings found on the infected test'], [String(cln.summary.findings), 'false alarms on clean traffic'], [String(garage.score), 'risk score given to the infected camera']];
  res.forEach(([n, l], i) => {
    const x = 0.5 + i * 2.32;
    card(s, x, 1.5, 2.05, 2.0, C.background2, `Result ${i + 1}`);
    tx(s, n, { x: x + 0.15, y: 1.65, w: 1.75, h: 0.85, fontSize: 32, bold: true, color: i === 2 ? C.accent5 : (i === 3 ? C.accent2 : C.accent1), fontFace: THEME.headFontFace, valign: 'middle' });
    tx(s, l, { x: x + 0.15, y: 2.5, w: 1.75, h: 0.95, fontSize: 13, color: C.text1, valign: 'top' });
  });
  tx(s, 'In short: it catches the infected camera, leaves the healthy ones alone, and every automated check passes.', { x: 0.5, y: 3.8, w: 9, h: 0.5, fontSize: 15, color: C.text2, valign: 'middle' });
  s.addNotes('In short: every automated check passes, the infected camera is caught with a high risk score, and the clean traffic produces zero false alarms.');

  // 13. Recent upgrades (consolidated: Windows, live camera, hosting)
  s = add('CONTENT', 'Seeing it work');
  s.addText('Recent upgrades', { placeholder: 'title' });
  const ups = [[fa.FaWindows, 'Works on Windows now', 'Not just Mac/Linux; one command starts everything'], [fa.FaVideo, 'Real-looking live video', 'Cameras now stream moving video you can watch in a browser'],
    [fa.FaExclamationTriangle, 'A camera you can watch get hacked', 'cam-vault — infected from the start, glitching feed'], [fa.FaCloud, 'Ready to put online', 'Can be hosted on a free/cheap site for demos']];
  for (let i = 0; i < ups.length; i++) {
    const x = 0.5 + (i % 2) * 4.6, y = 1.4 + Math.floor(i / 2) * 1.8;
    card(s, x, y, 4.3, 1.6, C.background2, `Upgrade ${i + 1}`);
    await badge(s, ups[i][0], x + 0.2, y + 0.2, 0.55, i % 2 ? HEX.accent4 : HEX.accent1);
    tx(s, ups[i][1], { x: x + 0.9, y: y + 0.2, w: 3.2, h: 0.55, fontSize: 15, bold: true, color: C.text1, valign: 'middle' });
    tx(s, ups[i][2], { x: x + 0.2, y: y + 0.9, w: 3.9, h: 0.6, fontSize: 13, color: C.text2, valign: 'top' });
  }
  s.addNotes('Four recent additions: it now runs on Windows with one command; the pretend cameras stream real-looking moving video; a new camera lets you literally watch it get hacked; and the detector is ready to be hosted online for a live demo link.');

  // 14. Honest limits
  s = add('CONTENT', 'Seeing it work');
  s.addText('What it can\'t do (yet)', { placeholder: 'title' });
  card(s, 0.5, 1.4, 9, 3.5, C.background2, 'Limits card');
  tx(s, bl([
    'It reads TRAFFIC PATTERNS, not the content of messages — it can\'t see inside encrypted data',
    'The rules are hand-written, not learned from millions of real attacks (yet)',
    'It has no login screen — don\'t put it on the open internet without adding one',
    'The pretend virus is 100% harmless: it never touches real files or sends real data anywhere',
  ], 14), { x: 0.9, y: 1.7, w: 8.2, h: 3.0, fontSize: 16, color: C.text1, valign: 'top' });
  s.addNotes('To be upfront: it reads traffic patterns, not message contents, so it can\'t see inside encrypted data. The rules are hand-written, not machine-learned. It has no login screen yet, so it shouldn\'t be put on the open internet as-is. And the test virus is completely harmless — it never touches a real file or sends real data anywhere.');

  // 15. Thank you / close
  pres.addSection({ title: 'Close' });
  s = add('TITLE_DARK', 'Close');
  s.addText('Thank you', { placeholder: 'title' });
  s.addText('Questions?', { placeholder: 'body' });
  tx(s, 'Code: github.com/emmanuelekopimo/build-with-ai', { x: 0.7, y: 4.6, w: 8.6, h: 0.4, fontSize: 14, color: C.background2, valign: 'middle' });
  s.addShape(pres.shapes.OVAL, { x: 7.1, y: 1.6, w: 2.1, h: 2.1, fill: { color: C.accent1 }, line: { color: C.accent1, width: 0 } });
  s.addImage({ data: await icon(fa.FaShieldAlt, 'FFFFFF'), x: 7.65, y: 2.15, w: 1.0, h: 1.0, altText: 'Shield' });
  s.addNotes('Close. Invite questions.');

  await pres.writeFile({ fileName: OUT });
  const skillDirs = [process.env.PPTX_SKILL_DIR, ...(fs.existsSync('/root/.claude/skills/synced') ? fs.readdirSync('/root/.claude/skills/synced').map((d) => path.join('/root/.claude/skills/synced', d, 'pptx')) : [])].filter(Boolean);
  const applyPath = skillDirs.map((d) => path.join(d, 'scripts', 'apply_theme.js')).find((f) => fs.existsSync(f));
  if (applyPath) await require(applyPath).applyTheme(OUT, THEME);
  else console.warn('apply_theme.js not found (set PPTX_SKILL_DIR): theme colours were NOT written');
  console.log('wrote', OUT, `(${slideNo} slides)`);
})();
