// Entry kinds (diary, moments, stories, ideas, quotes, journeys, activities,
// weekly reviews): their forms, labels and card rendering.

import { db } from './db.js';
import { h, icon, formModal, isoDate, fmtDate, mimg, MOODS, tagChips, fmtHours, toast } from './ui.js';

export const ACTIVITY_TYPES = ['Gym', 'Jog / walk', 'Hike', 'Study', 'Reading', 'Photography', 'Writing', 'Hobby', 'Sports', 'Social', 'Other'];
export const STORY_FORMATS = ['Story', 'Film script', 'Short film idea', 'Content / reel idea', 'Poem', 'Blog post', 'Other'];
export const STORY_STATUS = ['Idea', 'Drafting', 'Revising', 'Done', 'Published'];

export const KINDS = {
  diary: {
    label: 'Diary entry', plural: 'Diary', icon: 'book',
    fields: [
      { name: 'date', label: 'Date', type: 'date', required: true, half: true },
      { name: 'mood', label: 'Mood', type: 'mood', half: true },
      { name: 'title', label: 'Title', placeholder: 'Optional' },
      { name: 'body', label: 'Dear diary…', type: 'textarea', rows: 10, required: true },
      { name: 'photos', label: 'Photos', type: 'photos' },
      { name: 'tags', label: 'Tags', type: 'tags' },
    ],
  },
  moment: {
    label: 'Post', plural: 'Posts', icon: 'camera',
    fields: [
      { name: 'body', label: 'What’s on your mind?', type: 'textarea', rows: 4 },
      { name: 'photos', label: 'Photos', type: 'photos' },
      { name: 'location', label: 'Place', half: true, placeholder: 'e.g. Red Rocks' },
      { name: 'date', label: 'Date', type: 'date', required: true, half: true },
      { name: 'mood', label: 'Mood', type: 'mood' },
      { name: 'tags', label: 'Tags', type: 'tags' },
    ],
  },
  story: {
    label: 'Story / script', plural: 'Stories', icon: 'film',
    fields: [
      { name: 'title', label: 'Working title', required: true },
      { name: 'format', label: 'Format', type: 'select', options: STORY_FORMATS, half: true },
      { name: 'status', label: 'Status', type: 'select', options: STORY_STATUS, half: true },
      { name: 'genre', label: 'Genre / mood', half: true, placeholder: 'Drama, travel vlog…' },
      { name: 'date', label: 'Started', type: 'date', half: true },
      { name: 'logline', label: 'Logline', type: 'textarea', rows: 2, placeholder: 'One or two sentences: who wants what, and what stands in the way.' },
      { name: 'body', label: 'Draft', type: 'textarea', rows: 16, placeholder: 'Scenes, dialogue, beats, shot ideas…' },
      { name: 'photos', label: 'Mood board / references', type: 'photos' },
      { name: 'tags', label: 'Tags', type: 'tags' },
    ],
  },
  idea: {
    label: 'Idea', plural: 'Ideas', icon: 'bulb',
    fields: [
      { name: 'body', label: 'Idea', type: 'textarea', rows: 5, required: true, placeholder: 'Write it before it flies away…' },
      { name: 'tags', label: 'Tags', type: 'tags' },
      { name: 'pinned', label: 'Pin to top', type: 'checkbox' },
      { name: 'date', label: 'Date', type: 'date' },
    ],
  },
  quote: {
    label: 'Quote', plural: 'Quotes', icon: 'quote',
    fields: [
      { name: 'body', label: 'Quote', type: 'textarea', rows: 4, required: true },
      { name: 'author', label: 'Who said it', half: true, placeholder: 'Me' },
      { name: 'source', label: 'Source', half: true, placeholder: 'Book, film, conversation…' },
      { name: 'tags', label: 'Tags', type: 'tags' },
      { name: 'date', label: 'Date', type: 'date' },
    ],
  },
  journey: {
    label: 'Journey', plural: 'Journeys', icon: 'map',
    fields: [
      { name: 'title', label: 'Journey name', required: true, placeholder: 'Weekend in Estes Park' },
      { name: 'location', label: 'Where', placeholder: 'Places, route…' },
      { name: 'date', label: 'Start', type: 'date', required: true, half: true },
      { name: 'endDate', label: 'End', type: 'date', half: true },
      { name: 'body', label: 'Story of the trip', type: 'textarea', rows: 6 },
      { name: 'photos', label: 'Cover & photos', type: 'photos' },
      { name: 'tags', label: 'Tags', type: 'tags' },
    ],
  },
  activity: {
    label: 'Activity', plural: 'Activities', icon: 'run',
    fields: [
      { name: 'type', label: 'Type', type: 'select', options: ACTIVITY_TYPES, half: true },
      { name: 'date', label: 'Date', type: 'date', required: true, half: true },
      { name: 'title', label: 'What', placeholder: 'Upper body day · Chapter 4 of … · Lake trail' },
      { name: 'minutes', label: 'Minutes', type: 'number', min: 0, half: true },
      { name: 'rating', label: 'How it felt', type: 'rating', half: true },
      { name: 'body', label: 'Notes', type: 'textarea', rows: 3 },
      { name: 'photos', label: 'Photos', type: 'photos' },
      { name: 'tags', label: 'Tags', type: 'tags' },
    ],
  },
  review: {
    label: 'Weekly review', plural: 'Weekly reviews', icon: 'target',
    fields: [
      { name: 'date', label: 'Week of', type: 'date', required: true, half: true },
      { name: 'score', label: 'Week score', type: 'rating', max: 10, half: true },
      { name: 'wins', label: 'Wins & progress', type: 'textarea', rows: 3 },
      { name: 'improve', label: 'What got in the way / what to change', type: 'textarea', rows: 3 },
      { name: 'focus', label: 'Focus for next week', type: 'textarea', rows: 3 },
      { name: 'body', label: 'Anything else', type: 'textarea', rows: 3 },
    ],
  },
};

