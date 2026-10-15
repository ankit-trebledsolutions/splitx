// Where everything on the itinerary roadmap goes, as plain numbers. Pure, so
// the geometry can be checked without a device: no React, no native modules.
//
// The road runs down the screen through three lanes. A day's milestone sits
// in the left lane; its stops snake middle → right → middle → left and on.
// The road passes side-lane nodes vertically and middle-lane nodes
// horizontally, joined by rounded corners, so a stop in the middle is
// labelled under itself (the road leaves it sideways) and a stop at a side
// is labelled inward (the road leaves it downward). Beside a node the road
// is dead straight until the corner starts, so a label that keeps clear of
// the node's own lane is clear of the road.

export const MILESTONE_R = 16;
export const STOP_R = 10;
// Side lanes sit this far in from the road's left and right edges: a
// narrow zigzag, as in the mockup, with room for labels beside the sides.
export const EDGE = 60;
export const TOP = 16;
export const BOTTOM = 110;
// Vertical distances between consecutive nodes.
export const GAP_FROM_DAY = 62; // milestone → its first stop
export const GAP_STOP = 60; // stop → stop
export const GAP_TO_DAY = 72; // last stop → next milestone (or Add Day)
export const GAP_DAY_DAY = 64; // milestone → milestone (a day without stops)
// Corners are quarter circles of this radius, shrunk where a gap is tight.
export const CORNER_R = 26;
// Label boxes, sized to their text: one line beside a stop, two under a
// middle stop, two beside a milestone. Text starts LABEL_GAP from a node's
// edge; the road beside a side-lane node runs straight in that node's lane
// for at least GAP_STOP - CORNER_R = 34px above and below it, past the
// 11px half-height of the label beside it.
export const LABEL_GAP = 12;
export const SIDE_LABEL_H = 22;
export const DAY_LABEL_H = 42;
export const MID_LABEL_W = 136;
export const MID_LABEL_H = 34;
export const MID_LABEL_GAP = 5; // under a middle-lane node
export const MARGIN = 8; // labels stop this short of the road's edges

const PATTERN = [1, 2, 1, 0];
// A day with 1, 5, 9… stops would end on a middle stop entered from the left
// that must leave to the left again (a hairpin through its own label).
// Starting such a day on the right keeps every middle stop a pass-through.
const PATTERN_ALT = [2, 1, 0, 1];

export const lanesFor = (count) => {
  const pattern = count % 4 === 1 ? PATTERN_ALT : PATTERN;
  return Array.from({ length: count }, (_, i) => pattern[i % pattern.length]);
};

const orient = (node) => (node.lane === 1 ? 'h' : 'v');
const sign = (n) => (n < 0 ? -1 : 1);

// Cubic control points for one quarter circle: 0.5523 is the usual constant.
const K = 0.5523;
const line = (p, q) => [p, p, q, q];
// A quarter turn from heading down at `from` to heading sideways (dir ±1).
const turnDownToSide = (from, r, dir) => {
  const to = { x: from.x + dir * r, y: from.y + r };
  return [from, { x: from.x, y: from.y + K * r }, { x: to.x - dir * K * r, y: to.y }, to];
};
// A quarter turn from heading sideways (dir ±1) at `from` to heading down.
const turnSideToDown = (from, r, dir) => {
  const to = { x: from.x + dir * r, y: from.y + r };
  return [from, { x: from.x + dir * K * r, y: from.y }, { x: to.x, y: to.y - K * r }, to];
};

// The road from a to b as cubic pieces (a straight line is a cubic whose
// control points sit on its ends). Side-lane nodes are left and entered
// vertically, middle-lane nodes horizontally; two side lanes are joined by
// a horizontal run halfway down.
export const segmentPieces = (a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const oa = orient(a);
  const ob = orient(b);
  const dir = sign(dx);

  if (oa === 'v' && ob === 'h') {
    const r = Math.min(CORNER_R, dy, Math.abs(dx));
    const c = { x: a.x, y: b.y - r };
    const turn = turnDownToSide(c, r, dir);
    return [line(a, c), turn, line(turn[3], b)];
  }
  if (oa === 'h' && ob === 'v') {
    const r = Math.min(CORNER_R, dy, Math.abs(dx));
    const c = { x: b.x - dir * r, y: a.y };
    const turn = turnSideToDown(c, r, dir);
    return [line(a, c), turn, line(turn[3], b)];
  }
  if (dx === 0) return [line(a, b)];
  const r = Math.min(CORNER_R, dy / 2, Math.abs(dx) / 2);
  const mid = a.y + dy / 2;
  const c1 = { x: a.x, y: mid - r };
  const turn1 = turnDownToSide(c1, r, dir);
  const c2 = { x: b.x - dir * r, y: mid };
  const turn2 = turnSideToDown(c2, r, dir);
  return [line(a, c1), turn1, line(turn1[3], c2), turn2, line(turn2[3], b)];
};

