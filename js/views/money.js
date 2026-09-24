import { db, getSetting, setSetting } from '../db.js';
import { h, icon, fmtDate, formModal, toast, money, isoDate, empty, download, parseDate } from '../ui.js';
import { EXPENSE_CATS, INCOME_CATS } from '../seed.js';
import { barChart, rankBars } from '../charts.js';

export const title = 'Money';

const ACCOUNT_TYPES = ['Checking', 'Savings', 'Credit card', 'Cash', 'Investment', 'Retirement', 'Loan', 'Other'];
const DEBT = ['Credit card', 'Loan'];

async function accountOptions() {
  const accts = await db.all('accounts');
  return [['', '—'], ...accts.map(a => [a.id, a.name])];
}

export async function quickTransaction(type = 'expense', existing = null) {
  const t = existing ? existing.type : type;
  const out = await formModal((existing ? 'Edit ' : 'Add ') + (t === 'income' ? 'income' : 'expense'), [
    { name: 'amount', label: 'Amount', type: 'money', required: true, min: 0, half: true },
    { name: 'date', label: 'Date', type: 'date', required: true, half: true },
    { name: 'category', label: 'Category', type: 'select', options: t === 'income' ? INCOME_CATS : EXPENSE_CATS, half: true },
    { name: 'accountId', label: 'Account', type: 'select', options: await accountOptions(), half: true },
    { name: 'note', label: 'Note', placeholder: t === 'income' ? 'Paycheck, client…' : 'Where / what' },
  ], existing || { date: isoDate(), type: t }, {
    onDelete: existing ? () => db.del('money', existing.id) : null,
  });
  if (!out) return;
  out.type = t;
  out.amount = Math.abs(out.amount);
  await db.put('money', out);
  toast(existing ? 'Saved' : (t === 'income' ? 'Income' : 'Expense') + ' of ' + money(out.amount) + ' added');
}

