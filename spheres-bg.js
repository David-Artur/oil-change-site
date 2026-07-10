import * as THREE from 'https://esm.sh/three@0.160.0';
import { RoomEnvironment } from 'https://esm.sh/three@0.160.0/examples/jsm/environments/RoomEnvironment.js';
window.__spheres = 'imported';

function init(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearAlpha(0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  const sizeEl = () => ({ w: canvas.clientWidth || window.innerWidth, h: canvas.clientHeight || window.innerHeight });
  let { w, h } = sizeEl();
  renderer.setSize(w, h, false);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
  camera.position.set(0, 0, 18);
  camera.lookAt(0, 0, 0);

  const amb = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(amb);
  const key = new THREE.DirectionalLight(0xffd9a0, 1.6);
  key.position.set(5, 10, 8);
  scene.add(key);
  const warm = new THREE.DirectionalLight(0xff8a2a, 1.1);
  warm.position.set(-6, -2, 4);
  scene.add(warm);

  const group = new THREE.Group();
  scene.add(group);

  // warm amber palette on dark theme — alternating glass / glossy
  const palette = [
    0xF5A623, 0xF3E4CB, 0xE8871A, 0xFFC978,
    0xC77A2E, 0xF5A623, 0xF3E4CB, 0xE8871A,
  ];
  const materials = palette.map((c, i) => {
    if (i % 2 === 0) {
      return new THREE.MeshPhysicalMaterial({
        color: c, roughness: 0.05, metalness: 0.0,
        transmission: 0.9, thickness: 1.5, ior: 1.45,
        envMapIntensity: 1.2, transparent: true, opacity: 1.0,
        attenuationColor: new THREE.Color(c), attenuationDistance: 2.2,
        specularIntensity: 0.6, specularColor: new THREE.Color(0xffffff),
      });
    }
    return new THREE.MeshPhysicalMaterial({
      color: c, roughness: 0.12, metalness: 0.45,
      envMapIntensity: 1.6, reflectivity: 1.0,
      specularIntensity: 1.0, specularColor: new THREE.Color(0xffffff),
    });
  });

  const spheres = [];
  const COUNT = 40;
  const DAMPING = 0.96;
  const SPRING = 0.002;
  const MOUSE_RADIUS = 4.0;
  const MOUSE_STRENGTH = 0.32;

  const raycaster = new THREE.Raycaster();
  const mouseNDC = new THREE.Vector2(-10, -10);
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const mouse3D = new THREE.Vector3();
  let mouseActive = false;

  const randInSphere = (radius) => {
    const u = Math.random(), v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = radius * Math.cbrt(Math.random());
    return {
      x: r * Math.sin(phi) * Math.cos(theta),
      y: r * Math.sin(phi) * Math.sin(theta) * 0.7,
      z: r * Math.cos(phi) * 0.7,
    };
  };

  for (let i = 0; i < COUNT; i++) {
    const radius = 0.4 + Math.random() * 0.85;
    const pos = randInSphere(4.5);
    const geo = new THREE.SphereGeometry(radius, 32, 32);
    const mesh = new THREE.Mesh(geo, materials[i % materials.length]);
    mesh.position.set(pos.x, pos.y, pos.z);
    group.add(mesh);
    spheres.push({
      mesh, basePos: { ...pos }, velocity: { x: 0, y: 0, z: 0 },
      radius, phase: Math.random() * Math.PI * 2,
      floatSpeed: 0.3 + Math.random() * 0.4, floatAmp: 0.02 + Math.random() * 0.04,
      mass: radius * radius,
    });
  }

  const resolveCollisions = () => {
    for (let i = 0; i < spheres.length; i++) {
      for (let j = i + 1; j < spheres.length; j++) {
        const a = spheres[i], b = spheres[j];
        const dx = a.mesh.position.x - b.mesh.position.x;
        const dy = a.mesh.position.y - b.mesh.position.y;
        const dz = a.mesh.position.z - b.mesh.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const minDist = (a.radius + b.radius) * 1.05;
        if (dist < minDist && dist > 0.001) {
          const overlap = (minDist - dist) * 0.5;
          const nx = dx / dist, ny = dy / dist, nz = dz / dist;
          a.mesh.position.x += nx * overlap; a.mesh.position.y += ny * overlap; a.mesh.position.z += nz * overlap;
          b.mesh.position.x -= nx * overlap; b.mesh.position.y -= ny * overlap; b.mesh.position.z -= nz * overlap;
          const totalMass = a.mass + b.mass;
          const dot = (a.velocity.x - b.velocity.x) * nx + (a.velocity.y - b.velocity.y) * ny + (a.velocity.z - b.velocity.z) * nz;
          if (dot > 0) continue;
          const impulse = -(1.6) * dot / totalMass;
          a.velocity.x += impulse * b.mass * nx; a.velocity.y += impulse * b.mass * ny; a.velocity.z += impulse * b.mass * nz;
          b.velocity.x -= impulse * a.mass * nx; b.velocity.y -= impulse * a.mass * ny; b.velocity.z -= impulse * a.mass * nz;
        }
      }
    }
  };

  for (let p = 0; p < 20; p++) resolveCollisions();
  spheres.forEach(s => { s.basePos.x = s.mesh.position.x; s.basePos.y = s.mesh.position.y; s.basePos.z = s.mesh.position.z; });

  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    if (e.clientY >= rect.top && e.clientY <= rect.bottom && e.clientX >= rect.left && e.clientX <= rect.right) {
      mouse.tx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      mouse.ty = -((e.clientY - rect.top) / rect.height - 0.5) * 2;
      mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      mouseActive = true;
    } else {
      mouseActive = false;
    }
  }, { passive: true });

  const applyMouseForce = () => {
    if (!mouseActive) return;
    raycaster.setFromCamera(mouseNDC, camera);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    mouse3D.copy(hit);
    spheres.forEach(s => {
      const dx = s.mesh.position.x - mouse3D.x;
      const dy = s.mesh.position.y - mouse3D.y;
      const dz = s.mesh.position.z - mouse3D.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < MOUSE_RADIUS && dist > 0.01) {
        const force = (1 - dist / MOUSE_RADIUS) * MOUSE_STRENGTH;
        s.velocity.x += (dx / dist) * force;
        s.velocity.y += (dy / dist) * force;
        s.velocity.z += (dz / dist) * force;
      }
    });
  };

  const clock = new THREE.Clock();
  let theta = 0, targetTheta = 0, phi = Math.PI / 2, targetPhi = Math.PI / 2;

  const renderFrame = () => {
    window.__spFrames = (window.__spFrames || 0) + 1;
    const t = clock.getElapsedTime();
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;

    targetTheta = t * 0.15 + mouse.x * 0.25;
    targetPhi = Math.PI / 2 - (Math.sin(t * 0.08) * 0.1 + mouse.y * 0.12);
    targetPhi = Math.max(0.3, Math.min(Math.PI - 0.3, targetPhi));
    theta += (targetTheta - theta) * 0.03;
    phi += (targetPhi - phi) * 0.03;

    applyMouseForce();
    spheres.forEach(s => {
      s.velocity.x += (s.basePos.x - s.mesh.position.x) * SPRING;
      s.velocity.y += (s.basePos.y - s.mesh.position.y) * SPRING;
      s.velocity.z += (s.basePos.z - s.mesh.position.z) * SPRING;
    });

    spheres.forEach(s => {
      const floatY = Math.sin(t * s.floatSpeed + s.phase) * s.floatAmp;
      const floatX = Math.cos(t * s.floatSpeed * 0.7 + s.phase) * s.floatAmp * 0.5;
      s.velocity.x *= DAMPING; s.velocity.y *= DAMPING; s.velocity.z *= DAMPING;
      s.mesh.position.x += s.velocity.x + floatX * 0.05;
      s.mesh.position.y += s.velocity.y + floatY * 0.05;
      s.mesh.position.z += s.velocity.z;
      const b = 8;
      s.mesh.position.x = Math.max(-b, Math.min(b, s.mesh.position.x));
      s.mesh.position.y = Math.max(-b, Math.min(b, s.mesh.position.y));
      s.mesh.position.z = Math.max(-b, Math.min(b, s.mesh.position.z));
    });
    for (let p = 0; p < 3; p++) resolveCollisions();

    const breathe = 1 + Math.sin(t * 0.4) * 0.008;
    group.scale.set(breathe, breathe, breathe);
    group.rotation.set(-(phi - Math.PI / 2), theta, 0);

    renderer.render(scene, camera);
  };

  const tick = () => { requestAnimationFrame(tick); renderFrame(); };
  tick();
  setInterval(renderFrame, 250);

  const onResize = () => {
    const s = sizeEl();
    w = s.w; h = s.h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  window.addEventListener('resize', onResize);
}

const waitFor = () => {
  const c = document.getElementById('spheres-bg-canvas');
  if (c && (c.clientWidth || c.clientHeight)) init(c);
  else requestAnimationFrame(waitFor);
};
waitFor();
