import * as THREE from 'three';

const BANDS = 14; // contour lines per unit of height
const LINE_ALPHA = 0.16;

const fragmentShader = /* glsl */ `
  uniform vec2 uRes;
  uniform vec2 uMouse;   // 0..1, y up
  uniform float uHover;  // 0..1, strength of the cursor hill
  uniform float uTime;
  uniform vec3 uLine;
  uniform vec3 uAccent;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
    return v;
  }

  void main() {
    float aspect = uRes.x / uRes.y;
    vec2 uv = gl_FragCoord.xy / uRes.y;
    vec2 m = uMouse * vec2(aspect, 1.0);
    float dm = length(uv - m);
    float near = exp(-dm * dm * 24.0);

    // terrain height: drifting noise + a hill that follows the cursor
    float h = fbm(uv * 1.5 + vec2(uTime * 0.02, uTime * 0.013)) + near * 0.32 * uHover;
    float f = h * ${BANDS.toFixed(1)};
    float g = abs(fract(f + 0.5) - 0.5) / fwidth(f); // pixel distance to nearest contour
    float line = 1.0 - min(g, 1.0);

    vec3 col = mix(uLine, uAccent, near * uHover);
    float alpha = line * ${LINE_ALPHA.toFixed(2)} * (1.0 + near * uHover * 3.0);
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

// Full-bleed topographic contour lines that swell around the cursor.
export function initHeroBg(canvas: HTMLCanvasElement) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));

  const css = getComputedStyle(document.documentElement);
  const u = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uHover: { value: 0 },
    uTime: { value: 0 },
    uLine: { value: new THREE.Color(css.getPropertyValue('--fg').trim() || '#f2f0ea') },
    uAccent: { value: new THREE.Color(css.getPropertyValue('--accent').trim() || '#d4ff3a') },
  };
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  scene.add(new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      vertexShader: 'void main() { gl_Position = vec4(position, 1.0); }',
      fragmentShader,
    }),
  ));

  const resize = () => {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    renderer.getDrawingBufferSize(u.uRes.value);
    renderer.render(scene, camera);
  };
  new ResizeObserver(resize).observe(canvas);
  resize();
  if (reduce) return;

  const target = { x: 0.5, y: 0.5, hover: 0 };
  let mouse = false;
  addEventListener('pointermove', (e) => {
    mouse = e.pointerType === 'mouse';
    const r = canvas.getBoundingClientRect();
    target.x = (e.clientX - r.left) / r.width;
    target.y = 1 - (e.clientY - r.top) / r.height;
    target.hover = 1;
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => (target.hover = 0));

  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(canvas);

  const clock = new THREE.Clock();
  const frame = () => {
    requestAnimationFrame(frame);
    if (!visible) return;
    const t = clock.getElapsedTime();
    if (!mouse) {
      // touch: the hill wanders on its own
      target.x = 0.5 + Math.sin(t * 0.3) * 0.3;
      target.y = 0.5 + Math.cos(t * 0.23) * 0.25;
      target.hover = 1;
    }
    u.uMouse.value.x += (target.x - u.uMouse.value.x) * 0.06;
    u.uMouse.value.y += (target.y - u.uMouse.value.y) * 0.06;
    u.uHover.value += (target.hover - u.uHover.value) * 0.05;
    u.uTime.value = t;
    renderer.render(scene, camera);
  };
  frame();
}
