import { getSetting } from './db.js';

export async function applyTheme() {
  const [theme, accent, font] = await Promise.all([getSetting('theme', 'auto'), getSetting('accent', 'lagoon'), getSetting('fontStyle', 'modern')]);
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  root.setAttribute('data-accent', accent);
  root.setAttribute('data-font', font);
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || (dark ? '#121216' : '#fbfaf8'));
}
