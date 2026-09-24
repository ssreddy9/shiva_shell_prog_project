// DOM helpers, dialogs, forms, formatting and photo handling.

import { db, uid, getSetting, withBlob } from './db.js';

// h('div.card.big#id', {onclick}, child, [children], 'text')
export function h(sel, attrs, ...kids) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) {
    kids.unshift(attrs);
    attrs = {};
  }
  const [tagPart, ...rest] = sel.split('.');
  const [tag, id] = tagPart.split('#');
  const svg = ['svg', 'path', 'rect', 'circle', 'line', 'g', 'text', 'polyline', 'ellipse'].includes(tag);
  const el = svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag || 'div');
  if (id) el.id = id;
  if (rest.length) el.setAttribute('class', rest.join(' '));
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.setAttribute('class', ((el.getAttribute('class') || '') + ' ' + v).trim());
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value' && !svg) el.value = v;
    else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'multiple') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false || k === true) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function icon(name, size = 20) {
  const s = h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
  s.innerHTML = ICONS[name] || ICONS.dot;
  return s;
}
const ICONS = {
  dot: '<circle cx="12" cy="12" r="3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  sprout: '<path d="M7 20h10M12 20V10"/><path d="M12 10c0-4 3-6 8-6 0 4-3 6-8 6ZM12 13c0-3-2-5-7-5 0 3 2 5 7 5Z"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="16.5" cy="13.5" r="1.2"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  cal: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.5" r="3.5"/>',
  book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2Zm0 0A2 2 0 0 0 6 22h14"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>',
  bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z"/>',
  quote: '<path d="M7 7h4v6c0 2-1 4-4 4M14 7h4v6c0 2-1 4-4 4"/>',
  map: '<path d="m9 4-6 3v13l6-3 6 3 6-3V4l-6 3Z"/><path d="M9 4v13M15 7v13"/>',
  heart: '<path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.7l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.5a5.5 5.5 0 0 0 0-7.9Z"/>',
  run: '<circle cx="14" cy="4" r="2"/><path d="m6 22 3-7 3 2v5M13 10l-3 5M10 8l4-1 3 3 3 1M5 12l2-4 3 0"/>',
  brief: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
  edit: '<path d="M11 4H4v16h16v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
  down: '<path d="M12 3v12M6 11l6 6 6-6M4 21h16"/>',
  up: '<path d="M12 21V9M6 13l6-6 6 6M4 3h16"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z"/>',
  pin: '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8M15 7h6v6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
};

export function clear(el) { while (el.firstChild) el.firstChild.remove(); return el; }

