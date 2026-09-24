import { db } from '../db.js';
import { h, icon, isoDate, parseDate, fmtLongDate, MOODS, MOOD_WORDS, money, mimg, empty, pad } from '../ui.js';
import { entryCard } from '../kinds.js';

export const title = 'Calendar';

export async function render(el, params, query) {
  const sel = query.get('d') || isoDate();
  const month = query.get('m') || sel.slice(0, 7);
  const [entries, days, checks, txns, blocks] = await Promise.all([db.all('entries'), db.all('days'), db.all('checks'), db.all('money'), db.all('schedule')]);

  const byDate = {};
  const bucket = d => (byDate[d] = byDate[d] || { entries: [], checks: [], txns: [] });
  entries.forEach(e => e.date && bucket(e.date).entries.push(e));
  checks.forEach(c => bucket(c.date).checks.push(c));
  txns.forEach(t => t.date && bucket(t.date).txns.push(t));
  const dayMap = Object.fromEntries(days.map(d => [d.date, d]));

  const first = parseDate(month + '-01');
  const shift = n => { const d = new Date(first); d.setMonth(d.getMonth() + n); return isoDate(d).slice(0, 7); };
  const lead = (first.getDay() + 6) % 7; // Monday first
  const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();

  el.append(h('div.page-head', h('div', h('h1', 'Calendar'), h('p.muted', 'Your life, day by day. Tap a day to see everything you logged.'))));
  el.append(h('div.month-nav',
    h('a.icon-btn', { href: `#/calendar?m=${shift(-1)}&d=${sel}`, 'aria-label': 'Previous month' }, icon('chevL')),
    h('strong', first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })),
    h('a.icon-btn', { href: `#/calendar?m=${shift(1)}&d=${sel}`, 'aria-label': 'Next month' }, icon('chevR'))));

  const cells = [];
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(d => cells.push(h('div.cal-dow', d)));
  for (let i = 0; i < lead; i++) cells.push(h('div.cal-cell.blank'));
  for (let d = 1; d <= daysIn; d++) {
    const ds = `${month}-${pad(d)}`;
    const b = byDate[ds];
    const mood = dayMap[ds]?.mood;
    const photo = b?.entries.find(e => e.photos && e.photos.length);
    cells.push(h('a.cal-cell' + (ds === sel ? '.sel' : '') + (ds === isoDate() ? '.today' : '') + (photo ? '.has-photo' : ''), { href: `#/calendar?m=${month}&d=${ds}`, 'aria-label': fmtLongDate(ds) },
      photo ? mimg(photo.photos[0], 'cal-bg') : null,
      h('span.cal-num', String(d)),
      mood ? h('span.cal-mood', MOODS[mood - 1]) : null,
      b ? h('span.cal-dots', b.entries.length ? h('i.d-entry') : null, b.checks.length ? h('i.d-check') : null, b.txns.length ? h('i.d-money') : null) : null));
  }
  el.append(h('div.cal-grid.card', cells));

  // day detail
  const b = byDate[sel] || { entries: [], checks: [], txns: [] };
  const dm = dayMap[sel];
  const blockById = Object.fromEntries(blocks.map(x => [x.id, x]));
  const detail = h('section.day-detail', h('h2', fmtLongDate(sel)));
  if (dm && (dm.mood || dm.highlight)) detail.append(h('div.card', dm.mood ? h('p.lead', MOODS[dm.mood - 1] + ' ' + MOOD_WORDS[dm.mood - 1]) : null, dm.highlight ? h('p', dm.highlight) : null));
  if (b.checks.length) detail.append(h('div.card', h('h3', '✅ Done'), h('ul', b.checks.map(c => h('li', blockById[c.blockId]?.title || 'Removed block')))));
  if (b.entries.length) detail.append(h('div.stack', b.entries.map(entryCard)));
  if (b.txns.length) detail.append(h('div.card', h('h3', '💸 Money'), h('ul.plain', b.txns.map(t => h('li', `${t.type === 'income' ? '+' : '−'}${money(t.amount)} · ${t.category}${t.note ? ' · ' + t.note : ''}`)))));
  if (!b.entries.length && !b.checks.length && !b.txns.length && !(dm && (dm.mood || dm.highlight))) detail.append(empty('Nothing logged on this day.'));
  el.append(detail);
}
