import { db, getSetting } from '../db.js';
import { h, icon, isoDate, fmtLongDate, fmtTime, fmtDate, minutesOf, MOODS, MOOD_WORDS, fmtHours, catSvg, toast, parseDate, mimg, filePicker, saveImage } from '../ui.js';
import { editEntry, entryCard, KINDS } from '../kinds.js';
import { weekStats, learningWeek, loggingStreak } from '../stats.js';
import { ANCHORS, LEARNING_START } from '../seed.js';
import { quickTransaction } from './money.js';
import { todayCards } from './lists.js';

export const title = 'Today';

function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? 'Still up' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
}

export async function toggleCheck(date, block) {
  const id = date + '|' + block.id;
  if (await db.get('checks', id)) { await db.del('checks', id); return false; }
  await db.put('checks', { id, date, blockId: block.id, done: true });
  return true;
}

export function meter(label, value, goal, fmt = String) {
  const pct = Math.min(100, goal ? (value / goal) * 100 : 0);
  return h('div.meter',
    h('div.meter-top', h('span', label), h('strong', `${fmt(value)} / ${fmt(goal)}`)),
    h('div.meter-track', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': goal, 'aria-valuenow': value, 'aria-label': label },
      h('div.meter-fill' + (pct >= 100 ? '.done' : ''), { style: { width: pct + '%' } })));
}

