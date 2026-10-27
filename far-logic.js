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

// ---- words ---------------------------------------------------------------------------

export const num = (n) => Math.round(n).toLocaleString('en-US');
export function dist(km) {
  const mi = km / 1.609344;
  const f = (v) => (v < 10 ? v.toFixed(1) : num(v));
  return { km: `${f(km)} km`, mi: `${f(mi)} mi` };
}
export function hm(min) {
  const m = Math.abs(Math.round(min)), h = Math.floor(m / 60), r = m % 60;
  return h && r ? `${h} h ${r} min` : h ? `${h} h` : `${r} min`;
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
export function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[øæœßłđðþıħ]/g, (c) => LETTERS[c]).replace(/[^a-z0-9]+/g, ' ').trim();
}

export function placeLabel(p) {
  const parts = [p[P.NAME]];
  if (p[P.A1] && p[P.A1] !== p[P.NAME]) parts.push(p[P.A1]);
  parts.push(p[P.CC]);
  return parts.join(', ');
}

// The part before the first comma starts the name; each later part starts the region or
// the country. Whole-name matches first, then the list's order (most populous first).
export function matchPlaces(places, q, limit = 8) {
  const [head, ...rest] = String(q).split(',').map(fold);
  if (!head) return [];
  const exact = [], prefix = [];
  for (const p of places) {
    const n = fold(p[P.NAME]);
    if (!n.startsWith(head)) continue;
    if (rest.some((r) => r && !(fold(p[P.A1]).startsWith(r) || fold(p[P.CC]).startsWith(r)))) continue;
    (n === head ? exact : prefix).push(p);
    if (exact.length >= limit) break;
  }
  return exact.concat(prefix).slice(0, limit);
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
