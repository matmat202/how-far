// How Far? — pure logic, no DOM. The page and the suite both import this file.
//
// Distance and the starting bearing are Vincenty's inverse formula on the WGS84 ellipsoid,
// the shape GPS uses; the suite checks them against GeographicLib (Karney) to the metre.
// Vincenty does not converge for a few nearly antipodal pairs, and there it falls back to
// the sphere, which is within 0.5%. The route drawn and the halfway point are on the
// sphere: at map scale nobody can see the difference.

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
export const R_KM = 6371.0088; // mean Earth radius (IUGG)
const A = 6378137, F = 1 / 298.257223563, B = A * (1 - F);

// Haversine distance (km) and initial bearing (deg) on the sphere.
export function sphere(a, b) {
  const p1 = a.lat * RAD, p2 = b.lat * RAD, dl = (b.lon - a.lon) * RAD;
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const km = 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return { km, bearing: (Math.atan2(y, x) * DEG + 360) % 360 };
}

// Vincenty inverse on WGS84: { km, bearing, exact }. exact=false means the sphere was used.
export function measure(a, b) {
  const L = (b.lon - a.lon) * RAD;
  const U1 = Math.atan((1 - F) * Math.tan(a.lat * RAD)), U2 = Math.atan((1 - F) * Math.tan(b.lat * RAD));
  const sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2);
  let lam = L, prev, sinS, cosS, sigma, cos2a, cos2Sm, sinL, cosL;
  for (let i = 0; i < 200; i++) {
    sinL = Math.sin(lam); cosL = Math.cos(lam);
    sinS = Math.sqrt((cU2 * sinL) ** 2 + (cU1 * sU2 - sU1 * cU2 * cosL) ** 2);
    if (sinS === 0) return { km: 0, bearing: 0, exact: true }; // the same point
    cosS = sU1 * sU2 + cU1 * cU2 * cosL;
    sigma = Math.atan2(sinS, cosS);
    const sinA = (cU1 * cU2 * sinL) / sinS;
    cos2a = 1 - sinA * sinA;
    cos2Sm = cos2a ? cosS - (2 * sU1 * sU2) / cos2a : 0; // both on the equator
    const C = (F / 16) * cos2a * (4 + F * (4 - 3 * cos2a));
    prev = lam;
    lam = L + (1 - C) * F * sinA * (sigma + C * sinS * (cos2Sm + C * cosS * (-1 + 2 * cos2Sm * cos2Sm)));
    if (Math.abs(lam - prev) < 1e-12) {
      const u2 = (cos2a * (A * A - B * B)) / (B * B);
      const k1 = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
      const k2 = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
      const dS = k2 * sinS * (cos2Sm + (k2 / 4) * (cosS * (-1 + 2 * cos2Sm * cos2Sm)
        - (k2 / 6) * cos2Sm * (-3 + 4 * sinS * sinS) * (-3 + 4 * cos2Sm * cos2Sm)));
      const az = Math.atan2(cU2 * sinL, cU1 * sU2 - sU1 * cU2 * cosL) * DEG;
      return { km: (B * k1 * (sigma - dS)) / 1000, bearing: (az + 360) % 360, exact: true };
    }
  }
  return { ...sphere(a, b), exact: false };
}

// Points along the great circle, as [lon, lat], from a to b.
export function route(a, b, n = 128) {
  const p1 = a.lat * RAD, l1 = a.lon * RAD, p2 = b.lat * RAD, l2 = b.lon * RAD;
  const v1 = [Math.cos(p1) * Math.cos(l1), Math.cos(p1) * Math.sin(l1), Math.sin(p1)];
  const v2 = [Math.cos(p2) * Math.cos(l2), Math.cos(p2) * Math.sin(l2), Math.sin(p2)];
  const d = Math.acos(Math.max(-1, Math.min(1, v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2])));
  if (d < 1e-9) return [[a.lon, a.lat]];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = Math.sin(d);
    const k1 = Math.sin((1 - t) * d) / s, k2 = Math.sin(t * d) / s;
    const x = k1 * v1[0] + k2 * v2[0], y = k1 * v1[1] + k2 * v2[1], z = k1 * v1[2] + k2 * v2[2];
    out.push([Math.atan2(y, x) * DEG, Math.atan2(z, Math.hypot(x, y)) * DEG]);
  }
  return out;
}

