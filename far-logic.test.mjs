// node site/far-logic.test.mjs — the page's pure logic against GeographicLib's answers
// (test/facts.json, made by test/facts.py), known geodesic constants, and time zones whose
// offsets are fixed by law. Exit 1 on any failure.
//   test/plant.sh   # mutates a copy of the logic; each mutant must FAIL this suite
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const L = await import(process.env.LOGIC ? pathToFileURL(process.env.LOGIC).href : './far-logic.js');
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
const near = (name, a, b, tol) => ok(name, Math.abs(a - b) <= tol, `got ${a} want ${b} ±${tol}`);
const pt = (lat, lon) => ({ lat, lon });
const bearingGap = (x, y) => Math.abs(((x - y + 540) % 360) - 180);

// --- geodesic constants (WGS84) --------------------------------------------------------
near('a quarter of the equator', L.measure(pt(0, 0), pt(0, 90)).km, 10018.754171, 0.000001);
near('equator to the pole', L.measure(pt(0, 0), pt(90, 0)).km, 10001.965729, 0.000001);
eq('the same point is 0 km', L.measure(pt(37.44, -122.14), pt(37.44, -122.14)).km, 0);
near('due east along the equator', L.measure(pt(0, 10), pt(0, 20)).bearing, 90, 1e-9);
near('due south down a meridian', L.measure(pt(40, 5), pt(-10, 5)).bearing, 180, 1e-9);
near('sphere: a quarter circumference', L.sphere(pt(0, 0), pt(0, 90)).km, (Math.PI / 2) * L.R_KM, 1e-9);

// --- every pair against GeographicLib ---------------------------------------------------
// The repo keeps facts in test/; the published copy has them in test/ beside this file.
const facts = JSON.parse(readFileSync(here(existsSync(here('../test/facts.json')) ? '../test/facts.json' : 'test/facts.json'), 'utf8'));
const shipped = existsSync(here('data/places.json')) ? JSON.parse(readFileSync(here('data/places.json'), 'utf8')) : null;
ok('shipped places exist', !!shipped);
const find = (label) => { const p = L.placeByLabel(shipped.places, label); return p && L.toPlace(p, shipped.zones); };
let fellBack = 0;
for (const f of facts.pairs) {
  const a = find(f.from), b = find(f.to);
  ok(`places: ${f.from} / ${f.to}`, a && b);
  if (!a || !b) continue;
  const m = L.measure(a, b), s = L.sphere(a, b), tag = `${L.short(f.from)}-${L.short(f.to)}`;
  if (m.exact) {
    near(`${tag}: km to the metre`, m.km, f.km, 0.001);
    ok(`${tag}: bearing to 0.0001°`, bearingGap(m.bearing, f.bearing) < 1e-4, `${m.bearing} vs ${f.bearing}`);
  } else {
    fellBack++;
    ok(`${tag}: sphere fallback within 0.5%`, Math.abs(m.km - f.km) / f.km < 0.005, `${m.km} vs ${f.km}`);
  }
  ok(`${tag}: the sphere is within 0.5%`, Math.abs(s.km - f.km) / f.km < 0.005, `${s.km} vs ${f.km}`);
  ok(`${tag}: bearing in [0, 360)`, m.bearing >= 0 && m.bearing < 360 && s.bearing >= 0 && s.bearing < 360, `${m.bearing} ${s.bearing}`);
  const mid = L.midpoint(a, b);
  near(`${tag}: halfway lat`, mid.lat, f.mid[0], 1e-4);
  ok(`${tag}: halfway lon`, bearingGap(mid.lon, f.mid[1]) < 1e-4, `${mid.lon} vs ${f.mid[1]}`);
  const r = L.route(a, b, 64);
  ok(`${tag}: the route starts and ends at the towns`, Math.abs(r[0][1] - a.lat) < 1e-9 && Math.abs(r[64][1] - b.lat) < 1e-9
    && bearingGap(r[0][0], a.lon) < 1e-9 && bearingGap(r[64][0], b.lon) < 1e-9);
}
eq('Vincenty converged for every real pair', fellBack, 0);
for (const f of facts.antipodes) {
  const m = L.measure(pt(...f.a), pt(...f.b));
  ok(`near-antipodes ${f.a}/${f.b}: says it fell back`, m.exact === false);
  ok(`near-antipodes ${f.a}/${f.b}: the sphere within 0.5%`, Math.abs(m.km - f.km) / f.km < 0.005, `${m.km} vs ${f.km}`);
}

// --- the date line ----------------------------------------------------------------------
const anc = pt(61.218, -149.9), tyo = pt(35.69, 139.69), lon = pt(51.509, -0.126), nyc = pt(40.714, -74.006);
const across = L.splitAtDateLine(L.route(anc, tyo));
eq('Anchorage to Tokyo crosses the date line once', across.length, 2);
ok('both pieces meet at the same latitude on opposite edges',
  across[0].at(-1)[0] === -180 && across[1][0][0] === 180 && across[0].at(-1)[1] === across[1][0][1], JSON.stringify([across[0].at(-1), across[1][0]]));