async function editAccount(a) {
  const out = await formModal(a ? 'Edit account' : 'Add account', [
    { name: 'name', label: 'Name', required: true, placeholder: 'Chase checking, Amex…' },
    { name: 'type', label: 'Type', type: 'select', options: ACCOUNT_TYPES, half: true },
    { name: 'opening', label: 'Starting balance', type: 'money', half: true, hint: 'For cards/loans, enter what you owe as a positive number.' },
    { name: 'asOf', label: 'Balance as of', type: 'date', half: true },
    { name: 'last4', label: 'Last 4 digits', half: true, placeholder: 'optional' },
    { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
  ], a || { type: 'Checking', opening: 0, asOf: isoDate() }, { onDelete: a ? () => db.del('accounts', a.id) : null });
  if (out) { out.opening = out.opening || 0; await db.put('accounts', out); toast('Saved'); }
}

export function accountBalance(a, txns) {
  let bal = a.opening || 0;
  const debt = DEBT.includes(a.type);
  for (const t of txns) {
    if (t.accountId !== a.id || (a.asOf && t.date < a.asOf)) continue;
    const sign = t.type === 'income' ? 1 : -1;
    bal += debt ? -sign * t.amount : sign * t.amount;
  }
  return bal;
}

export async function render(el, params, query) {
  const month = query.get('m') || isoDate().slice(0, 7);
  const [txns, accounts, budgets] = await Promise.all([db.all('money'), db.all('accounts'), getSetting('budgets', {})]);
  const inMonth = txns.filter(t => t.date && t.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const income = inMonth.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const spent = inMonth.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const net = income - spent;

  const shift = n => { const d = parseDate(month + '-01'); d.setMonth(d.getMonth() + n); return isoDate(d).slice(0, 7); };
  const monthLabel = m => new Date(m + '-02').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  el.append(h('div.page-head',
    h('div', h('h1', 'Money'), h('p.muted', 'Earnings, spending, budgets and what you are worth — all on this device.')),
    h('div.head-actions',
      h('button.btn', { onclick: () => quickTransaction('income') }, icon('up', 18), 'Income'),
      h('button.btn.primary', { onclick: () => quickTransaction('expense') }, icon('down', 18), 'Expense'))));

  el.append(h('div.month-nav',
    h('a.icon-btn', { href: '#/money?m=' + shift(-1), 'aria-label': 'Previous month' }, icon('chevL')),
    h('strong', monthLabel(month)),
    h('a.icon-btn', { href: '#/money?m=' + shift(1), 'aria-label': 'Next month' }, icon('chevR'))));

  el.append(h('div.stat-row.big',
    h('div.stat', h('span.muted', 'Earned'), h('strong', money(income))),
    h('div.stat', h('span.muted', 'Spent'), h('strong', money(spent))),
    h('div.stat', h('span.muted', 'Net'), h('strong' + (net < 0 ? '.neg' : '.pos'), (net < 0 ? '−' : '+') + money(Math.abs(net)))),
    h('div.stat', h('span.muted', 'Saved'), h('strong', income ? Math.round((net / income) * 100) + '%' : '—'))));

  const grid = h('div.dash-grid');
  el.append(grid);

  // six-month trend
  const trend = [];
  for (let i = 5; i >= 0; i--) {
    const m = shift(-i);
    const rows = txns.filter(t => t.date && t.date.startsWith(m));
    trend.push({ label: new Date(m + '-02').toLocaleDateString(undefined, { month: 'short' }),
      values: [rows.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0), rows.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)] });
  }
  grid.append(h('section.card', h('div.card-head', h('h2', icon('trend', 18), 'Last 6 months')),
    barChart({ data: trend, series: [{ name: 'Earned', color: 'var(--series-1)' }, { name: 'Spent', color: 'var(--series-2)' }], fmt: v => money(v, { whole: true }), ariaLabel: 'Earned vs spent, last 6 months' })));

  // categories vs budgets
  const cats = {};
  for (const t of inMonth) if (t.type === 'expense') cats[t.category || 'Other'] = (cats[t.category || 'Other'] || 0) + t.amount;
  for (const c of Object.keys(budgets)) if (budgets[c] && !(c in cats)) cats[c] = 0;
  const rows = Object.entries(cats).map(([label, value]) => ({ label, value, budget: budgets[label] || 0 })).sort((a, b) => b.value - a.value);
  grid.append(h('section.card', h('div.card-head', h('h2', icon('wallet', 18), 'Where it went'), h('button.btn.ghost.small', { onclick: editBudgets }, 'Budgets')),
    rows.length ? rankBars(rows, v => money(v, { whole: true })) : h('p.muted', 'No spending logged this month.')));

  // accounts / net worth
  const bals = accounts.map(a => ({ a, bal: accountBalance(a, txns) }));
  const worth = bals.reduce((s, { a, bal }) => s + (DEBT.includes(a.type) ? -bal : bal), 0);
  grid.append(h('section.card.span2', h('div.card-head', h('h2', icon('card', 18), 'Accounts'), h('div.head-actions', h('span.muted', 'Net worth ' + money(worth)), h('button.btn.ghost.small', { onclick: () => editAccount() }, icon('plus', 16), 'Account'))),
    h('div.acct-grid', bals.map(({ a, bal }) => h('button.acct', { onclick: () => editAccount(a) },
      h('span.muted.small', a.type + (a.last4 ? ' ·•••' + a.last4 : '')), h('strong', a.name), h('span.acct-bal' + (DEBT.includes(a.type) ? '.neg' : ''), (DEBT.includes(a.type) ? 'owe ' : '') + money(bal))))),
    h('p.muted.small', 'Balances = starting balance + transactions linked to the account since that date.')));

  // transactions
  const list = h('div.txn-list');
  let day = '';
  for (const t of inMonth) {
    if (t.date !== day) { day = t.date; list.append(h('div.txn-day', fmtDate(day))); }
    list.append(h('button.txn', { onclick: () => quickTransaction(t.type, t) },
      h('span.txn-cat', t.category || 'Other'),
      h('span.txn-note.muted', t.note || ''),
      h('strong' + (t.type === 'income' ? '.pos' : ''), (t.type === 'income' ? '+' : '−') + money(t.amount))));
  }
  grid.append(h('section.card.span2',
    h('div.card-head', h('h2', icon('list', 18), 'Transactions'), h('button.btn.ghost.small', { onclick: () => exportCSV(txns, accounts) }, icon('down', 16), 'CSV')),
    inMonth.length ? list : empty('Nothing logged for ' + monthLabel(month) + '.')));
}

async function editBudgets() {
  const budgets = await getSetting('budgets', {});
  const out = await formModal('Monthly budgets', EXPENSE_CATS.map(c => ({ name: c, label: c, type: 'money', half: true, placeholder: 'no limit' })), budgets);
  if (!out) return;
  const clean = {};
  for (const c of EXPENSE_CATS) if (out[c]) clean[c] = out[c];
  await setSetting('budgets', clean);
  toast('Budgets saved');
}

function exportCSV(txns, accounts) {
  const names = Object.fromEntries(accounts.map(a => [a.id, a.name]));
  const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const rows = [['Date', 'Type', 'Category', 'Amount', 'Account', 'Note'], ...txns.sort((a, b) => a.date.localeCompare(b.date)).map(t => [t.date, t.type, t.category, t.amount, names[t.accountId] || '', t.note])];
  download('dinalekha-money-' + isoDate() + '.csv', new Blob([rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv' }));
}