export async function editEntry(kind, existing = null, preset = {}) {
  const k = KINDS[kind];
  const values = existing ? { ...existing } : { date: isoDate(), ...preset };
  const out = await formModal(existing ? 'Edit ' + k.label.toLowerCase() : 'New ' + k.label.toLowerCase(), k.fields, values, {
    wide: ['story', 'diary', 'journey'].includes(kind),
    onDelete: existing ? async () => { await db.del('entries', existing.id); toast('Deleted'); } : null,
  });
  if (!out) return null;
  if (kind === 'moment' && !(out.body || '').trim() && !(out.photos || []).length) { toast('Write something or add a photo'); return null; }
  out.kind = kind;
  if (!out.date) out.date = isoDate();
  const saved = await db.put('entries', out);
  toast(existing ? 'Saved' : k.label + ' added');
  return saved;
}

export function entryTitle(e) {
  if (e.title) return e.title;
  if (e.kind === 'review') return 'Week of ' + fmtDate(e.date);
  const t = (e.body || e.location || '').split('\n')[0];
  return t.length > 70 ? t.slice(0, 70) + '…' : t || KINDS[e.kind]?.label || 'Entry';
}

export function entryCard(e) {
  const k = KINDS[e.kind] || { label: e.kind, icon: 'dot' };
  const photo = e.photos && e.photos[0];
  const snippet = e.kind === 'story' ? e.logline || e.body : e.kind === 'review' ? e.wins || e.focus : e.body;
  return h('a.card.entry-card', { href: '#/entry/' + e.id },
    photo ? h('div.entry-photo', mimg(photo), e.photos.length > 1 ? h('span.badge', '+' + (e.photos.length - 1)) : null) : null,
    h('div.entry-main',
      h('div.entry-meta', h('span.kind-chip.k-' + e.kind, icon(k.icon, 14), k.label),
        h('span', fmtDate(e.date)),
        e.mood ? h('span', { title: 'Mood' }, MOODS[e.mood - 1]) : null,
        e.minutes ? h('span', fmtHours(e.minutes)) : null,
        e.status ? h('span.pill', e.status) : null,
        e.location ? h('span', icon('pin', 12), e.location) : null),
      h('h3', entryTitle(e)),
      snippet && e.title !== snippet ? h('p.snippet', snippet.slice(0, 220)) : null,
      tagChips(e.tags)));
}

export function quoteCard(e) {
  return h('a.card.quote-card', { href: '#/entry/' + e.id },
    h('blockquote', '“' + e.body + '”'),
    h('cite', '— ' + (e.author || 'Me') + (e.source ? ', ' + e.source : '')));
}
