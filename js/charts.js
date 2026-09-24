// Small SVG bar charts: grouped vertical bars and a horizontal ranked list.
// Colors come from CSS tokens (--series-1, --series-2) so light/dark both work.

import { h } from './ui.js';

// data: [{label, values: [n, n]}], series: [{name, color: 'var(--series-1)'}]
export function barChart({ data, series, fmt = String, height = 180, ariaLabel = 'Bar chart' }) {
  const W = 640, H = height, padL = 8, padB = 26, padT = 12;
  const max = Math.max(1, ...data.flatMap(d => d.values));
  const n = data.length, s = series.length;
  const band = (W - padL * 2) / n;
  const gap = 2;
  const bw = Math.min(28, (band * 0.7 - gap * (s - 1)) / s);
  const tip = h('div.chart-tip', { role: 'status' });
  const svg = h('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': ariaLabel });

  // recessive baseline + one mid gridline
  for (const f of [0, 0.5, 1]) {
    const y = padT + (H - padT - padB) * (1 - f);
    svg.append(h('line', { x1: padL, x2: W - padL, y1: y, y2: y, class: f === 0 ? 'axis' : 'grid' }));
  }
  data.forEach((d, i) => {
    const x0 = padL + band * i + (band - (bw * s + gap * (s - 1))) / 2;
    d.values.forEach((v, j) => {
      const bh = ((H - padT - padB) * v) / max;
      const x = x0 + j * (bw + gap), y = H - padB - bh;
      if (v > 0) svg.append(h('path', { d: roundTop(x, y, bw, bh, Math.min(4, bh, bw / 2)), fill: series[j].color }));
    });
    const hit = h('rect', { x: padL + band * i, y: 0, width: band, height: H - padB, class: 'hit' });
    const show = () => {
      tip.replaceChildren(h('strong', d.label), ...d.values.map((v, j) => h('div', h('span.swatch', { style: { background: series[j].color } }), series[j].name + ': ' + fmt(v))));
      tip.style.left = ((padL + band * (i + 0.5)) / W * 100) + '%';
      tip.classList.add('on');
    };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('click', show);
    hit.addEventListener('pointerleave', () => tip.classList.remove('on'));
    svg.append(hit);
    svg.append(h('text', { x: padL + band * (i + 0.5), y: H - 8, 'text-anchor': 'middle', class: 'tick' }, d.label));
  });

  return h('figure.chart-wrap',
    series.length > 1 ? h('figcaption.legend', series.map(se => h('span', h('span.swatch', { style: { background: se.color } }), se.name))) : null,
    h('div.chart-area', svg, tip));
}

function roundTop(x, y, w, hgt, r) {
  return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`;
}

// rows: [{label, value, budget?}] — single series, sorted by caller.
export function rankBars(rows, fmt = String) {
  const max = Math.max(1, ...rows.map(r => Math.max(r.value, r.budget || 0)));
  return h('div.rank', rows.map(r => {
    const over = r.budget && r.value > r.budget;
    return h('div.rank-row',
      h('div.rank-label', h('span', r.label), h('strong', fmt(r.value), r.budget ? h('span.muted', ' / ' + fmt(r.budget)) : null)),
      h('div.rank-track',
        h('div.rank-fill' + (over ? '.over' : ''), { style: { width: (r.value / max * 100) + '%' } }),
        r.budget ? h('div.rank-budget', { style: { left: (r.budget / max * 100) + '%' }, title: 'Budget' }) : null),
      over ? h('small.over-text', '⚠ over budget by ' + fmt(r.value - r.budget)) : null);
  }));
}