// Where the great circle meets 180°, in closed form: tan(lat) = (sin f1 cos f2 sin(l-l2) - sin f2 cos f1 sin(l-l1)) / (cos f1 cos f2 sin(l1-l2)).
const crossLat = (a, b, l = Math.PI) => { const R = Math.PI / 180, f1 = a.lat * R, f2 = b.lat * R, l1 = a.lon * R, l2 = b.lon * R;
  return Math.atan((Math.sin(f1) * Math.cos(f2) * Math.sin(l - l2) - Math.sin(f2) * Math.cos(f1) * Math.sin(l - l1))
    / (Math.cos(f1) * Math.cos(f2) * Math.sin(l1 - l2))) / R; };
near('the crossing is at the great circle\'s own latitude', across[0].at(-1)[1], crossLat(anc, tyo), 0.01);
eq('London to New York does not', L.splitAtDateLine(L.route(lon, nyc)).length, 1);
const eastward = L.splitAtDateLine(L.route(tyo, anc));
ok('eastward crossing closes at +180 first', eastward[0].at(-1)[0] === 180 && eastward[1][0][0] === -180);

// --- nearest ----------------------------------------------------------------------------
const tiny = [['A', '', 'X', 10, 10, 5, 0], ['B', '', 'X', 10.5, 10, 5, 0], ['C', '', 'X', -40, 0, 5, 0]];
eq('nearest picks the closest, not the first', L.nearest(tiny, pt(10.4, 10)).p[0], 'B');
near('nearest says how far', L.nearest(tiny, pt(10.5, 10)).km, 0, 1e-9);

// --- words ------------------------------------------------------------------------------
eq('compass points', [0, 11.2, 11.3, 90, 303.58, 359, -10, 180].map(L.compass),
  ['north', 'north', 'north-northeast', 'east', 'west-northwest', 'north', 'north', 'south']);
eq('flight times', [L.flightMin(150), L.flightMin(199.9), L.flightMin(200), L.flightMin(4000), L.flightMin(8330.2)],
  [null, null, 60, 340, 625]);
eq('the wind: east is quicker in the belt, either hemisphere, and not in the tropics',
  [L.flightMin(4000, 90, 40, 40), L.flightMin(4000, 270, 40, 40), L.flightMin(4000, 90, -40, -40), L.flightMin(4000, 90, 10, 10), L.flightMin(4000, 90, 10, 40)],
  [325, 350, 325, 340, 330]);
eq('no wind flying due north', L.flightMin(4000, 0, 40, 40), 340);

// --- against the timetable: every US route BTS scheduled in August 2025 -----------------
// test/flights.json is the median scheduled gate-to-gate time of each route (see its source).
const fl = JSON.parse(readFileSync(here(existsSync(here('../test/flights.json')) ? '../test/flights.json' : 'test/flights.json'), 'utf8'));
const legs = fl.routes.map(([o, d, sched]) => {
  const a = pt(...fl.airports[o]), b = pt(...fl.airports[d]), m = L.measure(a, b);
  return { o, d, km: m.km, east: Math.sin(m.bearing * Math.PI / 180), err: L.flightMin(m.km, m.bearing, a.lat, b.lat) - sched };
});
const median = (xs) => { const v = [...xs].sort((x, y) => x - y), h = v.length >> 1; return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2; };
const share = (xs, f) => xs.filter(f).length / xs.length;
ok('5,955 routes to check', legs.length === 5955, String(legs.length));
near('no bias: median error', median(legs.map((l) => l.err)), 0, 3);
near('typical miss: median |error|', median(legs.map((l) => Math.abs(l.err))), 5, 2);
ok('off by 30+ minutes on under 2% of routes', share(legs, (l) => Math.abs(l.err) >= 30) < 0.02, String(share(legs, (l) => Math.abs(l.err) >= 30)));
for (const [name, f] of [['long hauls, 4,000 km+', (l) => l.km >= 4000], ['eastbound, 2,500 km+', (l) => l.km >= 2500 && l.east > 0.7],
  ['westbound, 2,500 km+', (l) => l.km >= 2500 && l.east < -0.7], ['short hops, under 500 km', (l) => l.km < 500]]) {
  near(`no bias: ${name}`, median(legs.filter(f).map((l) => l.err)), 0, 5);
}
const leg = (o, d) => legs.find((l) => l.o === o && l.d === d);
near('SFO to New York JFK', leg('SFO', 'JFK').err, 0, 15);
near('New York JFK to SFO, the long way round the wind', leg('JFK', 'SFO').err, 0, 30);
eq('distances', [L.dist(8330.2213), L.dist(3.14), L.dist(0)], [{ km: '8,330 km', mi: '5,176 mi' }, { km: '3.1 km', mi: '2.0 mi' }, { km: '0.0 km', mi: '0.0 mi' }]);
eq('hours and minutes', [L.hm(960), L.hm(345), L.hm(30), L.hm(-420), L.hm(1440)], ['16 h', '5 h 45 min', '30 min', '7 h', '24 h']);
eq('coordinates', L.coord(pt(48.5526, -171.97517)), '48.6° N, 172.0° W');
eq('coordinates south and east', L.coord(pt(-27.1671, 59.19293)), '27.2° S, 59.2° E');
eq('share of half the world', [L.ofHalf(Math.PI * L.R_KM), L.ofHalf(8330.2), L.ofHalf(0)], [100, 42, 0]);