export async function render(el) {
  const today = isoDate();
  const dow = new Date().getDay();
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const [name, blocks, checks, day, stats, learning, quotes, all, vault, lastBackup, streak] = await Promise.all([
    getSetting('name', ''), db.all('schedule'), db.byIndex('checks', 'date', today), db.get('days', today),
    weekStats(today), db.all('learning'), db.byIndex('entries', 'kind', 'quote'), db.all('entries'), db.all('vault'),
    getSetting('lastBackup', 0), loggingStreak()]);

  const doneIds = new Set(checks.map(c => c.blockId));
  const todays = blocks.filter(b => b.day === dow).sort((a, b) => (a.start || '99').localeCompare(b.start || '99'));

  // ---- hero
  el.append(h('section.hero',
    h('div',
      h('p.eyebrow', (name ? name + ' / ' : '') + 'daily log'),
      h('h1', greeting() + (name ? ', ' : '.'), name ? h('em', name + '.') : null),
      h('p.muted', fmtLongDate(today), streak ? h('span.streak', ' · 🔥 ' + streak + '-day logging streak') : null)),
    catSvg(56)));

  // ---- quick add
  const quick = [
    ['diary', 'Diary'], ['moment', 'Post'], ['idea', 'Idea'], ['quote', 'Quote'], ['activity', 'Activity'], ['story', 'Story'], ['journey', 'Journey'],
  ];
  el.append(h('div.quick-row',
    quick.map(([k, label]) => h('button.quick', { onclick: () => editEntry(k) }, icon(KINDS[k].icon, 18), label)),
    h('button.quick', { onclick: () => quickTransaction('expense') }, icon('wallet', 18), 'Expense'),
    h('button.quick', { onclick: () => quickTransaction('income') }, icon('trend', 18), 'Income')));

  const grid = h('div.dash-grid');
  el.append(grid);

  // ---- plan
  const planList = h('ol.plan');
  if (!todays.length) planList.append(h('li.muted', 'Nothing scheduled — enjoy the free day.'));
  for (const b of todays) {
    const s = minutesOf(b.start), e = minutesOf(b.end);
    const isNow = s != null && e != null && nowMin >= s && nowMin < e;
    const done = doneIds.has(b.id);
    const li = h('li.plan-item.cat-' + b.cat + (isNow ? '.now' : '') + (done ? '.done' : ''),
      h('span.plan-time', b.start ? fmtTime(b.start) + (b.end ? '–' + fmtTime(b.end) : '') : 'Flexible'),
      h('span.plan-title', b.title, b.note ? h('small.muted', b.note) : null, isNow ? h('span.now-chip', 'now') : null),
      b.track ? h('button.check' + (done ? '.on' : ''), {
        'aria-label': (done ? 'Unmark ' : 'Mark done: ') + b.title, 'aria-pressed': String(done),
        onclick: async () => {
          const on = await toggleCheck(today, b);
          if (on) toast('Nice — ' + b.title.split(' (')[0] + ' done', {
            label: 'Add notes', fn: () => editEntry('activity', null, {
              blockId: b.id, title: b.title.split(' (')[0],
              type: b.cat === 'career' ? 'Study' : b.cat === 'reading' ? 'Reading' : /gym/i.test(b.title) ? 'Gym' : /jog|walk/i.test(b.title) ? 'Jog / walk' : /hike/i.test(b.title) ? 'Hike' : 'Other',
              minutes: s != null && e != null ? e - s : null,
            }),
          });
        },
      }, icon('check', 16)) : h('span.check-spacer'));
    planList.append(li);
  }
  grid.append(h('section.card.span2',
    h('div.card-head', h('h2', icon('clock', 18), "Today's plan"), h('a.link', { href: '#/schedule' }, 'Edit week')),
    planList,
    h('details.anchors', h('summary', 'Fixed anchors'), h('ul', ANCHORS.map(a => h('li', a))))));

  // ---- office duties (daily to-do lists): plan in the morning, tick off by evening
  for (const card of await todayCards()) grid.append(card);

  // ---- "How's today?" composer: write, tap Post, and it goes to the Feed.
  // Unposted text is kept as a draft on this device so nothing is lost.
  const d = day || { date: today };
  const DRAFT = 'dinalekha-draft';
  const readDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT)) || {}; } catch { return {}; } };
  const writeDraft = v => { try { localStorage.setItem(DRAFT, JSON.stringify(v)); } catch { /* storage unavailable */ } };
  const draft = readDraft();
  let photos = Array.isArray(draft.photos) ? draft.photos : [];
  const txt = h('textarea', { rows: 3, placeholder: 'What’s on your mind today? A highlight, a thought, a thank-you…', 'aria-label': 'Write a post about today' });
  txt.value = draft.text || '';
  const saveDraft = () => writeDraft({ text: txt.value, photos });
  txt.addEventListener('input', saveDraft);
  const thumbs = h('div.thumb-grid.composer-thumbs');
  const paintThumbs = () => {
    thumbs.replaceChildren(...photos.map((mid, i) => h('div.thumb', mimg(mid),
      h('button.thumb-x', { type: 'button', 'aria-label': 'Remove photo', onclick: () => { photos.splice(i, 1); saveDraft(); paintThumbs(); } }, icon('x', 14)))));
    thumbs.hidden = !photos.length;
  };
  paintThumbs();
  const moodBtns = MOODS.map((m, i) => h('button.mood-btn', {
    'aria-label': MOOD_WORDS[i], 'aria-pressed': String(d.mood === i + 1), title: MOOD_WORDS[i],
    onclick: async () => {
      d.mood = d.mood === i + 1 ? null : i + 1;
      moodBtns.forEach((b, j) => b.setAttribute('aria-pressed', String(d.mood === j + 1)));
      await db.put('days', d, { silent: true });
    },
  }, m));
  const post = async () => {
    const body = txt.value.trim();
    if (!body && !photos.length) { toast('Write something or add a photo first'); txt.focus(); return; }
    const saved = await db.put('entries', { kind: 'moment', date: today, body, photos: [...photos], mood: d.mood || null, tags: [] }, { silent: true });
    txt.value = ''; photos = []; writeDraft({});
    toast('Posted to your feed', { label: 'View', fn: () => { location.hash = '#/entry/' + saved.id; } });
    dispatchEvent(new Event('rerender'));
  };
  grid.append(h('section.card.composer',
    h('div.card-head', h('h2', icon('heart', 18), "How's today?")),
    h('div.mood-row', moodBtns), txt, thumbs,
    h('div.save-row',
      h('button.btn.ghost.small', { onclick: async () => {
        const files = await filePicker({ accept: 'image/*', multiple: true });
        for (const f of files) photos.push(await saveImage(f));
        saveDraft(); paintThumbs();
      } }, icon('camera', 16), 'Photo'),
      h('button.btn.ghost.small', { onclick: () => {
        const body = txt.value.trim();
        editEntry('diary', null, { body, mood: d.mood || null, photos: [...photos] }).then(saved => {
          if (saved) { txt.value = ''; photos = []; writeDraft({}); paintThumbs(); }
        });
      } }, icon('book', 16), 'As diary'),
      h('span.spacer'),
      h('button.btn.primary', { onclick: post }, icon('up', 16), 'Post'))));

  // ---- week goals
  const g = stats.goals;
  grid.append(h('section.card',
    h('div.card-head', h('h2', icon('target', 18), 'This week'), h('span.muted', fmtDate(stats.from, { month: 'short', day: 'numeric' }) + ' – ' + fmtDate(stats.to, { month: 'short', day: 'numeric' }))),
    meter('Career work', stats.careerMinutes, g.careerMinutes, fmtHours),
    meter('Gym sessions', stats.gym, g.gym),
    meter('Jog / walk', stats.jog, g.jog),
    meter('Reading sessions', stats.reading, g.reading),
    stats.outdoor ? h('p.muted.small', `⛰️ ${stats.outdoor} outdoor adventure${stats.outdoor > 1 ? 's' : ''} this week`) : null,
    dow === 0 ? h('button.btn.primary.small', { onclick: () => editEntry('review', null, { date: stats.from }) }, 'Start weekly review') : null));

  // ---- learning
  const lw = learningWeek(today);
  const sorted = learning.sort((a, b) => a.week - b.week);
  const cur = sorted.find(l => l.week === Math.min(Math.max(lw.week, 1), 12));
  if (cur) {
    const doneWeeks = sorted.filter(l => l.done).length;
    grid.append(h('section.card',
      h('div.card-head', h('h2', icon('sprout', 18), lw.started ? (lw.week > 12 ? 'Learning plan complete' : 'Learning · week ' + cur.week) : 'Learning starts ' + fmtDate(LEARNING_START)),
        h('a.link', { href: '#/grow/learning' }, doneWeeks + '/12 weeks')),
      h('p.lead', cur.focus), h('p.muted.small', cur.range),
      h('ul.tasklist', cur.tasks.map(t => h('li', h('label.check-line',
        h('input', { type: 'checkbox', checked: t.done, onchange: async ev => { t.done = ev.target.checked; cur.done = cur.tasks.every(x => x.done); await db.put('learning', cur); } }),
        h('span', t.text)))))));
  }

  // ---- alerts
  const alerts = [];
  const soon = vault.filter(v => v.expiry).map(v => ({ v, days: Math.round((parseDate(v.expiry) - parseDate(today)) / 86400000) })).filter(x => x.days <= 90).sort((a, b) => a.days - b.days);
  for (const { v, days } of soon) alerts.push(h('li', icon('file', 16), h('span', `${v.label} ${days < 0 ? 'expired ' + -days + ' days ago' : 'expires in ' + days + ' days'} (${fmtDate(v.expiry)})`)));
  const since = lastBackup ? Math.floor((Date.now() - lastBackup) / 86400000) : null;
  if (all.length + vault.length > 0 && (since == null || since >= 7)) alerts.push(h('li', icon('down', 16), h('span', since == null ? 'You have not made a backup yet. ' : `Last backup ${since} days ago. `, h('a.link', { href: '#/settings' }, 'Back up now'))));
  if (alerts.length) grid.append(h('section.card.alert', h('div.card-head', h('h2', '⚠️ Heads up')), h('ul.alerts', alerts)));

  // ---- quote of the day
  if (quotes.length) {
    const seed = [...today].reduce((a, c) => a + c.charCodeAt(0), 0);
    const q = quotes[seed % quotes.length];
    grid.append(h('a.card.quote-card.feature', { href: '#/entry/' + q.id }, h('blockquote', '“' + q.body + '”'), h('cite', '— ' + (q.author || 'Me'))));
  }

  // ---- on this day
  const md = today.slice(5);
  const memories = all.filter(e => e.date && e.date.slice(5) === md && e.date !== today);
  if (memories.length) grid.append(h('section.card.span2', h('div.card-head', h('h2', '📸 On this day')), h('div.stack', memories.slice(0, 4).map(entryCard))));

  // ---- recent
  const recent = all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
  grid.append(h('section.card.span2',
    h('div.card-head', h('h2', icon('list', 18), 'Recently logged'), h('a.link', { href: '#/calendar' }, 'Calendar')),
    recent.length ? h('div.stack', recent.map(entryCard)) : h('p.muted', 'Your entries will show up here. Tap a quick button above to log your first one.')));
}
