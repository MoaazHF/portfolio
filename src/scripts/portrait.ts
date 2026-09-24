import * as THREE from 'three';

const REVEAL = 0.22; // hover circle radius as a fraction of the portrait height
const DEPTH = 0.16; // relief depth as a fraction of the portrait height
const FLOAT = 0.012; // vertical bob as a fraction of the portrait height
const TILT = [0.04, 0.08]; // max cursor tilt (radians) around x, y — lower = less sensitive
const SEGMENTS = [180, 226]; // mesh resolution (x, y) — more = smoother relief
const ASCII_ROWS = 72; // character rows across the portrait height
const ASCII_CHARS = ' .:-=+*#%@'; // dark → bright
const SCAN_TIME = 1.8; // seconds for the auto scan line to cross the portrait
const GLITCH_TIME = 0.35; // seconds per glitch burst
const FX_GAP = [4, 8]; // random pause (s) between automatic scan / glitch events

const vertexShader = /* glsl */ `
  uniform sampler2D uDepthMap;
  uniform float uDepth;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += texture2D(uDepthMap, uv).r * uDepth;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform sampler2D uDepthMap;
  uniform sampler2D uAscii; // glyph atlas: ASCII_CHARS in one row
  uniform float uRows;
  uniform vec2 uMouse;   // 0..1, y up
  uniform float uReveal;
  uniform float uTime;
  uniform float uAspect;
  uniform vec2 uSlope;   // converts depth deltas into surface slope
  uniform vec3 uLight;   // light direction in object space
  uniform vec3 uAccent;
  uniform float uScan;   // 0..1 auto scan progress (0 and 1 are both off-image)
  uniform float uGlitch; // 0..1 glitch burst strength
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec2 aspect = vec2(uAspect, 1.0);
    vec2 d = (vUv - uMouse) * aspect;
    float len = max(length(d), 1e-4);
    float ang = atan(d.y, d.x);
    float r = uReveal * (${REVEAL.toFixed(3)} + sin(ang * 5.0 + uTime * 2.0) * 0.015 + sin(ang * 3.0 - uTime * 1.3) * 0.015);

    // glitch: random horizontal slices jump sideways and flip to ASCII
    float slice = floor(vUv.y * 28.0);
    float tick = floor(uTime * 20.0);
    float glitch = step(1.0 - uGlitch * 0.4, hash(vec2(slice, tick)));
    vec2 uv = vUv + vec2((hash(vec2(tick, slice)) - 0.5) * 0.1 * glitch, 0.0);

    // ripple just outside the ring
    float ripple = exp(-pow((len - r) * 16.0, 2.0)) * uReveal;
    vec2 baseUv = uv + (d / len) / aspect * sin(len * 90.0 - uTime * 8.0) * ripple * 0.006;
    vec4 base = texture2D(uMap, baseUv);
    base.r = texture2D(uMap, baseUv + vec2(0.012 * glitch, 0.0)).r; // RGB split on glitched slices

    // surface normal from the depth map → lighting that shifts as the model turns
    vec2 e = vec2(0.004, 0.0);
    float dx = texture2D(uDepthMap, vUv + e.xy).r - texture2D(uDepthMap, vUv - e.xy).r;
    float dy = texture2D(uDepthMap, vUv + e.yx).r - texture2D(uDepthMap, vUv - e.yx).r;
    vec3 n = normalize(vec3(-dx * uSlope.x, -dy * uSlope.y, 1.0));
    float diffuse = max(dot(n, uLight), 0.0);
    float rim = smoothstep(0.35, 0.85, 1.0 - n.z); // only the steepest edges catch the accent
    base.rgb *= 0.72 + 0.4 * diffuse;
    base.rgb += uAccent * rim * 0.3;

    // hover layer: the same photo as ASCII art (cells stick to the surface)
    const float N = ${ASCII_CHARS.length.toFixed(1)};
    vec2 grid = vec2(floor(uRows * uAspect / 0.6), uRows); // glyph cells are 0.6 as wide as tall
    vec2 cell = floor(uv * grid);
    vec4 src = texture2D(uMap, (cell + 0.5) / grid);
    float l = dot(src.rgb, vec3(0.2126, 0.7152, 0.0722));
    l = clamp(pow(l, 0.6) * 1.25 + (hash(cell + floor(uTime * 8.0)) - 0.5) * 0.1, 0.0, 1.0); // lift darks + flicker
    float gi = floor(l * (N - 1.0) + 0.5);
    vec2 local = fract(uv * grid);
    float glyph = texture2D(uAscii, vec2((gi + local.x) / N, local.y)).r;
    vec4 alt = vec4(mix(uAccent * 1.6, vec3(1.0), l * 0.7) * glyph, src.a);

    // auto scan: a line sweeps top → bottom, leaving a dithered ASCII band that decays behind it
    float behind = vUv.y - (1.2 - uScan * 1.4); // > 0 = already scanned; start/end stay off-image
    float scan = step(0.0, behind + (hash(cell) - 0.5) * 0.03) * (1.0 - smoothstep(0.02, 0.18, behind + hash(cell + 7.0) * 0.05));
    float line = exp(-pow(behind * 250.0, 2.0));

    float m = max(1.0 - smoothstep(r - 0.012, r, len), max(scan, glitch));
    float ring = (smoothstep(r - 0.012, r, len) - smoothstep(r, r + 0.004, len)) * uReveal;
    vec4 col = mix(base, alt, m);
    col.rgb += uAccent * (ring + line * 1.5) * max(base.a, alt.a);
    col.a *= smoothstep(0.0, 0.14, vUv.x) * smoothstep(0.0, 0.14, 1.0 - vUv.x);
    if (col.a < 0.01) discard; // keeps transparent areas out of the depth buffer
    gl_FragColor = col;
    #include <colorspace_fragment>
  }
`;

