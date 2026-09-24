// Backup / restore. A backup is one JSON file containing everything,
// including photos. Vault contents stay encrypted inside it.
// Importing MERGES: newer edits win, deletions carry over — so you can move
// the file back and forth between phone and laptop to keep them in sync.

import { db, STORES, setSetting } from './db.js';
import { toB64, fromB64, deriveKey, checkKey, reencryptRecords, currentKey, cryptoMeta } from './crypto.js';
import { promptPassphrase } from './ui.js';

async function ser(v) {
  if (v instanceof Blob) return { $blob: toB64(new Uint8Array(await v.arrayBuffer())), type: v.type };
  if (v instanceof Uint8Array || v instanceof ArrayBuffer) return { $u8: toB64(v) };
  if (Array.isArray(v)) return Promise.all(v.map(ser));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = await ser(x);
    return o;
  }
  return v;
}
function deser(v) {
  if (Array.isArray(v)) return v.map(deser);
  if (v && typeof v === 'object') {
    if ('$blob' in v) return new Blob([fromB64(v.$blob)], { type: v.type });
    if ('$u8' in v) return fromB64(v.$u8);
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = deser(x);
    return o;
  }
  return v;
}

export async function exportBackup() {
  const parts = ['{"app":"dinalekha","version":1,"exportedAt":' + Date.now() + ',"stores":{'];
  let firstStore = true;
  for (const name of Object.keys(STORES)) {
    parts.push((firstStore ? '' : ',') + JSON.stringify(name) + ':[');
    firstStore = false;
    const rows = await db.all(name);
    // serialize row by row so large photo libraries don't need one giant string
    for (let i = 0; i < rows.length; i++) parts.push((i ? ',' : '') + JSON.stringify(await ser(rows[i])));
    parts.push(']');
  }
  parts.push('}}');
  await setSetting('lastBackup', Date.now(), { silent: true });
  return new Blob(parts, { type: 'application/json' });
}

const SKIP_SETTINGS = new Set(['crypto', 'lastBackup', 'seeded']);

export async function importBackup(file, onProgress = () => {}) {
  onProgress('Reading file…');
  const json = JSON.parse(await file.text());
  if (!['dinalekha', 'lifelog'].includes(json.app) || !json.stores) throw new Error('This is not a Dinalekha backup file.');
  const S = {};
  for (const [name, rows] of Object.entries(json.stores)) if (name in STORES) S[name] = deser(rows);

  // --- vault key reconciliation
  const backupCrypto = (S.settings || []).find(r => r.key === 'crypto')?.value;
  const localCrypto = await cryptoMeta();
  const hasVault = (S.vault || []).length > 0;
  if (hasVault && backupCrypto) {
    if (!localCrypto) {
      await setSetting('crypto', backupCrypto, { keepTime: true });
    } else if (localCrypto.salt !== backupCrypto.salt) {
      onProgress('The backup vault uses a different passphrase…');
      const pass = await promptPassphrase('Passphrase used for the BACKUP’s vault', { hint: 'This backup was made with a different vault passphrase. Enter it so the items can be re-encrypted with this device’s passphrase.' });
      if (!pass) throw new Error('Import cancelled.');
      const bk = await deriveKey(pass, backupCrypto.salt, backupCrypto.iter);
      if (!(await checkKey(bk, backupCrypto))) throw new Error('Wrong passphrase for the backup vault.');
      if (!currentKey()) throw new Error('Unlock this device’s vault first (Vault tab), then import again.');
      const { items, files } = await reencryptRecords(S.vault, S.vaultfiles || [], bk, currentKey());
      S.vault = items;
      S.vaultfiles = files;
    }
  }

  // --- merge
  const localTomb = Object.fromEntries((await db.all('deleted')).map(t => [t.id, t.at]));
  const incomingTomb = S.deleted || [];
  let added = 0, updated = 0, removed = 0;
  for (const name of Object.keys(STORES)) {
    if (name === 'deleted' || !S[name]) continue;
    onProgress('Merging ' + name + '…');
    const keyOf = r => r.id ?? r.date ?? r.key;
    const out = [];
    for (const r of S[name]) {
      const k = keyOf(r);
      if (name === 'settings' && SKIP_SETTINGS.has(k)) continue;
      const dead = localTomb[name + ':' + k];
      if (dead && dead >= (r.updatedAt || 0)) continue;
      const cur = await db.get(name, k);
      if (!cur) { out.push(r); added++; }
      else if ((r.updatedAt || 0) > (cur.updatedAt || 0)) { out.push(r); updated++; }
    }
    if (out.length) await db.bulkPut(name, out);
  }
  for (const t of incomingTomb) {
    const cur = await db.get(t.store, t.key);
    if (cur && (cur.updatedAt || 0) <= t.at) { await db.del(t.store, t.key, { tombstone: false }); removed++; }
  }
  if (incomingTomb.length) await db.bulkPut('deleted', incomingTomb);
  return { added, updated, removed };
}
