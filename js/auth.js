// Cloud accounts: sign in / sign up, unlocking the end-to-end encryption key,
// password reset with the recovery key, and first-time setup.

import { db, useDatabase, databaseHasData, readDatabase, LEGACY_DB, setSyncTracking, getSetting, setSetting, deleteDatabase } from './db.js';
import { h, icon, toast, download, confirmDialog, formModal } from './ui.js';
import { remote, appBaseUrl } from './remote.js';
import { createKeys, unlockWithPassword, unlockWithRecovery, rewrapWithPassword, newRecoveryKey, rememberKey, recallKey, forgetKey, setDataKey, getDataKey } from './account.js';
import { startSync, stopSync, syncNow, pendingCount } from './sync.js';
import { seedPlanner, seedBasics } from './seed.js';

const userDb = id => 'dinalekha-' + id;
let current = null; // { uid, email }
export const currentUser = () => current;

// ---- full-screen card shell --------------------------------------------------
function screen(...content) {
  const app = document.getElementById('app');
  app.replaceChildren(h('div.lockscreen.auth', h('div.card.lock-card.auth-card',
    h('img.lock-logo', { src: 'icons/icon.svg', alt: '', width: 64, height: 64 }), ...content)));
  const f = app.querySelector('input');
  if (f) setTimeout(() => f.focus(), 50);
}
const field = (label, attrs) => h('label.field', h('span', label), h('input', attrs));
const busy = (btn, on, text) => { btn.disabled = on; if (text) btn.textContent = text; };

function cleanUrl() {
  if (location.search) history.replaceState(null, '', appBaseUrl() + location.hash);
}

// ---- entry point --------------------------------------------------------------
// Resolves once someone is signed in, their key is unlocked and setup is done.
export async function startAccountMode() {
  const r = await remote();
  const params = new URLSearchParams(location.search);
  const resetting = params.has('reset');
  const confirmed = params.has('confirmed');
  // getSession() first: Supabase reads the one-time code from the address
  // (email confirmation / password reset links) before we tidy the URL.
  let session = await r.getSession();
  cleanUrl();
  let password = null;
  let note = confirmed ? 'Email confirmed — sign in to continue.' : '';

  if (session && resetting) {
    password = await newPasswordScreen(r);
  }
  while (!session) {
    ({ session, password } = await signInScreen(r, note));
    note = '';
  }
  current = { uid: session.user.id, email: session.user.email };

  await useDatabase(userDb(current.uid));
  let key = await recallKey(current.uid);
  const profile = key && !resetting ? null : await r.getProfile();
  if (!key) key = await unlockFlow(r, profile, password);
  else if (resetting && profile) await r.putProfile(await rewrapWithPassword(key, profile, password));
  setDataKey(key);
  await rememberKey(current.uid, key);

  setSyncTracking(true);
  await startSync(current.uid).catch(() => {});
  if (!(await getSetting('onboarded'))) await onboarding();
  return current;
}

