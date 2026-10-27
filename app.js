// How Far? — the page. Logic lives in far-logic.js; this file only reads and draws.
import * as L from './far-logic.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
let PLACES = [], ZONES = [], LAND = '';
const state = { from: null, to: null };

function sync() {
  history.replaceState(null, '', location.pathname + L.encodeState({ from: state.from.label, to: state.to.label }));
}

function zoneName(tz, ms) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(ms))
    .find((p) => p.type === 'timeZoneName');
  return `${tz.replace(/_/g, ' ')}${part ? ` (${part.value})` : ''}`;
}

function clocks() {
  const now = Date.now(), { from, to } = state;
  for (const [id, p] of [['from', from], ['to', to]]) {
    const c = L.clock(now, p.tz);
    $(`${id}Clock`).textContent = `${c.day} ${c.time}`;
    $(`${id}Zone`).textContent = `in ${L.short(p.label)} · ${zoneName(p.tz, now)}`;
  }
  const d = L.diffWords(from, to, now);
  const day = L.clock(now, from.tz).day !== L.clock(now, to.tz).day ? ' It is a different day there right now.' : '';
  $('diff').textContent = d.text + day;
}

function drawMap(a, b) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-180 -90 360 180');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `World map: the shortest route from ${a.label} to ${b.label}`);
  const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.append(e); return e; };
  el('rect', { class: 'sea', x: -180, y: -90, width: 360, height: 180 });
  let g = '';
  for (let x = -150; x < 180; x += 30) g += `M${x} -90V90`;
  for (let y = -60; y <= 60; y += 30) g += `M-180 ${y}H180`;
  el('path', { class: 'grat', d: g });
  el('path', { class: 'land', d: LAND });
  const path = (parts) => parts.map((pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${(-y).toFixed(2)}`).join('')).join('');
  el('path', { class: 'straight', d: path(L.splitAtDateLine([[a.lon, a.lat], [b.lon, b.lat]])) });
  el('path', { class: 'route', d: path(L.splitAtDateLine(L.route(a, b))) });
  const m = L.midpoint(a, b);
  el('circle', { class: 'mid', cx: m.lon, cy: -m.lat, r: 2.2 });
  for (const p of [a, b]) el('circle', { class: 'end', cx: p.lon, cy: -p.lat, r: 2.6 });
  $('map').replaceChildren(svg);
  return m;
}

function draw() {
  const a = state.from, b = state.to;
  sync();
  clocks();
  const m = L.measure(a, b);
  if (a.label === b.label) {
    $('km').textContent = '0 km';
    $('mi').textContent = 'That is the same town twice. Pick a second one.';
    for (const id of ['heading', 'fly', 'half']) $(id).textContent = '–';
    $('flySub').textContent = 'a scheduled flight';
    $('headingSub').textContent = 'to set off in';
    drawMap(a, b);
    $('midNote').textContent = '';
    $('diff').textContent = '';
    return;
  }
  const d = L.dist(m.km);
  $('km').textContent = d.km;
  $('mi').textContent = `${d.mi}${m.exact ? '' : ' · nearly opposite sides of the Earth, so measured on a sphere (within 0.5%)'}`;
  $('heading').textContent = L.compass(m.bearing);
  $('headingSub').textContent = `${Math.round(m.bearing) % 360}° as you leave ${L.short(a.label)}`;
  const f = L.flightMin(m.km, m.bearing, a.lat, b.lat), back = L.flightMin(m.km, L.measure(b, a).bearing, b.lat, a.lat);
  $('fly').textContent = f == null ? 'too close' : `${L.hm(f)}`;
  $('flySub').textContent = f == null ? 'to fly' : back - f >= 15 ? `scheduled, nonstop · ${L.hm(back)} coming back, against the wind`
    : f - back >= 15 ? `scheduled, nonstop, into the wind · ${L.hm(back)} coming back` : 'scheduled, nonstop';
  $('half').textContent = `${L.ofHalf(m.km)}%`;
  const mid = drawMap(a, b);
  const n = L.nearest(PLACES, mid);
  const where = L.placeLabel(n.p);
  $('midNote').textContent = `Halfway is at ${L.coord(mid)}. ${n.km < 25 ? `That is in or next to ${where}.`
    : `The nearest town is ${where}, ${L.dist(n.km).km} away.`}`;
}

// ---- the two town boxes (as in projects/daylight) ----------------------------------------

function combo(boxId, listId, onPick) {
  const box = $(boxId), ul = $(listId);
  let opts = [], active = -1;
  const close = () => { opts = []; active = -1; ul.hidden = true; box.setAttribute('aria-expanded', 'false'); box.removeAttribute('aria-activedescendant'); };
  const drawOpts = () => {
    ul.replaceChildren();
    opts.forEach((p, i) => {
      const li = document.createElement('li');
      li.id = `${listId}${i}`; li.setAttribute('role', 'option'); li.dataset.i = i;
      li.setAttribute('aria-selected', String(i === active));
      li.textContent = L.placeLabel(p);
      ul.append(li);
    });
    if (!opts.length) { const li = document.createElement('li'); li.className = 'none'; li.textContent = 'No town by that name. Try a bigger place nearby.'; ul.append(li); }
    ul.hidden = false;
    box.setAttribute('aria-expanded', 'true');
    if (active >= 0) { box.setAttribute('aria-activedescendant', `${listId}${active}`); $(`${listId}${active}`).scrollIntoView({ block: 'nearest' }); }
  };
  const pick = (p) => { close(); onPick(L.toPlace(p, ZONES)); };
  box.addEventListener('input', () => {
    if (!box.value.trim()) { close(); return; }
    opts = L.matchPlaces(PLACES, box.value); active = opts.length ? 0 : -1; drawOpts();
  });
  box.addEventListener('keydown', (e) => {
    if (ul.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!opts.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : opts.length - 1)) % opts.length; drawOpts(); e.preventDefault();
    } else if (e.key === 'Enter') { if (opts[active]) pick(opts[active]); e.preventDefault(); }
    else if (e.key === 'Escape') { close(); e.preventDefault(); }
  });
  ul.addEventListener('mousedown', (e) => e.preventDefault());
  ul.addEventListener('click', (e) => { const i = e.target.closest('li[data-i]')?.dataset.i; if (i != null && opts[i]) pick(opts[i]); });
  box.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== box) { close(); box.value = state[boxId].label; } }, 150));
}

function wire() {
  combo('from', 'fromList', (p) => { state.from = p; $('from').value = p.label; draw(); });
  combo('to', 'toList', (p) => { state.to = p; $('to').value = p.label; draw(); });
  $('swap').addEventListener('click', () => {
    [state.from, state.to] = [state.to, state.from];
    $('from').value = state.from.label; $('to').value = state.to.label;
    draw();
  });
  setInterval(clocks, 20000);
}

async function main() {
  let doc, land;
  try {
    const [r1, r2] = await Promise.all([fetch('data/places.json'), fetch('data/land.json')]);
    if (!r1.ok || !r2.ok) throw new Error(r1.ok ? r2.status : r1.status);
    [doc, land] = await Promise.all([r1.json(), r2.json()]);
  } catch (e) { $('mi').textContent = `Could not load the list of towns (${e.message}). Reload to try again.`; return; }
  PLACES = doc.places; ZONES = doc.zones; LAND = land.land;
  const want = L.decodeState(location.search);
  const find = (label) => { const p = label && L.placeByLabel(PLACES, label); return p ? L.toPlace(p, ZONES) : null; };
  let mine = null;
  try { mine = L.biggestIn(PLACES, ZONES, Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { /* no zone */ }
  const london = find('London, England, United Kingdom');
  state.from = find(want.from) || (mine && L.toPlace(mine, ZONES)) || london;
  state.to = find(want.to) || (state.from.label === london.label ? find('New York City, New York, United States') : london);
  $('from').value = state.from.label;
  $('to').value = state.to.label;
  wire();
  draw();
}
main();
