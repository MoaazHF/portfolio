import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// WebGL contexts are expensive to create (the biggest load cost here): make them only on approach.
// (Tried pre-creating in idle time after load: more long tasks, no scroll gain — reverted.)
export const whenNear = (el: Element, fn: () => void, margin = '50%') =>
  new IntersectionObserver(([e], io) => { if (e.isIntersecting) { io.disconnect(); fn(); } }, { rootMargin: `${margin} 0px` }).observe(el);

// ── Rive: any <canvas data-rive="/rive/x.riv"> plays automatically
const riveCanvases = document.querySelectorAll<HTMLCanvasElement>('canvas[data-rive]');
if (riveCanvases.length) {
  import('@rive-app/canvas').then(({ Rive }) =>
    riveCanvases.forEach((canvas) => new Rive({ src: canvas.dataset.rive!, canvas, autoplay: true })),
  );
}

// ── Liquid metal: any [data-metal] element with a <canvas> child renders its text as metal
document.querySelectorAll<HTMLElement>('[data-metal]').forEach((el) =>
  whenNear(el, () => import('./liquid-metal').then((m) => m.initLiquidMetal(el.querySelector('canvas')!, el))),
);

// ── Smooth scroll
if (!reduce) {
  const lenis = new Lenis({ syncTouch: true }); // smooth touch scrolling too (default leaves it native)
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) =>
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href')!;
      if (id.length < 2) return;
      e.preventDefault();
      lenis.scrollTo(id);
    }),
  );
}

// ── Word splitting (DOM nodes, not innerHTML, so content is never parsed as markup)
document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
  const words = el.textContent!.trim().split(/\s+/);
  el.textContent = '';
  words.forEach((word, i) => {
    const outer = document.createElement('span');
    const inner = document.createElement('span');
    outer.className = 'w';
    inner.textContent = word;
    outer.append(inner);
    el.append(outer, i < words.length - 1 ? ' ' : '');
  });
});

// ── Custom cursor (mouse/trackpad only)
if (matchMedia('(pointer: fine)').matches && !reduce) {
  const dot = document.createElement('div');
  dot.className = 'cursor';
  document.body.append(dot);
  const xTo = gsap.quickTo(dot, 'x', { duration: 0.35, ease: 'power3' });
  const yTo = gsap.quickTo(dot, 'y', { duration: 0.35, ease: 'power3' });
  addEventListener('pointermove', (e) => { xTo(e.clientX); yTo(e.clientY); }, { passive: true });
  document.addEventListener('pointerover', (e) =>
    dot.classList.toggle('is-link', !!(e.target as Element).closest('a, button')),
  );

  // magnetic buttons: pulled a fraction of the way toward the cursor
  document.querySelectorAll<HTMLElement>('.btn, .round').forEach((el) => {
    const x = gsap.quickTo(el, 'x', { duration: 0.4, ease: 'power3' });
    const y = gsap.quickTo(el, 'y', { duration: 0.4, ease: 'power3' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      x((e.clientX - r.left - r.width / 2) * 0.3);
      y((e.clientY - r.top - r.height / 2) * 0.3);
    });
    el.addEventListener('pointerleave', () => { x(0); y(0); });
  });

  // click sparks: short accent burst at the click point
  const sparks = document.createElement('canvas');
  sparks.className = 'sparks';
  document.body.append(sparks);
  const g = sparks.getContext('2d')!;
  const color = getComputedStyle(document.documentElement).getPropertyValue('--accent-text');
  let bursts: { x: number; y: number; t: number }[] = [];
  const draw = (now: number) => {
    g.clearRect(0, 0, sparks.width, sparks.height);
    bursts = bursts.filter((b) => now - b.t < 420);
    bursts.forEach((b) => {
      const p = (now - b.t) / 420, ease = 1 - (1 - p) ** 3;
      g.strokeStyle = color;
      g.globalAlpha = 1 - p;
      g.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, d = 8 + ease * 26, len = 10 * (1 - p);
        g.beginPath();
        g.moveTo(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d);
        g.lineTo(b.x + Math.cos(a) * (d + len), b.y + Math.sin(a) * (d + len));
        g.stroke();
      }
    });
    if (bursts.length) requestAnimationFrame(draw);
  };
  addEventListener('pointerdown', (e) => {
    if (sparks.width !== innerWidth || sparks.height !== innerHeight) {
      sparks.width = innerWidth;
      sparks.height = innerHeight;
    }
    if (!bursts.length) requestAnimationFrame(draw);
    bursts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
  });
}

