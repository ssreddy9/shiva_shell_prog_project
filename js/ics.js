// Export the weekly planner (+ the 12-week learning milestones) as an .ics
// calendar file. Times are "floating" local times, so they land at the same
// clock time in whatever time zone your calendar uses (Denver for you).

import { isoDate, addDays, parseDate } from './ui.js';
import { LEARNING_START } from './seed.js';

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

function firstOnOrAfter(start, day) {
  let d = start;
  while (parseDate(d).getDay() !== day) d = addDays(d, 1);
  return d;
}

export function buildICS(blocks, learning = []) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dinalekha//Weekly planner//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Dinalekha week'];
  const start = isoDate();
  for (const b of blocks) {
    if (!b.start) continue;
    const date = firstOnOrAfter(start, b.day).replace(/-/g, '');
    const end = b.end || b.start;
    L.push('BEGIN:VEVENT', `UID:${b.id}@lifelog`, `DTSTAMP:${stamp()}`,
      `DTSTART:${date}T${b.start.replace(':', '')}00`, `DTEND:${date}T${end.replace(':', '')}00`,
      `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[b.day]}`, `SUMMARY:${esc(b.title)}`,
      `CATEGORIES:${esc(b.cat)}`, b.note ? `DESCRIPTION:${esc(b.note)}` : null, 'END:VEVENT');
  }
  for (const w of learning) {
    const d = addDays(LEARNING_START, (w.week - 1) * 7);
    L.push('BEGIN:VEVENT', `UID:learning-${w.week}@lifelog`, `DTSTAMP:${stamp()}`,
      `DTSTART;VALUE=DATE:${d.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(d, 1).replace(/-/g, '')}`,
      `SUMMARY:${esc(`Learning week ${w.week}: ${w.focus}`)}`, `DESCRIPTION:${esc(w.checkpoint)}`, 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.filter(Boolean).join('\r\n') + '\r\n';
}
