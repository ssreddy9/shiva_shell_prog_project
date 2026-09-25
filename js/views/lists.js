// Checklists: office duties for the day, groceries, a hike backpack, and any
// list you make yourself. Lists live in `lists`, their items in `listitems`.

import { db, getSetting, setSetting } from '../db.js';
import { h, icon, isoDate, fmtDate, toast, modal, confirmDialog, empty } from '../ui.js';

export const title = 'Lists';

// daily: plan in the morning, tick off by evening; unfinished items carry over.
// shopping: ticked items drop to "In the cart" and can be cleared.
// packing: grouped, reusable — reset before the next trip.
export const TYPES = {
  daily: { label: 'Daily to-do', emoji: '💼', hint: 'Plan it in the morning, tick it off by evening. Anything unfinished carries over to the next day.', add: 'Add a duty for today…' },
  shopping: { label: 'Shopping list', emoji: '🛒', hint: 'Ticked items move to “In the cart”. Clear them when you’re done shopping.', add: 'Add an item… (e.g. Milk ×2)' },
  packing: { label: 'Packing list', emoji: '🎒', hint: 'A reusable list grouped by section. Reset it before the next trip.', add: 'Add something to pack…' },
  checklist: { label: 'Checklist', emoji: '✅', hint: 'A simple list of things to tick off.', add: 'Add an item…' },
};

const HIKE = {
  Essentials: ['Water (2–3 L)', 'Snacks and lunch', 'Offline map / trail app', 'Phone + power bank', 'Headlamp', 'First-aid kit', 'Sunscreen and lip balm', 'Sunglasses and hat', 'ID, cash and car key'],
  Clothing: ['Rain jacket', 'Warm layer', 'Extra socks', 'Hiking shoes'],
  Gear: ['Daypack', 'Trekking poles', 'Knife / multitool', 'Whistle', 'Trash bag (leave no trace)', 'Camera'],
};

// First run: create the three starter lists. Fixed ids keep two devices that
// both start fresh from creating duplicates when they sync.
export async function ensureLists() {
  if (await getSetting('listsSeeded', false)) return;
  if ((await db.count('lists')) === 0) {
    await db.bulkPut('lists', [
      { id: 'office', title: 'Office duties', type: 'daily', emoji: '💼', order: 1 },
      { id: 'groceries', title: 'Groceries', type: 'shopping', emoji: '🛒', order: 2 },
      { id: 'hike', title: 'Hike backpack', type: 'packing', emoji: '🎒', order: 3 },
    ].map(l => ({ ...l, createdAt: Date.now(), updatedAt: Date.now() })), { silent: true });
    let n = 0;
    const items = Object.entries(HIKE).flatMap(([group, names]) => names.map(text => ({
      id: 'hike-' + text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      list: 'hike', text, group, done: false, order: ++n, createdAt: Date.now(), updatedAt: Date.now(),
    })));
    await db.bulkPut('listitems', items, { silent: true });
  }
  await setSetting('listsSeeded', true, { silent: true });
}

const byOrder = (a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt);
const allLists = async () => (await db.all('lists')).sort(byOrder);
const itemsOf = async id => (await db.byIndex('listitems', 'list', id)).sort(byOrder);

// What a daily list shows for a day: today's items, repeating items, and
// anything from earlier days that isn't done yet.
export function dailyView(items, today = isoDate()) {
  const doneToday = i => i.repeat ? i.doneOn === today : i.done;
  const visible = items.filter(i => i.repeat || i.date === today || (!i.done && i.date < today) || (i.done && i.doneOn === today));
  return visible.map(i => ({ item: i, done: doneToday(i), carried: !i.repeat && i.date < today && !i.done }));
}

async function setDone(item, done, type) {
  const today = isoDate();
  if (type === 'daily' && item.repeat) item.doneOn = done ? today : null;
  else { item.done = done; item.doneOn = done ? today : null; }
  await db.put('listitems', item, { silent: true });
}

