# Dinalekha — the story of your day

*Dinalekha* (दिनलेखा, “day-writing”, from Sanskrit *dina* “day” + *lekha* “writing”). A personal life-logging app for phone and laptop: a diary, a photo feed like Instagram, a travel journal, a writing studio for stories and film ideas, a learning and career tracker, a money tracker, and an encrypted vault for your ID copies and cards.

It was built from the *Shiva Weekly Desk Planner* and *12-week Learning Checklist*. Your weekly schedule, weekly goals and the AWS/Python learning plan (starting Sep 28, 2026) come preloaded.

## What's inside

| Section | What you can do |
|---|---|
| **Today** | Greeting, today's blocks from your planner (tick off gym, study and reading), mood and a one-line highlight, weekly goal meters (7.5 h career, 2 gym, 1 jog, 2 reading), this week's learning checkpoint, expiry and backup reminders, quote of the day, "on this day" memories |
| **Feed** | Every photo you log, shown as posts or a grid (Instagram style). Post a *Moment* with photos, caption and place |
| **Write** | **Diary** (mood, photos, tags) · **Journeys** (trip plus a log for each day with photos) · **Stories** (scripts, short-film and content ideas with logline, format, status and word count) · **Ideas** (pinnable) · **Quotes** |
| **Lists** | **Office duties**: plan them in the morning, tick them off by evening (also shown on Today). Unfinished ones carry over, and routine ones can repeat every day · **Groceries**: ticked items move to “In the cart” (`Milk x2` sets a quantity) · **Hike backpack**: a packing list grouped by section that you reset before each trip · plus any list you make |
| **Grow** | **Learning**: the 12-week plan with checkpoints, notes, links and a chart of career hours per week · **Career**: job applications pipeline, certifications, skills (now vs. target), portfolio projects, wins · **Activities**: gym, hikes, reading, photography, hobbies · **Reviews**: Sunday weekly review |
| **Money** | Income and expenses, a month-by-month view, a 6-month chart, spending by category against budgets, accounts and net worth, CSV export |
| **Vault** | Passport, DL, SSN, visa/EAD, I-94, insurance, applications, cards and logins, with photo or PDF copies. **Encrypted with AES-256** using your passphrase. Warns you 90 days before a document expires |
| **Schedule** | Edit your weekly planner. **Add to calendar** exports an `.ics` file (repeating events plus learning milestones) for Apple, Google or Outlook |
| **Calendar / Search** | Month view with mood, photos and dots for each day. Full-text and `#tag` search |
| **Settings** | Name, currency, light/dark theme, colour theme (Lagoon, Indigo, Teal, Rose, Violet, Emerald, Amber, Ocean blue, Slate, or the multi-colour Sunset gradient), passphrase, app lock, auto-lock, backup and import, storage |

## Two modes

| | On-device mode (default) | Accounts mode |
|---|---|---|
| Turned on by | nothing to set up | connecting a Supabase project ([setup guide](docs/SETUP-ACCOUNTS.md)) |
| Login | none | email + password for each person |
| Where data lives | only in this browser (IndexedDB) | on each device **and** encrypted in the cloud |
| Phone ↔ laptop | export/import a backup file | automatic sync |
| Friends | share the link; each device is separate | everyone gets their own private account |

## Privacy

- **Accounts mode is end-to-end encrypted.** Each person has a random 256-bit data key, and every entry, photo and scan is encrypted with it (AES-256-GCM) *before* upload. The server stores the key only in wrapped form: once with the person's password (PBKDF2-SHA256, 310k iterations) and once with their **recovery key**. Nobody else can read the data, not even the project owner. Row-level security also keeps each person's rows and files private to them.
- **Password reset** works by email. After a reset, the recovery key is needed to unlock existing entries. Lose both and the old entries are gone for good; the account can start over empty.
- **On-device mode** stores everything only in the browser. Nothing is uploaded.
- **Vault items** (numbers, notes, scans) are also encrypted with a separate vault passphrase (AES-256-GCM, PBKDF2). **If you forget it, the vault cannot be recovered.**
- Optionally, **Settings → "Ask for passphrase when the app opens"** adds a lock screen on this device.

## Keeping your phone and laptop in sync

**Accounts mode:** automatic. Sign in on each device. The app works offline and syncs when back online. If two devices edit the same item, the most recent edit wins. Photos from other devices download the first time you view them.

**On-device mode:** each device keeps its own copy. To move changes across:

1. On the device with the newest changes: **Settings → Export backup** (on a phone this opens the share sheet).
2. Send the file to the other device (AirDrop, iCloud Drive, Google Drive, email to yourself).
3. On the other device: **Settings → Import backup**.

Imports **merge**: newer edits win, deletions carry over, and importing the same file twice changes nothing. Vault items stay encrypted inside the backup file; everything else in the backup is not, so keep backup files somewhere private.

## Put it online and install it

The app is plain HTML/CSS/JS with no build step. It needs to be served over **HTTPS** to install and work offline.

**GitHub Pages** (workflow included in `.github/workflows/pages.yml`):
1. Repo **Settings → Pages → Source: GitHub Actions**. Private repos need a paid GitHub plan for Pages. Otherwise make the repo public: only the code is public, never your data.
2. Merge to `main`. The site deploys to `https://<user>.github.io/<repo>/`.

Alternatives: drag the folder into Netlify Drop or Cloudflare Pages.

**Install:**
- **iPhone:** open in Safari → Share → *Add to Home Screen*
- **Android:** Chrome ⋮ → *Install app*
- **Laptop:** Chrome/Edge → install icon in the address bar, or Safari → File → *Add to Dock*

Installing matters. Browsers can clear storage for websites you haven't opened in a while, but installed apps are kept.

**Run locally:** `python3 -m http.server 8000` and open http://localhost:8000.

## Project layout

```
index.html, manifest.webmanifest, sw.js   app shell, install metadata, offline cache
css/app.css                               theme, colour themes, font styles
js/app.js                                 router, navigation, lock screen
js/db.js  js/crypto.js  js/backup.js      storage, vault encryption, backup/merge
js/config.js                              Supabase URL + anon key (empty = on-device mode)
js/remote.js  js/auth.js  js/account.js   backend connection, login screens, end-to-end keys
js/sync.js                                encrypted sync engine (outbox, push/pull, photos)
js/seed.js                                sample planner and learning checklist
js/kinds.js  js/stats.js  js/charts.js    entry types, weekly goals, small SVG charts
js/views/*.js                             one file per screen
js/vendor/supabase.js                     supabase-js 2 (MIT), loaded only in accounts mode
fonts/                                    self-hosted open-licence fonts (see fonts/README.md)
supabase/schema.sql                       database tables, row-level security, storage bucket
docs/SETUP-ACCOUNTS.md                    turning on accounts; custom domain
tests/                                    end-to-end test of accounts against a local mock backend
```

After changing any file, bump `VERSION` in `sw.js` so installed copies pick up the update.

## Tests

```
node tests/accounts.test.mjs
```

This runs the app in Chromium (Playwright) against a local stand-in for Supabase. It covers:
- sign-up, recovery key, onboarding;
- two-device sync, including photos, deletes and the vault;
- a check that the server only holds ciphertext;
- password reset with the recovery key;
- sign-out;
- moving existing on-device data into an account;
- isolation between accounts.
