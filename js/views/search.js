import { db } from '../db.js';
import { h, icon, fmtDate, money, empty } from '../ui.js';
import { entryCard } from '../kinds.js';

export const title = 'Search';

export async function render(el, params, query) {
  const q = (query.get('q') || '').trim();
  const input = h('input.search-big', { type: 'search', value: q, placeholder: 'Search everything — words, #tags, places, people…', 'aria-label': 'Search', autofocus: true });
  el.append(h('div.page-head', h('h1', 'Search')),
    h('form', { onsubmit: e => { e.preventDefault(); location.hash = '#/search?q=' + encodeURIComponent(input.value); } }, input));
  if (!q) {
    const tags = {};
    for (const e of await db.all('entries')) for (const t of e.tags || []) tags[t] = (tags[t] || 0) + 1;
    const top = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 30);
    if (top.length) el.append(h('h2.group-title', 'Your tags'), h('div.tags', top.map(([t, n]) => h('a.tag', { href: '#/search?q=' + encodeURIComponent('#' + t) }, `#${t} · ${n}`))));
    return;
  }
  const tag = q.startsWith('#') ? q.slice(1).toLowerCase() : null;
  const needle = q.toLowerCase();
  const text = o => JSON.stringify(o, (k, v) => (k === 'photos' || k === 'id' || k === 'data' ? undefined : v)).toLowerCase();

  const [entries, career, txns, days, vault] = await Promise.all([db.all('entries'), db.all('career'), db.all('money'), db.all('days'), db.all('vault')]);
  const hitE = entries.filter(e => tag ? (e.tags || []).some(t => t.toLowerCase() === tag) : text(e).includes(needle)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const hitC = tag ? [] : career.filter(c => text(c).includes(needle));
  const hitM = tag ? [] : txns.filter(t => text(t).includes(needle));
  const hitD = tag ? [] : days.filter(d => (d.highlight || '').toLowerCase().includes(needle));
  const hitV = tag ? [] : vault.filter(v => (v.label + ' ' + v.docType).toLowerCase().includes(needle));

  const total = hitE.length + hitC.length + hitM.length + hitD.length + hitV.length;
  el.append(h('p.muted', `${total} result${total === 1 ? '' : 's'}`));
  if (!total) { el.append(empty('Nothing found. Try another word.')); return; }
  if (hitE.length) el.append(h('div.stack', hitE.map(entryCard)));
  if (hitD.length) el.append(h('h2.group-title', 'Daily notes'), h('div.stack', hitD.map(d => h('a.card.row-btn', { href: '#/calendar?d=' + d.date }, h('div', h('strong', fmtDate(d.date)), h('div.muted', d.highlight))))));
  if (hitC.length) el.append(h('h2.group-title', 'Career'), h('div.stack', hitC.map(c => h('a.card.row-btn', { href: '#/grow/' + (c.type === 'link' ? 'learning' : 'career') }, h('div', h('strong', c.name || c.company || c.title), h('div.muted.small', c.type + (c.role ? ' · ' + c.role : '')))))));
  if (hitM.length) el.append(h('h2.group-title', 'Money'), h('div.stack', hitM.map(t => h('a.card.row-btn', { href: '#/money?m=' + t.date.slice(0, 7) }, h('div', h('strong', t.category), h('div.muted.small', fmtDate(t.date) + (t.note ? ' · ' + t.note : ''))), h('strong', money(t.amount))))));
  if (hitV.length) el.append(h('h2.group-title', 'Vault'), h('div.stack', hitV.map(v => h('a.card.row-btn', { href: '#/vault' }, icon('lock', 16), h('div', h('strong', v.label), h('div.muted.small', v.docType))))));
}
