import { getSetting } from './db.js';

export async function applyTheme() {
  const [theme, accent] = await Promise.all([getSetting('theme', 'auto'), getSetting('accent', 'indigo')]);
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  root.setAttribute('data-accent', accent);
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#14132b' : '#f7f5ff');
}
