# Implementation Plan: Effects upgrade from Repos.txt

## Overview
Take the strongest ideas from the 6 references in `Repos.txt` and land them in the existing Astro + vanilla three/GSAP/Lenis site without adding React. Each effect gets its own section, loads lazily, and pauses when offscreen.

## Source audit

| Source | Stack / License | Verdict | Why |
|---|---|---|---|
| ruucm/shadergradient | React + R3F, **no license** | **Recreate look, don't copy code** | The package pulls in React, R3F and drei (~300KB+). With no license the code can't be copied, so we write our own noise-displaced gradient plane in three, which is already installed. |
| collidingScopes/liquid-logo | TS/WebGL, MIT | **Port shader** | Vanilla and permissive. Turns an SVG into liquid metal. Use it on the signature/monogram (loader + footer). |
| dashersw/liquid-glass-js | Vanilla JS, MIT, relies on html2canvas | **Reference only, build natively** | html2canvas takes a static DOM snapshot and can't see the live WebGL canvases, so the glass would refract stale pixels. Native `backdrop-filter` + SVG `feDisplacementMap` refracts live content for free. |
| reactbits.dev | React, MIT + Commons Clause | **Port 4 components to vanilla** | Personal-site use is allowed. Port only the ones that fit: DecryptedText, Magnet, ClickSpark, SpotlightCard. |
| vantajs halo | needs global three r134, MIT | **Skip** | Conflicts with three 0.186, and `hero-bg.ts` already fills the hero background slot. A third background shader would dilute the hero. |
| zappar r3f examples | abandoned 2021, commercial SDK license | **Skip** | Needs a paid license and a camera prompt, and the repo is stale. Low payoff on a portfolio. |

## Architecture Decisions
- **No React islands.** Every effect is a vanilla TS module in `src/scripts/`, dynamic-imported from its component (same pattern as `Hero.astro`).
- **One shared WebGL guard.** Add `src/scripts/gl-visible.ts`: an IntersectionObserver that pauses a render loop when its canvas is offscreen. The hero already runs 2 contexts, and the new effects add 2 more.
- **Reduced motion honored.** Every effect checks `prefers-reduced-motion` and renders a static frame or plain CSS.
- **Content stays in profile.json.** New config, such as gradient colors and the logo SVG path, goes there.

## Effect → section map
| Section | Effect |
|---|---|
| Loader | Liquid-metal monogram (liquid-logo port) |
| Nav | Liquid-glass pill (native SVG refraction) |
| Section headings | DecryptedText scramble on reveal |
| Projects cards | SpotlightCard cursor glow + glass hover |
| Cta | ShaderGradient-style 3D gradient background + Magnet buttons |
| Global | ClickSpark on click |
| Footer | Liquid-metal signature (reuses Loader module) |

## Task List
See `tasks/todo.md`.

### Phase 1: Foundation (risk first)
- Task 1: gl-visible pause guard + retrofit hero canvases
- Task 2: Gradient shader in Cta (largest new WebGL piece, so its risk is retired first)

### Checkpoint A: perf baseline holds

### Phase 2: Signature effects
- Task 3: Liquid-metal monogram module + Loader
- Task 4: Liquid-glass nav pill

### Checkpoint B: visual review

### Phase 3: Micro-interactions (ReactBits ports)
- Task 5: DecryptedText on headings
- Task 6: SpotlightCard on project cards
- Task 7: Magnet buttons + ClickSpark

### Phase 4: Polish
- Task 8: Footer liquid signature + mobile/reduced-motion pass + perf audit

### Checkpoint C: complete

## Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Too many WebGL contexts or GPU load on mobile | High | gl-visible guard, DPR capped at 1.5, static fallback below 768px for Cta gradient |
| SVG `feDisplacementMap` inside `backdrop-filter` is Chromium-only | Med | Feature-detect; Safari/Firefox get plain `backdrop-filter: blur()` |
| Effect overload makes site look like a demo reel | High | One hero effect per section; Checkpoint B review is a hard gate |
| liquid-logo needs SVG → distance-field preprocessing | Med | Generate the field once at build or init from the signature SVG; Task 3 spikes this first |
| Commons Clause on ReactBits | Low | Personal, non-sold use; credit in footer/README |

## Open Questions
- Is a monogram/signature SVG available? `profile.signature` is currently a raster path. Liquid-logo needs a clean single-color SVG or high-contrast PNG.
- Gradient palette: derive from `profile.accent` (default) or pick 3 custom colors?
- Is AR (Zappar) wanted for anything specific? It is skipped unless there is a concrete use, such as an AR business card.

---

# v2: Creative combination pass