async function addItem(list, raw, extra = {}) {
  const text = raw.trim();
  if (!text) return null;
  const item = { list: list.id, text, done: false, order: Date.now(), ...extra };
  if (list.type === 'daily') item.date = isoDate();
  return db.put('listitems', item, { silent: true });
}

// One row: checkbox + text (+ small tags) + edit button.
function itemRow(list, item, done, { carried = false, onToggle } = {}) {
  const box = h('input', { type: 'checkbox', checked: done, 'aria-label': (done ? 'Mark not done: ' : 'Mark done: ') + item.text });
  const row = h('li.li-row' + (done ? '.done' : ''),
    h('label.check-line.li-main', box,
      h('span.li-text', item.text,
        item.qty ? h('small.li-qty', ' ×' + item.qty) : null,
        item.repeat ? h('span.pill.li-tag', { title: 'Repeats every day' }, '↻ daily') : null,
        carried ? h('span.pill.warnp.li-tag', 'from ' + fmtDate(item.date, { weekday: 'short' })) : null)),
    h('button.icon-btn.li-edit', { type: 'button', 'aria-label': 'Edit ' + item.text, onclick: () => editItem(list, item) }, icon('edit', 16)));
  box.addEventListener('change', async () => {
    row.classList.toggle('done', box.checked);
    await setDone(item, box.checked, list.type);
    onToggle ? onToggle(box.checked) : dispatchEvent(new Event('rerender'));
  });
  return row;
}

function editItem(list, item) {
  const text = h('input', { type: 'text', value: item.text, 'aria-label': 'Item' });
  const qty = h('input', { type: 'text', value: item.qty || '', placeholder: 'e.g. 2, 1 kg', 'aria-label': 'Quantity' });
  const group = h('input', { type: 'text', value: item.group || '', placeholder: 'e.g. Clothing', 'aria-label': 'Section' });
  const repeat = h('input', { type: 'checkbox', checked: !!item.repeat });
  const m = modal('Edit item', h('form.form', { onsubmit: async e => {
    e.preventDefault();
    if (!text.value.trim()) { text.focus(); return; }
    item.text = text.value.trim();
    if (list.type === 'shopping') item.qty = qty.value.trim() || null;
    if (list.type === 'packing') item.group = group.value.trim() || null;
    if (list.type === 'daily') {
      const was = !!item.repeat;
      item.repeat = repeat.checked;
      if (was !== item.repeat) { item.date = isoDate(); item.done = false; }
    }
    await db.put('listitems', item);
    m.close();
  } },
    h('label.field', h('span', 'Item'), text),
    list.type === 'shopping' ? h('label.field', h('span', 'Quantity'), qty) : null,
    list.type === 'packing' ? h('label.field', h('span', 'Section'), group) : null,
    list.type === 'daily' ? h('label.field.check', repeat, h('span', 'Repeat every day (e.g. check email, stand-up)')) : null,
    h('div.form-actions',
      h('button.btn.danger.ghost', { type: 'button', onclick: async () => { await db.del('listitems', item.id); m.close(); toast('Removed'); } }, icon('trash', 16), 'Delete'),
      h('span.spacer'),
      h('button.btn.primary', { type: 'submit' }, 'Save'))));
}

