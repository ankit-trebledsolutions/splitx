// Draws the itinerary roadmap as a static HTML page from the same layout
// module the app uses, with the app's colours and sizes, so a change to the
// road can be looked at in a browser without a device. The HTML mirrors
// components/ItineraryRoadmap.js by hand: keep the two in step.
//
//   node scripts/preview-roadmap.mjs [width=328] [out=../roadmap-preview.html]
import fs from 'node:fs';
import path from 'node:path';
import { layoutRoadmap, STOP_R, MILESTONE_R } from '../src/utils/roadmapLayout.js';

const ROAD_DONE = '#00C4D0';
const ROAD_NOW = '#F6B042';
const ROAD_BASE = 'rgba(255,255,255,0.14)';
const ROAD_EDGE = 'rgba(255,255,255,0.32)';
const ON_ROAD = '#04241A';
const card = '#0E1014';
const text = '#F4F7FA';
const muted = '#8A97A6';
const accent = '#00C4D0';

const mk = (title, status) => ({ status, activity: { title } });
const day = (dayNumber, title, stops, status, isToday = false) => {
  const done = stops.filter((s) => s.status === 'done').length;
  return { dayId: `d${dayNumber}`, dayNumber, day: { title }, date: 1, status, isToday, total: stops.length, done, stops };
};
const trips = {
  goa: (() => {
    const d1 = [mk('Airport pickup', 'done'), mk('Hotel check-in', 'done'), mk('Baga beach', 'done'), mk('Dinner at Thalassa', 'done')];
    const d2 = [mk('Breakfast', 'done'), mk('Dudhsagar falls', 'current'), mk('Spice farm lunch at Sahakari plantation', 'pending'), mk('Old Goa churches', 'pending'), mk('Sunset cruise on the Mandovi', 'pending')];
    const d3 = [mk('Checkout', 'pending'), mk('Souvenirs at Mapusa market', 'pending'), mk('Flight home', 'pending'), mk('Reach Pune', 'pending')];
    const days = [day(1, 'Arrival', d1, 'done'), day(2, 'Waterfalls', d2, 'current', true), day(3, 'Departure', d3, 'pending')];
    return { days, currentStop: d2[1], allDone: false };
  })(),
  sparse: (() => {
    const d1 = [mk('Only one stop today', 'done')];
    const d2 = [];
    const d3 = [mk('Lunch', 'skipped'), mk('Museum', 'done'), mk('A really long activity title that keeps going', 'current'), mk('Short', 'pending'), mk('Five', 'pending'), mk('Six', 'pending'), mk('Seven', 'pending')];
    const days = [day(1, 'One', d1, 'done'), day(2, 'Empty', d2, 'done'), day(3, 'Long', d3, 'current')];
    return { days, currentStop: d3[2], allDone: false };
  })(),
  finished: (() => {
    const d1 = [mk('Check in', 'done'), mk('Beach', 'done'), mk('Rained off', 'skipped')];
    const d2 = [];
    const days = [day(1, 'All done', d1, 'done'), day(2, 'Spare day', d2, 'pending')];
    return { days, currentStop: null, allDone: true };
  })(),
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const circleCss = (status, r) => {
  const base = `width:${r * 2}px;height:${r * 2}px;border-radius:${r}px;`;
  if (status === 'done') return `${base}background:${ROAD_DONE};`;
  if (status === 'current') return `${base}background:${ROAD_NOW};`;
  if (status === 'skipped') return `${base}background:${card};border:1.5px dashed ${ROAD_EDGE};`;
  return `${base}background:${card};border:1.5px solid ${ROAD_EDGE};`;
};
const check = (size, color) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const render = (progress, width) => {
  const L = layoutRoadmap(progress, width);
  let out = `<div class="road" style="width:${width}px;height:${L.height}px">`;
  out += `<svg width="${width}" height="${L.height}" style="position:absolute;left:0;top:0">`;
  out += `<path d="${L.roadPath}" stroke="${ROAD_BASE}" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="6 6"/>`;
  if (L.travelledPath) out += `<path d="${L.travelledPath}" stroke="${ROAD_DONE}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  const cur = L.nodes.find((n) => n.kind === 'stop' && n.stop === progress.currentStop);
  if (cur) out += `<circle cx="${cur.x}" cy="${cur.y}" r="${STOP_R + 5}" fill="${ROAD_NOW}" opacity="0.28"/>`;
  out += '</svg>';
  for (const n of L.nodes) {
    const b = n.label;
    const align = b.align === 'right' ? 'flex-end' : b.align === 'center' ? 'center' : 'flex-start';
    const justify = b.align === 'center' ? 'flex-start' : 'center';
    const box = `position:absolute;left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px;display:flex;flex-direction:column;justify-content:${justify};align-items:${align};text-align:${b.align};`;
    if (n.kind === 'day') {
      const st = n.row.status;
      const inner = st === 'done' ? check(18, ON_ROAD) : `<span style="font-weight:800;font-size:14px;color:${st === 'current' ? ON_ROAD : muted}">${n.row.dayNumber}</span>`;
      out += `<div class="node" style="left:${n.x - MILESTONE_R}px;top:${n.y - MILESTONE_R}px;${circleCss(st, MILESTONE_R)}">${inner}</div>`;
      const parts = ['Oct 16', n.row.total ? `${n.row.done} of ${n.row.total} done` : 'No stops yet'];
      if (n.row.isToday) parts.push('today');
      out += `<div style="${box}"><div style="display:flex;align-items:center;max-width:100%"><span class="dayTitle">Day ${n.row.dayNumber} · ${esc(n.row.day.title)}</span><span style="color:${accent};font-size:11px;margin-left:6px">&#9998;</span></div><span class="meta">${parts.join(' · ')}</span></div>`;
    } else if (n.kind === 'stop') {
      const st = n.stop.status;
      const inner = st === 'done' ? check(13, ON_ROAD) : st === 'skipped' ? `<span style="color:${muted};font-size:11px">&#10005;</span>` : '';
      out += `<div class="node" style="left:${n.x - STOP_R}px;top:${n.y - STOP_R}px;${circleCss(st, STOP_R)}">${inner}</div>`;
      const cls = st === 'current' ? 'now' : st === 'done' ? 'done' : st === 'skipped' ? 'skipped' : 'pending';
      const clamp =
        b.align === 'center'
          ? 'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;'
          : 'display:block;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      out += `<div style="${box}"><span class="title ${cls}" style="${clamp}">${esc(n.stop.activity.title)}</span></div>`;
    } else {
      out += `<div class="node" style="left:${n.x - MILESTONE_R}px;top:${n.y - MILESTONE_R}px;width:32px;height:32px;border-radius:16px;background:${card};border:1.5px dashed rgba(0,196,208,0.55);color:${accent};font-size:20px">+</div>`;
      out += `<div style="${box}"><span style="color:${accent};font-size:14px;font-weight:700">Add Day</span><span class="meta">The road goes on from here</span></div>`;
    }
  }
  return `${out}</div>`;
};

