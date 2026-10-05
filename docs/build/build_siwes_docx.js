/* Builds docs/SIWES-Report-HiiT-Plc-IoT-Trojan-Detector.docx: an editable SIWES (Student Industrial Work Experience Scheme)
 * report for a placement at HiiT Plc whose mini project is the IoT Trojan Detector in this repository.
 *
 *   python docs/build/export_facts.py && node docs/build/build_siwes_docx.js
 *
 * Formatting is shared with build_docx.js (docx_common.js). Anything the student must supply is written <<like this>> in the
 * source and appears in the document as [like this] with yellow highlight.
 */
const { ROOT, path, fs, runs, Doc, excerpt, fmtN, makeDocument, tocParagraphs, buildTwoPass, docx } = require('./docx_common');
const { Paragraph, TextRun, AlignmentType } = docx;

const OUT = path.join(ROOT, 'docs', 'SIWES-Report-HiiT-Plc-IoT-Trojan-Detector.docx');
const facts = JSON.parse(fs.readFileSync(path.join(__dirname, '_facts.json'), 'utf8'));
const C = facts.constants, inf = facts.infected, cln = facts.clean;
const NT = facts.tests.length;
const garage = inf.devices.find((d) => d.status === 'compromised');
const sevOrder = ['critical', 'high', 'medium', 'low'];
const sevText = Object.entries(inf.severity_counts).sort((a, b) => sevOrder.indexOf(a[0]) - sevOrder.indexOf(b[0])).map(([k, v]) => `${v} ${k}`).join(', ');
const scr = (id) => facts.screens.find((s) => s.id === id);

const centered = (t, o = {}) => new Paragraph({ style: 'BodyText', alignment: AlignmentType.CENTER, spacing: { before: o.before || 0, after: o.after === undefined ? 160 : o.after, line: 276, lineRule: 'auto' },
  children: runs(t, { bold: o.bold !== false, size: o.size || 24 }) });

