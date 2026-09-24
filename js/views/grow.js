import { db } from '../db.js';
import { h, icon, fmtDate, formModal, toast, segmented, empty, isoDate, addDays, weekStart, fmtHours, textBlock } from '../ui.js';
import { editEntry, entryCard, ACTIVITY_TYPES } from '../kinds.js';
import { learningWeek, weekStats } from '../stats.js';
import { LEARNING_LINKS, LEARNING } from '../seed.js';
import { barChart } from '../charts.js';
import { meter } from './today.js';

export const title = 'Grow';

const TABS = [['learning', 'Learning'], ['career', 'Career'], ['activities', 'Activities'], ['reviews', 'Reviews']];

export async function render(el, [tab = 'learning']) {
  el.append(h('div.page-head', h('div', h('h1', 'Grow'), h('p.muted', 'Learning, professional progress, fitness and hobbies — one steady week at a time.'))));
  el.append(h('div.tabs-row', segmented(TABS, tab, t => { location.hash = '#/grow/' + t; })));
  if (tab === 'career') return career(el);
  if (tab === 'activities') return activities(el);
  if (tab === 'reviews') return reviews(el);
  return learning(el);
}

// ---------------- learning ----------------
async function learning(el) {
  const weeks = (await db.all('learning')).sort((a, b) => a.week - b.week);
  if (!weeks.length) {
    el.append(empty('No learning plan yet. Start from the sample 12-week AWS Solutions Architect + Python plan and edit it as you go.',
      h('button.btn.primary', { onclick: async () => {
        await db.bulkPut('learning', LEARNING.map(l => ({ ...l, createdAt: Date.now(), updatedAt: Date.now() })));
        toast('Learning plan added');
      } }, icon('sprout', 18), 'Add the sample plan')));
    return;
  }
  const links = await db.byIndex('career', 'type', 'link');
  const lw = learningWeek();
  const doneWeeks = weeks.filter(w => w.done).length;
  const tasks = weeks.flatMap(w => w.tasks);

  // career-hours trend for the last 8 weeks
  const ws = weekStart();
  const trend = [];
  for (let i = 7; i >= 0; i--) {
    const from = addDays(ws, -7 * i);
    const s = await weekStats(from);
    trend.push({ label: fmtDate(from, { month: 'numeric', day: 'numeric' }), values: [Math.round(s.careerMinutes / 6) / 10] });
  }

  el.append(h('div.dash-grid',
    h('section.card',
      h('div.card-head', h('h2', icon('sprout', 18), '12-week plan')),
      h('p.lead', 'AWS Solutions Architect – Associate + practical Python and networking'),
      meter('Weeks completed', doneWeeks, 12),
      meter('Checkpoints done', tasks.filter(t => t.done).length, tasks.length),
      h('p.muted.small', 'Plan the AWS SAA exam when ready; reassess CCNP after this phase. Review the routine after week 4.')),
    h('section.card',
      h('div.card-head', h('h2', icon('trend', 18), 'Career hours per week'), h('span.muted', 'goal 7.5h')),
      barChart({ data: trend, series: [{ name: 'Hours', color: 'var(--series-1)' }], fmt: v => v + 'h', ariaLabel: 'Career work hours for the last 8 weeks' }),
      h('p.muted.small', 'Counts checked study blocks on Today plus any Study activities you log.')),
    h('section.card.span2',
      h('div.card-head', h('h2', icon('book', 18), 'Learning links'), h('button.btn.ghost.small', { onclick: () => editCareer('link') }, icon('plus', 16), 'Add link')),
      h('ul.link-list',
        LEARNING_LINKS.map(([t, u]) => h('li', h('a', { href: u, target: '_blank', rel: 'noopener' }, t))),
        links.map(l => h('li', h('a', { href: l.url, target: '_blank', rel: 'noopener' }, l.name), h('button.icon-btn', { 'aria-label': 'Edit link', onclick: () => editCareer('link', l) }, icon('edit', 14))))))));

  const list = h('div.stack');
  for (const w of weeks) {
    const current = lw.started && w.week === lw.week;
    const done = w.tasks.filter(t => t.done).length;
    list.append(h('section.card.week-card' + (current ? '.current' : '') + (w.done ? '.done' : ''),
      h('div.card-head',
        h('div', h('p.eyebrow', `Week ${w.week} · ${w.range}` + (current ? ' · this week' : '')), h('h3', w.focus)),
        h('label.check-line', h('input', { type: 'checkbox', checked: w.done, onchange: async e => { w.done = e.target.checked; if (w.done) w.tasks.forEach(t => (t.done = true)); await db.put('learning', w); } }), h('span', w.done ? 'Done' : `${done}/${w.tasks.length}`))),
      h('ul.tasklist', w.tasks.map(t => h('li', h('label.check-line',
        h('input', { type: 'checkbox', checked: t.done, onchange: async e => { t.done = e.target.checked; w.done = w.tasks.every(x => x.done); await db.put('learning', w); } }),
        h('span', t.text))))),
      w.notes ? textBlock(w.notes) : null,
      h('button.btn.ghost.small', { onclick: async () => {
        const out = await formModal(`Week ${w.week} notes`, [{ name: 'notes', label: 'Notes, links, what you built', type: 'textarea', rows: 8 }], w);
        if (out) { await db.put('learning', out); toast('Saved'); }
      } }, icon('edit', 14), w.notes ? 'Edit notes' : 'Add notes')));
  }
  el.append(h('h2.group-title', 'Weekly checkpoints'), list);
}

