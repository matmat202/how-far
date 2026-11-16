/* The scrolling story: each <section class="step"> names a layout in data-step; as the
 * reader scrolls into a step, the marks move to their place in that layout. Numbers in
 * the prose are not typed in: a <b data-fact="..."> is computed here from story.json's
 * pairs, and test/story.test.mjs checks each against the `check` block build_story.py
 * computed in python. Modelled on daylight/site/story. */
import { layout, stats, bands, STEPS, KM_MAX, BAND } from './layout.js';

const fmt = (n) => n.toLocaleString('en-US');
const pct = (v) => `${Math.round(v * 100)}%`;

/* "off45:all" -> "17%". Unknown names throw: a typo must not render as blank */
export function fact(D, spec) {
  const [f, k = 'all'] = spec.split(':');
  const S = stats(D, k);
  switch (f) {
    case 'n_towns': return fmt(D.n_towns);
    case 'n_pairs': return fmt(D.pairs.length);
    case 'billion': return `${(D.people / 1e9).toFixed(1)} billion`;
    case 'median_km': return `${fmt(Math.round(S.median_km / 10) * 10)} km`;
    case 'dom': case 'over10k': case 'off45': case 'off90': case 'merc45': case 'flip':
    case 'over10k_off45': case 'over12k_off45': case 'over15k_flip': return pct(S[f]);
    case 'under6k_n': return fmt(S.under6k_n);
    case 'under3k_median_off': return `${Math.round(S.under3k_median_off)}°`;
    default: throw new Error(`unknown fact ${spec}`);
  }
}

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

async function main() {
  const D = await (await fetch('story.json')).json();
  for (const e of document.querySelectorAll('[data-fact]')) e.textContent = fact(D, e.dataset.fact);
  const steps = [...document.querySelectorAll('.step')];
  for (const s of steps) if (!STEPS[s.dataset.step]) throw new Error(`unknown step ${s.dataset.step}`);
  const plot = document.getElementById('plot');
  const svg = el('svg', { id: 'chart' });
  const gAxis = el('g', { class: 'axis' }), gS = el('g'), gR = el('g');
  svg.append(gAxis, gS, gR);
  plot.append(svg);
  const dot = gR.appendChild(el('circle', { r: 0 }));
  dot.append(el('title')); dot.firstChild.textContent = 'the middle pair';
  const tick = (x, y, text, cls = 'tick') => { const t = el('text', { x, y, class: cls }); t.textContent = text; gAxis.append(t); };
  const grid = (x1, y1, x2, y2, cls = 'grid') => gAxis.append(el('line', { x1, x2, y1, y2, class: cls }));

  let shown = -1;
  const draw = (i) => {
    const name = steps[i].dataset.step;
    const box = plot.getBoundingClientRect(), W = box.width, H = box.height;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const L = layout(name, D, W, H);
    gS.replaceChildren();
    for (const b of L.bars) {
      const e = gS.appendChild(el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, class: name === 'dist' || b.cls === 'hit' ? b.cls : `${b.cls} whole` }));
      e.append(el('title'));
      e.firstChild.textContent = b.cls === 'hit' ? `${fmt(b.n)} of ${fmt(b.of)} pairs` : `${fmt(b.n)} pairs`;
    }
    const d = L.real[0];
    dot.style.transform = `translate(${d.x}px, ${d.y}px)`;
    dot.setAttribute('r', d.r); dot.style.fill = d.fill; dot.style.opacity = d.op;
    gAxis.replaceChildren();
    const narrow = W < 420;
    for (let km = 0; km <= KM_MAX; km += 2000) {
      grid(L.X(km), L.base - L.room, L.X(km), L.base);
      if (!narrow || km % 4000 === 0) tick(L.X(km), H + 16, km ? `${km / 1000}k` : '0', 'tick mid');
    }
    tick(W / 2, H + 32, `how far apart the two are, km (bands of ${fmt(BAND)})`, 'tick mid');
    if (name !== 'dist') {
      for (const v of [0.5, 1]) { grid(L.X(0), L.Y(v), L.X(KM_MAX), L.Y(v), v === 0.5 ? 'grid half' : 'grid'); tick(L.X(0) - 4, L.Y(v) + 4, pct(v), 'tick end'); }
      const cap = name === 'off'
        ? (narrow ? 'map’s line off by over 45°' : 'share of pairs where the map’s line is off by more than 45°')
        : (narrow ? 'map and route on opposite sides' : 'share where the map says north and the route starts south, or the other way');
      tick(L.X(0), L.base - L.room - 8, cap, 'tick cat');
    } else tick(L.X(0), L.base - L.room - 8, `pairs of people, middle ${fact(D, 'median_km')}`, 'tick cat');
    document.body.dataset.step = i;
    window.__story = { step: i, name, shown: L.bars.length + (d.op > 0 ? 1 : 0) };
  };

  const pick = () => {
    const line = innerHeight * 0.5;
    let i = 0;
    for (let k = 0; k < steps.length; k++) if (steps[k].getBoundingClientRect().top < line) i = k;
    if (i !== shown) { shown = i; draw(i); }
  };
  addEventListener('scroll', pick, { passive: true });
  addEventListener('resize', () => { shown = -1; pick(); });
  pick();
}

if (typeof document !== 'undefined') main().catch((e) => {
  document.body.classList.add('failed');
  document.getElementById('err').textContent = String(e.message || e);
  console.error(e);
});