// Inline "add" field: type and press Enter (or +). Keeps focus for the next one.
function adder(list, { placeholder, extra = () => ({}), after } = {}) {
  const input = h('input', { type: 'text', placeholder: placeholder || TYPES[list.type].add, 'aria-label': 'Add to ' + list.title, enterkeyhint: 'done' });
  const go = async () => {
    let text = input.value;
    const x = extra();
    // "Milk x2" / "Eggs ×12" → quantity
    const q = list.type === 'shopping' && text.match(/^(.*?)\s*[x×]\s*(\d+(?:\.\d+)?\s*\w*)\s*$/i);
    if (q) { text = q[1]; x.qty = q[2]; }
    if (!(await addItem(list, text, x))) { input.focus(); return; }
    input.value = '';
    sessionStorage.setItem('dinalekha-refocus', list.id);
    after ? after() : dispatchEvent(new Event('rerender'));
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  if (sessionStorage.getItem('dinalekha-refocus') === list.id) {
    sessionStorage.removeItem('dinalekha-refocus');
    setTimeout(() => input.focus(), 30);
  }
  return h('div.li-add', input, h('button.btn.primary.small', { type: 'button', onclick: go, 'aria-label': 'Add' }, icon('plus', 16), 'Add'));
}

function progress(done, total, label) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return h('div.li-progress', h('div.meter-track', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': done, 'aria-label': label },
    h('div.meter-fill' + (total && done === total ? '.done' : ''), { style: { width: pct + '%' } })), h('span.muted.small', `${done}/${total}`));
}

// ---------- Today page card for daily lists ----------
export async function todayCards() {
  await ensureLists();
  const lists = (await allLists()).filter(l => l.type === 'daily');
  const out = [];
  for (const list of lists) {
    const rows = dailyView(await itemsOf(list.id));
    const done = rows.filter(r => r.done).length;
    out.push(h('section.card.li-card',
      h('div.card-head', h('h2', h('span.li-emoji', list.emoji || '💼'), list.title), h('a.link', { href: '#/lists/' + list.id }, rows.length ? `${done}/${rows.length} done` : 'Open')),
      rows.length ? h('ul.li-list', rows.sort((a, b) => a.done - b.done).map(r => itemRow(list, r.item, r.done, { carried: r.carried }))) : h('p.muted.small', 'Nothing planned yet. What needs doing at work today?'),
      adder(list)));
  }
  return out;
}

// ---------- pages ----------
export async function render(el, [id]) {
  await ensureLists();
  if (id) return detail(el, id);
  const lists = await allLists();
  el.append(h('div.page-head',
    h('div', h('h1', 'Lists'), h('p.muted', 'Office duties, groceries, what to pack — tick things off as you go.')),
    h('button.btn.primary', { onclick: newList }, icon('plus', 18), 'New list')));
  if (!lists.length) { el.append(empty('No lists yet.', h('button.btn.primary', { onclick: newList }, icon('plus', 18), 'New list'))); return; }
  const cards = [];
  for (const list of lists) {
    const items = await itemsOf(list.id);
    let done, total, sub;
    if (list.type === 'daily') {
      const rows = dailyView(items);
      done = rows.filter(r => r.done).length; total = rows.length; sub = 'Today';
    } else if (list.type === 'shopping') {
      done = items.filter(i => i.done).length; total = items.length; sub = !total ? 'Empty' : total - done ? `${total - done} to buy` : 'All bought';
    } else {
      done = items.filter(i => i.done).length; total = items.length; sub = list.type === 'packing' ? `${done} of ${total} packed` : `${done} of ${total} done`;
    }
    const preview = (list.type === 'daily' ? dailyView(items).filter(r => !r.done).map(r => r.item) : items.filter(i => !i.done)).slice(0, 3);
    cards.push(h('a.card.li-summary', { href: '#/lists/' + list.id },
      h('div.card-head', h('h2', h('span.li-emoji', list.emoji || TYPES[list.type].emoji), list.title), icon('chevR', 18)),
      h('p.muted.small', TYPES[list.type].label + ' · ' + sub),
      total ? progress(done, total, list.title + ' progress') : null,
      preview.length ? h('ul.li-preview', preview.map(i => h('li', i.text))) : h('p.muted.small', total ? 'All done ✨' : 'Empty — tap to add items')));
  }
  el.append(h('div.dash-grid', cards));
}