// ---------------- career ----------------
const APP_STATUS = ['Wishlist', 'Applied', 'Screening', 'Interviewing', 'Offer', 'Accepted', 'Rejected', 'Withdrawn'];
const CERT_STATUS = ['Planned', 'Studying', 'Booked', 'Passed', 'Completed', 'Reassess', 'Expired'];
const CAREER_FORMS = {
  application: { label: 'Application', fields: [
    { name: 'company', label: 'Company', required: true, half: true },
    { name: 'role', label: 'Role', required: true, half: true },
    { name: 'status', label: 'Status', type: 'select', options: APP_STATUS, half: true },
    { name: 'date', label: 'Date applied', type: 'date', half: true },
    { name: 'location', label: 'Location / remote', half: true },
    { name: 'salary', label: 'Salary range', half: true },
    { name: 'url', label: 'Job link', type: 'url' },
    { name: 'contact', label: 'Recruiter / contact' },
    { name: 'notes', label: 'Notes, interview questions, follow-ups', type: 'textarea', rows: 5 },
  ] },
  cert: { label: 'Certification', fields: [
    { name: 'name', label: 'Certification', required: true },
    { name: 'provider', label: 'Provider', half: true },
    { name: 'status', label: 'Status', type: 'select', options: CERT_STATUS, half: true },
    { name: 'date', label: 'Exam / completion date', type: 'date', half: true },
    { name: 'expiry', label: 'Expires', type: 'date', half: true },
    { name: 'credential', label: 'Credential ID / link' },
    { name: 'notes', label: 'Notes', type: 'textarea', rows: 3 },
  ] },
  skill: { label: 'Skill', fields: [
    { name: 'name', label: 'Skill', required: true },
    { name: 'level', label: 'Where you are now (1 beginner – 5 expert)', type: 'rating' },
    { name: 'target', label: 'Target', type: 'rating' },
    { name: 'notes', label: 'Evidence / next step', type: 'textarea', rows: 3 },
  ] },
  project: { label: 'Portfolio project', fields: [
    { name: 'name', label: 'Project', required: true },
    { name: 'status', label: 'Status', type: 'select', options: ['Idea', 'Building', 'Documenting', 'Done'], half: true },
    { name: 'date', label: 'Started', type: 'date', half: true },
    { name: 'url', label: 'Repo / demo link', type: 'url' },
    { name: 'notes', label: 'What it shows (README, diagram, walkthrough)', type: 'textarea', rows: 4 },
  ] },
  win: { label: 'Win', fields: [
    { name: 'title', label: 'What happened', required: true, placeholder: 'Shipped…, got praised for…, promoted…' },
    { name: 'date', label: 'Date', type: 'date', required: true, half: true },
    { name: 'category', label: 'Type', type: 'select', options: ['Work win', 'Feedback', 'Promotion / raise', 'Learning', 'Networking', 'Other'], half: true },
    { name: 'notes', label: 'Details (great for performance reviews)', type: 'textarea', rows: 4 },
  ] },
  link: { label: 'Learning link', fields: [
    { name: 'name', label: 'Title', required: true },
    { name: 'url', label: 'URL', type: 'url', required: true },
  ] },
};

async function editCareer(type, item) {
  const f = CAREER_FORMS[type];
  const out = await formModal((item ? 'Edit ' : 'Add ') + f.label.toLowerCase(), f.fields, item || { date: isoDate() }, {
    onDelete: item ? () => db.del('career', item.id) : null,
  });
  if (!out) return;
  out.type = type;
  await db.put('career', out);
  toast('Saved');
}