// ── Loader → then scroll animations
const loader = document.querySelector<HTMLElement>('[data-loader]');
const pageLoaded = new Promise((r) => (document.readyState === 'complete' ? r(0) : addEventListener('load', r, { once: true })));

if (!loader || reduce) {
  loader?.remove();
  initScrollAnimations();
} else {
  const count = loader.querySelector('[data-loader-count]')!;
  const n = { v: 0 };
  const counter = gsap.to(n, { v: 100, duration: 1.4, ease: 'power2.inOut', onUpdate: () => { count.textContent = String(Math.round(n.v)); } });
  Promise.all([counter, pageLoaded]).then(() => {
    gsap.to(loader, { yPercent: -100, duration: 0.9, ease: 'expo.inOut', onComplete: () => loader.remove() });
    initScrollAnimations(0.5);
  });
}

function initScrollAnimations(delay = 0) {
  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    gsap.utils.toArray<HTMLElement>('[data-split]').forEach((el) =>
      gsap.from(el.querySelectorAll('.w > span'), {
        yPercent: 110, duration: 1.1, stagger: 0.04, ease: 'expo.out', delay,
        scrollTrigger: { trigger: el, start: 'top 88%' },
      }),
    );
    gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) =>
      gsap.from(el, {
        y: 60, opacity: 0, duration: 1, ease: 'power3.out', delay,
        scrollTrigger: { trigger: el, start: 'top 88%' },
      }),
    );
    gsap.to('[data-parallax]', {
      yPercent: -25, opacity: 0.2, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });
  });

  // pinned horizontal gallery; native swipe-scroll only with reduced motion
  const track = document.querySelector<HTMLElement>('[data-hscroll]');
  if (track) {
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const distance = () => track.scrollWidth - innerWidth;
      gsap.to(track, {
        x: () => -distance(), ease: 'none',
        scrollTrigger: { trigger: track.parentElement, pin: true, scrub: 1, end: () => `+=${distance()}`, invalidateOnRefresh: true },
      });
    });
  }

  // project vortex: pinned while the camera flies through the cards (created after the gallery pin,
  // so ScrollTrigger measures them in page order)
  const vortex = document.querySelector<HTMLElement>('[data-vortex]');
  if (vortex) {
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      let progress = 0;
      let render: ((p: number) => void) | undefined;
      whenNear(vortex, () =>
        Promise.all([import('./vortex'), document.fonts.load('400 92px Anton')]).then(([m]) => {
          render = m.initVortex(vortex.querySelector('canvas')!, JSON.parse(vortex.dataset.projects!));
          render(progress);
        }),
      );
      ScrollTrigger.create({
        trigger: vortex, pin: true, start: 'top top', end: '+=160%',
        onUpdate: (s) => { progress = s.progress; render?.(progress); },
      });
    });
  }

  // logos marquee follows scroll speed and direction (Web Animations playbackRate: no restart jump)
  const marquee = document.querySelector<HTMLElement>('.logos__track')?.getAnimations()[0];
  if (marquee) {
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      let rate = 1;
      ScrollTrigger.create({
        onUpdate: (s) => {
          const v = s.getVelocity() / 250; // px/s → speed multiple
          if (v) rate = Math.sign(v) * gsap.utils.clamp(1, 6, Math.abs(v)); // never slower than cruising
        },
      });
      const ease = () => {
        rate += ((rate < 0 ? -1 : 1) - rate) * 0.05; // settle back to cruising speed, keeping direction
        marquee.playbackRate = rate;
      };
      gsap.ticker.add(ease);
      return () => gsap.ticker.remove(ease);
    });
  }
}
