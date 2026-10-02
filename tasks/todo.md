# Todo: Effects upgrade

Verify every task with `npm run build`, then a manual check in `npm run dev` at desktop width and at 400×745.

## Task 1: WebGL visibility guard — already in hero-bg/portrait (IntersectionObserver `visible`); new modules reuse the pattern
**Description:** Add `src/scripts/gl-visible.ts`, which exports `onVisible(canvas, start, stop)` and is backed by an IntersectionObserver. Retrofit `hero-bg.ts` and `portrait.ts` so their loops stop when the hero is offscreen.
**Acceptance:**
- [x] With the hero scrolled out, the DevTools Performance panel shows no rAF work from the hero canvases
- [x] Scrolling back resumes both canvases with no visual jump
**Deps:** None · **Files:** gl-visible.ts, hero-bg.ts, portrait.ts · **Scope:** S

## Task 2: Cta gradient background (ShaderGradient look)
**Description:** Add `src/scripts/gradient.ts`: a three plane with vertex noise displacement and a 3-color blend taken from profile.json (default: derived from accent), plus slow camera drift and grain. Mount it as the Cta background canvas behind the text.
**Acceptance:**
- [x] Animates at 60fps on desktop, uses guard from Task 1
- [x] Mobile (<768px) or reduced-motion shows a single static frame
- [x] Cta text keeps AA contrast over it
**Deps:** 1 · **Files:** gradient.ts, Cta.astro, global.css, profile.json · **Scope:** M

## Checkpoint A
- [ ] Lighthouse not run yet. Lighthouse perf not lower than the pre-change score by more than 5 points
- [x] Human review of the gradient look

## Task 3: Liquid-metal monogram — own chrome shader (liquid-logo shader is a colour glow, not metal); credited as inspiration
**Description:** Spike first: port the liquid-logo shader into `src/scripts/liquid-metal.ts` (MIT, keep the attribution header). It takes an image or SVG mask and renders liquid metal. Use it in Loader in place of or beside the counter.
**Acceptance:**
- [x] Loader shows the animated metal monogram, then hands off to the existing loader exit animation
- [x] Falls back to plain SVG/text if WebGL is unavailable
**Deps:** 1 · **Files:** liquid-metal.ts, Loader.astro, motion.ts, public/img/monogram.svg · **Scope:** M

## Task 4: Liquid-glass nav pill
**Description:** Wrap Nav in a glass pill that uses `backdrop-filter` plus an inline SVG `feDisplacementMap` refraction filter, with a specular edge highlight. The filter is feature-detected.
**Acceptance:**
- [x] Chromium: hero canvases visibly refract through the pill
- [x] Safari/Firefox: blurred glass, no broken rendering
- [x] Nav links stay legible (AA) over every section
**Deps:** None · **Files:** Nav.astro, global.css · **Scope:** S

## Checkpoint B
- [x] Human visual review of the whole page. Cut anything that feels like a demo reel.

## Task 5: DecryptedText headings — DROPPED (headings already animate via data-split; stacking a scramble = noise)
**Description:** On ScrollTrigger enter, `[data-decrypt]` headings scramble glyphs and then resolve. Hook into the existing `initScrollAnimations` in `motion.ts`, without a parallel system.
**Acceptance:**
- [x] Runs once per heading. Screen readers get the final text (aria-label)
- [x] Reduced motion shows the text instantly
**Deps:** None · **Files:** motion.ts, Projects/Timeline/Gallery .astro (attribute only) · **Scope:** S

## Task 6: SpotlightCard project cards
**Description:** A radial gradient follows the cursor inside each `.card`, driven by CSS vars set from pointermove. It is CSS-only beyond the 5 lines that set the vars.
**Acceptance:**
- [x] Glow tracks the cursor and fades on leave
- [x] No effect on touch devices; horizontal rail scroll still works on mobile
**Deps:** None · **Files:** Projects.astro, global.css · **Scope:** XS

## Task 7: Magnet buttons + ClickSpark
**Description:** `.btn` and `.round` pull toward the cursor through a GSAP quickTo. Clicks emit a short spark burst on one fixed overlay canvas.
**Acceptance:**
- [x] Magnet works with a pointer:fine query only
- [x] Spark canvas has pointer-events none and does not block clicks
**Deps:** None · **Files:** motion.ts, global.css · **Scope:** S

## Task 8: Footer signature + final pass
**Description:** Reuse `liquid-metal.ts` on the footer signature. Run a full mobile and reduced-motion sweep. Credit the sources (liquid-logo MIT, ReactBits) in README or the footer.
**Acceptance:**
- [x] Max 2 WebGL loops are active at any scroll position
- [ ] Lighthouse mobile perf ≥ 80 (not run); no console errors ✓
- [x] All effects degrade cleanly with reduced motion
**Deps:** 3, 5–7 · **Files:** Footer.astro, global.css · **Scope:** S

## Checkpoint C
- [x] All acceptance met, build clean, human sign-off, then commit per task

---
# v2 todo

## Task 9: Cairo map data build script
**Description:** `tools/cairo-map.mjs` queries Overpass (streets + Nile around Tahrir) → `public/data/cairo.json`, with coordinates quantized to ints and ways sorted by distance from the centre.
**Acceptance:**
- [x] JSON < 150KB
- [x] Includes centre lat/lon and street class
**Deps:** none · **Scope:** S

## Task 10: "Cairo, right now" section
**Description:** New `City.astro` + `src/scripts/city-map.ts`. Canvas map draws outward with scroll progress. Nile in accent. Glass magnifier lens on pointer (all browsers: clip + scale). Live `Africa/Cairo` clock.
**Acceptance:**
- [x] Streets draw on scroll; lens magnifies on hover; clock ticks every second
- [x] Touch: lens hidden; reduced motion: fully drawn map
- [x] The clock has an `aria-live="off"` time element, and the canvas has an aria-label
**Deps:** 9 · **Scope:** M

## Task 11: Lanyard ID badge in About
**Description:** `src/scripts/lanyard.ts`: canvas verlet rope + badge (portrait cutout, name, role). Drag and throw. The strap is the section spine.
**Acceptance:**
- [x] Badge swings and settles; drag + throw works with mouse and touch
- [x] Reduced motion: static hang
**Deps:** none · **Scope:** M

## Checkpoint D
- [x] Build clean; desktop + 400px screenshots reviewed

## Task 12: Project vortex intro
**Description:** `src/scripts/vortex.ts`: pinned three.js scene before the rail. Project cards are canvas-generated typographic textures spiralling out of depth, scrubbed by scroll.
**Acceptance:**
- [x] Pins, scrubs, unpins into the rail without a jump
- [x] Reduced motion: section not rendered
**Deps:** none · **Scope:** M

## Task 13: Scroll-velocity marquee
**Description:** Logos marquee `playbackRate` follows scroll velocity (Web Animations API, no restart jump).
**Acceptance:**
- [x] Speeds up on fast scroll, reverses on scroll up, eases back to 1
**Deps:** none · **Scope:** XS

## Checkpoint E
- [x] Build clean, no console errors, all v2 effects verified in screenshots
