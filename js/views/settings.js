import { db, STORES, getSetting, setSetting } from '../db.js';
import { h, icon, toast, confirmDialog, promptPassphrase, download, isoDate, filePicker, relTime, formModal, loadCurrency } from '../ui.js';
import { cryptoMeta, changePassphrase, setupPassphrase, lock, isUnlocked } from '../crypto.js';
import { exportBackup, importBackup } from '../backup.js';
import { buildICS } from '../ics.js';
import { applyTheme } from '../theme.js';
import { isConfigured } from '../remote.js';
import { currentUser, signOut, changePassword, replaceRecoveryKey, deleteAccount } from '../auth.js';
import { syncNow, syncStatus, onSyncStatus } from '../sync.js';

export const title = 'Settings';
const FONTS = [
  ['modern', 'Modern', 'Instrument Serif + Plus Jakarta Sans', '"Instrument Serif", serif', 400],
  ['classic', 'Classic', 'Fraunces + Outfit', 'Fraunces, serif', 600],
  ['bold', 'Bold', 'Bricolage Grotesque', '"Bricolage Grotesque", sans-serif', 800],
  ['system', 'Simple', 'Your device’s own font', 'system-ui, sans-serif', 800],
];
export const APP_VERSION = 'v10';

const THEMES = [['indigo', 'Indigo'], ['teal', 'Teal'], ['rose', 'Rose'], ['violet', 'Violet'], ['emerald', 'Emerald'], ['amber', 'Amber'], ['ocean', 'Ocean blue'], ['slate', 'Slate'], ['sunset', 'Sunset (gradient)']];