// Cut a route where it crosses the 180th meridian, closing each piece at the map's edge.
export function splitAtDateLine(pts) {
  const parts = [[pts[0]]];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (Math.abs(x1 - x0) > 180) {
      const edge = x0 > 0 ? 180 : -180;
      const x1u = x1 + (x0 > 0 ? 360 : -360); // x1 unwrapped onto x0's side
      const y = y0 + ((y1 - y0) * (edge - x0)) / (x1u - x0);
      parts[parts.length - 1].push([edge, y]);
      parts.push([[-edge, y]]);
    }
    parts[parts.length - 1].push(pts[i]);
  }
  return parts;
}

// The halfway point along the great circle.
export function midpoint(a, b) {
  const pts = route(a, b, 2);
  const [lon, lat] = pts[Math.min(1, pts.length - 1)];
  return { lat, lon };
}

// The nearest place in the list to a point: { p, km }.
export function nearest(places, pt) {
  let best = null, bestKm = Infinity;
  for (const p of places) {
    const km = sphere(pt, { lat: p[P.LAT], lon: p[P.LON] }).km;
    if (km < bestKm) { best = p; bestKm = km; }
  }
  return { p: best, km: bestKm };
}

const POINTS = ['north', 'north-northeast', 'northeast', 'east-northeast', 'east', 'east-southeast', 'southeast',
  'south-southeast', 'south', 'south-southwest', 'southwest', 'west-southwest', 'west', 'west-northwest', 'northwest',
  'north-northwest'];
export const compass = (deg) => POINTS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

// A scheduled flight time in minutes, gate to gate, fitted to the median scheduled time of
// 5,955 US routes (BTS, August 2025; projects/flight-time): 45 minutes for taxi, climb and
// descent, then 820 km/h for the first 4,000 km and 900 km/h after, as long-haul jets cruise
// faster. In the westerly belts (25-60 degrees, either hemisphere) the wind takes 3.7 minutes
// per 1,000 km off flying east and adds it flying west, scaled by how much of the leg runs
// east-west and by how many of its two ends lie in a belt. Under 200 km nobody flies: null.
export const beltShare = (lat) => (Math.abs(lat) >= 25 && Math.abs(lat) <= 60 ? 0.5 : 0);
export function flightMin(km, bearing = 0, latA = 0, latB = 0) {
  if (km < 200) return null;
  const cruise = (Math.min(km, 4000) / 820 + Math.max(0, km - 4000) / 900) * 60;
  const wind = 0.0037 * km * Math.sin(bearing * RAD) * (beltShare(latA) + beltShare(latB));
  return Math.round((45 + cruise - wind) / 5) * 5;
}

// How much farther a real airliner flies than the great circle, in km: the median of 5,948
// US flights traced by ADS-B on 2025-10-01 and 2025-11-01 (projects/flight-detour), joined
// linearly between the median distance of each band and flat below the first. About three
// quarters of it is climbing out and lining up to land within 100 km of the airports, not
// en route. Nothing was measured past 4,400 km, so past it, and under 200 km, null.
export const DETOUR_KNOTS = [[357, 54], [723, 70], [1404, 85], [2551, 90], [3887, 117]];
export function flownExtra(km) {
  if (km < 200 || km > 4400) return null;
  const K = DETOUR_KNOTS;
  if (km <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) {
    if (km <= K[i][0]) {
      const [x0, y0] = K[i - 1], [x1, y1] = K[i];
      return y0 + ((y1 - y0) * (km - x0)) / (x1 - x0);
    }
  }
  return K[K.length - 1][1];
}

