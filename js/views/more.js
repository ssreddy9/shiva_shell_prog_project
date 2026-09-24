import { h, icon } from '../ui.js';

export const title = 'More';

const LINKS = [
  ['#/vault', 'lock', 'Vault', 'Passport, DL, SSN, cards — encrypted'],
  ['#/schedule', 'clock', 'Weekly schedule', 'Your desk planner — edit blocks, add to calendar'],
  ['#/calendar', 'cal', 'Calendar', 'Everything you logged, day by day'],
  ['#/grow/reviews', 'target', 'Weekly reviews', 'Sunday 6 PM check-in'],
  ['#/search', 'search', 'Search', 'Words, #tags, places'],
  ['#/settings', 'gear', 'Settings & backup', 'Theme, passphrase, sync between devices'],
];

export async function render(el) {
  el.append(h('div.page-head', h('h1', 'More')));
  el.append(h('div.stack', LINKS.map(([href, ic, t, d]) => h('a.card.row-btn.more-link', { href },
    h('span.v-icon', icon(ic, 22)), h('div', h('strong', t), h('div.muted.small', d)), icon('chevR', 18)))));
}
