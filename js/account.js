// End-to-end encryption keys for cloud accounts.
//
// Each person has one random 256-bit "data key" that encrypts everything they
// sync. The server only stores that key wrapped (encrypted) twice:
//   • with a key derived from their password (PBKDF2-SHA256), and
//   • with a key derived from their one-time recovery key.
// So the server — and the project owner — can never read their data. If a
// password is reset by email, the recovery key is what re-opens the data.

import { toB64, fromB64, deriveKey } from './crypto.js';

const ITER = 310000;
const te = new TextEncoder();
const td = new TextDecoder();

let dataKey = null;
export const getDataKey = () => dataKey;
export const setDataKey = k => { dataKey = k; };

const rand = n => crypto.getRandomValues(new Uint8Array(n));

async function wrap(rawKey, secret, salt, iter = ITER) {
  const kek = await deriveKey(secret, salt, iter);
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, rawKey);
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}
async function unwrap(ctB64, ivB64, secret, salt, iter) {
  const kek = await deriveKey(secret, salt, iter);
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB64) }, kek, fromB64(ctB64));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

// Recovery key: 20 random bytes as 32 base32 characters, shown in groups of 4.
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid mix-ups
function newRecoveryCode() {
  const bytes = rand(20);
  let bits = 0, val = 0, out = '';
  for (const b of bytes) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return out.match(/.{4}/g).join('-');
}
export const normalizeRecovery = code => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

async function recoveryFields(raw) {
  const code = newRecoveryCode();
  const salt = toB64(rand(16));
  const w = await wrap(raw, normalizeRecovery(code), salt);
  return { code, fields: { recovery_salt: salt, recovery_wrapped_key: w.ct, recovery_iv: w.iv } };
}
async function passwordFields(raw, password) {
  const salt = toB64(rand(16));
  const w = await wrap(raw, password, salt);
  return { kdf_salt: salt, kdf_iter: ITER, wrapped_key: w.ct, wrap_iv: w.iv };
}

// New account: make a data key and wrap it with the password and a recovery key.
export async function createKeys(uid, password) {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  const rec = await recoveryFields(raw);
  const profile = { id: uid, ...(await passwordFields(raw, password)), ...rec.fields };
  return { key, profile, recoveryCode: rec.code };
}

export async function unlockWithPassword(profile, password) {
  try { return await unwrap(profile.wrapped_key, profile.wrap_iv, password, profile.kdf_salt, profile.kdf_iter); }
  catch { return null; }
}
export async function unlockWithRecovery(profile, code) {
  try { return await unwrap(profile.recovery_wrapped_key, profile.recovery_iv, normalizeRecovery(code), profile.recovery_salt, ITER); }
  catch { return null; }
}

// After a password change or reset: wrap the same data key with the new password.
export async function rewrapWithPassword(key, profile, password) {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  return { ...profile, ...(await passwordFields(raw, password)) };
}
// Replace the recovery key (e.g. if the old one was lost).
export async function newRecoveryKey(key, profile) {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  const rec = await recoveryFields(raw);
  return { code: rec.code, profile: { ...profile, ...rec.fields } };
}

// ---- keep the unlocked key on this device so the app opens without a password
const KEYDB = 'dinalekha-keys';
function keyDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(KEYDB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('keys', { keyPath: 'uid' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function keyStore(mode) { return (await keyDb()).transaction('keys', mode).objectStore('keys'); }
const done = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

export async function rememberKey(uid, key) { await done((await keyStore('readwrite')).put({ uid, key })); }
export async function recallKey(uid) { const row = await done((await keyStore('readonly')).get(uid)); return row ? row.key : null; }
export async function forgetKey(uid) { await done((await keyStore('readwrite')).delete(uid)); }

// ---- encrypt / decrypt sync payloads (the store/key pair is bound in as AAD)
export async function sealJSON(obj, aad, key = dataKey) {
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(aad) }, key, te.encode(JSON.stringify(obj)));
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}
export async function openJSON(ivB64, ctB64, aad, key = dataKey) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB64), additionalData: te.encode(aad) }, key, fromB64(ctB64));
  return JSON.parse(td.decode(pt));
}
// Binary (photos, scans): 12-byte IV followed by ciphertext.
export async function sealBytes(bytes, aad, key = dataKey) {
  const iv = rand(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(aad) }, key, bytes));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return out;
}
export async function openBytes(buf, aad, key = dataKey) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12), additionalData: te.encode(aad) }, key, buf.slice(12));
  return new Uint8Array(pt);
}