const r1 = (n) => Math.round(n * 10) / 10;

export const pathOf = (pieces) =>
  pieces
    .map(([p0, p1, p2, p3], i) => {
      const start = i === 0 ? `M${r1(p0.x)} ${r1(p0.y)} ` : '';
      if (p1 === p0 && p2 === p3) return `${start}L${r1(p3.x)} ${r1(p3.y)}`;
      return `${start}C${r1(p1.x)} ${r1(p1.y)} ${r1(p2.x)} ${r1(p2.y)} ${r1(p3.x)} ${r1(p3.y)}`;
    })
    .join(' ');

// A point on one cubic piece at t in [0, 1].
export const pointAt = ([p0, p1, p2, p3], t) => {
  const s = 1 - t;
  const w0 = s * s * s;
  const w1 = 3 * s * s * t;
  const w2 = 3 * s * t * t;
  const w3 = t * t * t;
  return {
    x: w0 * p0.x + w1 * p1.x + w2 * p2.x + w3 * p3.x,
    y: w0 * p0.y + w1 * p1.y + w2 * p2.y + w3 * p3.y,
  };
};

const labelFor = (node, width) => {
  const { x, y, lane, kind } = node;
  const r = kind === 'stop' ? STOP_R : MILESTONE_R;
  if (kind !== 'stop' || lane === 0) {
    const left = x + r + LABEL_GAP;
    const h = kind === 'stop' ? SIDE_LABEL_H : DAY_LABEL_H;
    return { left, top: y - h / 2, width: width - left - MARGIN, height: h, align: 'left' };
  }
  if (lane === 2) {
    const right = x - r - LABEL_GAP;
    return { left: MARGIN, top: y - SIDE_LABEL_H / 2, width: right - MARGIN, height: SIDE_LABEL_H, align: 'right' };
  }
  return {
    left: x - MID_LABEL_W / 2,
    top: y + r + MID_LABEL_GAP,
    width: MID_LABEL_W,
    height: MID_LABEL_H,
    align: 'center',
  };
};

/**
 * Lays the whole trip out on a road `width` wide. Returns the nodes (each
 * with its circle centre, lane and label box), the road's segments (cubic
 * pieces plus the SVG path), the index up to which the road is travelled,
 * and the total height.
 */
export const layoutRoadmap = (progress, width) => {
  const lanes = [EDGE, width / 2, width - EDGE];
  const nodes = [];
  let y = TOP + MILESTONE_R;
  let last = null;

  const push = (node) => {
    nodes.push({ ...node, label: labelFor(node, width) });
    last = node;
  };

  progress.days.forEach((row) => {
    if (last) y += last.kind === 'stop' ? GAP_TO_DAY : GAP_DAY_DAY;
    push({ kind: 'day', key: `day-${row.dayId}`, x: lanes[0], y, lane: 0, row });
    const laneOf = lanesFor(row.stops.length);
    row.stops.forEach((stop, i) => {
      y += i === 0 ? GAP_FROM_DAY : GAP_STOP;
      push({ kind: 'stop', key: `stop-${stop.id}`, x: lanes[laneOf[i]], y, lane: laneOf[i], stop });
    });
  });
  if (last) y += last.kind === 'stop' ? GAP_TO_DAY : GAP_DAY_DAY;
  push({ kind: 'add', key: 'add', x: lanes[0], y, lane: 0 });

  const segments = nodes.slice(1).map((node, i) => {
    const pieces = segmentPieces(nodes[i], node);
    return { from: i, to: i + 1, pieces, d: pathOf(pieces) };
  });

  // The travelled road reaches the current stop; with every stop done it
  // reaches the last node that is done (not a skipped stop or an empty day
  // still ahead); before the first stop it is nothing.
  let travelledTo = 0;
  if (progress.currentStop) {
    travelledTo = nodes.findIndex((n) => n.kind === 'stop' && n.stop === progress.currentStop);
  } else if (progress.allDone) {
    const isDone = (n) =>
      (n.kind === 'stop' && n.stop.status === 'done') || (n.kind === 'day' && n.row.status === 'done');
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      if (isDone(nodes[i])) {
        travelledTo = i;
        break;
      }
    }
  }

  return {
    nodes,
    segments,
    travelledTo,
    height: y + MILESTONE_R + BOTTOM,
    roadPath: segments.map((s) => s.d).join(' '),
    travelledPath: segments
      .filter((s) => s.to <= travelledTo)
      .map((s) => s.d)
      .join(' '),
  };
};
