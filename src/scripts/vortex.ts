import * as THREE from 'three';

// Project cards spiralling out of depth past the camera (idea: bleibtgleich.dev "Work" vortex).
// Scroll-driven only: render(progress) draws one frame, so there is no idle loop.
const DEPTH = 34; // how far back the cloud starts
const TURNS = 0.35; // swirl of the whole cloud over the scroll (×π; past ~0.5 cards read upside down)
const CARD = [1.2, 0.9]; // world size (4:3)

type Project = { name: string; year: string; stack: string[]; image: string };

export function initVortex(canvas: HTMLCanvasElement, projects: Project[]) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(1); // cards are in motion; 1x is indistinguishable
  const css = getComputedStyle(document.documentElement);
  const colors = {
    bg: css.getPropertyValue('--bg').trim() || '#0b0b0c',
    bg2: css.getPropertyValue('--bg-2').trim() || '#141416',
    fg: css.getPropertyValue('--fg').trim() || '#f2f0ea',
    accent: css.getPropertyValue('--accent').trim() || '#2e5eb6',
  };

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(colors.bg, 8, DEPTH * 0.9); // far cards fade into the page
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const cloud = new THREE.Group();
  scene.add(cloud);

  const count = innerWidth < 768 ? 12 : 21;
  const geo = new THREE.PlaneGeometry(CARD[0], CARD[1]);
  const textures = projects.map((p) => cardTexture(p, colors));
  const loader = new THREE.TextureLoader();
  projects.forEach((p, i) => p.image && loader.load(p.image, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    // swap the typographic face for the real screenshot on every copy of this project
    cloud.children.forEach((c, k) => {
      if (k % projects.length !== i) return;
      const mat = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.map = t;
      mat.needsUpdate = true;
    });
    render(last);
  }));

  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: textures[i % textures.length], side: THREE.DoubleSide, transparent: true });
    const card = new THREE.Mesh(geo, mat);
    const r = 1.4 + ((i * 7) % 5) * 0.35; // deterministic spread, no Math.random flicker between builds
    card.position.set(Math.cos(i * golden) * r, Math.sin(i * golden) * r * 0.7, -((i + 0.5) / count) * DEPTH);
    card.rotation.set((((i * 3) % 7) - 3) * 0.08, (((i * 5) % 7) - 3) * 0.12, (((i * 11) % 7) - 3) * 0.05);
    cloud.add(card);
  }

  let last = 0;
  const render = (p: number) => {
    last = p;
    camera.position.z = 6 - p * (DEPTH + 4); // fly through the cloud
    cloud.rotation.z = p * TURNS * Math.PI;
    renderer.render(scene, camera);
  };

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render(last);
  };
  new ResizeObserver(resize).observe(canvas);
  resize();
  return render;
}

// Typographic card face: used until (or unless) a project screenshot exists.
function cardTexture(p: Project, c: { bg2: string; fg: string; accent: string }) {
  const W = 640, H = 480;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = c.bg2;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgb(255 255 255 / 0.18)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, W - 3, H - 3);
  g.fillStyle = c.accent;
  g.fillRect(0, 0, W, 14);
  g.fillStyle = c.fg;
  g.textBaseline = 'top';
  g.font = '700 30px Inter, system-ui, sans-serif';
  g.globalAlpha = 0.55;
  g.fillText(p.year, 40, 48);
  g.globalAlpha = 1;
  g.font = '400 92px Anton, Impact, sans-serif';
  const words = p.name.toUpperCase().split(' ');
  words.forEach((w, i) => g.fillText(w, 40, 110 + i * 96, W - 80));
  g.font = '500 26px Inter, system-ui, sans-serif';
  g.globalAlpha = 0.6;
  g.fillText(p.stack.join('  /  '), 40, H - 70, W - 80);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