// Today's wind at cruising height (projects/jet-today). The route is cut into WIND_N equal
// legs; each leg's middle gets the 250 hPa wind (about 34,000 ft) from Open-Meteo, and a jet
// at WIND_TAS km/h through the air covers the leg at that speed plus the wind's share along
// the track. The answer is minutes against still air, + slower and - faster. Checked against
// BTS August 2025 (state/scratch/jet-today/validate.py): on 12 coast-to-coast and
// cross-country routes it tracked each day's median air time at r = 0.71-0.95, slope near 1,
// with nothing fitted; on the diagonal Seattle-Miami it did not (r 0.39-0.51). Under
// WIND_MIN_KM the effect is a minute or two, so null.
export const WIND_N = 10, WIND_TAS = 870, WIND_MIN_KM = 1000;
export function windLegs(a, b) {
  const pts = route(a, b, 2 * WIND_N);
  const legs = [];
  for (let i = 0; i < WIND_N; i++) {
    const [lon0, lat0] = pts[2 * i], [lon, lat] = pts[2 * i + 1], [lon1, lat1] = pts[2 * i + 2];
    legs.push({ lat, lon, track: sphere({ lat: lat0, lon: lon0 }, { lat: lat1, lon: lon1 }).bearing });
  }
  return legs;
}
export function windURL(legs) {
  const f = (k) => legs.map((p) => p[k].toFixed(2)).join(',');
  return `https://api.open-meteo.com/v1/forecast?latitude=${f('lat')}&longitude=${f('lon')}`
    + '&current=wind_speed_250hPa,wind_direction_250hPa&wind_speed_unit=kmh';
}
// winds: [{ speed km/h, from: degrees the wind blows FROM }], one per leg. back=true flies b to a.
export function windMinutes(km, legs, winds, back = false) {
  if (km < WIND_MIN_KM || winds.length !== legs.length) return null;
  let h = 0;
  for (let i = 0; i < legs.length; i++) {
    const { speed, from } = winds[i];
    if (!Number.isFinite(speed) || !Number.isFinite(from)) return null;
    const track = back ? legs[i].track + 180 : legs[i].track;
    h += km / legs.length / (WIND_TAS + speed * Math.cos((from + 180 - track) * RAD));
  }
  return (h - km / WIND_TAS) * 60;
}
// Open-Meteo answers one point as an object and several as a list.
export function windsFrom(json) {
  return (Array.isArray(json) ? json : [json]).map((r) => ({ speed: r?.current?.wind_speed_250hPa, from: r?.current?.wind_direction_250hPa }));
}
export function windWords(out, back, a, b) {
  if (out == null || back == null) return '';
  const say = (m) => (Math.abs(m) < 2.5 ? 'about as long as in still air' : `${num(Math.abs(m))}${NB}min ${m < 0 ? 'faster' : 'slower'} than in still air`);
  return `Winds at cruising height right now: ${short(a)} to ${short(b)} flies ${say(out)}, and the way back ${say(back)}.`;
}

// ---- words ---------------------------------------------------------------------------

export const num = (n) => Math.round(n).toLocaleString('en-US');
export function dist(km) {
  const mi = km / 1.609344;
  const f = (v) => (v < 10 ? v.toFixed(1) : num(v));
  return { km: `${f(km)}${NB}km`, mi: `${f(mi)}${NB}mi` };
}
// A line may break anywhere but between a number and its unit: on a 390px phone the
// flight card read "11" at the end of one line and "h 20 min" on the next (unit-wrap,
// 18 of 18 renders over 6 pairs x 3 iPhone widths split one somewhere).
export const NB = '\u00a0';
export function hm(min) {
  const m = Math.abs(Math.round(min)), h = Math.floor(m / 60), r = m % 60;
  return h && r ? `${h}${NB}h ${r}${NB}min` : h ? `${h}${NB}h` : `${r}${NB}min`;
}
export function coord({ lat, lon }) {
  const f = (v, pos, neg) => `${Math.abs(v).toFixed(1)}° ${v >= 0 ? pos : neg}`;
  return `${f(lat, 'N', 'S')}, ${f(lon, 'E', 'W')}`;
}
// How much of the way to the opposite side of the Earth (half a circumference).
export const ofHalf = (km) => Math.round((km / (Math.PI * R_KM)) * 100);

