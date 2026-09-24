import { db, uid } from '../db.js';
import { h, icon, fmtDate, formModal, toast, modal, empty, promptPassphrase, confirmDialog, filePicker, compressImage, download, parseDate, isoDate, catSvg } from '../ui.js';
import { cryptoMeta, isUnlocked, unlock, setupPassphrase, lock, encryptJSON, decryptJSON, encryptBytes, decryptBytes } from '../crypto.js';

export const title = 'Vault';

const DOC_TYPES = ['SSN card', "Driver's license", 'Passport', 'Visa / EAD', 'Green card', 'I-94', 'I-20 / DS-2019', 'Birth certificate', 'Health insurance', 'Auto insurance', 'Degree / transcript', 'Application', 'Tax document', 'Lease / contract', 'Other'];
const NETWORKS = ['Visa', 'Mastercard', 'Amex', 'Discover', 'Debit', 'Gift / store card', 'Membership', 'Other'];

const FORMS = {
  doc: { label: 'Document', icon: 'file', fields: [
    { name: 'label', label: 'Name', required: true, placeholder: 'Passport, DL, SSN…' },
    { name: 'docType', label: 'Type', type: 'select', options: DOC_TYPES, half: true },
    { name: 'holder', label: 'Name on document', half: true },
    { name: 'number', label: 'Number', secret: true, half: true },
    { name: 'issuer', label: 'Issued by', half: true, placeholder: 'State / country / agency' },
    { name: 'issued', label: 'Issued', type: 'date', half: true },
    { name: 'expiry', label: 'Expires', type: 'date', half: true, hint: 'You will get a reminder on Today 90 days before.' },
    { name: 'notes', label: 'Notes', type: 'textarea', rows: 3, placeholder: 'Application numbers, receipt numbers, where the original is kept…' },
  ] },
  card: { label: 'Card', icon: 'card', fields: [
    { name: 'label', label: 'Name', required: true, placeholder: 'Chase Sapphire, Costco…' },
    { name: 'docType', label: 'Kind', type: 'select', options: NETWORKS, half: true },
    { name: 'holder', label: 'Cardholder', half: true },
    { name: 'number', label: 'Card number', secret: true },
    { name: 'exp', label: 'Valid thru (MM/YY)', half: true },
    { name: 'cvv', label: 'CVV', secret: true, half: true },
    { name: 'pin', label: 'PIN', secret: true, half: true },
    { name: 'phone', label: 'Bank phone', type: 'tel', half: true },
    { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
  ] },
  login: { label: 'Login / secure note', icon: 'lock', fields: [
    { name: 'label', label: 'Name', required: true, placeholder: 'USCIS account, bank…' },
    { name: 'url', label: 'Website', type: 'url' },
    { name: 'username', label: 'Username / email', half: true },
    { name: 'password', label: 'Password', secret: true, half: true },
    { name: 'notes', label: 'Secure note', type: 'textarea', rows: 5, secret: false },
  ] },
};
const PLAIN = ['label', 'docType', 'expiry']; // kept unencrypted so the list and expiry reminders work while locked

export async function render(el) {
  const meta = await cryptoMeta();
  el.append(h('div.page-head', h('div', h('h1', 'Vault'), h('p.muted', 'ID copies, cards and logins — encrypted on this device with your passphrase.')),
    isUnlocked() ? h('div.head-actions', h('button.btn', { onclick: () => lock() }, icon('lock', 18), 'Lock')) : null));

  if (!meta) {
    el.append(h('section.card.vault-intro', catSvg(64),
      h('h2', 'Set up your vault'),
      h('p', 'Pick a passphrase you will remember. Everything in the vault — numbers, notes and document scans — is encrypted with it (AES-256) before it is saved.'),
      h('p.warn', h('strong', 'There is no reset.'), ' If you forget the passphrase, the vault contents cannot be recovered. Write it down somewhere safe.'),
      h('button.btn.primary', { onclick: async () => {
        const p = await promptPassphrase('Create vault passphrase', { confirm: true, hint: 'At least 8 characters. A short sentence works well.' });
        if (!p) return;
        await setupPassphrase(p);
        toast('Vault ready');
        dispatchEvent(new Event('rerender'));
      } }, icon('lock', 18), 'Create passphrase')));
    return;
  }

  const items = (await db.all('vault')).sort((a, b) => a.label.localeCompare(b.label));
  if (!isUnlocked()) {
    const pass = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Vault passphrase', 'aria-label': 'Vault passphrase' });
    const err = h('p.error');
    el.append(h('section.card.vault-intro', icon('lock', 40),
      h('h2', 'Vault is locked'),
      h('p.muted', `${items.length} item${items.length === 1 ? '' : 's'} stored.`),
      h('form.inline-form', { onsubmit: async e => {
        e.preventDefault();
        err.textContent = 'Unlocking…';
        if (await unlock(pass.value)) dispatchEvent(new Event('rerender'));
        else { err.textContent = 'Wrong passphrase.'; pass.select(); }
      } }, pass, h('button.btn.primary', { type: 'submit' }, 'Unlock')), err));
    setTimeout(() => pass.focus(), 50);
    return;
  }

  el.append(h('div.page-actions',
    h('button.btn.primary', { onclick: () => editItem('doc') }, icon('file', 18), 'Add document'),
    h('button.btn', { onclick: () => editItem('card') }, icon('card', 18), 'Add card'),
    h('button.btn', { onclick: () => editItem('login') }, icon('lock', 18), 'Add login / note')));

  if (!items.length) { el.append(empty('Add your passport, DL, SSN card, visa papers and cards. Snap a photo or attach a PDF of each.')); return; }

  const today = isoDate();
  for (const kind of ['doc', 'card', 'login']) {
    const group = items.filter(i => i.kind === kind);
    if (!group.length) continue;
    el.append(h('h2.group-title', FORMS[kind].label + 's'), h('div.vault-grid', group.map(it => {
      const days = it.expiry ? Math.round((parseDate(it.expiry) - parseDate(today)) / 86400000) : null;
      return h('button.card.vault-item.v-' + kind, { onclick: () => openItem(it) },
        h('span.v-icon', icon(FORMS[kind].icon, 22)),
        h('span.v-text', h('strong', it.label), h('span.muted.small', it.docType || '')),
        days != null ? h('span.pill' + (days < 0 ? '.danger' : days <= 90 ? '.warnp' : ''), days < 0 ? 'expired' : 'exp ' + fmtDate(it.expiry)) : null);
    })));
  }
}

async function editItem(kind, item = null, data = null) {
  const f = FORMS[kind];
  const values = item ? { ...data, label: item.label, docType: item.docType, expiry: item.expiry } : {};
  const fields = f.fields.map(x => x.secret ? { ...x, type: x.type || 'text' } : x);
  const out = await formModal((item ? 'Edit ' : 'Add ') + f.label.toLowerCase(), fields, values, {
    onDelete: item ? () => deleteItem(item, data) : null,
  });
  if (!out) return;
  const secret = {};
  for (const x of f.fields) if (!PLAIN.includes(x.name)) secret[x.name] = out[x.name];
  secret.files = data?.files || [];
  const rec = item ? { ...item } : { id: uid(), kind };
  rec.label = out.label; rec.docType = out.docType || ''; rec.expiry = out.expiry || '';
  rec.data = await encryptJSON(secret);
  await db.put('vault', rec);
  toast('Saved securely');
  return rec;
}

async function deleteItem(item, data) {
  for (const f of data?.files || []) await db.del('vaultfiles', f.id);
  await db.del('vault', item.id);
  toast('Deleted');
}

async function openItem(item) {
  let data;
  try { data = await decryptJSON(item.data); } catch { toast('Could not decrypt — is the vault still unlocked?'); return; }
  const f = FORMS[item.kind];
  const urls = [];
  const rows = [];
  for (const x of f.fields) {
    const v = PLAIN.includes(x.name) ? item[x.name] : data[x.name];
    if (!v || x.name === 'label') continue;
    const shown = x.type === 'date' ? fmtDate(v) : v;
    const val = h('span.v-val' + (x.secret ? '.masked' : ''), x.secret ? '•'.repeat(Math.min(12, String(v).length)) : shown);
    let revealed = false;
    rows.push(h('div.v-row' + (x.type === 'textarea' ? '.full' : ''),
      h('span.muted.small', x.label), val,
      h('span.v-actions',
        x.secret ? h('button.icon-btn', { 'aria-label': 'Show ' + x.label, onclick: () => { revealed = !revealed; val.textContent = revealed ? v : '•'.repeat(Math.min(12, String(v).length)); val.classList.toggle('masked', !revealed); } }, icon('eye', 16)) : null,
        x.type !== 'textarea' ? h('button.icon-btn', { 'aria-label': 'Copy ' + x.label, onclick: async () => { await navigator.clipboard.writeText(String(v)); toast('Copied — clipboard clears in 30s'); setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30000); } }, icon('copy', 16)) : null)));
  }

  const filesEl = h('div.v-files');
  const paintFiles = async () => {
    filesEl.replaceChildren();
    for (const file of data.files || []) {
      const rec = await db.get('vaultfiles', file.id);
      if (!rec) continue;
      const blob = new Blob([await decryptBytes(rec)], { type: file.mime });
      const url = URL.createObjectURL(blob);
      urls.push(url);
      filesEl.append(h('div.v-file',
        file.mime.startsWith('image/') ? h('a', { href: url, target: '_blank', rel: 'noopener' }, h('img', { src: url, alt: file.name })) : h('a.v-pdf', { href: url, target: '_blank', rel: 'noopener' }, icon('file', 32), h('span', file.name)),
        h('div.v-file-actions',
          h('button.icon-btn', { 'aria-label': 'Download', onclick: () => download(file.name, blob) }, icon('down', 16)),
          h('button.icon-btn', { 'aria-label': 'Remove file', onclick: async () => {
            if (!(await confirmDialog('Remove this file from the vault?'))) return;
            data.files = data.files.filter(x => x.id !== file.id);
            await db.del('vaultfiles', file.id);
            item.data = await encryptJSON(data);
            await db.put('vault', item, { silent: true });
            paintFiles();
          } }, icon('trash', 16)))));
    }
    filesEl.append(h('button.thumb.add', { onclick: async () => {
      const files = await filePicker({ accept: 'image/*,application/pdf', multiple: true });
      for (const file of files) {
        let blob = file, mime = file.type || 'application/octet-stream';
        if (mime.startsWith('image/')) { blob = (await compressImage(file, 2400, 0.88)).blob; mime = blob.type || mime; }
        const box = await encryptBytes(new Uint8Array(await blob.arrayBuffer()));
        const fid = uid();
        await db.put('vaultfiles', { id: fid, iv: box.iv, ct: box.ct }, { silent: true });
        data.files = [...(data.files || []), { id: fid, name: file.name || 'scan.jpg', mime, size: blob.size }];
      }
      item.data = await encryptJSON(data);
      await db.put('vault', item, { silent: true });
      paintFiles();
    } }, icon('camera'), h('span', 'Add scan / PDF')));
  };

  const m = modal(item.label, [
    h('div.v-rows', rows.length ? rows : h('p.muted', 'No details yet.')),
    h('h3', 'Copies'), filesEl,
    h('div.form-actions', h('span.spacer'), h('button.btn', { onclick: async () => { m.close(); const updated = await editItem(item.kind, item, data); if (updated) openItem(updated); } }, icon('edit', 16), 'Edit details')),
  ], { wide: true, onClose: () => { urls.forEach(u => URL.revokeObjectURL(u)); dispatchEvent(new Event('rerender')); } });
  paintFiles();
}