## New references analysed
| Source | What it actually does | Idea worth taking |
|---|---|---|
| **bleibtgleich.dev** (Webflow + GSAP SplitText/MorphSVG/Draggable/Inertia, three r128) | Swiss white layout around one vertical hairline spine. Project thumbnails orbit in a 3D vortex around "Work 24–26". A live local clock `(21 : [image] : 15)` sits under a sentence that runs across it. "bleibt" and "gleich" ghost words are pinned in the corners. | The **3D project vortex**, the **live-clock-as-typography**, and **one line as structure** |
| **terraink.app** (MapLibre) | Generates posters from real city street networks | **Your city as a poster**: real Cairo streets from OSM, drawn as a piece of art |
| ReactBits (second look) | Lanyard (3D badge on a rope), ScrollVelocity, Magnifier/Lens | **ID badge on a rope**, **marquee that reacts to scroll velocity** |
| liquid-glass-js (second look) | Lens refraction | Reused as a **magnifying lens over the map** |

## Concept: terrain → city → person
The hero is already a **topographic** field (contour lines). v2 continues that story:
1. **About** gets the person's ID badge hanging on a lanyard. The strap becomes the section's single hairline spine (bleibtgleich).
2. **Projects** opens with the work flying out of depth in a vortex (bleibtgleich), then hands off to the accessible rail.
3. A new **"Cairo, right now"** section draws the real Cairo street network outward from Tahrir as you scroll (terraink). The Nile is in the accent colour, a glass lens magnifies the streets under the cursor (liquid-glass), and a live Cairo clock is set in display type (bleibtgleich).
4. **Logos** marquee speeds up and reverses with scroll velocity (ReactBits).

One signature per section and nothing repeated, so each section gets its own moment rather than effects scattered everywhere.

## Design tokens (unchanged identity, new uses)
- Colour: `--bg #0b0b0c`, `--bg-2 #141416`, `--fg #f2f0ea`, `--muted #8d8b86`, `--accent #2e5eb6`. Map: minor streets fg @ 18%, major fg @ 55%, Nile = accent.
- Type: Anton for display and the clock digits (tabular by monospace layout), Inter for body. New sections use sentence-case meta, with no tracked caps eyebrows.
- Map layout:
```
┌────────────────────────────────────────────┐
│ (21 : 14 : 05)            Cairo, right now  │  ← clock: Anton, huge
│  ░░▒▒ streets draw outward from Tahrir ▒▒░░ │
│  ░▒▒▒▒▒▒▒ ~~~ Nile (accent) ~~~ ▒▒▒▒▒▒▒░░░  │  ← canvas, scrubbed by scroll
│           ( lens follows cursor )           │
│ 30.0444° N  31.2357° E                      │
└────────────────────────────────────────────┘
```
- About layout:
```
│ about text (left)            │ strap (spine)
│ …                            │
│                            ┌─┴─┐ badge: portrait, name, role
│                            └───┘ drag + throw, verlet physics
```

## v2 risks
| Risk | Mitigation |
|---|---|
| Map data weight | Built once by `tools/cairo-map.mjs` into quantized JSON (~80KB). Fetched only when the section nears the viewport. |
| Pinned vortex + Lenis + existing pinned gallery | Same ScrollTrigger pin pattern as the gallery. Reduced motion → vortex not rendered. |
| Too much going on | Each effect is confined to its own section. Checkpoint review after Phase B. |

---

# Performance log (2026-10-02)
Harness: headless Chrome via CDP, 4× CPU throttle, software GL (SwiftShader), cache disabled, full-page scripted scroll.
Software GL exaggerates fill cost, so compare the rows against each other rather than reading them as absolute numbers.

| Change | Before → After | Verdict | Why |
|---|---|---|---|
| Portrait PNG 4MB (2046×2568) → WebP 1400px (167KB); depth PNG 357KB → WebP 700px (8KB); three.js + badge reuse the hero's decoded `<img>` instead of refetching | transfer 12.4MB → 0.44MB | **kept** | The same 4MB file was downloaded 3× |
| Lazy-create offscreen WebGL contexts (CTA gradient, footer metal, vortex) on approach (`whenNear`) | load long tasks 4.5s → 3.1s (desktop), 3.6s → 1.8s (mobile) | **kept** | `getContext` was 3.4s of main thread at load |
| Loader monogram: WebGL liquid metal → CSS chrome gradient | long tasks 3.1s → ~1.6s; contexts 6 → 5 | **kept** | Context create + `forceContextLoss` right on the critical path |
| Pixel ratio caps: hero-bg / gradient / vortex → 1×, portrait 2× → 1.5× | mobile@2x scroll avg 94 → 68ms, jank 55 → 35 | **kept** | Scroll main thread was ~87% idle, so the cost was GPU fill |
| Pre-create contexts in idle time after load | long tasks 1.3s → 4.3s, scroll unchanged | **reverted** | Moved the cost rather than removing it |

Final: desktop LCP ~0.8s, CLS 0.025, 0.44MB transfer, load long tasks ~1.5s, scroll p95 600 → ~215ms; mobile@2x scroll p95 ~780 → ~100ms.