const width = Number(process.argv[2] ?? 328);
const outPath = path.resolve(process.argv[3] ?? path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'roadmap-preview.html'));
const html = `<!doctype html><meta charset="utf-8"><title>Roadmap preview</title>
<style>
body{margin:0;background:#05070A;font-family:Roboto,"Segoe UI",system-ui,sans-serif;color:${text};display:flex;gap:40px;padding:24px;align-items:flex-start}
.phone{background:#05070A;padding:16px;border:1px solid #222;border-radius:24px}
.road{position:relative}
.node{position:absolute;display:flex;align-items:center;justify-content:center;box-sizing:border-box}
.dayTitle{color:${text};font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.meta{color:${muted};font-size:11px;margin-top:2px}
.title{font-size:12.5px;line-height:16px;color:#C3CBD5}
.title.now{color:${text};font-size:13.5px;line-height:17px;font-weight:700}
.title.done{color:${muted}}
.title.skipped{color:${muted};text-decoration:line-through}
h4{margin:0 0 8px;color:${muted};font-weight:500;font-size:12px}
</style>
${Object.entries(trips)
  .map(([k, p]) => `<div><h4>${k} · width ${width}</h4><div class="phone">${render(p, width)}</div></div>`)
  .join('')}`;
fs.writeFileSync(outPath, html);
console.log(`written ${outPath}`);