export async function render(el) {
  const [name, currency, theme, accent, lockApp, autoLock, lastBackup, meta] = await Promise.all([
    getSetting('name', ''), getSetting('currency', 'USD'), getSetting('theme', 'auto'), getSetting('accent', 'indigo'),
    getSetting('lockApp', false), getSetting('autoLock', 5), getSetting('lastBackup', 0), cryptoMeta()]);
  const fontStyle = await getSetting('fontStyle', 'modern');

  el.append(h('div.page-head', h('h1', 'Settings')));
  const sec = (t, ...kids) => h('section.card.settings-sec', h('h2', t), ...kids);
  const row = (label, control, hint) => h('div.set-row', h('div', h('strong', label), hint ? h('p.muted.small', hint) : null), control);

  const cloud = isConfigured() && currentUser();
  // account
  if (cloud) {
    const stateText = h('span.muted.small');
    const paint = st => {
      stateText.textContent = st.state === 'syncing' ? 'Syncing…'
        : st.state === 'offline' ? `Offline — ${st.pending || 0} change(s) will upload when you’re back online`
        : st.state === 'error' ? 'Last sync failed: ' + st.error
        : st.lastSync ? `Synced ${relTime(st.lastSync)}` + (st.pending ? ` · ${st.pending} waiting` : '') : 'Not synced yet';
    };
    paint(syncStatus());
    const off = onSyncStatus(st => (stateText.isConnected ? paint(st) : off()));
    el.append(sec('Account',
      row('Signed in as', h('strong.acct-email', currentUser().email)),
      row('Sync', h('button.btn', { onclick: () => syncNow() }, icon('trend', 16), 'Sync now'), stateText),
      h('p.muted.small', 'Everything you write is encrypted on this device before it syncs, so only you can read it — not even the app owner.'),
      row('Password', h('button.btn', { onclick: () => changePassword().catch(e => toast(e.message)) }, 'Change password')),
      row('Recovery key', h('button.btn', { onclick: () => replaceRecoveryKey().catch(e => toast(e.message)) }, 'Create new key'), 'Unlocks your entries if you forget your password. Make a new one if you lost it.'),
      row('Sign out', h('button.btn', { onclick: () => signOut().catch(e => toast(e.message)) }, 'Sign out'), 'Removes this device’s copy; everything stays safe in your account.')));
  }

  // profile
  el.append(sec('Profile',
    row('Your name', h('input', { value: name, onchange: async e => { await setSetting('name', e.target.value.trim()); toast('Saved'); } })),
    row('Currency', h('select', { onchange: async e => { await setSetting('currency', e.target.value); await loadCurrency(); toast('Saved'); } },
      ['USD', 'INR', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'AED', 'JPY'].map(c => h('option', { selected: c === currency }, c))))));

  // appearance
  el.append(sec('Appearance',
    row('Theme', h('select', { onchange: async e => { await setSetting('theme', e.target.value); applyTheme(); } },
      [['auto', 'Match device'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => h('option', { value: v, selected: v === theme }, l)))),
    row('Colour theme', h('div.swatch-wrap', h('div.swatches', THEMES.map(([a, label]) =>
      h('button.swatch-btn.acc-' + a, { 'aria-label': label, title: label, 'aria-pressed': String(a === (THEMES.some(t => t[0] === accent) ? accent : 'indigo')), onclick: async () => { await setSetting('accent', a); applyTheme(); } }))),
        h('small.muted', 'Selected: ' + (THEMES.find(t => t[0] === accent) || THEMES[0])[1])),
      'One calm colour for the whole app. “Sunset” is the multi-colour gradient look.'),
    row('Font style', h('div.font-choices', FONTS.map(([v, label, desc, family, weight]) =>
      h('button.font-choice', { 'aria-pressed': String(v === fontStyle), onclick: async () => { await setSetting('fontStyle', v); applyTheme(); } },
        h('span.font-sample', { style: { fontFamily: family, fontWeight: weight } }, 'Aa'),
        h('span', h('strong', label), h('small.muted', desc))))),
      'Headings and text. Telugu uses Anek Telugu in every style.')));

  // security
  el.append(sec('Security',
    row('Vault passphrase', meta
      ? h('button.btn', { onclick: async () => {
        const old = await promptPassphrase('Current passphrase');
        if (!old) return;
        const neu = await promptPassphrase('New passphrase', { confirm: true });
        if (!neu) return;
        toast('Re-encrypting vault…');
        toast(await changePassphrase(old, neu) ? 'Passphrase changed' : 'Current passphrase was wrong');
      } }, 'Change')
      : h('button.btn.primary', { onclick: async () => {
        const p = await promptPassphrase('Create vault passphrase', { confirm: true });
        if (p) { await setupPassphrase(p); toast('Vault ready'); }
      } }, 'Set up'),
      'Encrypts the Vault (documents, cards, logins). Cannot be recovered if forgotten.'),
    row('Ask for passphrase when the app opens', h('input', { type: 'checkbox', checked: lockApp, disabled: !meta, onchange: async e => { await setSetting('lockApp', e.target.checked); toast('Saved'); } }),
      'Hides everything behind the lock screen. Note: only the Vault is encrypted; diary, photos and money are protected by your device lock and this screen.'),
    row('Auto-lock after', h('select', { onchange: async e => { await setSetting('autoLock', Number(e.target.value)); } },
      [[1, '1 minute'], [5, '5 minutes'], [15, '15 minutes'], [60, '1 hour'], [0, 'Never']].map(([v, l]) => h('option', { value: v, selected: v === autoLock }, l)))),
    isUnlocked() ? row('Lock now', h('button.btn', { onclick: () => { lock(); toast('Locked'); } }, icon('lock', 16), 'Lock')) : null));

  // backup
  const status = h('p.muted.small', lastBackup ? 'Last backup ' + relTime(lastBackup) : 'No backup yet.');
  el.append(sec(cloud ? 'Backup file' : 'Backup & sync between phone and laptop',
    h('p', cloud ? 'Your account already syncs across your devices. A backup file is an extra copy you keep yourself.' : 'Everything is stored privately on each device. To keep your phone and laptop in sync, export a backup on one and import it on the other — imports merge (newer edits win, deletes carry over), so nothing is duplicated.'),
    cloud ? null : h('ol.small', h('li', 'On the device with the latest changes: Export backup.'), h('li', 'Move the file (AirDrop, iCloud Drive, Google Drive, email to yourself…).'), h('li', 'On the other device: Import backup and pick the file.')),
    h('div.btn-row',
      h('button.btn.primary', { onclick: async () => {
        toast('Preparing backup…');
        const blob = await exportBackup();
        const fname = `dinalekha-backup-${isoDate()}.json`;
        const file = new File([blob], fname, { type: 'application/json' });
        if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer:coarse)').matches) {
          try { await navigator.share({ files: [file], title: 'Dinalekha backup' }); } catch { download(fname, blob); }
        } else download(fname, blob);
        status.textContent = 'Last backup just now (' + (blob.size / 1048576).toFixed(1) + ' MB)';
      } }, icon('down', 18), 'Export backup'),
      h('button.btn', { onclick: async () => {
        const [file] = await filePicker({ accept: 'application/json,.json', multiple: false });
        if (!file) return;
        try {
          const r = await importBackup(file, msg => (status.textContent = msg));
          toast(`Import complete: ${r.added} new, ${r.updated} updated, ${r.removed} removed`);
        } catch (err) { status.textContent = err.message; toast(err.message); }
      } }, icon('up', 18), 'Import backup')),
    status,
    h('p.muted.small', 'Vault items stay encrypted inside the backup. Other data (diary, photos, money) is not encrypted in the file — keep backups somewhere private.')));

  // calendar
  el.append(sec('Calendar',
    row('Add your weekly plan to your calendar', h('button.btn', { onclick: async () => {
      download('dinalekha-week.ics', new Blob([buildICS(await db.all('schedule'), await db.all('learning'))], { type: 'text/calendar' }));
    } }, icon('cal', 16), 'Download .ics'), 'Repeating events for every tracked block, plus the 12 learning-week milestones. Works with Apple, Google and Outlook calendars.')));

  // storage
  const usage = h('span.muted', '…');
  if (navigator.storage?.estimate) navigator.storage.estimate().then(e => { usage.textContent = `${(e.usage / 1048576).toFixed(1)} MB used`; });
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  const counts = await Promise.all(['entries', 'media', 'money', 'vault'].map(s => db.count(s)));
  el.append(sec('Storage',
    row('On this device', usage, `${counts[0]} entries · ${counts[1]} photos · ${counts[2]} transactions · ${counts[3]} vault items`),
    row('Protect from automatic clean-up', persisted ? h('span.pill', 'Protected') : h('button.btn', { onclick: async () => {
      const ok = await navigator.storage?.persist?.();
      toast(ok ? 'Storage is now persistent' : 'The browser declined — install the app to your home screen and try again');
      dispatchEvent(new Event('rerender'));
    } }, 'Request'), 'Install the app to your home screen / dock so the browser keeps your data. Back up regularly anyway.')));

  // install help
  el.append(sec('Install on your devices',
    h('ul.small',
      h('li', h('strong', 'iPhone: '), 'open the app in Safari → Share → Add to Home Screen.'),
      h('li', h('strong', 'Android: '), 'Chrome menu (⋮) → Install app / Add to Home screen.'),
      h('li', h('strong', 'Laptop: '), 'Chrome or Edge → install icon in the address bar. On a Mac with Safari: File → Add to Dock.'))));

  // danger
  if (cloud) el.append(sec('Danger zone',
    row('Delete my account', h('button.btn.danger', { onclick: () => deleteAccount().catch(e => toast(e.message)) }, icon('trash', 16), 'Delete account'),
      'Permanently deletes your account and everything in it, on every device.')));
  else el.append(sec('Danger zone',
    row('Erase everything on this device', h('button.btn.danger', { onclick: async () => {
      if (!(await confirmDialog('Erase ALL data on this device — entries, photos, money, vault? Make a backup first. This cannot be undone.', { ok: 'Erase everything' }))) return;
      const typed = await formModal('Type ERASE to confirm', [{ name: 'c', label: 'Confirmation', required: true }], {});
      if (!typed || typed.c !== 'ERASE') { toast('Cancelled'); return; }
      for (const s of Object.keys(STORES)) await db.clear(s);
      location.reload();
    } }, icon('trash', 16), 'Erase'))));

  el.append(h('p.muted.small.center', 'Dinalekha ' + APP_VERSION + (cloud ? ' · works offline · end-to-end encrypted sync' : ' · works offline · your data never leaves your devices unless you export it.')));
}