function build(pages) {
  const d = Doc(pages);

  // ------------------------------------------------------------------ cover page
  const cover = [
    centered('REPORT ON', { size: 28, after: 120 }),
    centered('STUDENT INDUSTRIAL WORK EXPERIENCE SCHEME (SIWES)', { size: 28, after: 240 }),
    centered('EXPERIENCES AND MINI PROJECT UNDERTAKEN AT', { after: 120 }),
    centered('HiiT PLC', { size: 32, after: 240 }),
    centered('ON', { after: 120 }),
    centered('DESIGN AND IMPLEMENTATION OF A NETWORK-FLOW-BASED TROJAN HORSE DETECTION SYSTEM FOR IoT DEVICES, WITH A SIMULATED IP-CAMERA LABORATORY', { size: 26, after: 360 }),
    centered('BY', { after: 120 }),
    centered('<<SURNAME, FIRST NAME, MIDDLE NAME>>', { after: 60 }),
    centered('<<REGISTRATION NUMBER>>', { after: 360 }),
    centered('DEPARTMENT OF COMPUTER SCIENCE', { after: 60 }),
    centered('FACULTY OF COMPUTING', { after: 60 }),
    centered('UNIVERSITY OF UYO, UYO, AKWA IBOM STATE', { after: 120 }),
    centered('COURSE CODE: <<COURSE CODE>>', { after: 240 }),
    centered('SUBMITTED TO:', { after: 60 }),
    centered('DEPARTMENT OF COMPUTER SCIENCE', { after: 60 }),
    centered('FACULTY OF COMPUTING, UNIVERSITY OF UYO', { after: 240 }),
    centered('IN PARTIAL FULFILMENT OF THE REQUIREMENTS FOR THE AWARD OF A BACHELOR OF SCIENCE (B.Sc.) DEGREE IN COMPUTER SCIENCE', { after: 360 }),
    centered('<<MONTH, YEAR>>'),
  ];

  // ------------------------------------------------------------------ front matter
  d.h1('CERTIFICATION');
  d.p('This is to certify that this report on the Student Industrial Work Experience Scheme (SIWES) undertaken at HiiT Plc, together with the mini project on the design and implementation of a network-flow-based Trojan Horse detection system for IoT devices, was prepared by <<SURNAME, FIRST NAME>> (Reg. No. <<REGISTRATION NUMBER>>), a student of the Department of Computer Science, Faculty of Computing, University of Uyo, in partial fulfilment of the requirements for the award of the Bachelor of Science (B.Sc.) degree in Computer Science.', 'FirstParagraph');
  for (const [name, role] of [['Name of Industry-Based Supervisor', 'Industry-Based Supervisor, HiiT Plc'], ['Name of Institution-Based Supervisor', 'Institution-Based Supervisor, Department of Computer Science'],
    ['Name of SIWES Coordinator', 'SIWES Coordinator, Department of Computer Science'], ['Name of Head of Department', 'Head, Department of Computer Science']]) {
    d.blocks.push(new Paragraph({ style: 'Compact', spacing: { before: 360, after: 0 }, children: [new TextRun('______________________________')] }));
    d.blocks.push(new Paragraph({ style: 'Compact', alignment: AlignmentType.LEFT, spacing: { after: 0 }, children: runs(`<<${name}>>`) }));
    d.blocks.push(new Paragraph({ style: 'Compact', alignment: AlignmentType.LEFT, spacing: { after: 0 }, children: runs(role) }));
    d.blocks.push(new Paragraph({ style: 'Compact', alignment: AlignmentType.LEFT, spacing: { after: 0 }, children: runs('Date: ______________') }));
  }

  d.h1('ACKNOWLEDGEMENTS');
  d.p('I thank Almighty God for the health, strength and understanding that carried me through my industrial training and the preparation of this report.', 'FirstParagraph');
  d.p('I am grateful to the management and staff of HiiT Plc for admitting me into the organisation and for giving me room to learn by doing. Special thanks go to my industry-based supervisor, <<name of supervisor>>, and to the facilitators and colleagues who reviewed my work, answered my questions and challenged me to explain my design decisions.');
  d.p('I appreciate the Head of the Department of Computer Science, the SIWES Coordinator and my institution-based supervisor, <<name>>, at the University of Uyo for their supervision, advice and administrative support, and the Industrial Training Fund (ITF) for sustaining a scheme that lets students meet industry before they graduate.');
  d.p('Finally, I thank my family, friends and course mates for their prayers, encouragement and patience throughout the placement.');

  d.h1('ABSTRACT');
  d.p('This report presents my Student Industrial Work Experience Scheme (SIWES) training at HiiT Plc, a Nigerian information technology company engaged in IT training, publishing, consultancy and software solutions. Over the placement I worked mainly on one engineering problem: how to detect a Trojan Horse on Internet-of-Things (IoT) devices such as IP cameras when the devices themselves cannot run security software.', 'FirstParagraph');
  d.p(`The mini project, presented in Chapter Four, is a network-flow-based detection system. It accepts flow records as a CSV file (timestamp, device, source and destination address, destination port, protocol and bytes sent), compares them with an optional baseline of known-good behaviour, and reports nine kinds of findings, among them contact with known-bad addresses, suspicious ports, periodic beaconing, scan bursts and large outbound transfers. Each finding is mapped to a MITRE ATT&CK technique, each device receives a risk score and a status of clean, suspicious or compromised, and a flagged device can be quarantined from a web interface. To demonstrate the system safely I built a Docker laboratory with simulated IP cameras, a looping video stream, a fake command-and-control server and a harmless trojan simulator on an isolated network.`);
  d.p(`The system was implemented in Python and Flask and verified with ${NT} automated tests together with positive, negative and laboratory tests. On the bundled infected sample it reported ${inf.summary.findings} findings on one camera, marked it compromised, and left the other two cameras and the clean capture free of findings. The report also covers the experience gained in programming, networking, cybersecurity, containers, testing, version control and technical documentation, assesses the host organisation, and offers recommendations to the company, the University and the ITF.`);
  d.p('**Keywords:** SIWES, HiiT Plc, IoT security, Trojan Horse, network flow, beaconing, MITRE ATT&CK, Python, Flask, Docker.');
  const tocAt = d.blocks.length;

  // ------------------------------------------------------------------ CHAPTER ONE
  d.h1('CHAPTER ONE: INTRODUCTION: BRIEF HISTORY OF SIWES');
  d.h2('1.1 Introduction');
  d.p('The Student Industrial Work Experience Scheme (SIWES) is a practical training programme that forms part of the approved curriculum for degrees, diplomas and certificates in Nigerian universities, polytechnics and colleges of education. Students of Computer Science, engineering, the sciences, agriculture, medicine and similar disciplines are required to complete it before they can graduate. The thinking behind it is straightforward: a graduate should already have seen how a real organisation works before the first day of formal employment.', 'FirstParagraph');
  d.p('During SIWES a student spends a defined period, normally several months, away from lectures and in an organisation whose activities match the field of study. The student works under supervision, uses professional tools, follows workplace rules and records the activities in a logbook. In return the student gains skills and habits that are hard to acquire in a classroom, such as punctuality, accountability, teamwork, documentation and delivering to a deadline.');
  d.h2('1.2 Brief History of SIWES in Nigeria');
  d.p('The Industrial Training Fund (ITF) was established in 1971, and in 1973 it launched SIWES in response to a recurring complaint from employers: Nigerian graduates, particularly in science and technology, understood theory well but lacked practical competence, so companies had to spend heavily on retraining them. The scheme was designed to close that gap by making industrial exposure part of the degree itself.', 'FirstParagraph');
  d.p('The first cohorts were small and the ITF ran the scheme on its own. In the years that followed, coordination moved between the ITF and the academic regulators, and the Federal Government later restored operational responsibility to the ITF while the regulators kept control of academic standards. SIWES has since grown from a handful of institutions to a nationwide programme covering a wide range of disciplines.');
  d.h2('1.3 Stakeholders and Their Roles');
  d.p('SIWES depends on cooperation between several parties. Table 1.1 summarises who does what.');
  d.caption('Table 1.1: Stakeholders in SIWES and Their Roles');
  d.table(['Stakeholder', 'Role'], [
    ['Industrial Training Fund (ITF)', 'Administers the scheme, supports placement, supervises students and contributes to their funding and allowances.'],
    ['NUC, NBTE and NCCE', 'Set and monitor academic standards for universities, polytechnics and colleges of education respectively, including the SIWES component of programmes.'],
    ['Tertiary institution', 'Registers students, helps with placement, appoints supervisors, assesses the report and logbook, and awards credit.'],
    ['Host organisation', 'Provides placement, equipment, mentoring and a practical assessment of the student.'],
    ['Student', 'Attends the placement diligently, keeps the logbook, completes assigned tasks and submits a report.'],
  ], [2800, 6226]);
  d.h2('1.4 Aims and Objectives of SIWES');
  d.p('The main aim of SIWES is to prepare students for work by giving them supervised, practical exposure in their field of study. Its specific objectives are:', 'FirstParagraph');
  d.bullets([
    'To let students apply classroom knowledge to real problems in real working environments.',
    'To develop the practical and professional skills that employers expect of graduates.',
    'To teach how organisations are structured and how work flows through them.',
    'To build discipline, integrity, responsibility and good work ethics.',
    'To improve communication, teamwork and leadership ability.',
    'To improve graduate employability and reduce the cost of post-graduation retraining.',
    'To strengthen links between institutions and industry.',
  ]);
  d.h2('1.5 Relevance of SIWES to Computer Science Students');
  d.p('Computing changes faster than any syllabus can follow. Virtualisation, containers, cloud platforms, security tooling and version control are best learned by using them, and a placement provides the chance to see how software is specified, built, tested, secured, documented and delivered by a team. For me, SIWES was also an opportunity to test an interest in cybersecurity: instead of reading about attacks in the abstract, I built a laboratory in which an attack could be simulated, detected and contained.', 'FirstParagraph');
  d.h2('1.6 Purpose and Structure of This Report');
  d.p('This report documents what I did and learned at HiiT Plc. Chapter One introduces SIWES. Chapter Two describes HiiT Plc, its structure and services, and the work I carried out there. Chapter Three records the experience gained. Chapter Four presents the mini project in full, from requirements and design to implementation, testing and results. Chapter Five summarises the training, draws conclusions and makes recommendations. The references and appendices follow.', 'FirstParagraph');

  // ------------------------------------------------------------------ CHAPTER TWO
  d.h1('CHAPTER TWO: BRIEF HISTORY OF THE SIWES ORGANISATION (HiiT PLC)');
  d.h2('2.1 Introduction');
  d.p('HiiT Plc is a Nigerian-owned information technology company registered with the Computer Professionals Registration Council of Nigeria (CPN). It operates in four connected areas: IT training and education, publishing, IT consultancy, and IT solutions development and services. This chapter describes the organisation, the units I interacted with, the projects I worked on and my assessment of the company.', 'FirstParagraph');
  d.h2('2.2 Background and History of HiiT Plc');
  d.p('HiiT Plc grew out of the belief that Nigerians should be able to acquire world-class IT skills from Nigerian professionals, at international standards but at a cost and in a form that suit local conditions. Public information describes it as the largest indigenous IT training company in Nigeria, with CPN-accredited training centres in Lagos, Abuja, Ibadan and Kano, and more than 60,000 graduates over about a quarter of a century of operation (BusinessDay, 2020). The company was founded in 1996 and has its head office in Lagos <<confirm founding year and head-office address from the company profile>>.', 'FirstParagraph');
  d.p('Beyond its physical centres, HiiT delivers instructor-led online training so that learners elsewhere in Nigeria can attend the same classes, and it runs a SIWES and internship programme through which students from tertiary institutions spend time working with its facilitators and practitioners. My placement took place within that programme.');
  d.h2('2.3 Vision, Mission and Core Values');
  d.p('<<Replace this paragraph with the company\'s official vision and mission statements from the orientation handbook or website.>> In summary, HiiT aims to be a leading indigenous centre of excellence that produces skilled, certified and employable IT professionals, and to deliver quality IT education, consultancy and software services through experienced facilitators, current course content and good facilities.', 'FirstParagraph');
  d.p('The values the company works by, as presented in its profile, are:');
  d.bullets([['Excellence', 'treating the minimum acceptable standard as a starting point, not a target.'], ['Innovation', 'continuously looking for better methods, tools and opportunities as technology changes.'],
    ['Caring', 'showing concern for learners, clients and colleagues beyond the transaction.'], ['Happiness', 'building a working and learning environment in which people can thrive.']]);
  d.h2('2.4 Services and Business Units');
  d.caption('Table 2.1: Lines of Business of HiiT Plc');
  d.table(['Line of business', 'Description'], [
    ['IT training and education', 'Instructor-led and online courses in programming, networking, databases, cybersecurity, digital literacy and certification preparation.'],
    ['Software development and services', 'Design and delivery of software solutions and IT services tailored to client needs.'],
    ['IT consultancy', 'Advice to organisations on systems, infrastructure, ICT policy and digital adoption.'],
    ['Networking, ICT and CBT centre set-up', 'Planning, equipping and commissioning networks, ICT laboratories and computer-based testing centres.'],
    ['Publishing', 'Production of IT textbooks and learning materials for training and self-study.'],
    ['SIWES and internship programme', 'Supervised industrial training with mentoring, practical tasks and exposure sessions for students.'],
  ], [2900, 6126]);
  d.h2('2.5 Organisational Units and My Interaction with Them');
  d.p('At the start of the placement I was shown how the organisation is arranged. Table 2.2 lists the units I dealt with and how each related to my work.', 'FirstParagraph');
  d.caption('Table 2.2: Units of HiiT Plc and Their Relevance to My Work');
  d.table(['Unit', 'Function', 'Relevance to my work'], [
    ['Training / academic unit', 'Course content, facilitators, classes and certification.', 'Facilitators reviewed my approach and explained concepts in networking and security.'],
    ['Software and solutions unit', 'Development, testing and deployment of client applications.', 'Source of the working practices I followed: modular code, tests and version control.'],
    ['Networking and infrastructure unit', 'Laboratories, networks, hardware and technical support.', 'Provided the equipment and network access my laboratory work relied on.'],
    ['Publishing and content unit', 'Preparation and editing of learning materials.', 'Showed the standard expected of written technical material.'],
    ['SIWES / internship desk', 'Placement, attendance, supervision and intern activities.', 'Assigned my supervisor and tracked my attendance and logbook.'],
  ], [2300, 3100, 3626]);
  d.p('Seeing these units working side by side taught me that technical work is never done in isolation: a single deliverable passes through requirements, development, review, documentation and support before it becomes useful to anyone.');
  d.h2('2.6 Placement Details');
  d.caption('Table 2.3: Summary of My Placement');
  d.table(['Item', 'Details'], [
    ['Host organisation', 'HiiT Plc'],
    ['Branch / centre', '<<branch or centre>>'],
    ['Unit / department', '<<unit or department>>'],
    ['Period of training', '<<start date>> to <<end date>>'],
    ['Industry-based supervisor', '<<name and designation>>'],
    ['Institution-based supervisor', '<<name and designation>>'],
    ['Main assignment', 'Design and implementation of a network-flow-based Trojan Horse detection system for IoT devices, with a simulated camera laboratory'],
  ], [3000, 6026]);
  d.h2('2.7 Projects I Worked On During the Training Period');
  d.p('Table 2.4 lists the technical work I completed. The detection system is the mini project and is presented fully in Chapter Four; the supporting activities are described in Chapter Three.', 'FirstParagraph');
  d.caption('Table 2.4: Projects and Work Packages Completed');
  d.table(['S/N', 'Work package', 'Domain', 'Main tools', 'Outcome'], [
    ['1', 'Flow-analysis and detection engine', 'Cybersecurity / software', 'Python (standard library)', `Parser, baseline builder, nine detection rules and risk scoring`],
    ['2', 'Web interface and JSON API', 'Software engineering', 'Flask, HTML, JavaScript', 'CSV upload, results display, quarantine and release'],
    ['3', 'Simulated IP-camera laboratory', 'Systems / networking', 'Docker Compose, MediaMTX, ffmpeg', 'Isolated lab with cameras, RTSP stream and shared telemetry'],
    ['4', 'Harmless trojan and fake C2 simulator', 'Security', 'Python sockets', 'Repeatable infection, beaconing and containment demonstration'],
    ['5', 'Testing and verification', 'Quality assurance', 'pytest', `${NT} automated tests plus positive, negative and laboratory tests`],
    ['6', 'Documentation and screenshots', 'Technical writing', 'Playwright, Chromium, Word', 'README, PDF guide, Word report and annotated screenshots'],
    ['7', '<<other task assigned at HiiT, if any>>', '<<domain>>', '<<tools>>', '<<outcome>>'],
  ], [600, 2300, 1700, 2000, 2426], { center: [0] });
  d.h2('2.8 Review of HiiT Plc');
  d.h3('2.8.1 Strengths');
  d.bullets([
    ['Longevity and credibility', 'A quarter of a century in a sector where many start-ups disappear is a strong record.'],
    ['Professional standing', 'CPN registration reassures learners, interns and clients that the company works within professional standards.'],
    ['Breadth of services', 'Training, publishing, consultancy and software under one roof lets an intern see several sides of the industry.'],
    ['National reach', 'Centres in several cities, together with online delivery, make the training accessible beyond Lagos.'],
    ['Willing mentors', 'Facilitators explained the reasoning behind their advice instead of only giving instructions.'],
  ]);
  d.h3('2.8.2 Areas for Improvement');
  d.bullets([
    'A written schedule of tasks and learning outcomes at the start of the placement would make expectations visible from the first week.',
    'More project-based assignments with a named reviewer would convert exposure into measurable skill.',
    'Reliable backup power and redundant internet access would protect laboratory hours from the infrastructure problems that affect most Nigerian organisations.',
    'Supervised portfolio presentations would help interns show completed work to future employers.',
  ]);
  d.h3('2.8.3 SWOT Summary');
  d.caption('Table 2.5: SWOT Analysis of HiiT Plc');
  d.table(['Strengths', 'Weaknesses'], [
    ['Long operating history', 'Intern task scheduling could be more formal'],
    ['CPN-registered, Nigerian-owned', 'Resource limits at some centres'],
    ['Several service lines', 'Dependence on unreliable national infrastructure'],
    ['Multi-city presence plus online delivery', ''],
  ], [4513, 4513]);
  d.table(['Opportunities', 'Threats'], [
    ['Growing demand for cybersecurity, data and software skills', 'Competition from global online platforms'],
    ['Growth of remote and hybrid learning', 'Rapid change in technology and certifications'],
    ['Partnerships with universities for SIWES', 'Cost pressures on students'],
  ], [4513, 4513]);
  d.h3('2.8.4 My Overall Assessment');
  d.p('My assessment of HiiT Plc is positive. The company takes the training of Nigerians seriously, and that showed in the way facilitators tied every concept to real use. I would recommend it to Computer Science students who want practical exposure to programming, networking and security. <<Adjust this paragraph to reflect your own experience.>>', 'FirstParagraph');

  // ------------------------------------------------------------------ CHAPTER THREE
  d.h1('CHAPTER THREE: EXPERIENCE GAINED AND WORK DONE');
  d.h2('3.0 Introduction to the Training Environment');
  d.p('My placement at HiiT Plc ran from <<start date>> to <<end date>> at <<branch or centre>> under the supervision of <<supervisor name>>. <<Describe orientation: working hours, conduct and safety rules, introduction to the units, and the tools provided.>> I was then given progressively more demanding tasks, beginning with environment set-up and ending with independent project work.', 'FirstParagraph');
  d.p('My development platform was <<describe your laptop or workstation: model, processor, memory and operating system>>. The main software used was Python 3, the Flask web framework, Docker and Docker Compose, the pytest test framework, Git and GitHub, a code editor, and Microsoft Word for documentation. Working within the limits of the machine taught me to plan resources carefully, which is a professional habit in its own right.');
  d.h2('3.1 Overview of Experiences Gained');
  d.p('The training strengthened my competence in six areas:', 'FirstParagraph');
  d.numbered([
    '**Networking and traffic analysis:** how conversations between devices are summarised as flows, and what normal and abnormal flows look like.',
    '**Cybersecurity of IoT devices:** how trojans persist, communicate and spread, how defenders describe those behaviours, and how to study them safely.',
    '**Systems and containers:** building an isolated, repeatable laboratory with Docker Compose.',
    '**Software development in Python:** structuring a program into a testable engine, a web layer and simulators.',
    '**Quality assurance and version control:** writing automated tests, finding defects and managing changes in Git.',
    '**Professional practice:** technical documentation, reporting, communication and time management.',
  ], 'num1');
  d.h2('3.2 Network Flow Analysis');
  d.p('Most of my early learning was about the data the detector works on. A flow record summarises one conversation between two endpoints: when it started, the addresses and ports involved, the protocol and how many bytes moved. Flow data is exported by routers and switches (NetFlow and IPFIX) and by monitoring tools such as Zeek and Suricata. It is attractive for IoT monitoring because it is compact, it does not need access to the device and it works even when the payload is encrypted.', 'FirstParagraph');
  d.p('I learned to read flows for behaviour rather than content. A camera that streams video to a recorder every ten seconds, synchronises its clock at fixed times and sends a periodic heartbeat to its vendor has a clear, repetitive pattern. A trojan leaves a different pattern: contact with an address the device never used, at a constant interval, on an unusual port, sometimes followed by a burst of connections to neighbouring hosts. Distinguishing the two is the central problem the project solves.');
  d.h2('3.3 Cybersecurity Concepts and Ethical Practice');
  d.h3('3.3.1 Threat Background');
  d.p('IoT cameras typically run a small Linux system with a web administration page and a video service, and many ship with default credentials. The Mirai botnet of 2016 showed how quickly such devices can be taken over when those defaults are left in place (Antonakakis et al., 2017). An infected device usually waits for instructions from a command-and-control (C2) server, scans for more victims and takes part in attacks, and each of these produces network traffic that differs from the device\'s ordinary role.', 'FirstParagraph');
  d.h3('3.3.2 MITRE ATT&CK');
  d.p('I learned to describe detections using the MITRE ATT&CK knowledge base, which gives each adversary technique an identifier, for example T1071 (Application Layer Protocol), T1571 (Non-Standard Port), T1046 (Network Service Discovery) and T1041 (Exfiltration Over C2 Channel). Using these identifiers in the detector means findings can be understood by any security team without further explanation.');
  d.h3('3.3.3 Ethical and Legal Framework');
  d.p('Security work carries responsibilities. I worked only on systems I had built myself, inside an isolated laboratory, and I deliberately avoided real malware: the trojan in the lab is a simulator that reproduces observable indicators and nothing else. I also became aware that unauthorised access to computer systems is an offence under Nigerian law, including the Cybercrimes (Prohibition, Prevention, etc.) Act 2015, which is a good reason to keep testing confined to environments one owns or is authorised to test.');
  d.h2('3.4 Containers and the Virtual Laboratory');
  d.p('To demonstrate the detector without real malware or real cameras, I built a laboratory with Docker Compose. It defines simulated cameras, a looping video stream, a fake C2 server, the trojan simulator and the detector, all connected to a network declared as internal so that nothing can reach the internet. A separate network exposes only the web interface, one camera admin page and the video port to the host. A shared volume carries the flow records from the simulators to the detector. Figure 3.1 shows the layout.', 'FirstParagraph');
  d.figure('fig-architecture.png', 'Figure 3.1: Architecture of the laboratory and the detector', 560);
  d.p('Working with containers taught me how images, networks, volumes and service profiles fit together, and why an infection step should be an explicit action: the trojan service sits behind a Compose profile, so the laboratory starts clean and is infected only when I choose.');
  d.h2('3.5 Programming with Python and Flask');
  d.p('The software is organised in layers so that each part can be understood and tested on its own. The analysis engine uses only the Python standard library and has no dependency on the web framework. The Flask application is a thin layer that receives uploads, calls the engine and returns JSON. The simulators are small separate programs. Keeping the engine independent made testing straightforward and would allow it to be reused in a different front end.', 'FirstParagraph');
  d.p('I practised several habits that I had only met in theory before: validating input and returning clear error messages instead of stack traces; checking file names before using them; keeping thresholds as named constants so they can be tuned; and returning structured data (findings, device summaries) rather than formatted text.');
  d.h2('3.6 Software Testing and Debugging');
  d.p(`I wrote ${NT} automated tests with pytest covering the parser, the detection rules, the web endpoints and the failure cases. Testing was valuable mostly because it exposed mistakes I would not have noticed by inspection. Two defects in particular changed the design: legitimate periodic traffic was at first reported as beaconing, and the lab's stand-in internet addresses were wrongly treated as private, which silently disabled the large-transfer rule. Both are explained in Section 4.10.2. I learned that a failing test is information about the design and not just an obstacle.`, 'FirstParagraph');
  d.h2('3.7 Version Control and Collaboration');
  d.p('The project was developed in a Git repository hosted on GitHub (emmanuelekopimo/build-with-ai) on a dedicated feature branch, with small commits that each describe one change, and a pull request used to present the work for review. I learned why history matters: a clear commit message makes a change understandable weeks later, and a branch keeps unfinished work away from the stable code.', 'FirstParagraph');
  d.h2('3.8 Technical Documentation and Professional Communication');
  d.p('Documentation formed a large part of the work. I wrote a README with a quick start and a table of commands, and automated the documentation itself: a script drives the application in a headless browser, takes screenshots and draws numbered callouts on key elements, and further scripts assemble a PDF guide and a Word report from the same source so that the text and the numbers cannot drift apart. I also prepared a timed five-minute presentation script for demonstrating the system. Writing for different readers, a developer, a supervisor and an audience, showed me how much the same facts need to be reshaped for each.', 'FirstParagraph');
  d.h2('3.9 Soft Skills and Professional Conduct');
  d.bullets([
    ['Punctuality and discipline', 'Keeping to working hours and delivering tasks on the agreed days.'],
    ['Communication', 'Explaining technical decisions to supervisors and facilitators in plain language, and asking for clarification early.'],
    ['Receiving feedback', 'Treating review comments as input to improve the work.'],
    ['Time management', 'Breaking the project into stages and finishing each one before starting the next.'],
    ['Integrity', 'Staying within the ethical boundaries of security work and reporting limitations honestly.'],
  ]);
  d.p('<<Add or adjust points to reflect your own experience at HiiT.>>');
  d.h2('3.10 Challenges Encountered and How They Were Solved');
  d.caption('Table 3.1: Challenges and Solutions');
  d.table(['Challenge', 'How it was solved'], [
    ['Healthy cameras were flagged because their regular traffic looked like beaconing.', 'Beaconing is now judged against a per-device baseline, so regular traffic to known peers is ignored while the same regularity to a new peer is reported.'],
    ['The large-transfer rule did not fire on the simulated upload.', 'The standard library treats documentation address ranges as private. I replaced it with an explicit list of LAN ranges.'],
    ['No Docker daemon was available in the development environment.', 'I ran the simulators, the fake C2 and the detector directly as Python processes to verify the laboratory logic, and documented that the container layer still needs a run on a machine with Docker.'],
    ['Screenshots of long tables spilled over several pages of the documentation.', 'The capture script now shows the first rows and a "more findings not shown" line.'],
    ['The baseline is kept in memory and may not be shared between server workers.', 'Recorded as a known limitation, with single-worker or shared-storage options recommended.'],
    ['<<Add a challenge you faced at HiiT>>', '<<How you solved it>>'],
  ], [4300, 4726]);
  d.h2('3.11 Conclusion');
  d.p('The placement gave me practical experience in network analysis, cybersecurity, containers, Python development, testing, version control and documentation. The most important lesson was that good engineering is iterative: design, build, test, find what is wrong, correct it and write down what was learned.', 'FirstParagraph');

  // ------------------------------------------------------------------ CHAPTER FOUR
  d.h1('CHAPTER FOUR: MINI PROJECT: DESIGN AND IMPLEMENTATION OF A NETWORK-FLOW-BASED TROJAN HORSE DETECTION SYSTEM FOR IoT DEVICES');
  d.h2('4.0 Introduction');
  d.p('This chapter presents the mini project I carried out at HiiT Plc. It follows the usual structure of a software engineering project: background, problem, aim and objectives, tools, methodology, requirements, design, implementation, testing and results, discussion, limitations and conclusions.', 'FirstParagraph');
  d.h2('4.1 Background');
  d.p('IoT devices such as IP cameras are inexpensive, always connected and often protected only by default passwords. Once compromised, a camera continues to stream video while it quietly contacts a command-and-control server, scans other hosts or uploads data. Because the device cannot host security software, the behaviour has to be detected from outside, in the traffic it produces. Flow records, which summarise who talked to whom, on which port, how often and how much, provide exactly that view without needing the payload.', 'FirstParagraph');
  d.h2('4.2 Problem Statement');
  d.bullets([
    ['No on-device protection', 'IoT devices cannot run endpoint security agents, so detection must happen on the network.'],
    ['Signature dependence', 'Signatures recognise only malware that has already been analysed; behaviour is a more durable indicator.'],
    ['Legitimate regularity', 'Healthy camera traffic is also periodic, so a naive beacon detector produces false positives.'],
    ['Safe evaluation', 'Detection logic must be demonstrated without handling real malware and without risk to real networks.'],
  ]);
  d.h2('4.3 Aim and Objectives');
  d.p('**Aim:** to design, implement and test a lightweight, agentless system that detects trojan-like behaviour on IoT devices from network-flow data, explains its findings in standard terms and supports containment, together with a safe laboratory for demonstrating it.', 'FirstParagraph');
  d.p('**Objectives:**');
  d.numbered([
    'Define a tool-neutral flow-record CSV schema that can be produced from Zeek, Suricata or router exports.',
    'Implement a detection engine for known-bad destinations, suspicious and unusual ports, beaconing, scan bursts and large outbound transfers.',
    'Support an optional per-device baseline so that legitimate periodic traffic is not reported.',
    'Map every finding to a MITRE ATT&CK technique and compute a per-device risk score and status.',
    'Provide a web interface and API for uploading CSV files, viewing findings and quarantining a device.',
    'Build an isolated Docker laboratory with simulated cameras, a harmless trojan and a fake C2 server.',
    'Verify the system with automated, positive, negative and laboratory tests.',
  ], 'num2');
  d.h2('4.4 Scope and Limitations');
  d.p('The system analyses flow records; it does not inspect payloads, use machine learning or see inside encrypted traffic. Its rules are heuristic and were tuned on simulated data. Flow telemetry in the laboratory is produced by the simulators rather than captured from a wire, quarantine in the laboratory is a marker file, and the baseline is held in memory. These limits are discussed in Section 4.13.', 'FirstParagraph');
  d.h2('4.5 Tools and Technologies');
  d.caption('Table 4.1: Tools and Technologies Used');
  d.table(['Tool', 'Purpose'], [
    ['Python 3.11+', 'Analysis engine, web application and simulators.'],
    ['Flask and gunicorn', 'Web interface, JSON API and production server.'],
    ['Docker and Docker Compose', 'Isolated multi-container laboratory with internal and edge networks.'],
    ['MediaMTX and ffmpeg', 'Looping synthetic RTSP video stream for the simulated cameras.'],
    ['pytest', 'Automated testing.'],
    ['Git and GitHub', 'Version control and pull-request review.'],
    ['Playwright and Chromium', 'Automated screenshots and PDF generation for the documentation.'],
    ['Microsoft Word', 'Editable project report.'],
  ], [3000, 6026]);
  d.h2('4.6 Methodology');
  d.p('I used an incremental approach in which each stage produced something that could be run and tested before the next began. The stages were: (1) define the flow schema and generate deterministic sample data; (2) write the parser and a first set of rules and test them on the samples; (3) add the baseline and refine the rules after the defects found in testing; (4) add the web application and API; (5) build the simulators and the Docker laboratory; (6) add quarantine and release; (7) write the documentation and automate its screenshots. Writing the tests alongside each stage made it safe to change the rules later.', 'FirstParagraph');
  d.h2('4.7 System Requirements');
  d.h3('4.7.1 Functional Requirements');
  d.caption('Table 4.2: Functional Requirements');
  d.table(['ID', 'Requirement'], [
    ['FR1', 'The system shall accept a flow CSV upload and optionally a baseline CSV.'],
    ['FR2', 'The system shall accept common column aliases and ISO-8601 or epoch timestamps.'],
    ['FR3', 'The system shall reject malformed or incomplete files with a message naming the problem.'],
    ['FR4', 'The system shall detect contact with known-bad addresses and use of suspicious or unusual ports.'],
    ['FR5', 'The system shall detect periodic beaconing to peers outside a device\'s baseline.'],
    ['FR6', 'The system shall detect scan-like bursts and large outbound transfers.'],
    ['FR7', 'The system shall give every finding a severity, evidence and a MITRE ATT&CK technique.'],
    ['FR8', 'The system shall compute a per-device risk score and a status of clean, suspicious or compromised.'],
    ['FR9', 'The user shall be able to quarantine and release a device.'],
    ['FR10', 'The system shall provide a laboratory that can infect and clean a simulated camera safely.'],
  ], [900, 8126], { center: [0] });
  d.h3('4.7.2 Non-Functional Requirements');
  d.caption('Table 4.3: Non-Functional Requirements');
  d.table(['ID', 'Requirement'], [
    ['NFR1', 'Safety: no real malware; the laboratory network has no route to the internet.'],
    ['NFR2', 'Repeatability: sample data and laboratory behaviour are deterministic and can be regenerated.'],
    ['NFR3', 'Usability: the interface is a single page, readable on a phone, with clear error messages.'],
    ['NFR4', 'Maintainability: the engine is independent of the web layer and thresholds are named constants.'],
    ['NFR5', 'Security of the application: uploads are size-limited, output is escaped and device names are validated.'],
    ['NFR6', 'Portability: runs with Python alone or with Docker Compose.'],
  ], [900, 8126], { center: [0] });
  d.h2('4.8 System Design');
  d.h3('4.8.1 Architecture and Processing Pipeline');
  d.p('The overall architecture is the one shown in Figure 3.1. Inside the detector, data moves through the pipeline in Figure 4.1: the CSV is parsed and normalised, an optional baseline is built from known-good traffic, six rule families are evaluated for each device, findings are scored, and a JSON result is returned to the interface.', 'FirstParagraph');
  d.figure('fig-pipeline.png', 'Figure 4.1: Detection pipeline from flow CSV to scored result', 560);
  d.h3('4.8.2 Data Model');
  d.caption('Table 4.4: Flow Record Schema (Input CSV)');
  d.table(['Field', 'Type', 'Required', 'Notes'], [
    ['timestamp', 'ISO-8601 or epoch seconds', 'Yes', 'Rows are sorted by time after parsing.'],
    ['device', 'string', 'Yes', 'Grouping key for all per-device logic.'],
    ['src_ip, dst_ip', 'string', 'Yes', 'Classed as LAN or external using RFC 1918, loopback, link-local and multicast ranges.'],
    ['dst_port', 'integer', 'Yes', 'Destination port.'],
    ['protocol', 'string', 'Yes', 'Upper-cased (TCP, UDP and so on).'],
    ['bytes_out', 'integer', 'Yes', 'Bytes sent by the device in the flow.'],
    ['bytes_in, packets, duration', 'number', 'No', 'Optional; accepted for compatibility.'],
  ], [2100, 1900, 1100, 3926]);
  d.p('The engine returns a structured result:');
  d.code(['finding = { device, rule, severity, title, detail, mitre,', '            evidence: {dst_ip, dst_port, flows, interval_s, jitter_cv, ...},', '            first_seen, last_seen }',
    'device  = { device, flows, bytes_out, src_ips[], score, status, findings }', 'result  = { summary: {flows, devices, findings, compromised, suspicious, with_baseline},', '            devices[], findings[], quarantined[] }']);
  d.h3('4.8.3 Detection Rule Design');
  d.caption('Table 4.5: Detection Rules, Thresholds and ATT&CK Mapping');
  d.table(['Rule', 'Severity', 'Fires when', 'ATT&CK'], facts.rules, [1500, 1000, 5226, 1300]);
  d.p('Two design decisions matter most. First, beaconing is tested only for peers outside the device\'s baseline, because healthy traffic is also periodic; with no baseline, regular traffic on well-known service ports is ignored unless the peer is on the known-bad list. Second, beaconing is measured by the coefficient of variation (standard deviation divided by the mean) of the gaps between flows: a 15-second timer with about 4 percent jitter scores about 0.02, far below the 0.25 limit, whereas interactive traffic scores much higher.');
  d.h3('4.8.4 Risk Scoring');
  d.p(`Each finding adds a weight (critical ${facts.severity_score.critical}, high ${facts.severity_score.high}, medium ${facts.severity_score.medium}, low ${facts.severity_score.low}) and a device's score is the sum capped at 100. A score below 10 is **clean**, 10 to 49 is **suspicious** and 50 or above is **compromised**. One critical and one high finding are therefore enough for compromised, while a single unusual port only raises suspicion.`, 'FirstParagraph');
  d.h3('4.8.5 Laboratory Design');
  d.caption('Table 4.6: Laboratory Addressing Plan');
  d.table(['Host', 'IP address', 'Networks', 'Published port'], [
    ['rtsp', '10.50.0.2', 'lab, edge', '8554 (RTSP)'], ['cam-lobby', '10.50.0.11', 'lab, edge', '8081 (admin page)'], ['cam-garage (and trojan sidecar)', '10.50.0.12', 'lab only', 'none'],
    ['c2', '10.50.0.66', 'lab only', 'none'], ['detector', '10.50.0.100', 'lab, edge', '8080 (web interface)'],
  ], [3100, 1900, 1800, 2226]);
  d.p('The lab network is declared internal, so no container on it can reach the internet. The trojan simulator shares the network namespace of cam-garage, so every connection it makes carries that camera\'s address, as a trojan on the real device would.');
  d.h3('4.8.6 Security Design');
  d.bullets([
    'No real malware is used; the simulator reproduces indicators only and contains no payload.',
    'Uploads are limited to 25 MB and parsed defensively; more than 50 malformed rows aborts the parse.',
    'Device names used as file names must match a strict pattern, which blocks path traversal.',
    'All data shown in the interface is HTML-escaped.',
    'Sample names are checked against a fixed list before any file is opened.',
  ]);
  d.h2('4.9 Implementation');
  d.h3('4.9.1 Core Logic');
  d.p('The parser maps column names to canonical names and their aliases and raises a readable error when a required column is missing:', 'FirstParagraph');
  d.code(excerpt('trojan-lab/detector/engine.py', 'cols = {c.strip().lower()', 12));
  d.p('The beaconing rule skips peers that are part of the baseline, then tests the remaining groups for regular timing and size:');
  d.code(excerpt('trojan-lab/detector/engine.py', 'for (ip, port), fs in groups.items():', 17));
  d.p('Scores and statuses are derived from the findings:');
  d.code(excerpt('trojan-lab/detector/engine.py', 'devices = []', 8));
  d.h3('4.9.2 Web Application and API');
  d.caption('Table 4.7: HTTP Endpoints');
  d.table(['Endpoint', 'Purpose'], [
    ['GET /', 'Single-page user interface.'],
    ['POST /api/analyze', 'Multipart upload of [[flows]] and an optional [[baseline]]; returns the result JSON (400 on bad CSV, 413 above 25 MB).'],
    ['POST /api/analyze/sample', 'Runs the bundled infected or clean sample against the bundled baseline.'],
    ['POST /api/analyze/live', 'Analyses the live capture written by the laboratory.'],
    ['POST /api/baseline/live', 'Freezes the current live capture as the baseline.'],
    ['POST, DELETE /api/quarantine/<device>', 'Creates or removes the quarantine marker for a device.'],
    ['GET /health', 'Liveness check.'],
  ], [3200, 5826]);
  d.code(excerpt('trojan-lab/detector/app.py', '@app.post("/api/quarantine/<device>")', 8));
  d.h3('4.9.3 Simulators');
  d.p('Each simulated camera serves an admin page with the deliberately weak login admin/admin and writes realistic flows: about 2 MB of video to the recorder every ten seconds, and a periodic NTP query, DNS query and cloud heartbeat. The trojan simulator drops a hidden file containing the EICAR test string and a cron.d entry, beacons to the fake C2 every 15 seconds, performs a short scan-like burst on port 23, logs one large-upload record and, when a quarantine marker appears, deletes its files and exits:', 'FirstParagraph');
  d.code(excerpt('trojan-lab/trojan_sim/kworker_upd.py', 'def beacon():', 10));
  d.h3('4.9.4 User Interface');
  d.p('The interface is a single HTML page. Figures 4.2 to 4.5 show its main states; the red numbered boxes match the numbered explanations beneath each figure.');
  let fig = 1, nl = 2;
  const show = (id, w) => { const s = scr(id); fig += 1; nl += 1; d.figure(`${id}.png`, `Figure 4.${fig}: ${s.title}`, w); d.numbered(s.callouts, 'num' + nl); };
  show('01-landing', 560);
  show('04-results', 560);
  show('05-findings', 560);
  show('08-quarantine', 560);
  d.p('The layout is responsive. On a phone the cards stack, the summary tiles reflow into two columns and the tables scroll inside their own cards, so the page itself never scrolls sideways.');
  show('m02-results', 230);

  d.h2('4.10 Testing and Results');
  d.h3('4.10.1 Automated Tests');
  d.p(`The project has ${NT} pytest tests that run in under a second without Docker; all ${NT} passed at the time of writing.`, 'FirstParagraph');
  const purpose = {
    test_upload_with_baseline: ['Analysing the infected sample with a baseline upload gives one compromised device and with_baseline = true.', 'Positive'],
    test_upload_rejects_bad_csv: ['A CSV missing required columns returns HTTP 400 with a clear message.', 'Negative'],
    test_no_file: ['A request with no file returns HTTP 400.', 'Negative'],
    test_sample_and_quarantine_roundtrip: ['Sample analysis finds one compromised device; an invalid sample name is rejected; quarantine and release create and remove the marker.', 'Both'],
    test_quarantine_rejects_traversal: ['A path-traversal device name is refused.', 'Negative'],
    test_clean_capture_has_no_findings: ['The clean capture gives no findings, with and without a baseline.', 'Negative'],
    test_infected_device_flagged_others_clean: ['Only cam-garage is compromised and the expected rules fire; the other cameras stay clean.', 'Positive'],
    test_beacon_interval_reported: ['The beacon destination is 203.0.113.66 and the interval is between 14 and 16 seconds.', 'Positive'],
    test_column_aliases_and_epoch: ['A CSV with aliases and epoch timestamps parses and a beacon is detected.', 'Positive'],
    test_missing_columns_message: ['The error message names the missing column.', 'Negative'],
    test_empty_or_headers_only: ['An empty file and a headers-only file are rejected.', 'Negative'],
    test_irregular_traffic_not_beacon: ['Thirty flows with random gaps and sizes are not reported as beaconing.', 'Negative'],
  };
  const seen = new Set(), rows = [];
  for (const t of facts.tests) {
    const base = t.replace(/\[.*$/, ''); if (seen.has(base)) continue; seen.add(base);
    const n = facts.tests.filter((x) => x.replace(/\[.*$/, '') === base).length;
    const [desc, kind] = purpose[base] || ['', ''];
    rows.push([base + (n > 1 ? ` (x${n})` : ''), kind, desc]);
  }
  d.caption('Table 4.8: Automated Tests and What They Prove');
  d.table(['Test', 'Type', 'Behaviour verified'], rows, [3000, 1150, 4876]);
  d.h3('4.10.2 Defects Found and Their Remediation');
  d.caption('Table 4.9: Defects, Remediation and Status');
  d.table(['#', 'Severity', 'Defect', 'Remediation / status'], [
    ['1', 'High', 'The first beaconing rule reported legitimate periodic traffic (video, NTP, cloud heartbeats) as beacons, so the clean capture produced findings.', 'Beaconing now applies only to peers outside the baseline (or, with no baseline, off well-known service ports). Fixed.'],
    ['2', 'High', 'The large-transfer rule did not fire because Python\'s ipaddress.is_private also covers the documentation ranges 198.51.100.0/24 and 203.0.113.0/24 used for the lab\'s stand-in internet hosts.', 'LAN membership is decided by an explicit list of private, loopback, link-local and multicast ranges. Fixed.'],
    ['3', 'Medium', 'The baseline is held in process memory, so it is lost on restart and may not be shared between server workers.', 'Documented as a limitation; single worker or shared storage recommended. Open.'],
  ], [450, 900, 4200, 3476], { center: [0, 1] });
  d.h3('4.10.3 Detection Results on the Sample Captures');
  d.p(`The infected sample (${fmtN(inf.summary.flows)} flows across ${inf.summary.devices} cameras) was analysed against the baseline. The engine reported ${inf.summary.findings} findings (${sevText}), all on cam-garage, which scored ${garage.score} and was marked compromised. Table 4.10 shows one finding for each rule that fired and Table 4.11 compares the per-device outcome for the infected and clean captures.`, 'FirstParagraph');
  d.caption('Table 4.10: One Finding per Rule from the Infected Sample');
  d.table(['Severity', 'Finding', 'Evidence', 'ATT&CK'], inf.per_rule, [900, 2400, 4226, 1500]);
  d.caption('Table 4.11: Per-Device Results, Infected and Clean Captures');
  const devRows = [];
  for (const dv of inf.devices) devRows.push(['Infected', dv.device, fmtN(dv.flows), String(dv.score), dv.status, String(dv.findings)]);
  for (const dv of cln.devices) devRows.push(['Clean', dv.device, fmtN(dv.flows), String(dv.score), dv.status, String(dv.findings)]);
  d.table(['Capture', 'Device', 'Flows', 'Risk score', 'Status', 'Findings'], devRows, [1300, 1900, 1100, 1300, 1900, 1526], { center: [2, 3, 5] });
  d.h3('4.10.4 Positive Functional Tests');
  d.caption('Table 4.12: Positive Test Cases');
  d.table(['#', 'Test case', 'Expected result', 'Outcome'], [
    ['P1', 'Analyse the infected sample with the baseline.', 'cam-garage compromised; two other cameras clean.', 'Pass'],
    ['P2', 'Analyse the clean sample with and without the baseline.', 'Zero findings; all devices clean.', 'Pass'],
    ['P3', 'Upload the infected capture and baseline through the API.', 'HTTP 200; one compromised device.', 'Pass'],
    ['P4', 'Upload a CSV using aliases and epoch timestamps.', 'Parsed correctly; beacon detected.', 'Pass'],
    ['P5', 'Check the reported beacon.', 'Destination 203.0.113.66; interval about 15 s.', 'Pass'],
    ['P6', 'Quarantine cam-garage, then release it.', 'Marker created and listed; marker removed on release.', 'Pass'],
    ['P7', 'Run the simulators locally and analyse the live capture.', 'Flows detected; quarantine stops the simulator.', 'Pass'],
  ], [600, 3600, 3826, 1000], { center: [0, 3] });
  d.h3('4.10.5 Negative Tests');
  d.caption('Table 4.13: Negative Test Cases');
  d.table(['#', 'Test case', 'Expected result', 'Outcome'], [
    ['N1', 'Upload a CSV missing required columns.', 'HTTP 400 naming the missing columns.', 'Pass'],
    ['N2', 'Upload an empty or headers-only file.', 'Rejected with an error message.', 'Pass'],
    ['N3', 'Call the analyse endpoint with no file.', 'HTTP 400.', 'Pass'],
    ['N4', 'Request a sample named ../etc/passwd.', 'HTTP 400; no file access.', 'Pass'],
    ['N5', 'Quarantine a device name containing a path-traversal sequence.', 'Request refused.', 'Pass'],
    ['N6', 'Analyse thirty flows with irregular gaps and sizes.', 'No beaconing finding.', 'Pass'],
    ['N7', 'Analyse the clean capture.', 'No findings (no false positives).', 'Pass'],
  ], [600, 3600, 3826, 1000], { center: [0, 3] });
  d.h3('4.10.6 Laboratory Run of the Simulators');
  d.p('No Docker daemon was available in my development environment, so I exercised the laboratory logic by running the simulators directly as Python processes. The fake C2 server logged the beacons; the shared CSV held 21 flow records; and the engine, run without a baseline, reported five findings on the device (a known-bad address, suspicious port 23, a scan burst, a large transfer to 198.51.100.77 and an unusual port) and marked it compromised. When I created the quarantine marker, the simulator reported it, removed its two persistence files and exited. In this accelerated one-second run no beaconing finding appeared; the 15-second cadence of the real simulator is covered by the sample-data tests. The container layer itself (networking, RTSP, volume sharing) has still to be validated with docker compose up --build on a machine with Docker.', 'FirstParagraph');
  d.h2('4.11 Discussion of Results');
  d.p('The results show that useful detection is possible from flow data alone. No single rule is proof of compromise, since an unusual port may be a mistake and a periodic flow may be a heartbeat, but the combination is persuasive: in the infected sample the same camera contacts a known-bad address, beacons at a fixed interval to a peer it never used before, scans the network and sends a large volume to an unknown host, and its score reflects that accumulation. The clean capture, which is just as regular, produces no findings, which shows that the baseline logic does its job.', 'FirstParagraph');
  d.p('The most instructive result was the false-positive defect. A detector that treats all regularity as suspicious is unusable on cameras, and the fix, judging regularity only against peers outside the baseline, is a small change that makes the difference between a toy and a tool.');
  d.h2('4.12 Challenges Encountered');
  d.p('The main challenges are listed in Table 3.1. In addition, choosing thresholds without real attack data was difficult: the values in the engine (six events, a coefficient of variation of 0.25, ten distinct targets in 60 seconds, 5 MB for exfiltration) are reasonable starting points but need tuning against real traffic.', 'FirstParagraph');
  d.h2('4.13 Limitations');
  d.bullets([
    'The rules are heuristic and were tested on simulated data; a patient attacker could vary intervals and sizes beyond the thresholds.',
    'Encrypted payloads cannot be inspected; the system reasons only about metadata.',
    'Laboratory telemetry is generated by the simulators, not captured from a wire.',
    'Quarantine in the laboratory is a marker file; the application has no built-in authentication.',
    'The baseline is held in memory and may not be shared between server workers.',
    'The Docker container layer has not been run end to end in my environment.',
  ]);
  d.h2('4.14 Recommendations and Future Work');
  d.bullets([
    'Ingest real telemetry from Zeek, Suricata or NetFlow/IPFIX and map addresses to device names from DHCP or an asset inventory.',
    'Store baselines in a database or file and refresh them on a schedule.',
    'Place the application behind a TLS reverse proxy with single sign-on, and connect quarantine to a firewall or network access control system.',
    'Load threat-intelligence feeds into the known-bad list and tune thresholds on real traffic.',
    'Evaluate on public IoT datasets and measure detection and false-positive rates; consider learned baselines and streaming analysis.',
  ]);
  d.h2('4.15 Conclusion');
  d.p(`The mini project achieved its objectives. I designed, implemented and tested an agentless, flow-based Trojan Horse detection system for IoT devices, together with a safe Docker laboratory in which infection, detection and containment can be demonstrated repeatably. All ${NT} automated tests pass, the clean capture produces no false positives, and the infected capture is identified with one compromised device and no collateral flags.`, 'FirstParagraph');

  // ------------------------------------------------------------------ CHAPTER FIVE
  d.h1('CHAPTER FIVE: SUMMARY, CONCLUSION AND RECOMMENDATIONS');
  d.h2('5.1 Summary');
  d.p('This report has described my SIWES training at HiiT Plc. Chapter One explained the origin, aims and structure of SIWES. Chapter Two presented the history, services and units of HiiT Plc, my placement details, the work I completed and a review of the organisation. Chapter Three recorded the experience I gained in network analysis, cybersecurity, containers, Python development, testing, version control and documentation. Chapter Four presented the mini project: the design, implementation and testing of a network-flow-based Trojan Horse detection system for IoT devices and its simulated laboratory.', 'FirstParagraph');
  d.h2('5.2 Knowledge and Skills Acquired');
  d.bullets([
    'Reading network-flow data for behaviour and distinguishing normal regularity from malicious regularity.',
    'Describing threats with MITRE ATT&CK and studying malicious behaviour safely and ethically.',
    'Building isolated, repeatable laboratories with Docker Compose.',
    'Designing layered, testable Python programs with a Flask web interface and JSON API.',
    'Writing automated tests, diagnosing defects and recording their remediation.',
    'Using Git and GitHub for version control and review.',
    'Producing professional documentation, including automated screenshots, a PDF guide and a Word report.',
    'Time management, communication and ethical conduct in a technical workplace.',
  ]);
  d.h2('5.3 Conclusion');
  d.p('SIWES did what it is meant to do. It turned the concepts from my courses into skills I can demonstrate, exposed me to the standards of a professional organisation and sharpened my interest in cybersecurity. I leave the placement better prepared for the remainder of my degree and for a career in software engineering and security.', 'FirstParagraph');
  d.h2('5.4 Recommendations');
  d.h3('5.4.1 To the Host Organisation');
  d.bullets(['Give interns a written task schedule and learning outcomes at the start of the placement.', 'Assign each intern a project with a named reviewer and a defined deliverable.', 'Provide backup power and redundant connectivity for laboratories.', 'Arrange supervised portfolio presentations at the end of the placement.']);
  d.h3('5.4.2 To the University and the Department');
  d.bullets(['Introduce practical security, containers and version-control content earlier in the programme.', 'Increase the number and quality of supervisory visits and feedback during the placement.', 'Keep a record of host organisations rated by past students.']);
  d.h3('5.4.3 To the ITF and Regulators');
  d.bullets(['Pay student allowances promptly.', 'Strengthen monitoring so that tasks match the student\'s discipline.', 'Encourage more technology companies to host ICT students.']);
  d.h3('5.4.4 To Future SIWES Students');
  d.bullets(['Treat the logbook as a daily habit and not a last-week task.', 'Build a portfolio of documented projects during the placement.', 'Ask questions, accept correction and keep ethical boundaries in every technical activity.']);

  // ------------------------------------------------------------------ references and appendices
  d.h1('REFERENCES');
  d.bullets([
    'Antonakakis, M., April, T., Bailey, M., et al. (2017). Understanding the Mirai botnet. Proceedings of the 26th USENIX Security Symposium, Vancouver.',
    'BusinessDay. (2020). HiiT Plc offers N20 million digital skills acquisition scholarship to Nigerian students. https://businessday.ng/technology/article/hiit-plc-offers-n20-million-digital-skills-acquisition-scholarship-to-nigerian-students/',
    'Claise, B. (Ed.). (2004). RFC 3954: Cisco Systems NetFlow Services Export Version 9. Internet Engineering Task Force.',
    'Claise, B., Trammell, B., & Aitken, P. (Eds.). (2013). RFC 7011: Specification of the IP Flow Information Export (IPFIX) Protocol. Internet Engineering Task Force.',
    'Docker, Inc. (n.d.). Docker and Docker Compose documentation. https://docs.docker.com',
    'EICAR. (n.d.). Anti-malware testing standard file. https://www.eicar.org',
    'Federal Republic of Nigeria. (2015). Cybercrimes (Prohibition, Prevention, etc.) Act, 2015.',
    'HiiT Plc. (n.d.). Company profile and training programme information. Lagos, Nigeria. <<add the page or document you used>>',
    'Industrial Training Fund. (n.d.). Students\' Industrial Work Experience Scheme (SIWES): information and guidelines. Jos, Nigeria: ITF.',
    'MITRE Corporation. (n.d.). MITRE ATT&CK. https://attack.mitre.org',
    'Paxson, V. (1999). Bro: a system for detecting network intruders in real time. Computer Networks, 31(23-24).',
    'Pallets Projects. (n.d.). Flask documentation. https://flask.palletsprojects.com',
  ]);
  d.h1('APPENDIX A: CORE SOURCE CODE OF THE DETECTION SYSTEM');
  d.p('The complete source is in the project repository (trojan-lab/). The excerpts below are the parts discussed in Chapter Four.', 'FirstParagraph');
  d.h3('A.1 Address classification (engine.py)');
  d.code(excerpt('trojan-lab/detector/engine.py', '_INTERNAL = [ipaddress', 12));
  d.h3('A.2 Baseline construction (engine.py)');
  d.code(excerpt('trojan-lab/detector/engine.py', 'def build_baseline', 16));
  d.h3('A.3 Beaconing rule (engine.py)');
  d.code(excerpt('trojan-lab/detector/engine.py', 'for (ip, port), fs in groups.items():', 28));
  d.h3('A.4 Scan-burst rule (engine.py)');
  d.code(excerpt('trojan-lab/detector/engine.py', '# 5. Scan burst', 15));
  d.h3('A.5 Quarantine endpoints (app.py)');
  d.code(excerpt('trojan-lab/detector/app.py', '@app.post("/api/quarantine/<device>")', 17));
  d.h3('A.6 Trojan simulator main loop (kworker_upd.py)');
  d.code(excerpt('trojan-lab/trojan_sim/kworker_upd.py', 'def main():', 20));
  d.h3('A.7 Laboratory services (docker-compose.yml)');
  d.code(excerpt('trojan-lab/docker-compose.yml', '  trojan:', 9));
  d.h1('APPENDIX B: SIWES LOGBOOK EXTRACT');
  d.p('<<Attach scanned or typed pages of the SIWES logbook signed by the industry-based supervisor. The table below can be used as a weekly summary.>>', 'FirstParagraph');
  d.caption('Table B.1: Weekly Summary of Activities');
  const weeks = [];
  for (let i = 1; i <= 12; i++) weeks.push([`Week ${i}`, '<<dates>>', '<<activities>>', '<<remark>>']);
  d.table(['Week', 'Dates', 'Activities carried out', 'Supervisor\'s remark'], weeks, [1000, 1700, 4426, 1900]);
  d.h1('APPENDIX C: CERTIFICATES AND SUPPORTING DOCUMENTS');
  d.p('<<Attach the SIWES completion letter, training certificate(s), and any other supporting documents.>>', 'FirstParagraph');
  d.h1('APPENDIX D: GLOSSARY OF TECHNICAL ACRONYMS');
  d.table(['Acronym', 'Definition'], [
    ['ATT&CK', 'Adversarial Tactics, Techniques and Common Knowledge (MITRE)'], ['C2', 'Command and Control'], ['CPN', 'Computer Professionals Registration Council of Nigeria'],
    ['CV', 'Coefficient of Variation (standard deviation divided by mean)'], ['EICAR', 'European Institute for Computer Antivirus Research (test file standard)'],
    ['IoT', 'Internet of Things'], ['IPFIX', 'IP Flow Information Export'], ['ITF', 'Industrial Training Fund'], ['NTP', 'Network Time Protocol'], ['RTSP', 'Real Time Streaming Protocol'],
    ['SIWES', 'Student Industrial Work Experience Scheme'], ['SWOT', 'Strengths, Weaknesses, Opportunities, Threats'], ['TLS', 'Transport Layer Security'],
  ], [2000, 7026]);

  // ------------------------------------------------------------------ assemble: cover, front matter, contents, chapters
  const body = [...cover, ...d.blocks.slice(0, tocAt), ...tocParagraphs(d.toc, pages), ...d.blocks.slice(tocAt)];
  return { doc: makeDocument({ title: 'SIWES Report: HiiT Plc, Network-Flow-Based Trojan Horse Detection System for IoT Devices', creator: 'Student', body }), toc: d.toc };
}

buildTwoPass(build, OUT);
