// End-to-end test of cloud accounts against the mock backend.
// Run: node tests/accounts.test.mjs   (needs Playwright + Chromium)
import { startServer, MOCK_CLIENT } from './mock-backend.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const pw = await import(process.env.PLAYWRIGHT || 'playwright').catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8790;
const URL = `http://localhost:${PORT}/`;
const PHOTO = path.join(root, 'icons/icon-512.png');
const { server, state, close } = await startServer(root, PORT);
const browser = await pw.chromium.launch();
const errors = [];
let passed = 0;
const step = (name) => { passed++; console.log('  ✓', name); };

async function device(name, { inject = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  if (inject) await ctx.addInitScript(MOCK_CLIENT);
  // A device still on the old no-login version (until the test flips 'joined').
  else await ctx.addInitScript(() => { if (!localStorage.getItem('joined')) window.__DINALEKHA_LOCAL__ = true; });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
  return { ctx, page };
}
const syncAndWait = async page => {
  await page.evaluate(async () => { const s = await import('./js/sync.js'); await s.syncNow(); });
  await page.waitForFunction(async () => { const s = await import('./js/sync.js'); const st = s.syncStatus(); return st.state === 'synced' && !st.pending; }, null, { timeout: 15000 });
};
const EMAIL = 'shiva@example.com', PASS = 'correct horse 42', NEWPASS = 'brand new pass 77';

try {
  // ---- 1. Sign up on "phone" ---------------------------------------------------
  console.log('Phone: sign up');
  const A = await device('phone');
  await A.page.goto(URL);
  await A.page.waitForSelector('.auth-card');
  assert.equal(await A.page.locator('label:has-text("Repeat password")').isVisible(), false, 'no repeat-password box when signing in');
  await A.page.click('.auth-tabs button:has-text("Create account")');
  assert.equal(await A.page.locator('label:has-text("Repeat password")').isVisible(), true);
  await A.page.fill('input[type=email]', EMAIL);
  await A.page.fill('input[autocomplete="new-password"] >> nth=0', PASS);
  await A.page.fill('input[autocomplete="new-password"] >> nth=1', PASS);
  await A.page.click('button[type=submit]:has-text("Create account")');
  await A.page.waitForSelector('.recovery-code');
  const recovery = (await A.page.textContent('.recovery-code')).trim();
  assert.match(recovery, /^([A-Z0-9]{4}-){7}[A-Z0-9]{4}$/);
  assert.equal(await A.page.isDisabled('button:has-text("Continue")'), true);
  await A.page.check('.auth-card input[type=checkbox]');
  await A.page.click('button:has-text("Continue")');
  step('account created, recovery key shown and must be confirmed');

  await A.page.waitForSelector('text=Welcome to Dinalekha');
  assert.equal(await A.page.locator('.choice').count(), 2, 'no "bring existing data" option on a fresh device');
  await A.page.fill('input[autocomplete="given-name"]', 'Shiva');
  await A.page.click('.choice:has-text("sample planner")');
  await A.page.click('button:has-text("Start my journal")');
  await A.page.waitForSelector('.hero');
  assert.match(await A.page.textContent('.hero h1'), /Shiva/);
  step('onboarding: name + sample planner');

  // content: post with photo + Telugu, expense, vault document
  await A.page.fill('textarea[aria-label="Write a post about today"]', 'Hello from my phone — ఈ రోజు బాగుంది');
  const [fc] = await Promise.all([A.page.waitForEvent('filechooser'), A.page.click('.composer button:has-text("Photo")')]);
  await fc.setFiles(PHOTO);
  await A.page.waitForSelector('.composer-thumbs img');
  await A.page.click('.composer button:has-text("Post")');
  await A.page.waitForTimeout(300);
  await A.page.click('.quick:has-text("Expense")');
  await A.page.fill('#f_amount', '12.34');
  await A.page.fill('#f_note', 'Coffee with Ravi');
  await A.page.click('.modal button[type=submit]');
  await A.page.waitForTimeout(300);
  await A.page.goto(URL + '#/vault');
  await A.page.click('text=Create passphrase');
  await A.page.fill('input[placeholder="Passphrase"]', 'vault pass phrase');
  await A.page.fill('input[placeholder="Repeat passphrase"]', 'vault pass phrase');
  await A.page.click('.modal button[type=submit]');
  await A.page.waitForSelector('text=Add document');
  await A.page.click('text=Add document');
  await A.page.fill('#f_label', 'Passport');
  await A.page.fill('#f_number', 'Z9876543');
  await A.page.click('.modal button[type=submit]');
  await A.page.waitForTimeout(400);
  await syncAndWait(A.page);
  step('phone: post with photo, expense and vault document synced');

  // ---- 2. The server only holds ciphertext ----------------------------------------
  const allCt = [...state.records.values()].map(r => r.ct || '').join('');
  const decoded = Buffer.from(allCt, 'base64').toString('latin1');
  for (const secret of ['Hello from my phone', 'Coffee with Ravi', 'Z9876543', 'Passport', 'Shiva', 'AWS']) {
    assert.ok(!JSON.stringify([...state.records.values()]).includes(secret), `server rows leak "${secret}"`);
    assert.ok(!decoded.includes(secret), `ciphertext leaks "${secret}"`);
  }
  const blobs = [...state.blobs.values()].map(b => Buffer.from(b, 'base64'));
  assert.ok(blobs.length >= 1, 'photo uploaded');
  assert.ok(blobs.every(b => b[1] !== 0x50 || b[2] !== 0x4e), 'photo is not stored as a plain PNG');
  const profile = [...state.profiles.values()][0];
  assert.ok(profile.wrapped_key && profile.recovery_wrapped_key && !JSON.stringify(profile).includes(PASS));
  step(`server holds only ciphertext (${state.records.size} rows, ${state.blobs.size} encrypted files)`);

  // ---- 3. Sign in on "laptop": everything appears -----------------------------------
  console.log('Laptop: sign in');
  const B = await device('laptop');
  await B.page.goto(URL);
  await B.page.waitForSelector('.auth-card');
  await B.page.fill('input[type=email]', EMAIL);
  await B.page.fill('input[type=password] >> nth=0', 'wrong password!');
  await B.page.click('button[type=submit]:has-text("Sign in")');
  await B.page.waitForSelector('.error:has-text("Wrong email or password")');
  step('wrong password rejected');
  await B.page.fill('input[type=password] >> nth=0', PASS);
  await B.page.click('button[type=submit]:has-text("Sign in")');
  await B.page.waitForSelector('.hero');
  assert.match(await B.page.textContent('.hero h1'), /Shiva/, 'no onboarding on second device; name synced');
  await B.page.goto(URL + '#/feed');
  await B.page.waitForSelector('.post');
  assert.match(await B.page.textContent('.post'), /Hello from my phone — ఈ రోజు బాగుంది/);
  await B.page.waitForFunction(() => { const i = document.querySelector('.post .carousel img'); return i && i.naturalWidth > 0; }, null, { timeout: 10000 });
  step('laptop: post and its photo arrived (photo decrypted on first view)');
  await B.page.goto(URL + '#/money');
  await B.page.waitForSelector('.txn');
  assert.match(await B.page.textContent('.txn-list'), /Coffee with Ravi/);
  await B.page.goto(URL + '#/vault');
  await B.page.fill('input[aria-label="Vault passphrase"]', 'vault pass phrase');
  await B.page.click('button:has-text("Unlock")');
  await B.page.click('.vault-item');
  await B.page.click('.v-row button[aria-label="Show Number"]');
  assert.match(await B.page.textContent('.v-rows'), /Z9876543/);
  await B.page.keyboard.press('Escape');
  step('laptop: money and vault document arrived; vault passphrase works across devices');

  // ---- 4. Edit on laptop → shows on phone -------------------------------------------
  await B.page.goto(URL + '#/today');
  await B.page.fill('textarea[aria-label="Write a post about today"]', 'Written on the laptop');
  await B.page.click('.composer button:has-text("Post")');
  await B.page.waitForTimeout(300);
  await syncAndWait(B.page);
  await syncAndWait(A.page);
  await A.page.goto(URL + '#/feed');
  await A.page.waitForSelector('.post:has-text("Written on the laptop")');
  step('two-way sync: laptop post shows on phone');

  // delete on phone → gone on laptop
  const delId = await A.page.evaluate(async () => { const { db } = await import('./js/db.js'); const e = (await db.all('entries')).find(x => x.body === 'Written on the laptop'); await db.del('entries', e.id); return e.id; });
  await syncAndWait(A.page);
  await syncAndWait(B.page);
  assert.equal(await B.page.evaluate(async id => !!(await (await import('./js/db.js')).db.get('entries', id)), delId), false);
  step('deletes sync too');

  // ---- 5. Forgot password → recovery key ---------------------------------------------
  console.log('Tablet: password reset with recovery key');
  const C = await device('tablet');
  await C.page.goto(URL);
  await C.page.waitForSelector('.auth-card');
  await C.page.click('button:has-text("Forgot password?")');
  await C.page.fill('input[type=email]', EMAIL);
  await C.page.click('button:has-text("Send reset link")');
  await C.page.waitForSelector('text=Check your email');
  // "click" the emailed link: a recovery session lands on ?reset=1
  const { token } = await (await fetch(`${URL}__mock/resetlink`, { method: 'POST', body: JSON.stringify({ email: EMAIL }) })).json();
  await C.page.evaluate(t => localStorage.setItem('mockToken', t), token);
  await C.page.goto(URL + '?reset=1');
  await C.page.waitForSelector('text=Set a new password');
  await C.page.fill('input[autocomplete="new-password"] >> nth=0', NEWPASS);
  await C.page.fill('input[autocomplete="new-password"] >> nth=1', NEWPASS);
  await C.page.click('button:has-text("Save new password")');
  await C.page.waitForSelector('text=Enter your recovery key');
  await C.page.fill('input[placeholder^="XXXX"]', 'AAAA-BBBB');
  await C.page.click('button:has-text("Unlock")');
  await C.page.waitForSelector('.error:has-text("didn’t match")');
  await C.page.fill('input[placeholder^="XXXX"]', recovery.toLowerCase().replace(/-/g, ' '));
  await C.page.click('button:has-text("Unlock")');
  await C.page.waitForSelector('.hero');
  assert.equal(new globalThis.URL(C.page.url()).search, '', 'reset parameters removed from the address');
  await C.page.goto(URL + '#/feed');
  await C.page.waitForSelector('.post:has-text("Hello from my phone")');
  step('reset password + recovery key unlocks the data (lower-case / spaced key accepted)');

  const D = await device('new-phone');
  await D.page.goto(URL);
  await D.page.fill('input[type=email]', EMAIL);
  await D.page.fill('input[type=password] >> nth=0', NEWPASS);
  await D.page.click('button[type=submit]:has-text("Sign in")');
  await D.page.waitForSelector('.hero');
  step('new password now unlocks directly on another device');

  // ---- 6. Sign out removes the local copy ----------------------------------------------
  await D.page.goto(URL + '#/settings');
  await D.page.click('button:has-text("Sign out")');
  await D.page.waitForSelector('.auth-card');
  const dbs = await D.page.evaluate(async () => (await indexedDB.databases()).map(d => d.name));
  assert.ok(!dbs.some(n => n.startsWith('dinalekha-') && n !== 'dinalekha-keys'), 'user database removed: ' + dbs.join(','));
  step('sign out returns to login and removes this device’s copy');

  // ---- 7. Bring existing on-device data into a new account --------------------------------
  console.log('Existing on-device user joins');
  const E = await device('legacy', { inject: false });
  await E.page.goto(URL);
  await E.page.waitForSelector('.hero');
  await E.page.click('.quick:has-text("Idea")');
  await E.page.fill('#f_body', 'Idea saved before accounts existed');
  await E.page.click('.modal button[type=submit]');
  await E.page.waitForTimeout(300);
  await E.page.evaluate(() => localStorage.setItem('joined', '1'));
  await E.ctx.addInitScript(MOCK_CLIENT);
  await E.page.reload();
  await E.page.waitForSelector('.auth-card');
  await E.page.click('.auth-tabs button:has-text("Create account")');
  await E.page.fill('input[type=email]', 'friend@example.com');
  await E.page.fill('input[autocomplete="new-password"] >> nth=0', 'friends password 1');
  await E.page.fill('input[autocomplete="new-password"] >> nth=1', 'friends password 1');
  await E.page.click('button[type=submit]:has-text("Create account")');
  await E.page.waitForSelector('.recovery-code');
  await E.page.check('.auth-card input[type=checkbox]');
  await E.page.click('button:has-text("Continue")');
  await E.page.waitForSelector('.choice[aria-pressed="true"]:has-text("Bring my existing data")');
  await E.page.fill('input[autocomplete="given-name"]', 'Ravi');
  await E.page.click('button:has-text("Start my journal")');
  await E.page.waitForSelector('.hero');
  await E.page.goto(URL + '#/write/idea');
  await E.page.waitForSelector('.idea-card:has-text("Idea saved before accounts existed")');
  const legacyLeft = await E.page.evaluate(async () => (await indexedDB.databases()).some(d => d.name === 'lifelog'));
  assert.equal(legacyLeft, false, 'old on-device copy removed after import');
  await syncAndWait(E.page);
  const friendRows = [...state.records.values()].filter(r => r.user_id !== profile.id).length;
  assert.ok(friendRows > 0, 'friend data uploaded');
  // phone user cannot see friend's data
  await syncAndWait(A.page);
  assert.equal(await A.page.evaluate(async () => (await (await import('./js/db.js')).db.all('entries')).some(e => /before accounts/.test(e.body || ''))), false);
  step('existing data moved into a new account; accounts are isolated from each other');

  console.log(errors.length ? '\nPage errors:\n' + errors.join('\n') : '\nNo page errors.');
  if (errors.length) process.exitCode = 1;
  console.log(`\n${passed} checks passed.`);
} catch (err) {
  console.error('\nFAILED:', err.message);
  if (errors.length) console.error('Page errors:\n' + errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  await close();
}
