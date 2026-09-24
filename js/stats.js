// Shared calculations: weekly goals, learning week, streaks.

import { db } from './db.js';
import { isoDate, addDays, weekStart, parseDate, minutesOf } from './ui.js';
import { LEARNING_START, WEEKLY_GOALS } from './seed.js';

export function blockMinutes(b) {
  if (b.start && b.end) return Math.max(0, minutesOf(b.end) - minutesOf(b.start));
  return 0;
}

export function blockGroup(b) {
  const t = b.title.toLowerCase();
  if (b.cat === 'career') return 'career';
  if (b.cat === 'reading') return 'reading';
  if (t.includes('gym')) return 'gym';
  if (t.includes('jog') || t.includes('walk')) return 'jog';
  if (b.cat === 'fitness') return 'outdoor';
  return 'other';
}

const ACT_GROUP = { 'Gym': 'gym', 'Jog / walk': 'jog', 'Study': 'career', 'Reading': 'reading', 'Hike': 'outdoor' };

export async function weekStats(anyDate = isoDate()) {
  const from = weekStart(anyDate);
  const to = addDays(from, 6);
  const [checks, blocks, entries] = await Promise.all([
    db.range('checks', 'date', from, to), db.all('schedule'), db.range('entries', 'date', from, to)]);
  const byId = Object.fromEntries(blocks.map(b => [b.id, b]));
  const s = { from, to, careerMinutes: 0, gym: 0, jog: 0, reading: 0, outdoor: 0, activityMinutes: 0, entries: entries.length };
  for (const c of checks) {
    const b = byId[c.blockId];
    if (!b) continue;
    const g = blockGroup(b);
    if (g === 'career') s.careerMinutes += blockMinutes(b);
    else if (g in s) s[g] += 1;
  }
  for (const e of entries) {
    if (e.kind !== 'activity') continue;
    s.activityMinutes += e.minutes || 0;
    if (e.blockId) continue; // already counted through its schedule check
    const g = ACT_GROUP[e.type];
    if (g === 'career') s.careerMinutes += e.minutes || 0;
    else if (g) s[g] += 1;
  }
  s.goals = WEEKLY_GOALS;
  return s;
}

export function learningWeek(today = isoDate()) {
  const diff = Math.floor((parseDate(today) - parseDate(LEARNING_START)) / 86400000);
  return { week: Math.floor(diff / 7) + 1, started: diff >= 0 };
}

// Consecutive days (ending today or yesterday) with at least one entry, check or mood.
export async function loggingStreak() {
  const [entries, checks, days] = await Promise.all([db.all('entries'), db.all('checks'), db.all('days')]);
  const set = new Set([...entries.map(e => e.date), ...checks.map(c => c.date), ...days.filter(d => d.mood || d.highlight).map(d => d.date)]);
  let d = isoDate();
  if (!set.has(d)) d = addDays(d, -1);
  let n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
