/* Where every mark sits on each step of the story. Pure: no DOM, so test/story.test.mjs
 * runs every layout at several plot sizes. Modelled on daylight/site/story.
 *
 * Every step is the same chart: the pairs of people in bands of 1,000 km of distance.
 *   "dist": grey bars, how many pairs are that far apart; the red dot is the middle pair
 *   "off":  each band as 100% of its pairs, red where the map's line is off by over 45°
 *   "flip": red where the map's line and the real route set off on opposite sides of east–west
 */
export const COL = { hit: '#b3261e', faint: '#cfcac3' };
export const BAND = 1000, KM_MAX = 20000, NBANDS = KM_MAX / BAND;
export const STEPS = { dist: 'dist', off: 'off', flip: 'flip' };
const S10 = Math.sin((10 * Math.PI) / 180);

/* degrees between the true starting direction and a map's line (col 4 the page's map, 5 Mercator) */
export const offBy = (p, col = 4) => Math.abs(((((p[3] - p[col] + 1800) % 3600) + 3600) % 3600) - 1800) / 10;
/* the map's line heads north-ish and the route south-ish, or the other way, each by 10° or more */
export function flips(p) {
  const c1 = Math.cos((p[3] / 10) * (Math.PI / 180)), c2 = Math.cos((p[4] / 10) * (Math.PI / 180));
  return Math.abs(c1) > S10 && Math.abs(c2) > S10 && (c1 > 0) !== (c2 > 0);
}
export const SEL = {
  all: () => true,
  eq: (p) => (p[6] & 4) !== 0,
  nochina: (p) => (p[6] & 2) === 0,
};

const memo = new WeakMap();
/* -> the numbers the story quotes, for the pairs SEL[sel] keeps; build_story.py's `check` holds the same */
export function stats(D, sel = 'all') {
  if (!SEL[sel]) throw new Error(`unknown selection ${sel}`);
  if (!memo.has(D)) memo.set(D, {});
  const m = memo.get(D);
  if (m[sel]) return m[sel];
  const P = D.pairs.filter(SEL[sel]);
  const share = (xs, f) => (xs.length ? xs.filter(f).length / xs.length : 0);
  const km = P.map((p) => p[2]).sort((a, b) => a - b);
  const short = P.filter((p) => p[2] < 3000).map((p) => offBy(p)).sort((a, b) => a - b);
  const far = (k) => P.filter((p) => p[2] >= k);
  m[sel] = {
    n: P.length,
    median_km: km[(km.length - 1) >> 1],
    dom: share(P, (p) => (p[6] & 1) !== 0),
    over10k: share(P, (p) => p[2] >= 10000),
    off45: share(P, (p) => offBy(p) > 45),
    off90: share(P, (p) => offBy(p) > 90),
    merc45: share(P, (p) => offBy(p, 5) > 45),
    flip: share(P, flips),
    under6k_off45: P.filter((p) => p[2] < 6000 && offBy(p) > 45).length,
    under6k_n: P.filter((p) => p[2] < 6000).length,
    under3k_median_off: short[(short.length - 1) >> 1],
    over10k_off45: share(far(10000), (p) => offBy(p) > 45),
    over12k_off45: share(far(12000), (p) => offBy(p) > 45),
    over15k_flip: share(far(15000), flips),
  };
  return m[sel];
}

/* -> [{n, hit}] per band: pairs in it, and how many of them the step's red marks */
export function bands(D, name) {
  const out = Array.from({ length: NBANDS }, () => ({ n: 0, hit: 0 }));
  const red = name === 'off' ? (p) => offBy(p) > 45 : name === 'flip' ? flips : () => false;
  for (const p of D.pairs) {
    const b = out[Math.min(NBANDS - 1, Math.floor(p[2] / BAND))];
    b.n++; if (red(p)) b.hit++;
  }
  return out;
}

/* -> {X, Y, bars: [{x,y,w,h,n,cls}], real: [{x,y,r,fill,op}], ymax} in px of w x h */
export function layout(name, D, w, h) {
  if (!STEPS[name]) throw new Error(`unknown step ${name}`);
  const pad = 8;
  const X = (km) => pad + (km / KM_MAX) * (w - 2 * pad);
  const base = h - pad, room = h - 2 * pad - 20;
  const B = bands(D, name);
  const most = Math.max(...B.map((b) => b.n));
  // "dist" is counts (the fullest band is full height); the others are shares of each band
  const Y = name === 'dist' ? (v) => base - (room * v) / most : (v) => base - room * v;
  const bw = Math.max(1, (X(BAND) - X(0)) * 0.84);
  const bars = [];
  B.forEach((b, k) => {
    if (!b.n) return;
    const x = X((k + 0.5) * BAND) - bw / 2;
    if (name === 'dist') bars.push({ x, y: Y(b.n), w: bw, h: base - Y(b.n), n: b.n, cls: 'bar' });
    else {
      bars.push({ x, y: Y(1), w: bw, h: room, n: b.n, cls: 'bar' });
      if (b.hit) bars.push({ x, y: Y(b.hit / b.n), w: bw, h: base - Y(b.hit / b.n), n: b.hit, cls: 'hit', of: b.n });
    }
  });
  const r = Math.max(3.5, Math.min(7, h * 0.012));
  const real = name === 'dist' ? [{ x: X(stats(D).median_km), y: base - r, r, fill: COL.hit, op: 1 }] : [{ x: X(0), y: base, r: 0, fill: COL.hit, op: 0 }];
  return { kind: name, X, Y, base, room, bars, real };
}