async function career(el) {
  const items = await db.all('career');
  const by = t => items.filter(i => i.type === t);
  const apps = by('application').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const active = apps.filter(a => !['Rejected', 'Withdrawn', 'Accepted'].includes(a.status));

  const section = (type, heading, iconName, content) => h('section.card.span2',
    h('div.card-head', h('h2', icon(iconName, 18), heading), h('button.btn.ghost.small', { onclick: () => editCareer(type) }, icon('plus', 16), 'Add')),
    content);

  const pipeline = h('div.pipeline', APP_STATUS.map(s => {
    const n = apps.filter(a => (a.status || 'Wishlist') === s).length;
    return h('div.pipe' + (n ? '.has' : ''), h('strong', String(n)), h('span', s));
  }));

  el.append(h('div.dash-grid',
    section('application', `Applications · ${active.length} active`, 'brief', h('div',
      pipeline,
      apps.length ? h('div.table-wrap', h('table.table',
        h('thead', h('tr', h('th', 'Company'), h('th', 'Role'), h('th', 'Status'), h('th', 'Applied'))),
        h('tbody', apps.map(a => h('tr.clickable', { onclick: () => editCareer('application', a) },
          h('td', h('strong', a.company)), h('td', a.role), h('td', h('span.pill.s-' + (a.status || 'Wishlist').toLowerCase(), a.status || 'Wishlist')), h('td', fmtDate(a.date))))))) : h('p.muted', 'Track every job application here — status, contacts and interview notes.'))),
    section('skill', 'Skills', 'trend', h('div.skills', by('skill').map(s => h('button.skill-row', { onclick: () => editCareer('skill', s) },
      h('span.skill-name', s.name),
      h('span.skill-bar', [1, 2, 3, 4, 5].map(i => h('span.seg' + (i <= (s.level || 0) ? '.on' : '') + (i === s.target ? '.target' : '')))),
      h('span.muted.small', s.level ? `${s.level}/5` : 'rate me'))))),
    section('cert', 'Certifications', 'star', h('div.stack', by('cert').map(c => h('button.row-btn', { onclick: () => editCareer('cert', c) },
      h('div', h('strong', c.name), h('div.muted.small', [c.provider, c.date ? fmtDate(c.date) : '', c.expiry ? 'expires ' + fmtDate(c.expiry) : ''].filter(Boolean).join(' · '))),
      h('span.pill.s-' + (c.status || '').toLowerCase(), c.status || '')))) ),
    section('project', 'Portfolio projects', 'grid', by('project').length ? h('div.stack', by('project').map(p => h('button.row-btn', { onclick: () => editCareer('project', p) },
      h('div', h('strong', p.name), p.notes ? h('div.muted.small', p.notes.slice(0, 120)) : null), h('span.pill', p.status || 'Idea')))) : h('p.muted', 'Sunday 10 AM–noon is portfolio time. Log each project with its README and diagram.')),
    section('win', 'Wins & achievements', 'heart', by('win').length ? h('div.stack', by('win').sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(w => h('button.row-btn', { onclick: () => editCareer('win', w) },
      h('div', h('strong', w.title), h('div.muted.small', fmtDate(w.date) + (w.category ? ' · ' + w.category : ''))), icon('chevR', 16)))) : h('p.muted', 'Write down every win, big or small. Future-you will need them for reviews and interviews.'))));
}

// ---------------- activities ----------------
async function activities(el) {
  const acts = (await db.byIndex('entries', 'kind', 'activity')).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const monthStart = isoDate().slice(0, 7);
  const thisMonth = acts.filter(a => a.date && a.date.startsWith(monthStart));
  const byType = {};
  for (const a of thisMonth) byType[a.type || 'Other'] = (byType[a.type || 'Other'] || 0) + (a.minutes || 0);

  let filter = '';
  const listEl = h('div.stack');
  const paint = () => {
    listEl.replaceChildren();
    const rows = filter ? acts.filter(a => a.type === filter) : acts;
    if (!rows.length) listEl.append(empty('No activities logged yet. Gym, hikes, books, photography — log them here or tick them off on Today.'));
    else rows.forEach(a => listEl.append(entryCard(a)));
  };

  el.append(h('div.page-actions',
    h('select', { 'aria-label': 'Filter by type', onchange: e => { filter = e.target.value; paint(); } }, h('option', { value: '' }, 'All types'), ACTIVITY_TYPES.map(t => h('option', t))),
    h('button.btn.primary', { onclick: () => editEntry('activity') }, icon('plus', 18), 'Log activity')));
  if (thisMonth.length) {
    el.append(h('section.card', h('div.card-head', h('h2', 'This month')),
      h('div.stat-row', Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, m]) =>
        h('div.stat', h('span.muted', t), h('strong', m ? fmtHours(m) : thisMonth.filter(a => (a.type || 'Other') === t).length + '×'))))));
  }
  el.append(listEl);
  paint();
}

// ---------------- reviews ----------------
async function reviews(el) {
  const list = (await db.byIndex('entries', 'kind', 'review')).sort((a, b) => b.date.localeCompare(a.date));
  const s = await weekStats();
  el.append(h('section.card',
    h('div.card-head', h('h2', icon('target', 18), 'Sunday 6–6:45 PM · weekly review')),
    h('p', `This week so far: ${fmtHours(s.careerMinutes)} career work, ${s.gym} gym, ${s.jog} jog/walk, ${s.reading} reading, ${s.entries} entries logged.`),
    h('button.btn.primary', { onclick: () => editEntry('review', null, { date: s.from, wins: `Career: ${fmtHours(s.careerMinutes)} · Gym: ${s.gym} · Jog: ${s.jog} · Reading: ${s.reading}\n` }) }, icon('plus', 18), 'Write this week’s review')));
  el.append(list.length ? h('div.stack', list.map(entryCard)) : empty('Your weekly reviews will build up here — a record of how each week actually went.'));
}
