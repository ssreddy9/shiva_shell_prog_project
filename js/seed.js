// Starting data taken from "SHIVA / WEEKLY DESK PLANNER" and "LEARNING CHECKLIST".

import { db, getSetting, setSetting } from './db.js';

// day: 0 = Sunday ... 6 = Saturday. cat: fitness | career | reading | personal
// track: shows a check-off box on the Today page and counts toward weekly goals.
const B = (id, day, start, end, title, cat, track = false, note = '') => ({ id, day, start, end, title, cat, track, note });

export const SCHEDULE = [
  // Monday
  B('mon-gym', 1, '18:40', '19:25', 'Gym (warm-up 10 · gym 30 · cool-down 5)', 'fitness', true),
  B('mon-dinner', 1, '19:25', '20:00', 'Shower + dinner', 'personal'),
  B('mon-study', 1, '20:00', '21:15', 'AWS architecture study', 'career', true),
  B('mon-relax', 1, '21:15', '22:30', 'Relax', 'personal'),
  // Tuesday
  B('tue-dinner', 2, '18:30', '19:30', 'Dinner + break', 'personal', false, 'Rest from scheduled exercise'),
  B('tue-study', 2, '19:30', '20:45', 'Python / API automation lab', 'career', true),
  B('tue-free', 2, '20:45', '22:30', 'Free time', 'personal'),
  // Wednesday
  B('wed-jog', 3, '18:40', '19:10', 'Easy jog / walk (warm-up 5 · jog 20 · cool-down 5)', 'fitness', true),
  B('wed-dinner', 3, '19:10', '20:00', 'Shower + dinner', 'personal'),
  B('wed-study', 3, '20:00', '21:00', 'Applications / interview practice', 'career', true),
  B('wed-read', 3, '21:30', '21:50', 'Read a book', 'reading', true),
  // Thursday
  B('thu-dinner', 4, '18:30', '19:30', 'Dinner + break', 'personal', false, 'Rest from scheduled exercise'),
  B('thu-study', 4, '19:30', '20:45', 'AWS / network troubleshooting', 'career', true),
  B('thu-free', 4, '20:45', '22:30', 'Free time', 'personal'),
  // Friday
  B('fri-gym', 5, '18:40', '19:25', 'Gym (warm-up 10 · gym 30 · cool-down 5)', 'fitness', true),
  B('fri-dinner', 5, '19:25', '20:00', 'Shower + dinner', 'personal'),
  B('fri-free', 5, '20:00', '22:30', 'Photos, writing or friends', 'personal', false, 'No required study'),
  // Saturday
  B('sat-hike', 6, null, null, 'Hike / outdoor adventure', 'fitness', true, 'Timing depends on the outing. Rest day if no outing is planned.'),
  B('sat-personal', 6, null, null, 'Errands, hobbies and personal time', 'personal'),
  // Sunday
  B('sun-recovery', 0, null, null, 'Recovery / unscheduled activity', 'fitness'),
  B('sun-portfolio', 0, '10:00', '12:00', 'Portfolio build', 'career', true),
  B('sun-photos', 0, '13:00', '17:00', 'Afternoon: photos / personal time', 'personal'),
  B('sun-review', 0, '18:00', '18:45', 'Weekly review', 'career', true),
  B('sun-read', 0, '21:30', '21:50', 'Read a book', 'reading', true),
];

export const ANCHORS = [
  'Office Mon–Fri, 9 AM–5 PM (sometimes 6 PM) · Home 6:30 PM',
  'Wake 7–7:30 AM · keep mornings for breakfast, getting ready and travel',
  'Wind down from 10:30 PM · sleep 11 PM–midnight',
  'Busy day? Shorten or skip a session rather than delaying sleep.',
];

// Weekly targets from "Weekly plan: 7.5 hours of career work + 2 gym sessions + 1 jog/walk + 2 reading sessions."
export const WEEKLY_GOALS = { careerMinutes: 450, gym: 2, jog: 1, reading: 2 };

