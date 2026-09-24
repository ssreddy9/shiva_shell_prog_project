// Connection to the cloud backend (Supabase). Everything that talks to the
// server goes through this small interface, so the rest of the app never sees
// Supabase directly. All payloads passed in here are already encrypted.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

let client = null;
let impl = null;

// Tests can inject a stand-in backend with the same interface.
const injected = () => (typeof window !== 'undefined' && window.__DINALEKHA_REMOTE__) || null;

export function isConfigured() {
  return !!injected() || !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

// The page URL (without query/hash) that email links should come back to.
export function appBaseUrl() {
  return location.origin + location.pathname;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.append(s);
  });
}

export async function remote() {
  if (impl) return impl;
  if (injected()) return (impl = injected());
  if (!window.supabase) await loadScript('js/vendor/supabase.js');
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  impl = supabaseImpl(client);
  return impl;
}

const fail = (error, fallback) => { if (error) throw new Error(error.message || fallback); };

function supabaseImpl(sb) {
  const bucket = () => sb.storage.from('blobs');
  return {
    async getSession() {
      const { data } = await sb.auth.getSession();
      return data.session ? { user: { id: data.session.user.id, email: data.session.user.email } } : null;
    },
    onAuthChange(cb) {
      sb.auth.onAuthStateChange((event, session) => cb(event, session ? { user: { id: session.user.id, email: session.user.email } } : null));
    },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: appBaseUrl() + '?confirmed=1' } });
      fail(error, 'Sign-up failed');
      // With email confirmation on, Supabase returns no session until the link is clicked.
      return { session: data.session ? { user: { id: data.user.id, email: data.user.email } } : null };
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      fail(error, 'Sign-in failed');
      return { user: { id: data.user.id, email: data.user.email } };
    },
    async signOut() { await sb.auth.signOut(); },
    async sendPasswordReset(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: appBaseUrl() + '?reset=1' });
      fail(error, 'Could not send the reset email');
    },
    async updatePassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      fail(error, 'Could not change the password');
    },
    async getProfile() {
      const { data, error } = await sb.from('profiles').select('*').maybeSingle();
      fail(error, 'Could not load your account');
      return data;
    },
    async putProfile(row) {
      const { error } = await sb.from('profiles').upsert({ ...row, updated_at: new Date().toISOString() });
      fail(error, 'Could not save your account keys');
    },
    async pushRows(rows) {
      if (!rows.length) return;
      const { error } = await sb.from('records').upsert(rows, { onConflict: 'user_id,store,key' });
      fail(error, 'Upload failed');
    },
    async pullRows(since, limit = 500) {
      const { data, error } = await sb.from('records').select('*').gt('server_updated', since).order('server_updated').limit(limit);
      fail(error, 'Download failed');
      return data;
    },
    async uploadBlob(path, bytes) {
      const { error } = await bucket().upload(path, new Blob([bytes], { type: 'application/octet-stream' }), { upsert: true, contentType: 'application/octet-stream' });
      fail(error, 'Photo upload failed');
    },
    async downloadBlob(path) {
      const { data, error } = await bucket().download(path);
      fail(error, 'Photo download failed');
      return new Uint8Array(await data.arrayBuffer());
    },
    async removeBlobs(paths) {
      if (!paths.length) return;
      const { error } = await bucket().remove(paths);
      fail(error, 'Could not delete files');
    },
    async listBlobs(folder) {
      const out = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await bucket().list(folder, { limit: 1000, offset });
        fail(error, 'Could not list files');
        out.push(...data.map(f => folder + '/' + f.name));
        if (data.length < 1000) return out;
      }
    },
    async deleteAccount() {
      const { error } = await sb.rpc('delete_my_account');
      fail(error, 'Could not delete the account');
      await sb.auth.signOut();
    },
  };
}
