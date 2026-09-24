// Vault encryption: AES-GCM 256 with a key derived from your passphrase
// (PBKDF2-SHA256). The passphrase and key are never stored; only a salt and
// an encrypted "verifier" are saved so we can tell if a passphrase is right.

import { db, getSetting, setSetting } from './db.js';

const te = new TextEncoder();
const td = new TextDecoder();
const ITER = 310000;
const VERIFY = 'lifelog-vault-ok';

let key = null;
let lastActive = Date.now();
const lockListeners = new Set();

export function toB64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(str) {
  const s = atob(str);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

export async function deriveKey(pass, saltB64, iter = ITER) {
  const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(saltB64), iterations: iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptBytes(bytes, k = key) {
  if (!k) throw new Error('Vault is locked');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, bytes);
  return { iv: toB64(iv), ct: new Uint8Array(ct) };
}
export async function decryptBytes(box, k = key) {
  if (!k) throw new Error('Vault is locked');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, k, box.ct);
  return new Uint8Array(pt);
}
export async function encryptJSON(obj, k = key) { return encryptBytes(te.encode(JSON.stringify(obj)), k); }
export async function decryptJSON(box, k = key) { return JSON.parse(td.decode(await decryptBytes(box, k))); }

async function makeVerifier(k) {
  const box = await encryptBytes(te.encode(VERIFY), k);
  return { iv: box.iv, ct: toB64(box.ct) };
}
export async function checkKey(k, meta) {
  try {
    const pt = await decryptBytes({ iv: meta.verifier.iv, ct: fromB64(meta.verifier.ct) }, k);
    return td.decode(pt) === VERIFY;
  } catch { return false; }
}

export async function cryptoMeta() { return getSetting('crypto'); }
export const isUnlocked = () => !!key;

export async function setupPassphrase(pass) {
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const k = await deriveKey(pass, salt);
  await setSetting('crypto', { salt, iter: ITER, verifier: await makeVerifier(k) });
  key = k;
  touch();
}

export async function unlock(pass) {
  const meta = await cryptoMeta();
  if (!meta) return false;
  const k = await deriveKey(pass, meta.salt, meta.iter);
  if (!(await checkKey(k, meta))) return false;
  key = k;
  touch();
  return true;
}

export function lock() {
  if (!key) return;
  key = null;
  for (const fn of lockListeners) fn();
}
export function onLock(fn) { lockListeners.add(fn); }
export function touch() { lastActive = Date.now(); }

// Re-encrypt every vault record with a new passphrase.
export async function changePassphrase(oldPass, newPass) {
  const meta = await cryptoMeta();
  const oldKey = await deriveKey(oldPass, meta.salt, meta.iter);
  if (!(await checkKey(oldKey, meta))) return false;
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const newKey = await deriveKey(newPass, salt);
  await reencryptAll(oldKey, newKey);
  await setSetting('crypto', { salt, iter: ITER, verifier: await makeVerifier(newKey) });
  key = newKey;
  touch();
  return true;
}

export async function reencryptRecords(items, files, oldKey, newKey) {
  const outItems = [];
  for (const it of items) outItems.push({ ...it, data: await encryptJSON(await decryptJSON(it.data, oldKey), newKey) });
  const outFiles = [];
  for (const f of files) {
    const box = await encryptBytes(await decryptBytes(f, oldKey), newKey);
    outFiles.push({ ...f, iv: box.iv, ct: box.ct });
  }
  return { items: outItems, files: outFiles };
}

async function reencryptAll(oldKey, newKey) {
  const { items, files } = await reencryptRecords(await db.all('vault'), await db.all('vaultfiles'), oldKey, newKey);
  if (items.length) await db.bulkPut('vault', items);
  if (files.length) await db.bulkPut('vaultfiles', files);
}

export function currentKey() { return key; }
export function adoptKey(k) { key = k; touch(); }

// Auto-lock after a period of inactivity.
export function startAutoLock(getMinutes) {
  ['pointerdown', 'keydown', 'scroll'].forEach(ev => addEventListener(ev, touch, { passive: true }));
  setInterval(async () => {
    if (!key) return;
    const mins = await getMinutes();
    if (mins > 0 && Date.now() - lastActive > mins * 60000) lock();
  }, 15000);
}
