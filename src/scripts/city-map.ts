import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Real Cairo streets (public/data/cairo.json, built by tools/cairo-map.mjs) drawn outward from the
// centre as the section scrolls in, with a glass magnifier under the cursor.
const LENS_R = 120; // lens radius, css px
const ZOOM = 2.6;
const NILE_W = 48; // river stroke in map units (~240 m)

type Way = { cls: number; pts: Float32Array; box: [number, number, number, number] };
type Map = { center: [number, number]; w: number; h: number; ways: number[][] };

export async function initCityMap(base: HTMLCanvasElement, lens: HTMLCanvasElement) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const data: Map = await (await fetch('/data/cairo.json')).json();
  const ways: Way[] = data.ways.map(([cls, ...d]) => {
    const pts = new Float32Array(d.length);
    let x = 0, y = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < d.length; i += 2) {
      x += d[i]; y += d[i + 1];
      pts[i] = x; pts[i + 1] = y;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    const pad = cls === 2 ? NILE_W : 2;
    return { cls, pts, box: [x0 - pad, y0 - pad, x1 + pad, y1 + pad] } as Way;
  }).sort((a, b) => +(b.cls === 2) - +(a.cls === 2)); // Nile first (stays under bridges), then outward

  const css = getComputedStyle(document.documentElement);
  const fg = css.getPropertyValue('--fg').trim() || '#f2f0ea';
  const bg = css.getPropertyValue('--bg').trim() || '#0b0b0c';
  const accent = css.getPropertyValue('--accent').trim() || '#2e5eb6';
  const STYLE = [
    { color: fg, alpha: 0.2, width: 0.9 }, // minor streets
    { color: fg, alpha: 0.6, width: 2.2 }, // major roads
    { color: accent, alpha: 1, width: NILE_W }, // Nile
  ];

  const g = base.getContext('2d')!;
  const l = lens.getContext('2d')!;
  let dpr = 1, scale = 1, ox = 0, oy = 0; // map units → css px ("cover" fit)
  let drawn = 0; // ways currently on the base canvas

  // strokes ways [from, to) for one class at a time so the Nile stays under the streets
  const stroke = (ctx: CanvasRenderingContext2D, from: number, to: number, k: number, clip?: number[]) => {
    for (const cls of [2, 0, 1]) {
      const s = STYLE[cls];
      ctx.beginPath();
      for (let i = from; i < to; i++) {
        const w = ways[i];
        if (w.cls !== cls) continue;
        if (clip && (w.box[2] < clip[0] || w.box[0] > clip[2] || w.box[3] < clip[1] || w.box[1] > clip[3])) continue;
        ctx.moveTo(w.pts[0], w.pts[1]);
        for (let j = 2; j < w.pts.length; j += 2) ctx.lineTo(w.pts[j], w.pts[j + 1]);
      }
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = s.alpha;
      ctx.lineWidth = cls === 2 ? s.width : s.width / k; // streets keep a hairline weight at any zoom
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  const setMapTransform = (ctx: CanvasRenderingContext2D) => ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);

  const draw = (progress: number) => {
    const target = Math.round(ways.length * progress);
    if (target < drawn) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, base.width, base.height); drawn = 0; }
    if (target === drawn) return;
    setMapTransform(g);
    stroke(g, drawn, target, scale);
    drawn = target;
  };

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = base;
    if (!w || !h) return;
    dpr = Math.min(devicePixelRatio, 2);
    for (const c of [base, lens]) { c.width = w * dpr; c.height = h * dpr; }
    scale = Math.max(w / data.w, h / data.h);
    ox = (w - data.w * scale) / 2;
    oy = (h - data.h * scale) / 2;
    const p = drawn / ways.length;
    drawn = 0;
    draw(p);
  };
  new ResizeObserver(resize).observe(base);
  resize();

  if (reduce) draw(1);
  else {
    ScrollTrigger.create({
      trigger: base, start: 'top 85%', end: 'bottom 60%',
      onUpdate: (self) => draw(self.progress),
      onLeave: () => draw(1),
    });
  }

  // ── glass magnifier (mouse/trackpad only)
  if (!matchMedia('(pointer: fine)').matches) return;
  let raf = 0, px = 0, py = 0, on = false;
  const renderLens = () => {
    raf = 0;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.clearRect(0, 0, lens.width, lens.height);
    if (!on) return;
    const k = scale * ZOOM;
    // map-unit window under the lens, for culling
    const mx = (px - ox) / scale, my = (py - oy) / scale, r = LENS_R / k;
    l.save();
    l.scale(dpr, dpr);
    l.beginPath();
    l.arc(px, py, LENS_R, 0, Math.PI * 2);
    l.fillStyle = bg;
    l.fill();
    l.clip();
    l.setTransform(dpr * k, 0, 0, dpr * k, dpr * (px - mx * k), dpr * (py - my * k));
    stroke(l, 0, drawn, k, [mx - r, my - r, mx + r, my + r]);
    l.restore();
    // rim: bright edge + faint chromatic fringe, like the nav glass
    l.save();
    l.scale(dpr, dpr);
    const ring = (dx: number, color: string, width: number, alpha: number) => {
      l.beginPath();
      l.arc(px + dx, py, LENS_R - width / 2, 0, Math.PI * 2);
      l.strokeStyle = color; l.lineWidth = width; l.globalAlpha = alpha; l.stroke();
    };
    ring(-1.5, '#ff4d6d', 3, 0.35);
    ring(1.5, '#4dd2ff', 3, 0.35);
    ring(0, fg, 1, 0.8);
    const shine = l.createLinearGradient(px, py - LENS_R, px, py + LENS_R);
    shine.addColorStop(0, 'rgb(255 255 255 / 0.18)');
    shine.addColorStop(0.45, 'rgb(255 255 255 / 0)');
    l.globalAlpha = 1;
    l.fillStyle = shine;
    l.beginPath();
    l.arc(px, py, LENS_R - 2, 0, Math.PI * 2);
    l.fill();
    l.restore();
  };
  const queue = () => (raf ||= requestAnimationFrame(renderLens));
  const stage = base.parentElement!;
  stage.addEventListener('pointermove', (e) => {
    const r = base.getBoundingClientRect();
    px = e.clientX - r.left; py = e.clientY - r.top; on = true;
    queue();
  });
  stage.addEventListener('pointerleave', () => { on = false; queue(); });
}

// Live wall clock for a time zone, written into el every second.
export function initClock(el: HTMLElement, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const parts = [...el.querySelectorAll<HTMLElement>('[data-part]')];
  const tick = () => {
    const now = fmt.formatToParts(new Date());
    for (const p of parts) p.textContent = now.find((x) => x.type === p.dataset.part)!.value;
    el.setAttribute('datetime', now.filter((x) => x.type !== 'literal').map((x) => x.value).join(':'));
    setTimeout(tick, 1000 - (Date.now() % 1000)); // land on the second boundary
  };
  tick();
}