// ---- sign in / create account ------------------------------------------------
function signInScreen(r, note = '') {
  return new Promise(resolve => {
    let mode = 'in';
    const email = field('Email', { type: 'email', autocomplete: 'email', required: true, placeholder: 'you@example.com' });
    const pw = field('Password', { type: 'password', autocomplete: 'current-password', required: true, minlength: 8 });
    const pw2 = field('Repeat password', { type: 'password', autocomplete: 'new-password', minlength: 8 });
    const msg = h('p.auth-msg', note);
    const err = h('p.error');
    const submit = h('button.btn.primary.wide', { type: 'submit' }, 'Sign in');
    const tabs = h('div.segmented.auth-tabs',
      h('button', { type: 'button', role: 'tab', 'aria-selected': 'true', onclick: () => setMode('in') }, 'Sign in'),
      h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', onclick: () => setMode('up') }, 'Create account'));
    const forgot = h('button.link', { type: 'button', onclick: () => forgotScreen(r, email.querySelector('input').value).then(() => signInScreen(r).then(resolve)) }, 'Forgot password?');
    const setMode = m => {
      mode = m;
      tabs.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-selected', String((i === 0) === (m === 'in'))));
      pw2.hidden = m === 'in';
      forgot.hidden = m !== 'in';
      submit.textContent = m === 'in' ? 'Sign in' : 'Create account';
      pw.querySelector('input').autocomplete = m === 'in' ? 'current-password' : 'new-password';
      err.textContent = '';
    };
    const form = h('form.form', { onsubmit: async e => {
      e.preventDefault();
      err.textContent = '';
      const em = email.querySelector('input').value.trim();
      const p = pw.querySelector('input').value;
      if (p.length < 8) { err.textContent = 'Use at least 8 characters for the password.'; return; }
      if (mode === 'up' && p !== pw2.querySelector('input').value) { err.textContent = 'Passwords do not match.'; return; }
      busy(submit, true, mode === 'in' ? 'Signing in…' : 'Creating account…');
      try {
        if (mode === 'in') resolve({ session: await r.signIn(em, p), password: p });
        else {
          const res = await r.signUp(em, p);
          if (res.session) resolve({ session: res.session, password: p });
          else { setMode('in'); msg.textContent = `Almost there — we sent a confirmation link to ${em}. Open it, then sign in here.`; busy(submit, false, 'Sign in'); }
        }
      } catch (ex) {
        err.textContent = friendly(ex.message);
        busy(submit, false, mode === 'in' ? 'Sign in' : 'Create account');
      }
    } }, email, pw, pw2, err, submit, h('div.auth-links', forgot));
    screen(h('h1', 'Dinalekha'), h('p.muted', 'the story of your day'), tabs, msg, form,
      h('p.muted.small.auth-foot', icon('lock', 14), ' Your entries are encrypted on your device before they are saved to the cloud. No one else — not even the app owner — can read them.'));
    setMode('in');
  });
}

function friendly(m = '') {
  if (/invalid login/i.test(m)) return 'Wrong email or password.';
  if (/not confirmed/i.test(m)) return 'Please confirm your email first — check your inbox for the link.';
  if (/already registered|already exists/i.test(m)) return 'That email already has an account — sign in instead.';
  if (/rate limit/i.test(m)) return 'Too many attempts. Please wait a few minutes and try again.';
  if (/fetch|network/i.test(m)) return 'Can’t reach the server. Check your internet connection.';
  return m;
}

function forgotScreen(r, prefill = '') {
  return new Promise(resolve => {
    const email = field('Email', { type: 'email', autocomplete: 'email', required: true, value: prefill });
    const err = h('p.error');
    const btn = h('button.btn.primary.wide', { type: 'submit' }, 'Send reset link');
    screen(h('h1', 'Reset password'),
      h('p.muted', 'We’ll email you a link to set a new password. Open it on this device. You’ll need your recovery key afterwards to unlock your entries.'),
      h('form.form', { onsubmit: async e => {
        e.preventDefault();
        busy(btn, true, 'Sending…');
        try {
          await r.sendPasswordReset(email.querySelector('input').value.trim());
          screen(h('h1', 'Check your email'), h('p', 'If an account exists for that address, a reset link is on its way.'),
            h('button.btn.primary.wide', { onclick: resolve }, 'Back to sign in'));
        } catch (ex) { err.textContent = friendly(ex.message); busy(btn, false, 'Send reset link'); }
      } }, email, err, btn),
      h('button.link', { onclick: resolve }, 'Back to sign in'));
  });
}

function newPasswordScreen(r) {
  return new Promise(resolve => {
    const pw = field('New password', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true });
    const pw2 = field('Repeat new password', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true });
    const err = h('p.error');
    const btn = h('button.btn.primary.wide', { type: 'submit' }, 'Save new password');
    screen(h('h1', 'Set a new password'), h('form.form', { onsubmit: async e => {
      e.preventDefault();
      const p = pw.querySelector('input').value;
      if (p.length < 8) { err.textContent = 'Use at least 8 characters.'; return; }
      if (p !== pw2.querySelector('input').value) { err.textContent = 'Passwords do not match.'; return; }
      busy(btn, true, 'Saving…');
      try { await r.updatePassword(p); resolve(p); }
      catch (ex) { err.textContent = friendly(ex.message); busy(btn, false, 'Save new password'); }
    } }, pw, pw2, err, btn));
  });
}

// ---- unlocking the encryption key ---------------------------------------------
async function unlockFlow(r, profile, password) {
  if (!profile) {
    // First sign-in ever: create the key and show the recovery key once.
    if (!password) password = await askPassword('Finish setting up', 'Enter your password once more to create your encryption key.');
    const made = await createKeys(current.uid, password);
    await r.putProfile(made.profile);
    await recoveryKeyScreen(made.recoveryCode, true);
    return made.key;
  }
  if (password) {
    const k = await unlockWithPassword(profile, password);
    if (k) return k;
    // Password works for login but not the key → it was reset by email.
    return recoverFlow(r, profile, password);
  }
  for (;;) {
    const p = await askPassword('Unlock your journal', 'Enter your password to unlock your entries on this device.', true);
    if (p === RECOVER) return recoverFlow(r, profile, null);
    const k = await unlockWithPassword(profile, p);
    if (k) return k;
    toast('That password didn’t unlock your data');
  }
}