const START = '2026-09-28';
const L = (week, range, focus, checkpoint) => ({
  id: 'w' + week, week, range, focus, checkpoint,
  tasks: checkpoint.replace(/\.$/, '').split('; ').map((t, i) => ({ id: i, text: t[0].toUpperCase() + t.slice(1), done: false })),
  done: false, notes: '',
});
export const LEARNING = [
  L(1, 'Sep 28 – Oct 4', 'Baseline + lab setup', 'Review AWS exam topics; assess Linux, routing and Python; create a learning folder.'),
  L(2, 'Oct 5 – 11', 'IAM, accounts and cloud basics', 'Explain users, roles and least privilege; set lab cost alerts before paid resources.'),
  L(3, 'Oct 12 – 18', 'VPCs, subnets and routes', 'Draw a packet path; compare route tables, security groups and network ACLs.'),
  L(4, 'Oct 19 – 25', 'Compute and storage', 'Build a small EC2/S3 lab; document access and teardown; review your weekly routine.'),
  L(5, 'Oct 26 – Nov 1', 'Availability and scaling', 'Explain load balancing, scaling and multi-AZ design; sketch a resilient application.'),
  L(6, 'Nov 2 – 8', 'Databases and recovery', 'Compare RDS and DynamoDB use cases; explain backups and recovery trade-offs.'),
  L(7, 'Nov 9 – 15', 'Python files and JSON', 'Write a script that checks a synthetic network inventory; handle bad inputs.'),
  L(8, 'Nov 16 – 22', 'APIs, logs and monitoring', 'Use a lab API with timeouts; interpret monitoring data; generate a short report.'),
  L(9, 'Nov 23 – 29', 'Terraform introduction', 'Create, inspect and destroy a small lab deployment; keep this a lighter week if needed.'),
  L(10, 'Nov 30 – Dec 6', 'Troubleshooting and security', 'Diagnose a blocked traffic path; explain the fix; verify the result.'),
  L(11, 'Dec 7 – 13', 'Portfolio and interviews', 'Finish one README and architecture diagram; practice a ten-minute walkthrough.'),
  L(12, 'Dec 14 – 20', 'Readiness and next step', 'Review all current exam domains; assess weak areas; choose the next phase.'),
];
export const LEARNING_START = START;

export const LEARNING_LINKS = [
  ['AWS exam guide and preparation', 'https://aws.amazon.com/certification/certified-solutions-architect-associate/'],
  ['AWS architect learning path', 'https://aws.amazon.com/training/learn-about/architect/'],
  ['Python tutorial', 'https://docs.python.org/3/tutorial/'],
  ['Terraform tutorials', 'https://developer.hashicorp.com/terraform/tutorials'],
];

const CAREER = [
  { id: 'cert-aws-saa', type: 'cert', name: 'AWS Solutions Architect – Associate', provider: 'AWS', status: 'Planned', notes: 'Book the exam when readiness review (week 12) says so. Check the current exam guide first.' },
  { id: 'cert-python', type: 'cert', name: 'Python course-completion certificates', provider: 'Udemy / LinkedIn Learning', status: 'Completed', notes: '' },
  { id: 'cert-ccnp', type: 'cert', name: 'CCNP', provider: 'Cisco', status: 'Reassess', notes: 'Reassess after the AWS phase.' },
  ...['AWS architecture', 'Python & APIs', 'Networking & routing', 'Linux', 'Terraform', 'Interviewing'].map((name, i) => ({ id: 'skill-' + i, type: 'skill', name, level: null, target: 4, notes: '' })),
];

export const EXPENSE_CATS = ['Groceries', 'Dining out', 'Transport', 'Rent', 'Utilities', 'Phone & internet', 'Shopping', 'Health & gym', 'Education', 'Travel', 'Entertainment', 'Insurance', 'Subscriptions', 'Family / send home', 'Gifts', 'Other'];
export const INCOME_CATS = ['Salary', 'Bonus', 'Freelance', 'Interest', 'Refund', 'Gift', 'Other'];

// On-device mode (no accounts): the app is Shiva's, so start with the planner.
export async function seedIfNeeded() {
  if (await getSetting('seeded')) return;
  await seedPlanner({ stamp: 0 });
  await seedBasics({ stamp: 0 });
  await setSetting('name', 'Shiva');
  await setSetting('seeded', true);
}

// Sample planner: the weekly schedule, 12-week learning plan and career items
// from the desk planner PDF. New account holders can pick it or start fresh.
export async function seedPlanner({ stamp = Date.now() } = {}) {
  await db.bulkPut('schedule', SCHEDULE.map(b => ({ ...b, createdAt: Date.now(), updatedAt: stamp })));
  await db.bulkPut('learning', LEARNING.map(l => ({ ...l, createdAt: Date.now(), updatedAt: stamp })));
  await db.bulkPut('career', CAREER.map(c => ({ ...c, createdAt: Date.now(), updatedAt: stamp })));
}
export async function seedBasics({ stamp = Date.now() } = {}) {
  await db.bulkPut('accounts', [{ id: 'acct-cash', name: 'Cash', type: 'Cash', opening: 0, createdAt: Date.now(), updatedAt: stamp }]);
}

export async function resetSchedule() {
  await db.clear('schedule');
  await db.bulkPut('schedule', SCHEDULE.map(b => ({ ...b, createdAt: Date.now(), updatedAt: Date.now() })));
}

// v6: "How's today?" became a post composer. Move any notes saved the old way
// (day.highlight) into the Feed as posts, once.
export async function migrateHighlightsToPosts() {
  if (await getSetting('highlightsMigrated')) return;
  for (const day of await db.all('days')) {
    if (!day.highlight) continue;
    await db.put('entries', { kind: 'moment', date: day.date, body: day.highlight, mood: day.mood || null, photos: [], tags: [] }, { silent: true });
    delete day.highlight;
    await db.put('days', day, { silent: true });
  }
  await setSetting('highlightsMigrated', true, { silent: true });
}
