import { onChange, getSetting } from './db.js';
import { h, icon, clear, modal, loadCurrency } from './ui.js';
import { seedIfNeeded, migrateHighlightsToPosts } from './seed.js';
import { applyTheme } from './theme.js';
import { cryptoMeta, unlock, isUnlocked, onLock, startAutoLock } from './crypto.js';
import { editEntry, KINDS } from './kinds.js';
import { quickTransaction } from './views/money.js';

import * as today from './views/today.js';
import * as feed from './views/feed.js';
import * as write from './views/write.js';
import * as grow from './views/grow.js';
import * as money from './views/money.js';
import * as vault from './views/vault.js';
import * as schedule from './views/schedule.js';
import * as calendar from './views/calendar.js';
import * as search from './views/search.js';
import * as settings from './views/settings.js';
import * as entry from './views/entry.js';
import * as more from './views/more.js';

const ROUTES = { today, feed, write, grow, money, vault, schedule, calendar, search, settings, entry, journey: entry, more };

const NAV = [
  ['today', 'sun', 'Today'], ['feed', 'grid', 'Feed'], ['write', 'pen', 'Write'], ['grow', 'sprout', 'Grow'],
  ['money', 'wallet', 'Money'], ['vault', 'lock', 'Vault'], ['schedule', 'clock', 'Schedule'], ['calendar', 'cal', 'Calendar'],
  ['search', 'search', 'Search'], ['settings', 'gear', 'Settings'],
];
const TABBAR = [['today', 'sun', 'Today'], ['feed', 'grid', 'Feed'], ['write', 'pen', 'Write'], ['grow', 'sprout', 'Grow'], ['money', 'wallet', 'Money'], ['more', 'more', 'More']];

let viewEl, sideNav, tabNav, current = '', appLocked = false;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'today';
  const [path, qs] = raw.split('?');
  const [name, ...params] = path.split('/').map(decodeURIComponent);
  return { name: ROUTES[name] ? name : 'today', params, query: new URLSearchParams(qs || '') };
}

async function renderView({ keepScroll = false } = {}) {
  if (appLocked) return;
  const { name, params, query } = parseHash();
  const key = location.hash;
  const y = window.scrollY;
  const fresh = h('div.view');
  try {
    await ROUTES[name].render(fresh, params, query);
  } catch (err) {
    console.error(err);
    fresh.append(h('div.card.alert', h('h2', 'Something went wrong'), h('pre.small', String(err && err.stack || err))));
  }
  viewEl.replaceWith(fresh);
  viewEl = fresh;
  const same = keepScroll && key === current;
  current = key;
  window.scrollTo(0, same ? y : 0);
  const section = name === 'entry' || name === 'journey' ? '' : name;
  for (const a of document.querySelectorAll('[data-nav]')) {
    const on = a.dataset.nav === section || (a.dataset.nav === 'more' && ['vault', 'schedule', 'calendar', 'search', 'settings'].includes(section));
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  document.title = (ROUTES[name].title || 'Dinalekha') + ' · Dinalekha';
}

let pending = null;
function scheduleRerender() {
  clearTimeout(pending);
  pending = setTimeout(() => renderView({ keepScroll: true }), 60);
}

function quickAddSheet() {
  const items = [
    ...['diary', 'moment', 'journey', 'story', 'idea', 'quote', 'activity'].map(k => [KINDS[k].label, KINDS[k].icon, () => editEntry(k)]),
    ['Expense', 'down', () => quickTransaction('expense')],
    ['Income', 'up', () => quickTransaction('income')],
    ['Document to vault', 'lock', () => { location.hash = '#/vault'; }],
  ];
  const m = modal('Log something', h('div.sheet-grid', items.map(([label, ic, fn]) => h('button.sheet-item', { onclick: () => { m.close(); fn(); } }, icon(ic, 22), h('span', label)))));
}

function shell() {
  const app = document.getElementById('app');
  clear(app);
  sideNav = h('nav.sidebar', { 'aria-label': 'Main' },
    h('a.brand', { href: '#/today' }, h('img.brand-logo', { src: 'icons/icon.svg', alt: '', width: 38, height: 38 }), h('span.brand-text', h('strong', 'Dinalekha'), h('small', 'the story of your day'))),
    NAV.map(([k, ic, label]) => h('a.nav-link', { href: '#/' + k, 'data-nav': k }, icon(ic), h('span', label))),
    h('button.btn.primary.side-add', { onclick: quickAddSheet }, icon('plus', 18), 'Log something'));
  tabNav = h('nav.tabbar', { 'aria-label': 'Main' }, TABBAR.map(([k, ic, label]) => h('a.tab', { href: '#/' + k, 'data-nav': k }, icon(ic, 22), h('span', label))));
  viewEl = h('div.view');
  app.append(sideNav, h('main.main', viewEl), tabNav,
    h('button.fab', { onclick: quickAddSheet, 'aria-label': 'Log something' }, icon('plus', 26)),
    h('div#toasts', { 'aria-live': 'polite' }));
}

async function lockScreen() {
  appLocked = true;
  const app = document.getElementById('app');
  clear(app);
  const pass = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Passphrase', 'aria-label': 'Passphrase' });
  const err = h('p.error');
  const name = await getSetting('name', '');
  app.append(h('div.lockscreen',
    h('form.card.lock-card', { onsubmit: async e => {
      e.preventDefault();
      err.textContent = 'Unlocking…';
      if (await unlock(pass.value)) { appLocked = false; shell(); renderView(); }
      else { err.textContent = 'Wrong passphrase.'; pass.select(); }
    } },
      h('img.lock-logo', { src: 'icons/icon.svg', alt: '', width: 76, height: 76 }), h('h1', name ? `Hi ${name}` : 'Dinalekha'), h('p.muted', 'Enter your passphrase to open your journal.'),
      pass, h('button.btn.primary.wide', { type: 'submit' }, 'Unlock'), err)));
  setTimeout(() => pass.focus(), 50);
}

async function boot() {
  await applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  await seedIfNeeded();
  await migrateHighlightsToPosts();
  await loadCurrency();
  navigator.storage?.persist?.().catch(() => {});

  const lockApp = await getSetting('lockApp', false);
  if (lockApp && (await cryptoMeta()) && !isUnlocked()) await lockScreen();
  else { shell(); await renderView(); }

  addEventListener('hashchange', () => renderView());
  addEventListener('rerender', scheduleRerender);
  onChange(scheduleRerender);
  onLock(async () => {
    const full = await getSetting('lockApp', false);
    // close anything showing decrypted vault details; keep unrelated drafts open
    document.querySelectorAll('.backdrop').forEach(b => { if (full || b.querySelector('.v-rows')) b.remove(); });
    if (full) lockScreen();
    else scheduleRerender();
  });
  startAutoLock(() => getSetting('autoLock', 5));

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // updateViaCache 'none' + regular update checks: new versions are picked up
    // as soon as they are published, and the page reloads once to show them.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      const check = () => reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      setInterval(check, 30 * 60000);
    }).catch(err => console.warn('SW registration failed', err));
  }
}

boot();
