import { db, getSetting, setSetting } from '../db.js';
import { h, icon, mimg, fmtDate, tagChips, empty, segmented } from '../ui.js';
import { editEntry, KINDS, entryTitle } from '../kinds.js';

export const title = 'Feed';

export function carousel(ids) {
  const track = h('div.carousel-track', ids.map(id => h('div.slide', mimg(id))));
  if (ids.length < 2) return h('div.carousel', track);
  const dots = ids.map((_, i) => h('span.cdot' + (i ? '' : '.on')));
  track.addEventListener('scroll', () => {
    const i = Math.round(track.scrollLeft / track.clientWidth);
    dots.forEach((d, j) => d.classList.toggle('on', i === j));
  }, { passive: true });
  const go = dir => track.scrollBy({ left: dir * track.clientWidth, behavior: 'smooth' });
  return h('div.carousel', track,
    h('button.car-btn.prev', { 'aria-label': 'Previous photo', onclick: () => go(-1) }, icon('chevL')),
    h('button.car-btn.next', { 'aria-label': 'Next photo', onclick: () => go(1) }, icon('chevR')),
    h('div.cdots', dots));
}

export async function render(el) {
  const mode = await getSetting('feedMode', 'feed');
  const entries = (await db.all('entries')).filter(e => e.photos && e.photos.length)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);

  el.append(h('div.page-head',
    h('div', h('h1', 'Feed'), h('p.muted', 'Every photo you have logged — moments, trips, workouts and diary pages.')),
    h('div.head-actions',
      segmented([['feed', 'Posts'], ['grid', 'Grid']], mode, async m => { await setSetting('feedMode', m); }),
      h('button.btn.primary', { onclick: () => editEntry('moment') }, icon('camera', 18), 'New moment'))));

  if (!entries.length) {
    el.append(empty('No photos yet. Post your first moment — a view, a meal, a sunset on the hike.',
      h('button.btn.primary', { onclick: () => editEntry('moment') }, icon('camera', 18), 'Post a moment')));
    return;
  }

  if (mode === 'grid') {
    el.append(h('div.photo-grid', entries.flatMap(e => e.photos.map((p, i) =>
      h('a.photo-cell', { href: '#/entry/' + e.id, 'aria-label': entryTitle(e) }, mimg(p), i === 0 && e.photos.length > 1 ? h('span.badge', icon('grid', 12)) : null)))));
    return;
  }

  const col = h('div.feed');
  for (const e of entries) {
    const k = KINDS[e.kind];
    col.append(h('article.post.card',
      h('header.post-head',
        h('span.kind-chip.k-' + e.kind, icon(k.icon, 14), k.label),
        h('span.muted', fmtDate(e.date)),
        e.location ? h('span.muted', icon('pin', 12), e.location) : null,
        h('a.icon-btn.post-open', { href: '#/entry/' + e.id, 'aria-label': 'Open' }, icon('more'))),
      carousel(e.photos),
      h('div.post-body',
        e.title ? h('h3', e.title) : null,
        e.body ? h('p', e.body.length > 400 ? e.body.slice(0, 400) + '…' : e.body) : null,
        tagChips(e.tags))));
  }
  el.append(col);
}
