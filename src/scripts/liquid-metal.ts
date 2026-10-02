import * as THREE from 'three';

// Chrome-like liquid metal text. Look inspired by collidingScopes/liquid-logo (MIT); shader is our own.
const BEVEL = 0.09; // edge softness (height-field blur) as a fraction of the font size
const FLOW = 0.3; // noise wobble of the surface
const DENT = 0.5; // cursor swell strength

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMask;    // sharp glyphs
  uniform sampler2D uHeight;  // blurred glyphs = bevelled height field
  uniform vec2 uTexel;
  uniform float uSlope;
  uniform vec2 uMouse;        // uv
  uniform float uPress;
  uniform float uTime;
  uniform float uAspect;
  uniform vec3 uTint;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  float height(vec2 uv) {
    float h = texture2D(uHeight, uv).r;
    vec2 q = vec2(uv.x * uAspect, uv.y);
    h += (noise(q * 4.0 + vec2(uTime * 0.25, -uTime * 0.15)) - 0.5) * ${FLOW.toFixed(2)} * h;
    vec2 d = (uv - uMouse) * vec2(uAspect, 1.0);
    h += uPress * exp(-dot(d, d) * 30.0) * ${DENT.toFixed(2)} * h;
    return h;
  }

  // studio environment: bright banded sky over a dark floor, slowly sliding
  vec3 env(vec3 r) {
    float y = r.y + 0.12 * sin(r.x * 4.0 + uTime * 0.5);
    float bands = 0.5 + 0.5 * sin(y * 6.0 - uTime * 0.7);
    vec3 sky = mix(vec3(0.62), vec3(1.0), bands);
    vec3 ground = mix(vec3(0.03), uTint * 0.5, bands * 0.7);
    return mix(ground, sky, smoothstep(-0.12, 0.12, y));
  }

  void main() {
    float a = texture2D(uMask, vUv).r;
    if (a < 0.01) discard;
    // gradient over a few texels: the 8-bit height field is too stepped for 1-texel differences
    vec2 e = uTexel * 3.0;
    float hx = (height(vUv + vec2(e.x, 0.0)) - height(vUv - vec2(e.x, 0.0))) / 3.0;
    float hy = (height(vUv + vec2(0.0, e.y)) - height(vUv - vec2(0.0, e.y))) / 3.0;
    vec3 n = normalize(vec3(-hx * uSlope, -hy * uSlope, 1.0));
    vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);
    r.y += (vUv.y - 0.5) * 0.9; // flat faces still show a horizon
    // slight dispersion on the bevels
    vec3 col = vec3(
      env(r + vec3(n.xy * 0.04, 0.0)).r,
      env(r).g,
      env(r - vec3(n.xy * 0.04, 0.0)).b
    );
    col = mix(col, col * uTint * 1.8, 0.22);
    col += pow(1.0 - n.z, 3.0) * 0.6; // rim light
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`;

// Renders el's text as liquid metal into canvas (which should overlay el). Adds .is-metal to el when live.
export async function initLiquidMetal(canvas: HTMLCanvasElement, el: HTMLElement) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const s = getComputedStyle(el);
  const text = s.textTransform === 'uppercase' ? el.textContent!.trim().toUpperCase() : el.textContent!.trim();
  await document.fonts.load(`${s.fontWeight} 100px ${s.fontFamily}`);
  if (!canvas.isConnected) return; // e.g. loader already gone

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
  const dpr = Math.min(devicePixelRatio, 1.5);
  renderer.setPixelRatio(dpr);

  const css = getComputedStyle(document.documentElement);
  const u = {
    uMask: { value: null as THREE.Texture | null },
    uHeight: { value: null as THREE.Texture | null },
    uTexel: { value: new THREE.Vector2() },
    uSlope: { value: 1 },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uPress: { value: 0 },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uTint: { value: new THREE.Color(css.getPropertyValue('--accent').trim() || '#2e5eb6') },
  };
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: u, vertexShader, fragmentShader, transparent: true })));

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    const size = parseFloat(s.fontSize) * dpr;
    const font = `${s.fontWeight} ${size}px ${s.fontFamily}`;
    // text position: el's content box inside the canvas
    const c = canvas.getBoundingClientRect(), e = el.getBoundingClientRect();
    const center = s.textAlign === 'center';
    const x = (center ? e.left + e.width / 2 - c.left : e.left - c.left + parseFloat(s.paddingLeft)) * dpr;
    const blur = size * BEVEL;
    u.uMask.value?.dispose();
    u.uHeight.value?.dispose();
    u.uMask.value = glyphs(W, H, text, font, x, center, 0);
    u.uHeight.value = glyphs(W, H, text, font, x, center, blur);
    u.uTexel.value.set(1 / W, 1 / H);
    u.uSlope.value = blur * 0.6; // ~unit slope across the bevel
    u.uAspect.value = W / H;
    renderer.render(scene, camera);
  };
  new ResizeObserver(resize).observe(canvas);
  resize();
  el.classList.add('is-metal');

  const target = { x: 0.5, y: 0.5, press: 0 };
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    target.x = (e.clientX - r.left) / r.width;
    target.y = 1 - (e.clientY - r.top) / r.height;
    target.press = 1;
  }, { passive: true });
  canvas.addEventListener('pointerleave', () => (target.press = 0));

  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(canvas);

  const clock = new THREE.Clock();
  const frame = () => {
    if (!canvas.isConnected) { renderer.dispose(); renderer.forceContextLoss(); return; } // e.g. loader removed
    requestAnimationFrame(frame);
    if (!visible || reduce) return;
    u.uTime.value = clock.getElapsedTime();
    u.uMouse.value.x += (target.x - u.uMouse.value.x) * 0.1;
    u.uMouse.value.y += (target.y - u.uMouse.value.y) * 0.1;
    u.uPress.value += (target.press - u.uPress.value) * 0.06;
    renderer.render(scene, camera);
  };
  frame();
}

// White text on black, vertically centred on its cap height. blur > 0 → gaussian via canvas shadow
// (shadowBlur works in every browser, unlike ctx.filter).
function glyphs(w: number, h: number, text: string, font: string, x: number, center: boolean, blur: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  g.font = font;
  g.textAlign = center ? 'center' : 'left';
  const m = g.measureText(text);
  const y = (h + m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  g.fillStyle = '#fff';
  if (blur) {
    g.shadowColor = '#fff';
    g.shadowBlur = blur;
    g.shadowOffsetX = w * 2; // draw off-canvas, keep only the blurred shadow
    g.fillText(text, x - w * 2, y);
  } else {
    g.fillText(text, x, y);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}