const RECOVER = Symbol('recover');
function askPassword(title, text, allowRecover = false) {
  return new Promise(resolve => {
    const pw = field('Password', { type: 'password', autocomplete: 'current-password', required: true });
    screen(h('h1', title), h('p.muted', text), h('form.form', { onsubmit: e => { e.preventDefault(); resolve(pw.querySelector('input').value); } },
      pw, h('button.btn.primary.wide', { type: 'submit' }, 'Continue')),
      allowRecover ? h('button.link', { onclick: () => resolve(RECOVER) }, 'Use my recovery key instead') : null);
  });
}

function recoverFlow(r, profile, newPassword) {
  return new Promise(resolve => {
    const code = field('Recovery key', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX', required: true });
    const err = h('p.error');
    const btn = h('button.btn.primary.wide', { type: 'submit' }, 'Unlock');
    screen(h('h1', 'Enter your recovery key'),
      h('p.muted', 'Your password was changed, so your entries need the recovery key you saved when you created the account.'),
      h('form.form', { onsubmit: async e => {
        e.preventDefault();
        busy(btn, true, 'Unlocking…');
        const k = await unlockWithRecovery(profile, code.querySelector('input').value);
        if (!k) { err.textContent = 'That recovery key didn’t match.'; busy(btn, false, 'Unlock'); return; }
        const pw = newPassword || await askPassword('Choose your password', 'Enter your current account password so it unlocks your entries from now on.');
        await r.putProfile(await rewrapWithPassword(k, profile, pw));
        toast('Unlocked — your password now opens your entries again');
        resolve(k);
      } }, code, err, btn),
      h('details.auth-lost', h('summary', 'I lost my recovery key'),
        h('p.small', 'Without it, your existing encrypted entries can’t be opened by anyone. You can start over with an empty journal on this account.'),
        h('button.btn.danger.small', { onclick: async () => {
          if (!(await confirmDialog('Erase everything stored in this account and start with an empty journal? This cannot be undone.', { ok: 'Erase and start over' }))) return;
          const pw = newPassword || await askPassword('Choose your password', 'Enter your current account password.');
          const made = await createKeys(current.uid, pw);
          await wipeCloud(r);
          await r.putProfile(made.profile);
          await recoveryKeyScreen(made.recoveryCode, true);
          resolve(made.key);
        } }, 'Erase and start over')));
  });
}

export function recoveryKeyScreen(code, blocking) {
  return new Promise(resolve => {
    const ok = h('input', { type: 'checkbox' });
    const go = h('button.btn.primary.wide', { disabled: true, onclick: resolve }, 'Continue');
    ok.addEventListener('change', () => { go.disabled = !ok.checked; });
    const body = [
      h('h1', 'Your recovery key'),
      h('p', 'This is the only way to unlock your entries if you ever forget your password. Save it somewhere safe — a password manager, or printed and kept with your documents.'),
      h('div.recovery-code', code),
      h('div.btn-row.center-row',
        h('button.btn.small', { type: 'button', onclick: async () => { await navigator.clipboard.writeText(code); toast('Copied'); } }, icon('copy', 16), 'Copy'),
        h('button.btn.small', { type: 'button', onclick: () => download('dinalekha-recovery-key.txt', new Blob([`Dinalekha recovery key for ${current.email}\n\n${code}\n\nKeep this private. It unlocks your journal if you forget your password.\n`], { type: 'text/plain' })) }, icon('down', 16), 'Save as file')),
      h('label.check-line', ok, h('span', 'I saved my recovery key')),
      go,
    ];
    if (blocking) screen(...body);
    else { const m = openModal(body, resolve); go.addEventListener('click', m); }
  });
}
function openModal(body, onClose) {
  const wrap = h('div.backdrop', h('div.modal', h('div.modal-body.recovery-modal', body)));
  document.body.append(wrap);
  return () => { wrap.remove(); onClose(); };
}

// ---- first-time setup ----------------------------------------------------------
async function onboarding() {
  const hasLocal = await databaseHasData(LEGACY_DB);
  const remoteHasData = (await db.count('entries')) + (await db.count('schedule')) > 0;
  if (remoteHasData) { await setSetting('onboarded', true); return; } // set up already on another device
  await new Promise(resolve => {
    const name = field('Your name', { type: 'text', autocomplete: 'given-name', placeholder: 'What should we call you?', required: true });
    let choice = hasLocal ? 'import' : 'fresh';
    const opts = [
      hasLocal ? ['import', 'Bring my existing data', 'Everything already saved in Dinalekha on this device moves into your account.'] : null,
      ['fresh', 'Start fresh', 'An empty journal, schedule and learning plan that you fill in yourself.'],
      ['sample', 'Use the sample planner', 'A ready-made weekly schedule, 12-week AWS/Python learning plan and career tracker you can edit.'],
    ].filter(Boolean);
    const cards = opts.map(([v, t, d]) => h('button.choice', { type: 'button', 'aria-pressed': String(v === choice), onclick: () => { choice = v; cards.forEach((c, i) => c.setAttribute('aria-pressed', String(opts[i][0] === v))); } },
      h('strong', t), h('span.muted.small', d)));
    const btn = h('button.btn.primary.wide', { type: 'submit' }, 'Start my journal');
    screen(h('h1', 'Welcome to Dinalekha'), h('p.muted', 'Two quick things and you’re in.'),
      h('form.form', { onsubmit: async e => {
        e.preventDefault();
        busy(btn, true, 'Setting up…');
        if (choice === 'import') await importLegacy();
        else { await seedBasics(); if (choice === 'sample') await seedPlanner(); }
        await setSetting('name', name.querySelector('input').value.trim());
        await setSetting('onboarded', true);
        syncNow();
        resolve();
      } }, name, h('div.choices', cards), btn));
  });
}

async function importLegacy() {
  const data = await readDatabase(LEGACY_DB);
  for (const [store, rows] of Object.entries(data)) {
    const list = store === 'settings' ? rows.filter(r => !['seeded', 'lastBackup', 'highlightsMigrated'].includes(r.key)) : rows;
    if (list.length) await db.bulkPut(store, list, { silent: true });
  }
  // The old on-device copy now lives in this account; remove it so another
  // person signing in on this device can't import it.
  await deleteDatabase(LEGACY_DB);
  toast('Your existing data is now in your account');
}

// ---- account actions (Settings) ------------------------------------------------
export async function signOut() {
  const r = await remote();
  await syncNow();
  const left = await pendingCount();
  if (left && !(await confirmDialog(`${left} change${left > 1 ? 's haven’t' : ' hasn’t'} uploaded yet (you may be offline). Signing out now will lose ${left > 1 ? 'them' : 'it'}. Sign out anyway?`, { ok: 'Sign out anyway' }))) return;
  stopSync();
  setSyncTracking(false);
  await forgetKey(current.uid);
  await r.signOut();
  await useDatabase(LEGACY_DB);
  await deleteDatabase(userDb(current.uid)); // remove this device's copy; it stays safe in the cloud
  location.reload();
}

export async function changePassword() {
  const out = await formModal('Change password', [
    { name: 'pw', label: 'New password', type: 'password', required: true },
    { name: 'pw2', label: 'Repeat new password', type: 'password', required: true },
  ], {}, { saveLabel: 'Change password' });
  if (!out) return;
  if (out.pw.length < 8) return toast('Use at least 8 characters');
  if (out.pw !== out.pw2) return toast('Passwords do not match');
  const r = await remote();
  await r.updatePassword(out.pw);
  await r.putProfile(await rewrapWithPassword(getDataKey(), await r.getProfile(), out.pw));
  toast('Password changed');
}

export async function replaceRecoveryKey() {
  if (!(await confirmDialog('Create a new recovery key? Your old one will stop working.', { ok: 'Create new key', danger: false }))) return;
  const r = await remote();
  const res = await newRecoveryKey(getDataKey(), await r.getProfile());
  await r.putProfile(res.profile);
  await recoveryKeyScreen(res.code, false);
}

async function wipeCloud(r) {
  const paths = [...await r.listBlobs(`${current.uid}/media`), ...await r.listBlobs(`${current.uid}/vaultfiles`)];
  for (let i = 0; i < paths.length; i += 100) await r.removeBlobs(paths.slice(i, i + 100));
  const rows = [];
  // mark everything deleted; rows are removed with the account
  for (let since = '1970-01-01T00:00:00Z'; ;) {
    const got = await r.pullRows(since, 500);
    rows.push(...got.filter(x => !x.deleted));
    if (got.length < 500) break;
    since = got[got.length - 1].server_updated;
  }
  for (let i = 0; i < rows.length; i += 200) {
    await r.pushRows(rows.slice(i, i + 200).map(x => ({ user_id: current.uid, store: x.store, key: x.key, client_updated: Date.now(), deleted: true, iv: null, ct: null, blob_path: null })));
  }
}

export async function deleteAccount() {
  const out = await formModal('Delete account', [{ name: 'c', label: 'Type DELETE to permanently delete your account and everything in it', required: true }], {}, { saveLabel: 'Delete forever' });
  if (!out || out.c !== 'DELETE') { if (out) toast('Cancelled'); return; }
  const r = await remote();
  const paths = [...await r.listBlobs(`${current.uid}/media`), ...await r.listBlobs(`${current.uid}/vaultfiles`)];
  for (let i = 0; i < paths.length; i += 100) await r.removeBlobs(paths.slice(i, i + 100));
  await r.deleteAccount();
  stopSync();
  setSyncTracking(false);
  await forgetKey(current.uid);
  await useDatabase(LEGACY_DB);
  await deleteDatabase(userDb(current.uid));
  location.reload();
}
