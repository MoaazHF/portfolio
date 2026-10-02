// ID badge on a lanyard (idea: ReactBits "Lanyard"), as a 2D verlet rope + pendulum card on a canvas.
// Mouse: drag and throw. Touch: tap to swing (dragging would fight page scroll).
const SEGMENTS = 14;
const GRAVITY = 2200; // px/s²
const DAMPING = 0.985;
const ITERATIONS = 14;
const CARD_MASS = 5; // vs 1 per rope point: the card swings the strap, not the reverse

// photo window on the card, as fractions of card width/height (+ fixed top offset in px)
const PAD = 0.08, PHOTO_H = 0.56, PHOTO_TOP = 14, CARD_DROP = 6;

// photo size inside the window: cover, slightly zoomed, bottom-aligned (shared with the portrait flight)
export const photoFit = (ww: number, wh: number, iw: number, ih: number) => {
  const s = Math.max(ww / iw, wh / ih) * 1.05;
  return [iw * s, ih * s];
};

export type PhotoFrame = { cx: number; cy: number; w: number; h: number; angle: number };
export type LanyardApi = { photoFrame: () => PhotoFrame | null; showPhoto: (on: boolean) => void };

type Badge = { name: string; role: string; location: string; portrait: string };
type P = { x: number; y: number; px: number; py: number; m: number };

export async function initLanyard(canvas: HTMLCanvasElement, badge: Badge): Promise<LanyardApi> {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim() || '#2e5eb6';
  const fg = css.getPropertyValue('--fg').trim() || '#f2f0ea';
  const bg = css.getPropertyValue('--bg').trim() || '#0b0b0c';
  const g = canvas.getContext('2d')!;
  // reuse the hero's decoded portrait when it's the same file (no second download/decode)
  const hero = document.querySelector<HTMLImageElement>('.hero__portrait');
  const photo = hero?.complete && hero.naturalWidth && hero.currentSrc.endsWith(badge.portrait) ? hero : await loadImage(badge.portrait).catch(() => null);
  await document.fonts.load('400 40px Anton');

  let W = 0, H = 0, dpr = 1, cw = 0, ch = 0, seg = 0;
  let card: HTMLCanvasElement, cardEmpty: HTMLCanvasElement;
  let photoOn = true; // off while the hero portrait is flying in
  let pts: P[] = [];

  const build = () => {
    W = canvas.clientWidth; H = canvas.clientHeight;
    if (!W || !H) return false;
    dpr = Math.min(devicePixelRatio, 2);
    canvas.width = W * dpr; canvas.height = H * dpr;
    cw = Math.min(240, W * 0.62); ch = cw * 1.45;
    seg = Math.max(H - ch - 40, 80) * 0.55 / SEGMENTS;
    card = renderCard(cw, ch, dpr, badge, photo, { accent, fg, bg });
    cardEmpty = renderCard(cw, ch, dpr, badge, null, { accent, fg, bg });
    // start swung out to the side, so it drops into place on first view
    pts = Array.from({ length: SEGMENTS + 2 }, (_, i) => {
      const x = W / 2 + Math.min(i, SEGMENTS) * seg * 0.9, y = Math.min(i, SEGMENTS) * seg * 0.4 + (i > SEGMENTS ? ch / 2 : 0);
      return { x, y, px: x, py: y, m: i > SEGMENTS ? CARD_MASS : 1 };
    });
    return true;
  };

  // last point = card centre, kept ch/2 below the rope end (the clip)
  const step = (dt: number) => {
    const anchor = pts[0];
    anchor.x = anchor.px = W / 2; anchor.y = anchor.py = 0;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p === held) continue;
      const vx = (p.x - p.px) * DAMPING, vy = (p.y - p.py) * DAMPING;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + GRAVITY * dt * dt;
    }
    for (let k = 0; k < ITERATIONS; k++) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const len = i === pts.length - 2 ? ch / 2 : seg;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        const diff = (d - len) / d;
        // pinned / held points don't move; otherwise split by inverse mass
        const wa = i === 0 || a === held ? 0 : 1 / a.m, wb = b === held ? 0 : 1 / b.m;
        if (!wa && !wb) continue;
        const s = diff / (wa + wb);
        a.x += dx * s * wa; a.y += dy * s * wa;
        b.x -= dx * s * wb; b.y -= dy * s * wb;
      }
    }
  };

  const draw = () => {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const clip = pts[SEGMENTS], c = pts[SEGMENTS + 1];
    // strap: accent ribbon with a lighter centre stitch
    g.lineJoin = g.lineCap = 'round';
    g.beginPath();
    pts.slice(0, SEGMENTS + 1).forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.strokeStyle = accent; g.lineWidth = 14; g.stroke();
    g.strokeStyle = 'rgb(255 255 255 / 0.25)'; g.lineWidth = 1.5; g.setLineDash([6, 6]); g.stroke(); g.setLineDash([]);
    // card, hanging from the clip
    const angle = Math.atan2(c.y - clip.y, c.x - clip.x) - Math.PI / 2;
    g.save();
    g.translate(clip.x, clip.y);
    g.rotate(angle);
    g.fillStyle = '#9a9a9e'; // metal clip
    g.fillRect(-10, -6, 20, 16);
    g.shadowColor = 'rgb(0 0 0 / 0.5)'; g.shadowBlur = 30; g.shadowOffsetY = 16;
    g.drawImage(photoOn ? card : cardEmpty, -cw / 2, CARD_DROP, cw, ch);
    g.restore();
  };

  // ── interaction
  let held: P | null = null;
  const local = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const onCard = (x: number, y: number) => {
    const clip = pts[SEGMENTS], c = pts[SEGMENTS + 1];
    const a = -(Math.atan2(c.y - clip.y, c.x - clip.x) - Math.PI / 2);
    const dx = x - clip.x, dy = y - clip.y;
    const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    return Math.abs(lx) < cw / 2 && ly > 0 && ly < ch + 6;
  };
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    if (held) { held.x = x; held.y = y; wake(); }
    else canvas.style.cursor = e.pointerType === 'mouse' && onCard(x, y) ? 'grab' : '';
  });
  canvas.addEventListener('pointerdown', (e) => {
    const [x, y] = local(e);
    if (!onCard(x, y)) return;
    const c = pts[SEGMENTS + 1];
    if (e.pointerType === 'mouse') {
      held = c; c.x = c.px = x; c.y = c.py = y;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    } else {
      c.px -= (Math.random() < 0.5 ? -1 : 1) * 18; // tap: flick sideways
    }
    wake();
  });
  const release = () => { if (held) { held = null; canvas.style.cursor = ''; } };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // ── loop: sleeps once the badge is at rest and offscreen work is skipped
  let running = false, visible = false, last = 0;
  const frame = (t: number) => {
    const dt = Math.min((t - last) / 1000, 1 / 30);
    last = t;
    for (let i = 0; i < 2; i++) step(dt / 2);
    draw();
    const c = pts[SEGMENTS + 1];
    const moving = held || Math.hypot(c.x - c.px, c.y - c.py) > 0.05;
    if (visible && moving) requestAnimationFrame(frame);
    else running = false;
  };
  const wake = () => {
    if (running || reduce) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  };

  // where the photo window is right now, in viewport px (for the hero → badge portrait flight)
  const photoFrame = (): PhotoFrame | null => {
    if (!pts.length) return null;
    const clip = pts[SEGMENTS], c = pts[SEGMENTS + 1];
    const angle = Math.atan2(c.y - clip.y, c.x - clip.x) - Math.PI / 2;
    const pad = cw * PAD, h = ch * PHOTO_H;
    const ly = CARD_DROP + pad + PHOTO_TOP + h / 2; // window centre below the clip, card-local
    const r = canvas.getBoundingClientRect();
    return { cx: r.left + clip.x - Math.sin(angle) * ly, cy: r.top + clip.y + Math.cos(angle) * ly, w: cw - pad * 2, h, angle };
  };
  const showPhoto = (on: boolean) => { if (on !== photoOn) { photoOn = on; if (pts.length) draw(); } };

  const settle = () => { for (let i = 0; i < 600; i++) step(1 / 120); draw(); };
  new ResizeObserver(() => { if (build()) (reduce ? settle() : (draw(), wake())); }).observe(canvas);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); }).observe(canvas);
  return { photoFrame, showPhoto };
}

