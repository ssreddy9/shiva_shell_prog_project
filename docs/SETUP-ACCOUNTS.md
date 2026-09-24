# Turning on accounts (login + sync)

Dinalekha runs without accounts until you connect a Supabase project. After
that, everyone who opens the site signs up with email + password, and their
journal syncs across their phone and laptop. Everything is **encrypted on the
device before upload**, so the database only holds unreadable ciphertext.
Not even you, the project owner, can read anyone's entries.

Time needed: about 15 minutes. Cost: $0 on Supabase's free plan.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com> → **Start your project** → sign in with GitHub.
2. **New project**:
   - Name: `dinalekha`
   - Database password: generate one and save it in your password manager. The app doesn't need it.
   - Region: the one closest to you (e.g. *West US* for Denver).
3. Wait about a minute while it's created.

## 2. Create the tables (one paste)

1. In the project: **SQL Editor** → **New query**.
2. Open [`supabase/schema.sql`](../supabase/schema.sql) from this repository and
   copy the whole file into the editor.
3. Click **Run**. You should see *Success. No rows returned.*

This creates:
- `profiles`: each person's encrypted key material;
- `records`: encrypted entries;
- a private `blobs` storage bucket: encrypted photos and scans;
- row-level security, so each person can only ever reach their own rows and files;
- a function that lets people delete their own account.

## 3. Authentication settings

**Authentication → URL Configuration**
- **Site URL:** `https://ssreddy9.github.io/shiva_shell_prog_project/`
- **Redirect URLs:** add the same address. When you get your own domain, add that too (see step 6).

**Authentication → Sign In / Providers → Email**
- **Enable Email provider:** on.
- **Confirm email:** on (recommended). New users click a link in their inbox before their first sign-in.
- **Minimum password length:** 8.

**Email sending (important once friends join).** Supabase's built-in email
service is for testing: it only sends a few emails per hour. Before you share
the app:
1. Create a free account with an email service such as [Resend](https://resend.com) (3,000 emails a month free).
2. In Supabase, open **Authentication → Emails → SMTP Settings**.
3. Enter the service's SMTP details.

The confirmation and password-reset emails will then arrive reliably.

## 4. Connect the app

**Project Settings → API** (or **Data API**), copy:
- **Project URL**, e.g. `https://abcdxyz.supabase.co`;
- the **anon / publishable** key (starts with `eyJ…` or `sb_publishable_…`).

  Never use the `service_role` / secret key in the app.

Then either send both values to Claude, or edit [`js/config.js`](../js/config.js):

```js
export const SUPABASE_URL = 'https://abcdxyz.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi…';
```

The anon key is designed to be public: row-level security and the on-device
encryption are what protect the data. Merge the change. The site updates
within a minute and opens with the sign-in screen.

## 5. Your first sign-in

1. Open the site → **Create account** → email + password → confirm via the email link → sign in.
2. **Save your recovery key** (copy it, or "Save as file"). It is the only way to
   open your entries if you forget your password. A password reset alone can't
   decrypt anything.
3. On the device where you've been using Dinalekha, choose **Bring my existing
   data**. Everything saved in on-device mode moves into your account and
   starts syncing.
4. On your other devices, just sign in. Your data appears within seconds.

Friends do the same: open the link, create an account, save their recovery
key, pick **Start fresh** or **Use the sample planner**.

## 6. Later: your own domain (e.g. `dinalekha.app`)

1. Buy the domain (Cloudflare, Namecheap, Porkbun… about $10–20 a year).
2. GitHub repo → **Settings → Pages → Custom domain** → enter it → Save, then tick **Enforce HTTPS** once it's offered.
3. At your domain registrar, add DNS records:
   - Apex domain (`dinalekha.app`): four `A` records → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `www` subdomain: `CNAME` → `ssreddy9.github.io`
4. In Supabase → **Authentication → URL Configuration**: set **Site URL** to
   `https://dinalekha.app/` and add it to **Redirect URLs**. Keep the old
   GitHub address in the list for a while.
5. Tell everyone the new link. They sign in once on the new address (data comes
   from the cloud) and re-add the app to their home screen.

## Good to know

- **Free-plan limits:** 500 MB database, 1 GB file storage and 50,000 monthly
  users. That's plenty for friends. Photos are compressed before upload.
- **Pausing:** a free project pauses after 7 days with no activity. The app keeps
  working offline, and sync resumes after you click **Restore** in the Supabase
  dashboard. Upgrading to Pro ($25 a month) removes the pause.
- **Forgot password:** use **Forgot password?** on the sign-in screen, open the
  email link *on the same device*, set a new password, then enter the recovery key.
- **Lost both password and recovery key:** the account can be reset to an empty
  journal, but the old entries can't be recovered by anyone. That is the point
  of end-to-end encryption.
- **Deleting an account:** Settings → Danger zone → Delete account removes the
  person's rows, files and login.
- **Turning accounts off again:** empty both values in `js/config.js`. The app
  goes back to on-device mode; data already in accounts stays in Supabase.
