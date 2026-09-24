import { db, uid } from '../db.js';
import { h, icon, fmtLongDate, fmtDate, MOODS, MOOD_WORDS, tagChips, textBlock, fmtHours, formModal, toast, empty, isoDate } from '../ui.js';
import { editEntry, KINDS, entryTitle } from '../kinds.js';
import { carousel } from './feed.js';
import { wordCount } from './write.js';

export const title = 'Entry';

const BACK = { diary: '#/write/diary', story: '#/write/story', idea: '#/write/idea', quote: '#/write/quote', journey: '#/write/journey', moment: '#/feed', activity: '#/grow/activities', review: '#/grow/reviews' };

export async function render(el, [id]) {
  const e = await db.get('entries', id);
  if (!e) { el.append(empty('This entry no longer exists.', h('a.btn', { href: '#/today' }, 'Go to Today'))); return; }
  if (e.kind === 'journey') return renderJourney(el, e);
  const k = KINDS[e.kind];

  el.append(h('div.detail-top',
    h('a.btn.ghost.small', { href: BACK[e.kind] || '#/today' }, icon('chevL', 16), k.plural),
    h('div.head-actions',
      e.kind === 'story' || e.kind === 'quote' || e.kind === 'idea' ? h('button.btn.ghost.small', { onclick: () => shareText(e) }, icon('share', 16), 'Share') : null,
      h('button.btn.small', { onclick: () => editEntry(e.kind, e) }, icon('edit', 16), 'Edit'))));

  const art = h('article.card.detail');
  if (e.photos && e.photos.length) art.append(carousel(e.photos));
  const meta = h('div.entry-meta',
    h('span.kind-chip.k-' + e.kind, icon(k.icon, 14), k.label),
    h('span', fmtLongDate(e.date)),
    e.mood ? h('span', MOODS[e.mood - 1] + ' ' + MOOD_WORDS[e.mood - 1]) : null,
    e.type ? h('span.pill', e.type) : null,
    e.minutes ? h('span', fmtHours(e.minutes)) : null,
    e.rating ? h('span', '★'.repeat(e.rating)) : null,
    e.format ? h('span.pill', e.format) : null,
    e.status ? h('span.pill', e.status) : null,
    e.genre ? h('span', e.genre) : null,
    e.location ? h('span', icon('pin', 12), e.location) : null);
  art.append(h('div.detail-body', meta));
  const body = art.lastChild;

  if (e.kind === 'quote') {
    body.append(h('blockquote.big-quote', '“' + e.body + '”'), h('cite', '— ' + (e.author || 'Me') + (e.source ? ', ' + e.source : '')));
  } else if (e.kind === 'review') {
    body.append(h('h1', entryTitle(e)), e.score ? h('p.lead', `Week score: ${e.score}/10`) : null);
    for (const [key, label] of [['wins', 'Wins & progress'], ['improve', 'What to change'], ['focus', 'Focus for next week'], ['body', 'Notes']])
      if (e[key]) body.append(h('h3', label), textBlock(e[key]));
  } else {
    if (e.title) body.append(h('h1', e.title));
    if (e.logline) body.append(h('p.lead', e.logline));
    if (e.body) body.append(textBlock(e.body));
    if (e.kind === 'story') body.append(h('p.muted.small', wordCount(e.body) + ' words · ~' + Math.max(1, Math.round(wordCount(e.body) / 150)) + ' min read aloud'));
  }
  body.append(tagChips(e.tags));
  el.append(art);
}

async function shareText(e) {
  const text = e.kind === 'quote' ? `“${e.body}” — ${e.author || 'Me'}` : [e.title, e.logline, e.body].filter(Boolean).join('\n\n');
  if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* cancelled */ } }
  await navigator.clipboard.writeText(text);
  toast('Copied to clipboard');
}

const STOP_FIELDS = [
  { name: 'date', label: 'Day', type: 'date', required: true, half: true },
  { name: 'place', label: 'Place', half: true },
  { name: 'text', label: 'What happened', type: 'textarea', rows: 6 },
  { name: 'photos', label: 'Photos', type: 'photos' },
];

async function editStop(journey, stop) {
  const out = await formModal(stop ? 'Edit day log' : 'Add a day to this journey', STOP_FIELDS, stop || { date: isoDate() }, {
    wide: true,
    onDelete: stop ? async () => { journey.stops = journey.stops.filter(s => s.id !== stop.id); await db.put('entries', journey); } : null,
  });
  if (!out) return;
  journey.stops = journey.stops || [];
  if (stop) Object.assign(stop, out);
  else journey.stops.push({ ...out, id: uid() });
  await db.put('entries', journey);
  toast('Saved');
}

function renderJourney(el, e) {
  el.append(h('div.detail-top',
    h('a.btn.ghost.small', { href: '#/write/journey' }, icon('chevL', 16), 'Journeys'),
    h('div.head-actions',
      h('button.btn.small', { onclick: () => editEntry('journey', e) }, icon('edit', 16), 'Edit trip'),
      h('button.btn.primary.small', { onclick: () => editStop(e) }, icon('plus', 16), 'Add day'))));
  el.append(h('article.card.detail',
    e.photos && e.photos.length ? carousel(e.photos) : null,
    h('div.detail-body',
      h('div.entry-meta', h('span.kind-chip.k-journey', icon('map', 14), 'Journey'),
        h('span', fmtDate(e.date) + (e.endDate && e.endDate !== e.date ? ' – ' + fmtDate(e.endDate) : '')),
        e.location ? h('span', icon('pin', 12), e.location) : null),
      h('h1', e.title),
      e.body ? textBlock(e.body) : null,
      tagChips(e.tags))));

  const stops = (e.stops || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (!stops.length) {
    el.append(empty('Log each day of the trip — where you went, what you saw, who you met.', h('button.btn.primary', { onclick: () => editStop(e) }, icon('plus', 18), 'Add the first day')));
    return;
  }
  el.append(h('ol.timeline', stops.map((s, i) => h('li.tl-item',
    h('div.tl-dot', String(i + 1)),
    h('div.card.tl-card',
      h('div.card-head', h('div', h('strong', 'Day ' + (i + 1) + ' · ' + fmtDate(s.date)), s.place ? h('span.muted', ' · ' + s.place) : null),
        h('button.icon-btn', { 'aria-label': 'Edit day', onclick: () => editStop(e, s) }, icon('edit', 16))),
      s.photos && s.photos.length ? carousel(s.photos) : null,
      s.text ? textBlock(s.text) : null)))));
}