// The badge face, rendered once at full resolution and reused every frame.
function renderCard(w: number, h: number, dpr: number, b: Badge, photo: HTMLImageElement | null, c: { accent: string; fg: string; bg: string }) {
  const cv = document.createElement('canvas');
  cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext('2d')!;
  g.scale(dpr, dpr);
  const r = 14, pad = w * PAD;
  g.beginPath(); g.roundRect(0, 0, w, h, r); g.fillStyle = c.fg; g.fill();
  g.save(); g.clip();
  // photo window on the accent
  const ph = h * PHOTO_H;
  g.fillStyle = c.accent;
  g.fillRect(pad, pad + PHOTO_TOP, w - pad * 2, ph);
  if (photo) {
    const [iw, ih] = photoFit(w - pad * 2, ph, photo.naturalWidth || photo.width, photo.naturalHeight || photo.height);
    g.save();
    g.beginPath(); g.rect(pad, pad + PHOTO_TOP, w - pad * 2, ph); g.clip();
    g.drawImage(photo, w / 2 - iw / 2, pad + PHOTO_TOP + ph - ih, iw, ih);
    g.restore();
  }
  // slot for the clip
  g.fillStyle = c.bg;
  g.beginPath(); g.roundRect(w / 2 - 18, 6, 36, 7, 4); g.fill();
  // name + role
  g.fillStyle = c.bg;
  g.font = `400 ${w * 0.15}px Anton, Impact, sans-serif`;
  g.textBaseline = 'top';
  g.fillText(b.name.toUpperCase(), pad, pad + PHOTO_TOP + ph + w * 0.05, w - pad * 2);
  g.font = `500 ${w * 0.055}px Inter, system-ui, sans-serif`;
  g.globalAlpha = 0.7;
  g.fillText(`${b.role} · ${b.location}`, pad, pad + PHOTO_TOP + ph + w * 0.23, w - pad * 2);
  g.globalAlpha = 1;
  // barcode: deterministic bars from the name
  let x = pad, i = 0;
  const by = h - pad - h * 0.07;
  while (x < w - pad) {
    const bw = 1 + (b.name.charCodeAt(i % b.name.length) * (i + 7)) % 4;
    if (i % 2 === 0) g.fillRect(x, by, bw, h * 0.07);
    x += bw + 1; i++;
  }
  g.restore();
  return cv;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}
