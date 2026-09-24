import { db } from '../db.js';
import { h, icon, fmtTime, formModal, toast, confirmDialog, download } from '../ui.js';
import { ANCHORS, resetSchedule, WEEKLY_GOALS } from '../seed.js';
import { buildICS } from '../ics.js';
import { blockMinutes } from '../stats.js';

export const title = 'Schedule';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const CATS = [['fitness', 'Gym / jogging / outdoors'], ['career', 'Career / study'], ['reading', 'Reading'], ['personal', 'Personal time']];

async function editBlock(block, day) {
  const out = await formModal(block ? 'Edit block' : 'Add block', [
    { name: 'title', label: 'What', required: true },
    { name: 'day', label: 'Day', type: 'select', options: ORDER.map(d => [String(d), DAYS[d]]), half: true },
    { name: 'cat', label: 'Category', type: 'select', options: CATS, half: true },
    { name: 'start', label: 'Start', type: 'time', half: true, hint: 'Leave empty for flexible' },
    { name: 'end', label: 'End', type: 'time', half: true },
    { name: 'track', label: 'Show a check-off box on Today (counts toward weekly goals)', type: 'checkbox' },
    { name: 'note', label: 'Note', placeholder: 'e.g. Rest day if no outing is planned' },
  ], block ? { ...block, day: String(block.day) } : { day: String(day), cat: 'personal', track: false }, {
    onDelete: block ? () => db.del('schedule', block.id) : null,
  });
  if (!out) return;
  out.day = Number(out.day);
  out.start = out.start || null;
  out.end = out.end || null;
  await db.put('schedule', out);
  toast('Schedule updated');
}

export async function render(el) {
  const blocks = await db.all('schedule');
  const career = blocks.filter(b => b.cat === 'career' && b.track).reduce((s, b) => s + blockMinutes(b), 0);
  el.append(h('div.page-head',
    h('div', h('p.eyebrow', 'Weekly desk planner'), h('h1', 'A steady week. Real progress.'),
      h('p.muted', 'First focus: AWS Solutions Architect – Associate + practical Python and networking')),
    h('div.head-actions',
      h('button.btn', { onclick: async () => {
        const learning = await db.all('learning');
        download('lifelog-week.ics', new Blob([buildICS(blocks, learning)], { type: 'text/calendar' }));
        toast('Calendar file saved — open it to add to Apple/Google/Outlook calendar');
      } }, icon('cal', 18), 'Add to calendar'),
      h('button.btn.ghost', { onclick: async () => {
        if (await confirmDialog('Replace your weekly blocks with the original planner from the PDF?', { ok: 'Reset', danger: true })) { await resetSchedule(); toast('Schedule reset'); }
      } }, 'Reset'))));

  el.append(h('section.card.anchors-card', h('h2.eyebrow', 'Your fixed anchors'), h('ul', ANCHORS.map(a => h('li', a))),
    h('p.small.muted', `Planned career time: ${(career / 60).toFixed(2).replace(/\.?0+$/, '')}h of ${WEEKLY_GOALS.careerMinutes / 60}h goal · ${WEEKLY_GOALS.gym} gym · ${WEEKLY_GOALS.jog} jog/walk · ${WEEKLY_GOALS.reading} reading sessions.`)));

  const today = new Date().getDay();
  el.append(h('div.week-grid', ORDER.map(d => {
    const list = blocks.filter(b => b.day === d).sort((a, b) => (a.start || '99').localeCompare(b.start || '99'));
    return h('section.card.day-col' + (d === today ? '.today' : ''),
      h('div.card-head', h('h3', DAYS[d]), h('button.icon-btn', { 'aria-label': 'Add block on ' + DAYS[d], onclick: () => editBlock(null, d) }, icon('plus', 16))),
      list.map(b => h('button.block.cat-' + b.cat, { onclick: () => editBlock(b) },
        h('span.block-time', b.start ? fmtTime(b.start) + (b.end ? '–' + fmtTime(b.end) : '') : 'Flexible'),
        h('span.block-title', b.title, b.track ? h('span.track-dot', { title: 'Tracked' }, ' ●') : null),
        b.note ? h('small.muted', b.note) : null)));
  })));
  el.append(h('p.muted.small.center', 'Tap any block to change it. Busy day? Shorten or skip a session rather than delaying sleep.'));
}
