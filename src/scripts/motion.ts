import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Rive: any <canvas data-rive="/rive/x.riv"> plays automatically
const riveCanvases = document.querySelectorAll<HTMLCanvasElement>('canvas[data-rive]');
if (riveCanvases.length) {
  import('@rive-app/canvas').then(({ Rive }) =>
    riveCanvases.forEach((canvas) => new Rive({ src: canvas.dataset.rive!, canvas, autoplay: true })),
  );
}

// ── Smooth scroll
if (!reduce) {
  const lenis = new Lenis();
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

  // pinned horizontal gallery on wide screens; native swipe-scroll below 768px
  const track = document.querySelector<HTMLElement>('[data-hscroll]');
  if (track) {
    mm.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
      const distance = () => track.scrollWidth - innerWidth;
      gsap.to(track, {
        x: () => -distance(), ease: 'none',
        scrollTrigger: { trigger: track.parentElement, pin: true, scrub: 1, end: () => `+=${distance()}`, invalidateOnRefresh: true },
      });
    });
  }
}