// Portrait as a floating depth-relief mesh (displaced by a grayscale depth map), lit from its
// own surface normals, tilting toward the cursor. Hovering reveals an ASCII-art version of it.
// The canvas is larger than the <img> (see CSS) so the model has room to move.
export function initPortrait(canvas: HTMLCanvasElement, img: HTMLImageElement) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const css = getComputedStyle(document.documentElement);
  const u = {
    uMap: { value: null as THREE.Texture | null },
    uDepthMap: { value: null as THREE.Texture | null },
    uAscii: { value: asciiAtlas() },
    uRows: { value: ASCII_ROWS },
    uDepth: { value: 0 },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uReveal: { value: 0 },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uSlope: { value: new THREE.Vector2(1, 1) },
    uLight: { value: new THREE.Vector3(0, 0, 1) },
    uAccent: { value: new THREE.Color(css.getPropertyValue('--accent').trim() || '#2e5eb6') },
    uScan: { value: 0 },
    uGlitch: { value: 0 },
  };

  // 1×1 black texture = flat surface until (or unless) a depth map loads
  const flat = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  flat.needsUpdate = true;
  u.uDepthMap.value = flat;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.z = 10;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1, SEGMENTS[0], SEGMENTS[1]),
    new THREE.ShaderMaterial({ uniforms: u, vertexShader, fragmentShader, transparent: true }),
  );
  mesh.visible = false;
  scene.add(mesh);

  const light = new THREE.Vector3(-0.45, 0.55, 1).normalize();
  const inv = new THREE.Quaternion();
  const home = new THREE.Vector3();
  let worldH = 1;

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // map the <img> box onto the z=0 plane
    const k = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z) / h;
    const c = canvas.getBoundingClientRect();
    const a = img.getBoundingClientRect();
    home.set((a.left + a.width / 2 - c.left - w / 2) * k, -(a.top + a.height / 2 - c.top - h / 2) * k, 0);
    mesh.position.copy(home);
    mesh.scale.set(a.width * k, a.height * k, 1);
    worldH = a.height * k;
    u.uDepth.value = DEPTH * worldH;
    u.uAspect.value = a.width / a.height;
    // depth delta over the 0.008-uv sampling window → slope in world units
    u.uSlope.value.set((DEPTH * worldH) / (0.008 * a.width * k), (DEPTH * worldH) / (0.008 * worldH));
  };
  new ResizeObserver(resize).observe(canvas);

  const loader = new THREE.TextureLoader();
  const load = (src: string, color: boolean, done: (tex: THREE.Texture) => void) =>
    loader.load(src, (tex) => {
      if (color) tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      done(tex);
      resize();
    });
  load(img.currentSrc || img.src, true, (tex) => {
    u.uMap.value = tex;
    mesh.visible = true;
    img.classList.add('is-3d'); // <img> stays for layout, alt text, pointer events and no-WebGL fallback
  });
  if (img.dataset.depth) load(img.dataset.depth, false, (tex) => (u.uDepthMap.value = tex));

  // pointer → tilt (whole page) and reveal position (raycast onto the mesh for its UV)
  const pointer = { x: 0, y: 0 };
  const tilt = { x: 0, y: 0 };
  const target = { x: 0.5, y: 0.5, reveal: 0 };
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let mouse = false;
  addEventListener('pointermove', (e) => {
    mouse = e.pointerType === 'mouse';
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = (e.clientY / innerHeight) * 2 - 1;
    if (!target.reveal) return;
    const c = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - c.left) / c.width) * 2 - 1, -((e.clientY - c.top) / c.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(mesh)[0];
    if (hit?.uv) { target.x = hit.uv.x; target.y = hit.uv.y; }
  }, { passive: true });
  // automatic scan / glitch events; hovering also kicks off a glitch
  let fx = { kind: '', start: 0, next: 1.5 };
  const trigger = (kind: string, t: number) =>
    (fx = { kind, start: t, next: t + FX_GAP[0] + Math.random() * (FX_GAP[1] - FX_GAP[0]) });

  img.addEventListener('pointerenter', (e) => {
    target.reveal = 1;
    if (!reduce) trigger('glitch', clock.elapsedTime);
    dispatchEvent(new PointerEvent('pointermove', e)); // resolve the entry point immediately
    if (u.uReveal.value < 0.01) u.uMouse.value.set(target.x, target.y);
  });
  img.addEventListener('pointerleave', () => (target.reveal = 0));

  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(canvas);

  const clock = new THREE.Clock();
  const frame = () => {
    requestAnimationFrame(frame);
    if (!visible || !mesh.visible) return;
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = reduce ? 0 : clock.elapsedTime;
    const ease = (rate: number) => (reduce ? 1 : 1 - Math.pow(1 - rate, dt * 60)); // same feel at any fps

    if (!reduce) {
      // touch: gentle idle sway instead of cursor tilt
      const px = mouse ? pointer.x : Math.sin(t * 0.5) * 0.5;
      const py = mouse ? pointer.y : Math.cos(t * 0.4) * 0.3;
      tilt.x += (py - tilt.x) * ease(0.05);
      tilt.y += (px - tilt.y) * ease(0.05);
      mesh.position.y = home.y + Math.sin(t * 0.9) * FLOAT * worldH;
      mesh.rotation.set(tilt.x * TILT[0] + Math.sin(t * 0.5) * 0.02, tilt.y * TILT[1] + Math.sin(t * 0.35) * 0.06, 0);
    }
    u.uLight.value.copy(light).applyQuaternion(inv.copy(mesh.quaternion).invert());

    const k = ease(0.15);
    u.uMouse.value.x += (target.x - u.uMouse.value.x) * k;
    u.uMouse.value.y += (target.y - u.uMouse.value.y) * k;
    u.uReveal.value += (target.reveal - u.uReveal.value) * ease(0.1);
    u.uTime.value = t;

    if (!reduce && t > fx.next) trigger(Math.random() < 0.6 ? 'scan' : 'glitch', t);
    const p = t - fx.start;
    u.uScan.value = fx.kind === 'scan' ? Math.min(p / SCAN_TIME, 1) : 0;
    u.uGlitch.value = fx.kind === 'glitch' && p < GLITCH_TIME ? 1 - p / GLITCH_TIME : 0;
    renderer.render(scene, camera);
  };
  frame();
}

// One row of glyphs, white on black, sampled by the shader per character cell.
function asciiAtlas() {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size * ASCII_CHARS.length;
  c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  g.font = `700 ${size * 0.9}px ui-monospace, Menlo, Consolas, monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  [...ASCII_CHARS].forEach((ch, i) => g.fillText(ch, i * size + size / 2, size / 2));
  const tex = new THREE.CanvasTexture(c);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}