async function detail(el, id) {
  const list = await db.get('lists', id);
  if (!list) { el.append(empty('This list no longer exists.', h('a.btn.primary', { href: '#/lists' }, 'All lists'))); return; }
  const items = await itemsOf(id);
  const T = TYPES[list.type] || TYPES.checklist;

  el.append(h('div.page-head',
    h('div', h('a.link.small', { href: '#/lists' }, icon('chevL', 14), 'All lists'),
      h('h1', h('span.li-emoji', list.emoji || T.emoji), list.title), h('p.muted', T.hint)),
    h('button.btn.ghost', { onclick: () => editList(list) }, icon('edit', 16), 'Edit list')));

  if (list.type === 'daily') return dailyDetail(el, list, items);

  const done = items.filter(i => i.done);
  const actions = [];
  if (done.length && list.type !== 'packing') actions.push(h('button.btn.ghost.small', { onclick: async () => {
    for (const i of done) await db.del('listitems', i.id, { silent: true });
    dispatchEvent(new Event('rerender'));
    toast(`Cleared ${done.length} item${done.length > 1 ? 's' : ''}`);
  } }, icon('trash', 16), list.type === 'shopping' ? 'Clear the cart' : 'Remove ticked'));
  if (done.length && list.type !== 'shopping') actions.push(h('button.btn.ghost.small', { onclick: async () => {
    for (const i of done) { i.done = false; i.doneOn = null; }
    await db.bulkPut('listitems', done);
    toast(list.type === 'packing' ? 'Ready for the next trip' : 'All unticked');
  } }, '↺ ', list.type === 'packing' ? 'Reset for next trip' : 'Untick all'));

  const card = h('section.card.li-card.span2');
  card.append(h('div.card-head', h('h2', list.type === 'packing' ? `${done.length} of ${items.length} packed` : list.type === 'shopping' ? `${items.length - done.length} to buy` : `${done.length} of ${items.length} done`),
    h('div.li-actions', actions)));
  if (items.length) card.append(progress(done.length, items.length, list.title + ' progress'));

  if (list.type === 'packing') {
    const groups = [...new Set(items.map(i => i.group || 'Other'))];
    const pick = h('select', { 'aria-label': 'Section' }, [...groups, '+ New section…'].map(g => h('option', { value: g }, g)));
    pick.addEventListener('change', () => {
      if (pick.value !== '+ New section…') return;
      const name = (prompt('Name of the new section') || '').trim();
      if (!name) { pick.selectedIndex = 0; return; }
      pick.insertBefore(h('option', { value: name }, name), pick.lastChild);
      pick.value = name;
    });
    card.append(h('div.li-add-wrap', adder(list, { extra: () => ({ group: pick.value === '+ New section…' ? 'Other' : pick.value }) }), groups.length ? pick : null));
    for (const g of groups) {
      const gi = items.filter(i => (i.group || 'Other') === g);
      card.append(h('h3.li-group', g, h('span.muted.small', ` ${gi.filter(i => i.done).length}/${gi.length}`)),
        h('ul.li-list', gi.map(i => itemRow(list, i, i.done))));
    }
  } else {
    card.append(adder(list));
    const open = items.filter(i => !i.done);
    card.append(open.length ? h('ul.li-list', open.map(i => itemRow(list, i, false))) : h('p.muted', items.length ? 'Everything is ticked off ✨' : 'Nothing here yet.'));
    if (done.length) card.append(h('h3.li-group', list.type === 'shopping' ? 'In the cart' : 'Done'), h('ul.li-list', done.map(i => itemRow(list, i, true))));
  }
  el.append(h('div.dash-grid', card));
}

