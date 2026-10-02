import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { photoFit, type LanyardApi } from './lanyard';

// As the About section scrolls in, the hero portrait flies from the hero into the ID badge's photo
// window and becomes its printed photo. Scroll back up and it flies home.
const LIFT = 90; // px the flight arcs upward at its midpoint

export function initPortraitFlight(img: HTMLImageElement, badge: LanyardApi, trigger: HTMLElement) {
  const figure = img.closest<HTMLElement>('.hero__figure') ?? img;
  // window (clips the photo once it's in the badge) + the photo inside it
  const frame = document.createElement('div');
  frame.className = 'flight';
  frame.setAttribute('aria-hidden', 'true');
  const photo = document.createElement('img');
  photo.src = img.currentSrc || img.src; // same decoded file: no new download
  photo.alt = '';
  frame.append(photo);
  document.body.append(frame);

  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const ease = gsap.parseEase('power2.inOut');

  let last = -1;
  const place = (p: number) => {
    const flying = p > 0 && p < 1;
    if (!flying && p === last) return; // parked at either end: nothing to update
    last = p;
    frame.style.visibility = flying ? 'visible' : 'hidden';
    figure.style.visibility = p > 0 ? 'hidden' : '';
    badge.showPhoto(p >= 1);
    if (!flying) return;
    const to = badge.photoFrame();
    if (!to) return;
    const from = img.getBoundingClientRect();
    const t = ease(p);
    // window: hero image box → badge photo window (rotated with the swinging card)
    const w = mix(from.width, to.w, t), h = mix(from.height, to.h, t);
    const cx = mix(from.left + from.width / 2, to.cx, t);
    const cy = mix(from.top + from.height / 2, to.cy, t) - Math.sin(Math.PI * t) * LIFT;
    const rot = mix(0, to.angle, t) + Math.sin(Math.PI * t) * 0.12; // slight tumble mid-air
    // photo inside the window: fills the hero box → cover-fit, bottom-aligned like the printed badge
    const [fw, fh] = photoFit(to.w, to.h, img.naturalWidth, img.naturalHeight);
    const pw = mix(w, fw, t), ph = mix(h, fh, t);
    const px = mix(0, (to.w - fw) / 2, t), py = mix(0, to.h - fh, t);
    frame.style.width = `${w}px`;
    frame.style.height = `${h}px`;
    frame.style.transform = `translate(${cx - w / 2}px, ${cy - h / 2}px) rotate(${rot}rad)`;
    frame.style.borderRadius = `${t * 4}px`;
    photo.style.width = `${pw}px`;
    photo.style.height = `${ph}px`;
    photo.style.transform = `translate(${px}px, ${py}px)`;
  };

  const st = ScrollTrigger.create({ trigger, start: 'top bottom', end: 'top 15%' });
  // per frame (not per scroll event): the badge keeps swinging after scrolling stops
  const tick = () => place(st.progress);
  gsap.ticker.add(tick);
  place(st.progress);
}
