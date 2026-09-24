// Test helper: serves the app and a stand-in for Supabase (auth, the
// `profiles`/`records` tables with per-user access, and file storage) from one
// local HTTP server. The browser side (MOCK_CLIENT) implements the same
// interface as js/remote.js and is injected with page.addInitScript.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

export function startServer(root, port) {
  const state = { users: new Map(), tokens: new Map(), profiles: new Map(), records: new Map(), blobs: new Map(), lastTs: 0 };
  const stamp = () => { state.lastTs = Math.max(Date.now(), state.lastTs + 1); return new Date(state.lastTs).toISOString(); };
  const newToken = uid => { const t = Math.random().toString(36).slice(2) + Date.now(); state.tokens.set(t, uid); return t; };
  const userById = id => [...state.users.values()].find(u => u.id === id);

  const api = {
    signup({ email, password }) {
      if (state.users.has(email)) return { error: 'User already registered' };
      const u = { id: crypto.randomUUID(), email, password };
      state.users.set(email, u);
      return { token: newToken(u.id), user: { id: u.id, email } };
    },
    signin({ email, password }) {
      const u = state.users.get(email);
      if (!u || u.password !== password) return { error: 'Invalid login credentials' };
      return { token: newToken(u.id), user: { id: u.id, email } };
    },
    session(_, uid) { const u = userById(uid); return { user: u ? { id: u.id, email: u.email } : null }; },
    updatepw({ password }, uid) { userById(uid).password = password; return {}; },
    reset() { return {}; },
    // test-only: what clicking the emailed reset link does (a session for that user)
    resetlink({ email }) { const u = state.users.get(email); return { token: newToken(u.id) }; },
    getprofile(_, uid) { return { profile: state.profiles.get(uid) || null }; },
    putprofile({ row }, uid) { if (row.id !== uid) return { error: 'RLS: profile belongs to someone else' }; state.profiles.set(uid, row); return {}; },
    push({ rows }, uid) {
      for (const r of rows) {
        if (r.user_id !== uid) return { error: 'RLS: row belongs to someone else' };
        state.records.set(`${uid}|${r.store}|${r.key}`, { ...r, server_updated: stamp() });
      }
      return {};
    },
    pull({ since, limit }, uid) {
      const rows = [...state.records.values()].filter(r => r.user_id === uid && r.server_updated > since)
        .sort((a, b) => a.server_updated.localeCompare(b.server_updated)).slice(0, limit);
      return { rows };
    },
    upload({ path: p, b64 }, uid) { if (!p.startsWith(uid + '/')) return { error: 'RLS: not your folder' }; state.blobs.set(p, b64); return {}; },
    download({ path: p }, uid) { if (!p.startsWith(uid + '/')) return { error: 'RLS: not your folder' }; return state.blobs.has(p) ? { b64: state.blobs.get(p) } : { error: 'Object not found' }; },
    remove({ paths }, uid) { for (const p of paths) if (p.startsWith(uid + '/')) state.blobs.delete(p); return {}; },
    list({ folder }, uid) { if (!folder.startsWith(uid)) return { error: 'RLS' }; return { paths: [...state.blobs.keys()].filter(p => p.startsWith(folder + '/')) }; },
    deleteaccount(_, uid) {
      const u = userById(uid); state.users.delete(u.email); state.profiles.delete(uid);
      for (const k of [...state.records.keys()]) if (k.startsWith(uid + '|')) state.records.delete(k);
      return {};
    },
  };
  const PUBLIC = new Set(['signup', 'signin', 'reset', 'resetlink']);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/__mock/')) {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        const name = url.pathname.slice(8);
        const input = body ? JSON.parse(body) : {};
        const uid = state.tokens.get(input.token);
        let out;
        if (!api[name]) out = { error: 'unknown ' + name };
        else if (!PUBLIC.has(name) && !uid) out = { error: 'Not signed in' };
        else out = api[name](input, uid);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(out));
      });
      return;
    }
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(port, () => resolve({ server, state, close: () => new Promise(r => server.close(r)) })));
}

// Injected into the page: same interface as js/remote.js, talking to the mock.
export const MOCK_CLIENT = `
(() => {
  const TOKEN = 'mockToken';
  const toB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const fromB64 = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
  const api = async (name, body = {}) => {
    const r = await fetch('/__mock/' + name, { method: 'POST', body: JSON.stringify({ token: localStorage.getItem(TOKEN), ...body }) });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return j;
  };
  window.__DINALEKHA_REMOTE__ = {
    async getSession() { if (!localStorage.getItem(TOKEN)) return null; try { const j = await api('session'); return j.user ? { user: j.user } : null; } catch { return null; } },
    onAuthChange() {},
    async signUp(email, password) { const j = await api('signup', { email, password }); localStorage.setItem(TOKEN, j.token); return { session: { user: j.user } }; },
    async signIn(email, password) { const j = await api('signin', { email, password }); localStorage.setItem(TOKEN, j.token); return { user: j.user }; },
    async signOut() { localStorage.removeItem(TOKEN); },
    async sendPasswordReset(email) { await api('reset', { email }); },
    async updatePassword(password) { await api('updatepw', { password }); },
    async getProfile() { return (await api('getprofile')).profile; },
    async putProfile(row) { await api('putprofile', { row }); },
    async pushRows(rows) { if (rows.length) await api('push', { rows }); },
    async pullRows(since, limit = 500) { return (await api('pull', { since, limit })).rows; },
    async uploadBlob(path, bytes) { await api('upload', { path, b64: toB64(bytes) }); },
    async downloadBlob(path) { return fromB64((await api('download', { path })).b64); },
    async removeBlobs(paths) { if (paths.length) await api('remove', { paths }); },
    async listBlobs(folder) { return (await api('list', { folder })).paths; },
    async deleteAccount() { await api('deleteaccount'); localStorage.removeItem(TOKEN); },
  };
})();
`;