// --- time zones (offsets fixed by law on these dates) ------------------------------------
const oct27 = Date.UTC(2026, 9, 27, 12), nov2 = Date.UTC(2026, 10, 2, 12), jul1 = Date.UTC(2026, 6, 1, 12);
eq('offsets', ['Asia/Kathmandu', 'Europe/London', 'America/Los_Angeles', 'Pacific/Apia', 'Pacific/Pago_Pago', 'Asia/Kolkata', 'UTC']
  .map((z) => L.offsetMin(z, oct27)), [345, 0, -420, 780, -660, 330, 0]);
eq('London in July is UTC+1', L.offsetMin('Europe/London', jul1), 60);
const pa = { label: 'Palo Alto, California, United States', tz: 'America/Los_Angeles' };
const ldn = { label: 'London, England, United Kingdom', tz: 'Europe/London' };
const sf = { label: 'San Francisco, California, United States', tz: 'America/Los_Angeles' };
// Britain left summer time on 25 October 2026, the US not until 1 November: a week of 7 h.
eq('Palo Alto is 7 h behind London in the gap week', L.diffWords(ldn, pa, oct27), { min: -420, text: 'Palo Alto is 7 h behind London.' });
eq('and 8 h after it', L.diffWords(ldn, pa, nov2).text, 'Palo Alto is 8 h behind London.');
eq('ahead the other way', L.diffWords(pa, ldn, nov2).text, 'London is 8 h ahead of Palo Alto.');
eq('Nepal keeps 45 minutes', L.diffWords(find('New Delhi, Delhi, India'), find('Kathmandu, Bagmati Province, Nepal'), oct27).text,
  'Kathmandu is 15 min ahead of New Delhi.');
eq('Apia is a day ahead of Pago Pago, 125 km away', L.diffWords(find('Pago Pago, Eastern District, American Samoa'), find('Apia, Tuamasaga, Samoa'), oct27).min, 1440);
eq('same zone, same time', L.diffWords(pa, sf, oct27), { min: 0, text: 'San Francisco and Palo Alto keep the same time.' });
const apia = L.clock(oct27, 'Pacific/Apia'), pago = L.clock(oct27, 'Pacific/Pago_Pago');
eq('the same clock on different days', [apia.time === pago.time, apia.day, pago.day], [true, 'Wed', 'Tue']);
eq('a clock reading', L.clock(Date.UTC(2026, 9, 27, 16, 41), 'America/Los_Angeles'), { time: '9:41 AM', day: 'Tue' });

// --- places and the URL -----------------------------------------------------------------
eq('"tromso" finds Tromsø', L.placeLabel(L.matchPlaces(shipped.places, 'tromso')[0]), 'Tromsø, Troms, Norway');
eq('"wellington, new" finds the capital', L.placeLabel(L.matchPlaces(shipped.places, 'wellington, new')[0]), 'Wellington, Wellington Region, New Zealand');
eq('every fact label round-trips', facts.pairs.every((f) => L.placeLabel(L.placeByLabel(shipped.places, f.from)) === f.from
  && L.placeLabel(L.placeByLabel(shipped.places, f.to)) === f.to), true);
eq('biggest town in a zone', L.placeLabel(L.biggestIn(shipped.places, shipped.zones, 'Europe/London')), 'London, England, United Kingdom');
const url = L.encodeState({ from: pa.label, to: 'Tokyo, Japan' });
eq('the URL round-trips', L.decodeState(url), { from: pa.label, to: 'Tokyo, Japan' });
eq('an empty URL', [L.encodeState({}), L.decodeState('')], ['', { from: null, to: null }]);
eq('a long value is clipped', L.decodeState(`?from=${'x'.repeat(300)}`).from.length, 120);
ok('31,000+ places, all with a zone', shipped.places.length > 31000 && shipped.places.every((p) => shipped.zones[p[L.P.TZ]]));
const land = existsSync(here('data/land.json')) ? JSON.parse(readFileSync(here('data/land.json'), 'utf8')).land : '';
ok('the land outline is a path', /^M-?\d/.test(land) && land.length > 20000, String(land.length));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
