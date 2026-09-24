import { db } from '../db.js';
import { h, icon, mimg, fmtDate, empty, segmented, tagChips, isoDate } from '../ui.js';
import { editEntry, entryCard, quoteCard, KINDS, STORY_STATUS } from '../kinds.js';

export const title = 'Write';

const TABS = [['diary', 'Diary'], ['journey', 'Journeys'], ['story', 'Stories'], ['idea', 'Ideas'], ['quote', 'Quotes']];
const BLURB = {
  diary: 'Your private diary — mood, thoughts and the details of the day.',
  journey: 'Trips and adventures, told day by day with photos.',
  story: 'Stories, scripts, film and content ideas — from spark to final draft.',
  idea: 'Quick sparks. Capture now, sort later.',
  quote: 'Lines you wrote, heard or read that are worth keeping.',
};

export async function render(el, [tab = 'diary']) {
  if (!KINDS[tab]) tab = 'diary';
  const list = (await db.byIndex('entries', 'kind', tab)).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  const k = KINDS[tab];

  let q = '';
  const body = h('div');
  const search = h('input.search-inline', { type: 'search', placeholder: `Search ${k.plural.toLowerCase()}…`, oninput: e => { q = e.target.value.toLowerCase(); paint(); } });

  el.append(h('div.page-head',
    h('div', h('h1', 'Write'), h('p.muted', BLURB[tab])),
    h('button.btn.primary', { onclick: () => editEntry(tab) }, icon('plus', 18), 'New ' + k.label.toLowerCase())));
  el.append(h('div.tabs-row', segmented(TABS, tab, t => { location.hash = '#/write/' + t; }), list.length > 4 ? search : null));
  el.append(body);

  function paint() {
    body.replaceChildren();
    const items = q ? list.filter(e => JSON.stringify([e.title, e.body, e.tags, e.author, e.logline, e.location]).toLowerCase().includes(q)) : list;
    if (!items.length) {
      body.append(empty(q ? 'Nothing matches that search.' : `No ${k.plural.toLowerCase()} yet.`,
        q ? null : h('button.btn.primary', { onclick: () => editEntry(tab) }, icon('plus', 18), 'Write the first one')));
      return;
    }
    if (tab === 'quote') body.append(h('div.masonry', items.map(quoteCard)));
    else if (tab === 'idea') {
      items.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
      body.append(h('div.masonry', items.map(e => h('a.card.idea-card' + (e.pinned ? '.pinned' : ''), { href: '#/entry/' + e.id },
        e.pinned ? h('span.pin', icon('pin', 14)) : null, h('p', e.body), tagChips(e.tags), h('small.muted', fmtDate(e.date))))));
    } else if (tab === 'story') {
      for (const st of STORY_STATUS) {
        const group = items.filter(e => (e.status || 'Idea') === st);
        if (!group.length) continue;
        body.append(h('h2.group-title', st, h('span.count', String(group.length))),
          h('div.stack', group.map(e => h('a.card.story-card', { href: '#/entry/' + e.id },
            h('div.entry-meta', h('span.pill', e.format || 'Story'), e.genre ? h('span', e.genre) : null, h('span', wordCount(e.body) + ' words'), h('span', 'edited ' + fmtDate(isoDate(new Date(e.updatedAt))))),
            h('h3', e.title), e.logline ? h('p.snippet', e.logline) : null, tagChips(e.tags)))));
      }
    } else if (tab === 'journey') {
      body.append(h('div.journey-grid', items.map(e => h('a.card.journey-card', { href: '#/journey/' + e.id },
        h('div.journey-cover', e.photos && e.photos[0] ? mimg(e.photos[0]) : h('div.cover-fallback', icon('map', 36))),
        h('div.journey-info',
          h('h3', e.title),
          h('p.muted', [e.location, fmtDate(e.date) + (e.endDate && e.endDate !== e.date ? ' – ' + fmtDate(e.endDate) : '')].filter(Boolean).join(' · ')),
          h('p.small.muted', `${(e.stops || []).length} day logs · ${countPhotos(e)} photos`))))));
    } else if (tab === 'diary') {
      let month = '';
      const stack = h('div.stack');
      for (const e of items) {
        const m = (e.date || '').slice(0, 7);
        if (m !== month) { month = m; stack.append(h('h2.group-title', new Date(m + '-02').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))); }
        stack.append(entryCard(e));
      }
      body.append(stack);
    } else body.append(h('div.stack', items.map(entryCard)));
  }
  paint();
}

export function wordCount(s) { return (s || '').trim() ? s.trim().split(/\s+/).length : 0; }
function countPhotos(e) { return (e.photos || []).length + (e.stops || []).reduce((n, s) => n + (s.photos || []).length, 0); }