// ---- time zones ----------------------------------------------------------------------

// Minutes east of UTC in a zone at an instant, from Intl ("GMT+5:45", "GMT-07:00", "GMT").
export function offsetMin(tz, ms) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date(ms))
    .find((p) => p.type === 'timeZoneName').value;
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(part);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
}

export const short = (label) => String(label).split(',')[0];

// "Tokyo is 16 h ahead of Palo Alto", "… behind …", or the same time.
export function diffWords(a, b, ms) {
  const d = offsetMin(b.tz, ms) - offsetMin(a.tz, ms);
  if (!d) return { min: 0, text: `${short(b.label)} and ${short(a.label)} keep the same time.` };
  return { min: d, text: `${short(b.label)} is ${hm(d)} ${d > 0 ? 'ahead of' : 'behind'} ${short(a.label)}.` };
}

// The shift a body clock makes, from a clock difference in minutes: a day is a full turn,
// so 16 h ahead is 8 h behind. At exactly 12 h it goes later, the easier way (CDC).
export function bodyShift(min) {
  const s = ((min % 1440) + 1440) % 1440;
  return s >= 720 ? s - 1440 : s;
}

// Jet lag flying a -> b, at the CDC Yellow Book's average rates (2026, "Jet Lag Disorder"):
// 1 h a day after flying east, 1.5 h a day after flying west; the disorder starts at two time
// zones. The CDC gives no light-timing rule of its own, so neither does this.
export const RATE = { east: 1, west: 1.5 };
export function jetLag(a, b, ms) {
  const d = offsetMin(b.tz, ms) - offsetMin(a.tz, ms), s = bodyShift(d);
  if (!d) return { shift: 0, days: 0, back: 0, text: '' };
  if (!s) return { shift: 0, days: 0, back: 0, text: `Jet lag: none. ${hm(Math.abs(d))} on the clock is the same time of day to a body.` };
  if (Math.abs(s) < 120) return { shift: s, days: 0, back: 0, text: `Jet lag: little or none. A shift under 2${NB}h is below the CDC's two time zones for jet lag disorder.` };
  const east = s > 0;
  // Home is its own shift: at exactly 12 h both legs go later, so it is not just the reverse.
  const daysFor = (x) => Math.max(1, Math.round(Math.abs(x) / 60 / (x > 0 ? RATE.east : RATE.west)));
  const days = daysFor(s), back = daysFor(bodyShift(-d));
  const way = east ? 'earlier' : 'later';
  const wrap = s !== d ? `${hm(Math.abs(d))} ${d > 0 ? 'ahead' : 'behind'} is the same body clock as ${hm(Math.abs(s))} ${east ? 'ahead' : 'behind'}, so ` : '';
  return {
    shift: s, days, back,
    text: `Jet lag: ${wrap}your body clock has to run ${hm(Math.abs(s))} ${way}. At the CDC's average of ${east ? `1${NB}h` : `1.5${NB}h`} a day `
      + `that takes about ${days}${NB}day${days === 1 ? '' : 's'} in ${short(b.label)}, and about ${back} coming home. Moving your sleep 1${NB}h ${way} `
      + `a day for 2–3${NB}days before you fly shortens it; for a trip under 2${NB}days, the CDC suggests keeping ${short(a.label)} hours.`,
  };
}

// The clock in a zone: { time: "9:41 AM", day: "Tue" }.
export function clock(ms, tz) {
  const o = { timeZone: tz };
  return {
    time: new Date(ms).toLocaleTimeString('en-US', { ...o, hour: 'numeric', minute: '2-digit' }),
    day: new Date(ms).toLocaleDateString('en-US', { ...o, weekday: 'short' }),
  };
}

