import * as THREE from 'three';

const REVEAL = 0.22; // hover circle radius as a fraction of the portrait height

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform sampler2D uHover;
  uniform float uHasHover;
  uniform vec2 uUvScale2;
  uniform vec2 uMouse;   // 0..1, y up
  uniform float uReveal;
  uniform float uTime;
  uniform float uAspect;
  uniform vec3 uAccent;
  varying vec2 vUv;

  void main() {
    vec2 aspect = vec2(uAspect, 1.0);
    vec2 d = (vUv - uMouse) * aspect; // aspect-corrected so circles stay round
    float len = max(length(d), 1e-4);
    float ang = atan(d.y, d.x);
    float r = uReveal * (${REVEAL.toFixed(3)} + sin(ang * 5.0 + uTime * 2.0) * 0.015 + sin(ang * 3.0 - uTime * 1.3) * 0.015);

    // outside the ring: the photo ripples outward from the circle edge
    float ripple = exp(-pow((len - r) * 16.0, 2.0)) * uReveal;
    vec2 baseUv = vUv + (d / len) / aspect * sin(len * 90.0 - uTime * 8.0) * ripple * 0.006;
    vec4 base = texture2D(uMap, baseUv);

    // inside the ring: the second layer is magnified toward the cursor and drifts with it
    vec2 altUv = uMouse + (vUv - uMouse) * 0.88 + (uMouse - 0.5) * 0.06;
    vec4 alt;
    if (uHasHover > 0.5) {
      altUv = (altUv - 0.5) * uUvScale2 + 0.5; // object-fit: cover
      // slight RGB split near the ring edge
      float split = smoothstep(r * 0.6, r, len) * 0.006;
      alt = vec4(
        texture2D(uHover, altUv + d / len / aspect * split).r,
        texture2D(uHover, altUv).g,
        texture2D(uHover, altUv - d / len / aspect * split).b,
        1.0);
    } else {
      // no second image yet: accent duotone + moving scanlines, clipped to the cutout
      float l = dot(base.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 duo = mix(vec3(0.01), uAccent, smoothstep(0.02, 0.5, l));
      float scan = 0.8 + 0.2 * sin(gl_FragCoord.y * 1.4 - uTime * 6.0);
      alt = vec4(duo * scan, base.a);
    }

    float m = 1.0 - smoothstep(r - 0.012, r, len);
    float ring = (smoothstep(r - 0.012, r, len) - smoothstep(r, r + 0.004, len)) * uReveal;

    vec4 col = mix(base, alt, m);
    col.rgb += uAccent * ring * max(base.a, alt.a);
    // photos cropped at the shoulders leave hard side edges: dissolve them
    col.a *= smoothstep(0.0, 0.14, vUv.x) * smoothstep(0.0, 0.14, 1.0 - vUv.x);
    gl_FragColor = col;
    #include <colorspace_fragment>
  }
`;

// Fixed portrait cutout drawn on a canvas that exactly covers the <img>;
// hovering reveals a second aligned layer inside a circle that follows the cursor.
export function initPortrait(canvas: HTMLCanvasElement, img: HTMLImageElement) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const u = {
    uMap: { value: null as THREE.Texture | null },
    uHover: { value: null as THREE.Texture | null },
    uHasHover: { value: 0 },
    uUvScale2: { value: new THREE.Vector2(1, 1) },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uReveal: { value: 0 },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uAccent: { value: new THREE.Color(accent || '#d4ff3a') },
  };
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);
  scene.add(new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position * 2.0, 1.0); }',
      fragmentShader,
    }),
  ));

  let hoverAspect = 1;
  let ready = false;
  const render = () => ready && renderer.render(scene, camera);
  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    u.uAspect.value = w / h;
    u.uUvScale2.value.set(Math.min(1, w / h / hoverAspect), Math.min(1, hoverAspect / (w / h)));
    render();
  };
  new ResizeObserver(resize).observe(canvas);

  const loader = new THREE.TextureLoader();
  const load = (src: string, done: (tex: THREE.Texture) => void) =>
    loader.load(src, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      done(tex);
      resize();
    });
  load(img.currentSrc || img.src, (tex) => {
    u.uMap.value = tex;
    ready = true;
    img.classList.add('is-3d'); // <img> stays for layout, alt text and no-WebGL fallback
  });
  if (img.dataset.hover) {
    load(img.dataset.hover, (tex) => {
      const i = tex.image as HTMLImageElement;
      hoverAspect = i.width / i.height;
      u.uHover.value = tex;
      u.uHasHover.value = 1;
    });
  }

  // pointer events land on the <img> (the canvas has pointer-events: none)
  const target = { x: 0.5, y: 0.5, reveal: 0 };
  const track = (e: PointerEvent) => {
    const r = img.getBoundingClientRect();
    target.x = (e.clientX - r.left) / r.width;
    target.y = 1 - (e.clientY - r.top) / r.height;
  };
  img.addEventListener('pointerenter', (e) => {
    track(e);
    if (u.uReveal.value < 0.01) u.uMouse.value.set(target.x, target.y); // grow from the entry point
    target.reveal = 1;
  });
  img.addEventListener('pointermove', track);
  img.addEventListener('pointerleave', () => (target.reveal = 0));

  // only animate while the reveal is visible
  const clock = new THREE.Clock();
  let idle = true;
  const frame = () => {
    requestAnimationFrame(frame);
    const active = target.reveal > 0 || u.uReveal.value > 0.001;
    if (!active && idle) return;
    const k = reduce ? 1 : 0.15;
    u.uMouse.value.x += (target.x - u.uMouse.value.x) * k;
    u.uMouse.value.y += (target.y - u.uMouse.value.y) * k;
    u.uReveal.value += (target.reveal - u.uReveal.value) * (reduce ? 1 : 0.1);
    if (!active) u.uReveal.value = 0;
    u.uTime.value = reduce ? 0 : clock.getElapsedTime();
    render();
    idle = !active;
  };
  frame();
}