// ---------- formatting ----------
export const pad = n => String(n).padStart(2, '0');
export function isoDate(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); }
export function weekStart(s = isoDate()) { const d = parseDate(s); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return isoDate(d); } // Monday
export function fmtDate(s, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  if (!s) return '';
  const d = parseDate(s);
  if (d.getFullYear() !== new Date().getFullYear()) opts = { ...opts, year: 'numeric' };
  return d.toLocaleDateString(undefined, opts);
}
export function fmtLongDate(s) { return parseDate(s).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }
export function fmtTime(t) {
  if (!t) return '';
  const [H, M] = t.split(':').map(Number);
  const ap = H >= 12 ? 'PM' : 'AM';
  const hr = ((H + 11) % 12) + 1;
  return M ? `${hr}:${pad(M)} ${ap}` : `${hr} ${ap}`;
}
export function minutesOf(t) { if (!t) return null; const [H, M] = t.split(':').map(Number); return H * 60 + M; }
export function relTime(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
let currency = 'USD';
export async function loadCurrency() { currency = await getSetting('currency', 'USD'); }
export function money(n, opts = {}) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: opts.whole ? 0 : 2 }).format(n || 0);
  } catch { return (n || 0).toFixed(2); }
}
export function fmtHours(mins) { const h = Math.floor(mins / 60), m = Math.round(mins % 60); return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`; }
export const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
export const MOOD_WORDS = ['Rough', 'Low', 'Okay', 'Good', 'Great'];

// ---------- toast ----------
export function toast(msg, action) {
  const host = document.getElementById('toasts') || document.body.appendChild(h('div#toasts'));
  const t = h('div.toast', { role: 'status' }, h('span', msg),
    action ? h('button.link', { onclick: () => { action.fn(); t.remove(); } }, action.label) : null);
  host.append(t);
  while (host.children.length > 2) host.firstChild.remove();
  setTimeout(() => t.classList.add('out'), action ? 5000 : 2600);
  setTimeout(() => t.remove(), action ? 5400 : 3000);
}

// ---------- modal ----------
export function modal(title, body, { wide = false, onClose } = {}) {
  const prevFocus = document.activeElement;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', esc); onClose && onClose(); prevFocus && prevFocus.focus && prevFocus.focus(); };
  const esc = e => { if (e.key === 'Escape') close(); };
  const box = h('div.modal' + (wide ? '.wide' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div.modal-head', h('h2', title), h('button.icon-btn', { onclick: close, 'aria-label': 'Close' }, icon('x'))),
    h('div.modal-body', body));
  const wrap = h('div.backdrop', { onclick: e => { if (e.target === wrap) close(); } }, box);
  document.body.append(wrap);
  document.addEventListener('keydown', esc);
  const f = box.querySelector('input:not([type=checkbox]):not([type=file]), textarea, select');
  if (f && matchMedia('(pointer:fine)').matches) setTimeout(() => { if (!box.contains(document.activeElement)) f.focus(); }, 30);
  return { close, box };
}

export function confirmDialog(message, { ok = 'Delete', danger = true } = {}) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (done) return; done = true; m.close(); resolve(v); };
    const m = modal('Please confirm', [
      h('p', message),
      h('div.form-actions',
        h('button.btn.ghost', { onclick: () => finish(false) }, 'Cancel'),
        h('button.btn' + (danger ? '.danger' : '.primary'), { onclick: () => finish(true) }, ok)),
    ], { onClose: () => { if (!done) { done = true; resolve(false); } } });
  });
}

export function promptPassphrase(title, { confirm = false, hint = '' } = {}) {
  return new Promise(resolve => {
    let done = false;
    const p1 = h('input', { type: 'password', autocomplete: confirm ? 'new-password' : 'current-password', placeholder: 'Passphrase' });
    const p2 = confirm ? h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Repeat passphrase' }) : null;
    const err = h('p.error');
    const submit = e => {
      e.preventDefault();
      if (confirm && p1.value.length < 8) { err.textContent = 'Use at least 8 characters.'; return; }
      if (confirm && p1.value !== p2.value) { err.textContent = 'Passphrases do not match.'; return; }
      if (!p1.value) return;
      done = true; m.close(); resolve(p1.value);
    };
    const m = modal(title, h('form.form', { onsubmit: submit },
      hint ? h('p.muted', hint) : null,
      h('label.field', h('span', 'Passphrase'), p1),
      p2 ? h('label.field', h('span', 'Repeat'), p2) : null,
      err,
      h('div.form-actions', h('button.btn.primary', { type: 'submit' }, 'Continue'))),
      { onClose: () => { if (!done) resolve(null); } });
  });
}

// ---------- photos ----------
const urlCache = new Map();
export async function mediaURL(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const m = await withBlob('media', await db.get('media', id));
  if (!m || !m.blob) return null;
  const url = URL.createObjectURL(m.blob);
  urlCache.set(id, url);
  return url;
}
export function mimg(id, cls = '', alt = '') {
  const img = h('img' + (cls ? '.' + cls : ''), { alt, loading: 'lazy', decoding: 'async' });
  mediaURL(id).then(u => { if (u) img.src = u; });
  return img;
}

export async function compressImage(file, max = 1600, q = 0.82) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
    return { blob: blob || file, w: c.width, h: c.height };
  } catch {
    return { blob: file };
  }
}

export async function saveImage(file) {
  const { blob, w, h: hh } = await compressImage(file);
  const rec = { id: uid(), blob, type: blob.type, w, h: hh, name: file.name };
  await db.put('media', rec, { silent: true });
  return rec.id;
}

export function filePicker({ accept = 'image/*', multiple = true } = {}) {
  return new Promise(resolve => {
    const inp = h('input', { type: 'file', accept, multiple, style: { display: 'none' } });
    inp.addEventListener('change', () => { resolve([...inp.files]); inp.remove(); });
    document.body.append(inp);
    inp.click();
  });
}

// ---------- generic form ----------
// spec: [{name, label, type, options, placeholder, rows, required, hint, show(values)}]
export function formModal(title, spec, values = {}, { onDelete, saveLabel = 'Save', wide = false } = {}) {
  return new Promise(resolve => {
    let done = false;
    const added = [];     // media ids created in this session; removed if cancelled
    const state = { ...values };
    const getters = {};
    const rows = [];

    for (const f of spec) {
      const id = 'f_' + f.name;
      let input;
      const v = state[f.name];
      switch (f.type) {
        case 'textarea':
          input = h('textarea', { id, rows: f.rows || 4, placeholder: f.placeholder || '' });
          input.value = v || '';
          getters[f.name] = () => input.value.trim();
          break;
        case 'select':
          input = h('select', { id }, f.options.map(o => {
            const [val, lab] = Array.isArray(o) ? o : [o, o];
            return h('option', { value: val, selected: String(v ?? f.default ?? '') === String(val) }, lab);
          }));
          getters[f.name] = () => input.value;
          break;
        case 'checkbox':
          input = h('input', { id, type: 'checkbox', checked: !!v });
          getters[f.name] = () => input.checked;
          break;
        case 'number':
        case 'money':
          input = h('input', { id, type: 'number', inputmode: 'decimal', step: f.step || (f.type === 'money' ? '0.01' : 'any'), min: f.min, max: f.max, value: v ?? '', placeholder: f.placeholder || '' });
          getters[f.name] = () => input.value === '' ? null : Number(input.value);
          break;
        case 'tags':
          input = h('input', { id, type: 'text', value: (v || []).join(', '), placeholder: f.placeholder || 'comma, separated' });
          getters[f.name] = () => input.value.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean);
          break;
        case 'mood': {
          let cur = v || 0;
          const btns = MOODS.map((m, i) => h('button.mood-btn', {
            type: 'button', 'aria-label': MOOD_WORDS[i], 'aria-pressed': String(cur === i + 1),
            onclick: () => { cur = cur === i + 1 ? 0 : i + 1; btns.forEach((b, j) => b.setAttribute('aria-pressed', String(cur === j + 1))); },
          }, m));
          input = h('div.mood-row', btns);
          getters[f.name] = () => cur || null;
          break;
        }
        case 'rating': {
          let cur = v || 0;
          const max = f.max || 5;
          const btns = [];
          for (let i = 1; i <= max; i++) btns.push(h('button.dot-btn', { type: 'button', 'aria-label': `${i} of ${max}`, onclick: () => { cur = cur === i ? 0 : i; paint(); } }, String(i)));
          const paint = () => btns.forEach((b, j) => b.classList.toggle('on', j < cur));
          paint();
          input = h('div.rating-row', btns);
          getters[f.name] = () => cur || null;
          break;
        }
        case 'photos': {
          let ids = [...(v || [])];
          const grid = h('div.thumb-grid');
          const paint = () => {
            clear(grid);
            ids.forEach((mid, i) => grid.append(h('div.thumb', mimg(mid),
              h('button.thumb-x', { type: 'button', 'aria-label': 'Remove photo', onclick: () => { ids.splice(i, 1); paint(); } }, icon('x', 14)))));
            grid.append(h('button.thumb.add', { type: 'button', onclick: async () => {
              const files = await filePicker({ accept: 'image/*', multiple: true });
              for (const file of files) { const mid = await saveImage(file); added.push(mid); ids.push(mid); }
              paint();
            } }, icon('camera'), h('span', 'Add')));
          };
          paint();
          input = grid;
          getters[f.name] = () => ids;
          break;
        }
        default:
          input = h('input', { id, type: f.type || 'text', value: v ?? (f.default || ''), placeholder: f.placeholder || '', autocomplete: 'off', list: f.suggest ? id + '_dl' : null });
          getters[f.name] = () => input.value.trim();
      }
      const wrapCls = f.type === 'checkbox' ? 'label.field.check' : (f.type === 'photos' || f.type === 'mood' || f.type === 'rating' ? 'div.field' : 'label.field');
      const row = h(wrapCls + (f.half ? '.half' : ''), f.type === 'checkbox'
        ? [input, h('span', f.label)]
        : [h('span', f.label), input, f.suggest ? h('datalist', { id: id + '_dl' }, f.suggest.map(s => h('option', { value: s }))) : null, f.hint ? h('small.muted', f.hint) : null]);
      rows.push(row);
    }

    const err = h('p.error');
    const collect = () => { const out = { ...values }; for (const k in getters) out[k] = getters[k](); return out; };
    const submit = e => {
      e.preventDefault();
      const out = collect();
      for (const f of spec) {
        const val = out[f.name];
        if (f.required && (val == null || val === '' || (Array.isArray(val) && !val.length))) {
          err.textContent = `${f.label} is required.`;
          return;
        }
      }
      done = true;
      m.close();
      resolve(out);
    };
    const m = modal(title, h('form.form', { onsubmit: submit }, h('div.form-grid', rows), err,
      h('div.form-actions',
        onDelete ? h('button.btn.danger.ghost', { type: 'button', onclick: async () => {
          if (await confirmDialog('Delete this item? This cannot be undone.')) { done = true; m.close(); await onDelete(); resolve(null); }
        } }, icon('trash', 16), 'Delete') : null,
        h('span.spacer'),
        h('button.btn.primary', { type: 'submit' }, saveLabel))),
      { wide, onClose: () => { if (!done) { added.forEach(id => db.del('media', id, { tombstone: false })); resolve(null); } } });
  });
}

// ---------- misc ----------
export function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
}

export function empty(msg, action) {
  return h('div.empty', h('div.empty-cat', catSvg(64)), h('p', msg), action || null);
}

// A little cat, in the spirit of the planner's doodles.
export function catSvg(size = 40) {
  const s = h('svg', { width: size, height: size, viewBox: '0 0 64 64', 'aria-hidden': 'true', class: 'cat' });
  s.innerHTML = `<path d="M12 26 10 8l14 10h16l14-10-2 18c3 4 4 8 4 12 0 12-11 20-24 20S8 50 8 38c0-4 1-8 4-12Z" fill="var(--cat)" stroke="var(--ink)" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M15 14l6 5M49 14l-6 5" stroke="var(--pink)" stroke-width="3" stroke-linecap="round"/>
  <circle cx="23" cy="36" r="3.4" fill="var(--ink)"/><circle cx="41" cy="36" r="3.4" fill="var(--ink)"/>
  <circle cx="24.2" cy="34.8" r="1" fill="#fff"/><circle cx="42.2" cy="34.8" r="1" fill="#fff"/>
  <path d="M29 42q3 3 6 0" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/>
  <path d="M31 40h2l-1 1.4Z" fill="var(--pink)"/>
  <circle cx="17" cy="42" r="3" fill="var(--pink)" opacity=".35"/><circle cx="47" cy="42" r="3" fill="var(--pink)" opacity=".35"/>`;
  return s;
}

export function tagChips(tags) {
  if (!tags || !tags.length) return null;
  return h('div.tags', tags.map(t => h('a.tag', { href: '#/search?q=' + encodeURIComponent('#' + t) }, '#' + t)));
}

export function segmented(options, current, onPick) {
  return h('div.segmented', { role: 'tablist' }, options.map(([val, label]) =>
    h('button', { role: 'tab', 'aria-selected': String(val === current), onclick: () => onPick(val) }, label)));
}

export function textBlock(text) {
  return h('div.prose', (text || '').split(/\n{2,}/).map(p => h('p', p.split('\n').map((line, i) => i ? [h('br'), line] : line))));
}
