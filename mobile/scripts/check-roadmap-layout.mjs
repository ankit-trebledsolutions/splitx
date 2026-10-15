// Samples every bend of the itinerary roadmap against every label box and
// node, for thousands of day/stop combinations and phone widths. Pure
// geometry, no React: run it after touching src/utils/roadmapLayout.js.
//
//   node scripts/check-roadmap-layout.mjs
import assert from 'node:assert/strict';
import { layoutRoadmap, pointAt, STOP_R, MILESTONE_R, lanesFor } from '../src/utils/roadmapLayout.js';

const ROAD_HALF = 1.5; // the road is a 3px stroke
const CLEAR = 2; // air between the road and a text box

// `current` is a stop index, null (nothing current, nothing done) or 'all'
// (everything done).
const fakeProgress = (counts, current) => {
  const stops = [];
  const days = counts.map((n, i) => {
    const row = { dayId: `d${i}`, stops: [], status: current === 'all' ? 'done' : 'pending' };
    for (let k = 0; k < n; k += 1) {
      const s = { id: `s${i}-${k}`, status: current === 'all' ? 'done' : 'pending' };
      row.stops.push(s);
      stops.push(s);
    }
    return row;
  });
  const currentStop = typeof current === 'number' ? (stops[current] ?? null) : null;
  return { days, currentStop, allDone: current === 'all' && stops.length > 0 };
};

const inflate = (b, by) => ({
  left: b.left - by,
  top: b.top - by,
  right: b.left + b.width + by,
  bottom: b.top + b.height + by,
});
const inside = (p, b) => p.x > b.left && p.x < b.right && p.y > b.top && p.y < b.bottom;
const rectsOverlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const circleBox = (n) => {
  const r = n.kind === 'stop' ? STOP_R : MILESTONE_R;
  return { left: n.x - r, top: n.y - r, right: n.x + r, bottom: n.y + r };
};

let cases = 0;
let roadSamples = 0;
const widths = [296, 312, 328, 344, 360, 380, 400];
const combos = [];
for (let a = 0; a <= 9; a += 1) for (let b = 0; b <= 9; b += 1) combos.push([a, b]);
for (const trio of [[4, 5, 4], [0, 0, 0], [1, 1, 1], [5, 1, 9], [3, 0, 2, 7], [13], [2, 6, 1, 0, 4]]) combos.push(trio);

for (const width of widths) {
  for (const counts of combos) {
    const total = counts.reduce((a, b) => a + b, 0);
    const currents = [0, Math.floor(total / 2), total - 1, null, 'all'].filter(
      (c) => c === null || c === 'all' || (c >= 0 && c < total)
    );
    for (const current of currents) {
      const progress = fakeProgress(counts, current);
      const laid = layoutRoadmap(progress, width);
      cases += 1;
      const { nodes, segments } = laid;
      const label = `w=${width} counts=${counts.join(',')} current=${current}`;

      // Middle-lane stops are pass-throughs between the two sides.
      nodes.forEach((n, i) => {
        if (n.kind === 'stop' && n.lane === 1) {
          const prev = nodes[i - 1];
          const next = nodes[i + 1];
          assert.ok(
            prev.lane !== 1 && next.lane !== 1 && prev.lane !== next.lane,
            `${label}: middle stop ${i} is not a pass-through (${prev.lane}->${next.lane})`
          );
        }
      });

      // Everything stays inside the road's box.
      for (const n of nodes) {
        const b = n.label;
        assert.ok(b.left >= 0 && b.left + b.width <= width, `${label}: label of ${n.key} off the side`);
        assert.ok(b.width >= 60, `${label}: label of ${n.key} too narrow (${b.width})`);
        assert.ok(n.y + MILESTONE_R < laid.height, `${label}: node ${n.key} below the height`);
        const c = circleBox(n);
        assert.ok(c.left >= 0 && c.right <= width, `${label}: circle of ${n.key} off the side`);
      }

      // Label boxes never overlap each other or any circle.
      for (let i = 0; i < nodes.length; i += 1) {
        const bi = inflate(nodes[i].label, 0);
        for (let j = 0; j < nodes.length; j += 1) {
          if (i !== j) {
            assert.ok(!rectsOverlap(bi, inflate(nodes[j].label, 0)), `${label}: labels ${nodes[i].key} and ${nodes[j].key} overlap`);
          }
          assert.ok(!rectsOverlap(bi, circleBox(nodes[j])), `${label}: label ${nodes[i].key} meets circle ${nodes[j].key}`);
        }
      }

      // The road never crosses a label box, never passes through a third
      // node, and never goes back up.
      for (const seg of segments) {
        let lastY = -Infinity;
        const samples = seg.pieces.flatMap((piece) => Array.from({ length: 41 }, (_, k) => pointAt(piece, k / 40)));
        samples.forEach((p, k) => {
          roadSamples += 1;
          assert.ok(p.y >= lastY - 1e-6, `${label}: segment ${seg.from}->${seg.to} goes up at sample ${k}`);
          lastY = p.y;
          for (const n of nodes) {
            assert.ok(
              !inside(p, inflate(n.label, ROAD_HALF + CLEAR)),
              `${label}: road ${seg.from}->${seg.to} crosses label ${n.key} at (${p.x.toFixed(1)},${p.y.toFixed(1)})`
            );
          }
          nodes.forEach((n, idx) => {
            if (idx === seg.from || idx === seg.to) return;
            const r = (n.kind === 'stop' ? STOP_R : MILESTONE_R) + ROAD_HALF + CLEAR;
            assert.ok(Math.hypot(p.x - n.x, p.y - n.y) > r, `${label}: road ${seg.from}->${seg.to} passes through node ${n.key}`);
          });
        });
      }

      // The travelled road reaches exactly the current stop, or the last
      // done node when everything is done, or nothing.
      if (progress.currentStop) {
        const idx = nodes.findIndex((n) => n.stop === progress.currentStop);
        assert.equal(laid.travelledTo, idx);
        assert.equal(laid.travelledPath.split('M').length - 1, idx, `${label}: travelled segments`);
      } else if (progress.allDone) {
        assert.equal(laid.travelledTo, nodes.length - 2, `${label}: all done reaches the last node before Add Day`);
      } else {
        assert.equal(laid.travelledPath, '');
      }
      assert.equal(laid.roadPath.split('M').length - 1, nodes.length - 1);
    }
  }
}

// Everything done, but the trip ends with a skipped stop and an empty day
// still ahead: the solid road stops at the last done node.
{
  const p = fakeProgress([2, 0], 'all');
  p.days[0].stops[1].status = 'skipped';
  p.days[1].status = 'pending';
  const laid = layoutRoadmap(p, 328);
  assert.equal(laid.travelledTo, 1, 'solid road ends at the last done stop');
}

assert.deepEqual(lanesFor(5), [2, 1, 0, 1, 2]);
assert.deepEqual(lanesFor(4), [1, 2, 1, 0]);
assert.deepEqual(lanesFor(1), [2]);
assert.deepEqual(lanesFor(0), []);
console.log(`roadmap geometry: ${cases} layouts, ${roadSamples} road samples, no collisions`);
