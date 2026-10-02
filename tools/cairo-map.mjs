// Builds public/data/cairo.json: real downtown Cairo streets + the Nile from OpenStreetMap (Overpass).
// Run once (needs network): node tools/cairo-map.mjs. Data © OpenStreetMap contributors (ODbL).
import { writeFileSync, mkdirSync } from 'node:fs';

const CENTER = [30.0444, 31.2357]; // Tahrir Square
const SPAN = [0.027, 0.062]; // lat, lon extent (~3 × 6 km, poster-wide)
const W = 1200; // output units across; height follows the true aspect
const TOL = 0.7; // simplification tolerance in output units

const [s, n] = [CENTER[0] - SPAN[0] / 2, CENTER[0] + SPAN[0] / 2];
const [w, e] = [CENTER[1] - SPAN[1] / 2, CENTER[1] + SPAN[1] / 2];
const bbox = `${s},${w},${n},${e}`;
const query = `[out:json][timeout:90];(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|pedestrian)$"](${bbox});
  way["waterway"="river"](${s - 0.05},${w - 0.05},${n + 0.05},${e + 0.05});
);out geom;`;

// public Overpass servers are often busy: try each mirror in turn
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
let elements;
for (const url of MIRRORS) {
  const res = await fetch(url, { method: 'POST', headers: { 'User-Agent': 'portfolio-map-build' }, body: new URLSearchParams({ data: query }) }).catch(() => null);
  if (res?.ok) { ({ elements } = await res.json()); break; }
  console.warn(`${url} → ${res?.status ?? 'network error'}`);
}
if (!elements) throw new Error('All Overpass mirrors failed; retry later');

const kx = W / (e - w);
const ky = kx / Math.cos((CENTER[0] * Math.PI) / 180); // equirectangular, true local aspect
const H = Math.round((n - s) * ky);
const project = ({ lat, lon }) => [(lon - w) * kx, (n - lat) * ky];
const MAJOR = /^(motorway|trunk|primary|secondary)$/;

// Douglas–Peucker
function simplify(pts) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts.at(-1)];
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], a, b);
    if (d > max) { max = d; idx = i; }
  }
  return max > TOL ? [...simplify(pts.slice(0, idx + 1)).slice(0, -1), ...simplify(pts.slice(idx))] : [a, b];
}
function segDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

const cx = W / 2, cy = H / 2;
const ways = elements
  .map((el) => {
    const pts = simplify(el.geometry.map(project));
    const cls = el.tags.waterway ? 2 : MAJOR.test(el.tags.highway) ? 1 : 0;
    const mid = pts[pts.length >> 1];
    return { cls, pts, d: Math.hypot(mid[0] - cx, mid[1] - cy) };
  })
  .sort((a, b) => a.d - b.d) // drawn outward from the centre
  .map(({ cls, pts }) => {
    // [class, x0, y0, dx1, dy1, ...] — integer deltas keep the file small
    const out = [cls];
    let px = 0, py = 0;
    for (const [x, y] of pts) {
      const qx = Math.round(x), qy = Math.round(y);
      out.push(qx - px, qy - py);
      px = qx; py = qy;
    }
    return out;
  });

mkdirSync('public/data', { recursive: true });
const json = JSON.stringify({ center: CENTER, w: W, h: H, ways });
writeFileSync('public/data/cairo.json', json);
console.log(`${ways.length} ways, ${(json.length / 1024).toFixed(0)} KB, ${W}×${H}`);