function dailyDetail(el, list, items) {
  const today = isoDate();
  const rows = dailyView(items, today);
  const open = rows.filter(r => !r.done), done = rows.filter(r => r.done);
  const card = h('section.card.li-card.span2',
    h('div.card-head', h('h2', 'Today · ' + fmtDate(today)), h('span.muted', `${done.length}/${rows.length} done`)),
    rows.length ? progress(done.length, rows.length, 'Today’s progress') : null,
    adder(list),
    open.length ? h('ul.li-list', open.map(r => itemRow(list, r.item, false, { carried: r.carried })))
      : h('p.muted', rows.length ? 'All done for today — nice work 🎉' : 'Nothing planned yet. Add what needs doing today.'),
    done.length ? [h('h3.li-group', 'Done today'), h('ul.li-list', done.map(r => itemRow(list, r.item, true)))] : null);
  el.append(h('div.dash-grid', card));

  // History: finished one-off items grouped by the day they were done.
  const past = items.filter(i => !i.repeat && i.done && i.doneOn && i.doneOn < today).sort((a, b) => b.doneOn.localeCompare(a.doneOn));
  if (past.length) {
    const days = [...new Set(past.map(i => i.doneOn))].slice(0, 30);
    el.append(h('details.card.li-history',
      h('summary', h('strong', 'Past days'), h('span.muted.small', ` · ${past.length} finished`)),
      days.map(d => h('div.li-day', h('h3.li-group', fmtDate(d)), h('ul.li-list.li-past', past.filter(i => i.doneOn === d).map(i => h('li', '✓ ', i.text))))),
      h('button.btn.ghost.small', { onclick: async () => {
        const old = past.filter(i => i.doneOn < today);
        if (!(await confirmDialog(`Remove ${old.length} finished item${old.length > 1 ? 's' : ''} from past days?`, { ok: 'Remove' }))) return;
        for (const i of old) await db.del('listitems', i.id, { silent: true });
        dispatchEvent(new Event('rerender'));
      } }, icon('trash', 16), 'Clear history')));
  }
}

function listForm(list, onSave) {
  const t = h('input', { type: 'text', value: list.title || '', placeholder: 'e.g. Camping trip', 'aria-label': 'Name' });
  const em = h('input.li-emoji-in', { type: 'text', value: list.emoji || '', maxlength: 4, 'aria-label': 'Emoji' });
  const type = h('select', { 'aria-label': 'Kind of list', disabled: !!list.id }, Object.entries(TYPES).map(([k, v]) => h('option', { value: k, selected: (list.type || 'checklist') === k }, v.emoji + ' ' + v.label)));
  type.addEventListener('change', () => { if (!em.dataset.touched) em.value = TYPES[type.value].emoji; });
  em.addEventListener('input', () => { em.dataset.touched = '1'; });
  if (!list.emoji) em.value = TYPES[type.value].emoji;
  const hint = h('p.muted.small', TYPES[type.value].hint);
  type.addEventListener('change', () => { hint.textContent = TYPES[type.value].hint; });
  return h('form.form', { onsubmit: async e => {
    e.preventDefault();
    if (!t.value.trim()) { t.focus(); return; }
    await onSave({ title: t.value.trim(), emoji: em.value.trim() || TYPES[type.value].emoji, type: type.value });
  } },
    h('div.li-name-row', h('label.field', h('span', 'Emoji'), em), h('label.field.grow', h('span', 'Name'), t)),
    h('label.field', h('span', 'Kind'), type), hint);
}

function newList() {
  const m = modal('New list', [listForm({}, async v => {
    const saved = await db.put('lists', { ...v, order: Date.now() });
    m.close();
    location.hash = '#/lists/' + saved.id;
  }), h('div.form-actions', h('span.spacer'), h('button.btn.primary', { onclick: () => m.box.querySelector('form').requestSubmit() }, 'Create'))]);
}

function editList(list) {
  const m = modal('Edit list', [listForm(list, async v => {
    Object.assign(list, { title: v.title, emoji: v.emoji });
    await db.put('lists', list);
    m.close();
  }), h('div.form-actions',
    h('button.btn.danger.ghost', { onclick: async () => {
      if (!(await confirmDialog(`Delete “${list.title}” and everything on it?`))) return;
      for (const i of await itemsOf(list.id)) await db.del('listitems', i.id, { silent: true });
      await db.del('lists', list.id);
      m.close();
      location.hash = '#/lists';
    } }, icon('trash', 16), 'Delete list'),
    h('span.spacer'),
    h('button.btn.primary', { onclick: () => m.box.querySelector('form').requestSubmit() }, 'Save'))]);
}