// ---- places: [name, admin1, country, lat, lon, pop, tzIndex], most populous first ------
// Copied from projects/daylight/site/sun-logic.js, which shares the data file.

export const P = { NAME: 0, A1: 1, CC: 2, LAT: 3, LON: 4, POP: 5, TZ: 6 };

// Letters NFD does not take apart: "tromso" has to find the slashed o of Tromso, "lodz" the barred l of Lodz.
const LETTERS = { 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'þ': 'th', 'ı': 'i', 'ħ': 'h' };
// Memoised on the coerced string: matchPlaces and placeByLabel fold every name in the
// places file on every call, so the live search re-folded thousands of names per keystroke.
// node --cpu-prof put fold at 59% of how-far's equivalence sweep and 27% of when-works'
// (2026-11-11). The key is the coerced string, never the argument, so a non-string cannot
// hold a reference; distinct keys are bounded by the place names plus the queries typed.
const foldCache = new Map();
export function fold(s) {
  const k = String(s);
  if (foldCache.has(k)) return foldCache.get(k);
  const v = k.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[øæœßłđðþıħ]/g, (c) => LETTERS[c]).replace(/[^a-z0-9]+/g, ' ').trim();
  foldCache.set(k, v);
  return v;
}

export function placeLabel(p) {
  const parts = [p[P.NAME]];
  if (p[P.A1] && p[P.A1] !== p[P.NAME]) parts.push(p[P.A1]);
  parts.push(p[P.CC]);
  return parts.join(', ');
}

// The part before the first comma starts the name; each later part starts the region or
// the country. Whole-name matches first, then the list's order (most populous first).
// With aliases (data/aliases.json: an airport code or another name -> row), a query that is
// exactly one ("lax", "bombay", "kiev, ukraine") also offers that town, after the towns
// really called that and before the rest.
export function matchPlaces(places, q, limit = 8, aliases = null) {
  const [head, ...rest] = String(q).split(',').map(fold);
  if (!head) return [];
  const inRest = (p) => !rest.some((r) => r && !(fold(p[P.A1]).startsWith(r) || fold(p[P.CC]).startsWith(r)));
  const exact = [], prefix = [];
  for (const p of places) {
    const n = fold(p[P.NAME]);
    if (!n.startsWith(head)) continue;
    if (!inRest(p)) continue;
    (n === head ? exact : prefix).push(p);
    if (exact.length >= limit) break;
  }
  const a = aliasRow(places, aliases, q);
  const also = a && inRest(a) && !exact.includes(a) ? [a] : [];
  return exact.concat(also, prefix.filter((p) => p !== a)).slice(0, limit);
}

// The row an alias names, or null. The file carries the length of the list it indexes, so a
// stale copy or the seed list never resolves a code to whichever town now sits at that row.
export function aliasRow(places, aliases, q) {
  if (!aliases || aliases.n !== places.length) return null;
  const i = aliases.aliases[fold(String(q).split(',')[0])];
  return Number.isInteger(i) ? places[i] : null;
}

export function placeByLabel(places, label) {
  const f = fold(label);
  return places.find((p) => fold(placeLabel(p)) === f) || null;
}

// The biggest town in a time zone: where the page starts when nothing else says.
export function biggestIn(places, zones, tz) {
  const i = zones.indexOf(tz);
  return i < 0 ? null : places.find((p) => p[P.TZ] === i) || null;
}

export const toPlace = (p, zones) => ({ label: placeLabel(p), lat: p[P.LAT], lon: p[P.LON], tz: zones[p[P.TZ]] });

// ?from=Palo Alto, California, United States&to=Tokyo, Tokyo, Japan
export function encodeState({ from, to }) {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  const s = q.toString();
  return s ? `?${s}` : '';
}
export function decodeState(search) {
  const q = new URLSearchParams(search || '');
  const clip = (v) => (v || '').slice(0, 120).trim() || null;
  return { from: clip(q.get('from')), to: clip(q.get('to')) };
}
