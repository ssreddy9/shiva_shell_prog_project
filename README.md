# LifeLog

A personal life-logging app for phone and laptop: a diary, a photo feed like Instagram, a travel journal, a writing studio for stories and film ideas, a learning and career tracker, a money tracker, and an encrypted vault for your ID copies and cards.

It was built from the *Shiva Weekly Desk Planner* and *12-week Learning Checklist*. Your weekly schedule, weekly goals and the AWS/Python learning plan (starting Sep 28, 2026) come preloaded.

## What's inside

| Section | What you can do |
|---|---|
| **Today** | Greeting, today's blocks from your planner (tick off gym, study and reading), mood and a one-line highlight, weekly goal meters (7.5 h career, 2 gym, 1 jog, 2 reading), this week's learning checkpoint, expiry and backup reminders, quote of the day, "on this day" memories |
| **Feed** | Every photo you log, shown as posts or a grid (Instagram style). Post a *Moment* with photos, caption and place |
| **Write** | **Diary** (mood, photos, tags) · **Journeys** (trip plus a log for each day with photos) · **Stories** (scripts, short-film and content ideas with logline, format, status and word count) · **Ideas** (pinnable) · **Quotes** |
| **Grow** | **Learning**: the 12-week plan with checkpoints, notes, links and a chart of career hours per week · **Career**: job applications pipeline, certifications, skills (now vs. target), portfolio projects, wins · **Activities**: gym, hikes, reading, photography, hobbies · **Reviews**: Sunday weekly review |
| **Money** | Income and expenses, a month-by-month view, a 6-month chart, spending by category against budgets, accounts and net worth, CSV export |
| **Vault** | Passport, DL, SSN, visa/EAD, I-94, insurance, applications, cards and logins, with photo or PDF copies. **Encrypted with AES-256** using your passphrase. Warns you 90 days before a document expires |
| **Schedule** | Edit your weekly planner. **Add to calendar** exports an `.ics` file (repeating events plus learning milestones) for Apple, Google or Outlook |
| **Calendar / Search** | Month view with mood, photos and dots for each day. Full-text and `#tag` search |
| **Settings** | Name, currency, light/dark theme, accent colour, passphrase, app lock, auto-lock, backup and import, storage |

## Privacy

- **No server and no account.** Everything is stored in your browser's database on each device (IndexedDB). Nothing is uploaded.
- **Vault items** (numbers, notes and scans) are encrypted with AES-GCM 256. The key comes from your passphrase (PBKDF2-SHA256, 310k iterations). The passphrase is never stored. **If you forget it, the vault cannot be recovered.**
- Optionally, **Settings → "Ask for passphrase when the app opens"** puts the whole app behind a lock screen. Only the Vault is encrypted. Your diary, photos and money data are protected by your device lock and that lock screen.

## Keeping your phone and laptop in sync

Each device keeps its own copy. To move changes across:

1. On the device with the newest changes: **Settings → Export backup** (on a phone this opens the share sheet).
2. Send the file to the other device (AirDrop, iCloud Drive, Google Drive, email to yourself).
3. On the other device: **Settings → Import backup**.

Imports **merge**: newer edits win, deletions carry over, and importing the same file twice changes nothing. Vault items stay encrypted inside the backup file. If both devices have different vault passphrases, the import asks for the backup's passphrase and re-encrypts with this device's. Everything else in the backup is not encrypted, so keep backup files somewhere private. Back up regularly; the Today page reminds you after 7 days.

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
css/app.css                               theme (planner colours, light and dark)
js/app.js                                 router, navigation, lock screen
js/db.js  js/crypto.js  js/backup.js      storage, vault encryption, backup/merge
js/seed.js                                your planner and learning checklist data
js/kinds.js  js/stats.js  js/charts.js    entry types, weekly goals, small SVG charts
js/views/*.js                             one file per screen
```

After changing any file, bump `VERSION` in `sw.js` so installed copies pick up the update.
