import * as THREE from 'https://esm.sh/three@0.160.0';
import { RoomEnvironment } from 'https://esm.sh/three@0.160.0/examples/jsm/environments/RoomEnvironment.js';
window.__spheres = 'imported';

function init(canvas) {
  const MOBILE = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MOBILE ? 1.5 : 2));
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

  // Visible half-height/width at z=0, so the spawn area and travel bounds actually
  // scale with the screen's aspect ratio instead of a fixed cube — on a wide desktop
  // monitor that means spheres can spread across the full width instead of bunching
  // in a narrow central column while the left/right edges sit empty.
  const halfHeight = Math.tan((camera.fov * Math.PI / 180) / 2) * camera.position.z;
  let xSpread = 1;
  const updateSpread = () => {
    const halfWidth = halfHeight * camera.aspect;
    xSpread = Math.min(3.2, Math.max(1, (halfWidth * 0.8) / 4.5));
  };
  updateSpread();

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
      // transmission (true glass refraction) is expensive — skip it on mobile GPUs
      // and fake the glassy look with plain transparency instead.
      if (MOBILE) {
        return new THREE.MeshPhysicalMaterial({
          color: c, roughness: 0.1, metalness: 0.0,
          transparent: true, opacity: 0.82,
          envMapIntensity: 1.1, specularIntensity: 0.6, specularColor: new THREE.Color(0xffffff),
        });
      }
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
  const COUNT = MOBILE ? 20 : 28;
  const SEGMENTS = MOBILE ? 16 : 32;
  const DAMPING = 0.96;
  const SPRING = 0.0035;
  const MAX_SPEED = 0.16;
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

  const FLYIN_DURATION = 1.7; // seconds
  const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

  const spawnSphere = (flyIn) => {
    const radius = 0.4 + Math.random() * 0.85;
    const pos = randInSphere(4.5);
    pos.x *= xSpread;
    const matIndex = Math.floor(Math.random() * materials.length);
    const geo = new THREE.SphereGeometry(radius, SEGMENTS, SEGMENTS);
    const mesh = new THREE.Mesh(geo, materials[matIndex]);

    let flyInInfo = null;
    let startX = pos.x, startY = pos.y, startZ = pos.z;
    if (flyIn) {
      // start well beyond the visible bounds, in a random direction, and
      // ease in toward its real resting spot over FLYIN_DURATION seconds
      const bx = 8 * xSpread, by = 8;
      const angle = Math.random() * Math.PI * 2;
      const reach = 1.5 + Math.random() * 0.6;
      startX = Math.cos(angle) * bx * reach;
      startY = Math.sin(angle) * by * reach;
      flyInInfo = { fromX: startX, fromY: startY, fromZ: startZ, elapsed: 0 };
    }
    mesh.position.set(startX, startY, startZ);
    group.add(mesh);
    const entry = {
      mesh, basePos: { ...pos }, velocity: { x: 0, y: 0, z: 0 },
      radius, phase: Math.random() * Math.PI * 2,
      floatSpeed: 0.3 + Math.random() * 0.4, floatAmp: 0.02 + Math.random() * 0.04,
      mass: radius * radius,
      flyIn: flyInInfo,
    };
    spheres.push(entry);
    return entry;
  };

  for (let i = 0; i < COUNT; i++) spawnSphere(false);

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
  const updateFromPoint = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom && clientX >= rect.left && clientX <= rect.right) {
      mouse.tx = ((clientX - rect.left) / rect.width - 0.5) * 2;
      mouse.ty = -((clientY - rect.top) / rect.height - 0.5) * 2;
      mouseNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouseNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      mouseActive = true;
    } else {
      mouseActive = false;
    }
  };

  window.addEventListener('mousemove', (e) => updateFromPoint(e.clientX, e.clientY), { passive: true });

  // touch support — dragging a finger over the spheres pushes them, same as the mouse
  window.addEventListener('touchstart', (e) => {
    if (e.touches.length) updateFromPoint(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (e.touches.length) updateFromPoint(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  window.addEventListener('touchend', () => { mouseActive = false; }, { passive: true });

  // scroll support — scrolling the page (the main touch gesture on mobile) gently nudges the spheres.
  // Kept small on purpose: the spring force pulls everything back to center, this is just a light stir.
  let lastScrollY = window.scrollY;
  window.addEventListener('scroll', () => {
    const rect = canvas.getBoundingClientRect();
    const dy = window.scrollY - lastScrollY;
    lastScrollY = window.scrollY;
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) return; // header out of view — ignore
    const kick = Math.max(-0.35, Math.min(0.35, dy * 0.008));
    if (!kick) return;
    spheres.forEach(s => {
      s.velocity.x += (Math.random() - 0.5) * Math.abs(kick) * 0.05;
      s.velocity.y += -kick * 0.06;
      s.velocity.z += (Math.random() - 0.5) * Math.abs(kick) * 0.03;
    });
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

  // A permanent, gentle "keep clear" zone roughly where the hero headline sits
  // (upper-center of the scene), so spheres drift and orbit around the text
  // instead of piling up behind it.
  const TEXT_ZONE = new THREE.Vector3(0, 1.4, 0.5);
  const TEXT_RADIUS = 7.5;
  const TEXT_STRENGTH = 0.22;
  const applyTextAvoidance = () => {
    spheres.forEach(s => {
      const dx = s.mesh.position.x - TEXT_ZONE.x;
      const dy = s.mesh.position.y - TEXT_ZONE.y;
      const dz = s.mesh.position.z - TEXT_ZONE.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < TEXT_RADIUS && dist > 0.01) {
        const force = (1 - dist / TEXT_RADIUS) * TEXT_STRENGTH;
        s.velocity.x += (dx / dist) * force;
        s.velocity.y += (dy / dist) * force;
        s.velocity.z += (dz / dist) * force;
      }
    });
  };

  // Spheres are gently drawn toward the "Book now" button in the sticky nav —
  // it's the one CTA that's always on screen, so it's the natural magnet target.
  let buttonZone = null;
  const updateButtonZone = () => {
    const btn = document.getElementById('nav-book-btn');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    if (!r.width) return;
    const ndc = new THREE.Vector2(
      ((r.left + r.width / 2) / window.innerWidth) * 2 - 1,
      -((r.top + r.height / 2) / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, hit)) buttonZone = hit.clone();
  };
  updateButtonZone();
  window.addEventListener('resize', updateButtonZone);

  const BTN_RADIUS = 7.5;
  const BTN_STRENGTH = 0.022;
  const applyButtonAttraction = () => {
    if (!buttonZone) return;
    spheres.forEach(s => {
      const dx = buttonZone.x - s.mesh.position.x;
      const dy = buttonZone.y - s.mesh.position.y;
      const dz = buttonZone.z - s.mesh.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > 0.01 && dist < BTN_RADIUS) {
        const force = (1 - dist / BTN_RADIUS) * BTN_STRENGTH;
        s.velocity.x += (dx / dist) * force;
        s.velocity.y += (dy / dist) * force;
        s.velocity.z += (dz / dist) * force;
      }
    });
  };

  // --- Pop a sphere on click/tap ---------------------------------------
  // A click is only accepted if the pointer barely moved and released quickly —
  // that's what separates a deliberate tap from a scroll/drag gesture, so
  // flicking through the page on mobile never accidentally pops a sphere.
  const POP_MOVE_LIMIT = 8; // px
  const POP_TIME_LIMIT = 500; // ms
  let downAt = null;

  // Blend modes and multiple overlapping animated layers are expensive to
  // composite on mobile GPUs — keep stains cheap there (no blend-mode, one
  // shape, shorter animation) and cap how many can be alive at once so
  // rapid tapping can't pile up dozens of animating elements.
  const activeStains = [];
  const MAX_STAINS = MOBILE ? 3 : 6;
  const BLOB_RADII = [
    '58% 42% 63% 37% / 41% 55% 45% 59%',
    '46% 54% 38% 62% / 60% 40% 62% 38%',
    '63% 37% 55% 45% / 48% 58% 42% 52%',
    '50% 50% 68% 32% / 55% 45% 55% 45%',
  ];
  const randBlob = () => BLOB_RADII[Math.floor(Math.random() * BLOB_RADII.length)];

  // One CSS @keyframes animation, declared once, driven entirely by the
  // compositor — no JS touching styles mid-flight (that pattern of reassigning
  // `transition`/`transform` partway through was forcing extra style recalcs
  // right when the page was already busy). The drip distance varies per stain
  // via a custom property read inside the keyframes.
  if (!document.getElementById('oil-stain-keyframes')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'oil-stain-keyframes';
    styleEl.textContent =
      '@keyframes oilStainLife {' +
      '0% { opacity: 0; transform: scale(.3) translateY(0) scaleY(1); }' +
      '10% { opacity: .9; transform: scale(1) translateY(0) scaleY(1); }' +
      '100% { opacity: 0; transform: scale(.62) translateY(var(--drip)) scaleY(1.8); }' +
      '}';
    document.head.appendChild(styleEl);
  }

  const spawnOilStain = (clientX, clientY, radius, colorHex) => {
    while (activeStains.length >= MAX_STAINS) {
      const oldest = activeStains.shift();
      if (oldest.parentNode) oldest.remove();
    }

    const size = Math.max(30, Math.round(radius * (MOBILE ? 78 : 100)));
    const dripDuration = MOBILE ? 2000 : 3400;
    const dripPx = Math.round(90 + radius * 130);
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:fixed; left:' + (clientX - size) + 'px; top:' + (clientY - size) + 'px; ' +
      'width:' + (size * 2) + 'px; height:' + (size * 2) + 'px; pointer-events:none; z-index:40; ' +
      '--drip:' + dripPx + 'px; opacity:0; ' +
      (MOBILE ? '' : 'mix-blend-mode:screen; ') +
      'animation: oilStainLife ' + dripDuration + 'ms cubic-bezier(.3,.7,.4,1) forwards;';

    const main = document.createElement('div');
    main.style.cssText =
      'position:absolute; left:22%; top:22%; width:66%; height:66%; border-radius:' + randBlob() + '; ' +
      'background: radial-gradient(circle at 35% 30%, ' + colorHex + 'E6, ' + colorHex + '90 55%, ' + colorHex + '10 80%);';
    wrap.appendChild(main);

    // a couple of small splatter droplets — skipped on mobile to keep the DOM light
    if (!MOBILE) {
      const dropletCount = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < dropletCount; i++) {
        const d = document.createElement('div');
        const dSize = 16 + Math.random() * 20;
        const ang = Math.random() * Math.PI * 2;
        const dist = size * 0.5 + Math.random() * size * 0.35;
        d.style.cssText =
          'position:absolute; width:' + dSize + 'px; height:' + dSize + 'px; border-radius:' + randBlob() + '; ' +
          'left:' + (size + Math.cos(ang) * dist - dSize / 2) + 'px; top:' + (size + Math.sin(ang) * dist - dSize / 2) + 'px; ' +
          'background: radial-gradient(circle at 35% 30%, ' + colorHex + 'CC, ' + colorHex + '60 60%, ' + colorHex + '00 80%);';
        wrap.appendChild(d);
      }
    }

    document.body.appendChild(wrap);
    activeStains.push(wrap);

    const cleanup = () => {
      wrap.remove();
      const idx = activeStains.indexOf(wrap);
      if (idx !== -1) activeStains.splice(idx, 1);
    };
    wrap.addEventListener('animationend', cleanup);
    setTimeout(cleanup, dripDuration + 300); // safety net if animationend doesn't fire
  };

  const BLAST_RADIUS = 3.4;
  const BLAST_STRENGTH = 0.85;
  const popSphere = (index, clientX, clientY) => {
    const s = spheres[index];
    if (!s) return;
    const pos = s.mesh.position.clone();
    const colorHex = '#' + s.mesh.material.color.getHexString();

    spheres.forEach((other, i) => {
      if (i === index) return;
      const dx = other.mesh.position.x - pos.x;
      const dy = other.mesh.position.y - pos.y;
      const dz = other.mesh.position.z - pos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < BLAST_RADIUS && dist > 0.01) {
        const force = (1 - dist / BLAST_RADIUS) * BLAST_STRENGTH;
        other.velocity.x += (dx / dist) * force;
        other.velocity.y += (dy / dist) * force;
        other.velocity.z += (dz / dist) * force;
      }
    });

    group.remove(s.mesh);
    s.mesh.geometry.dispose();
    spheres.splice(index, 1);

    spawnOilStain(clientX, clientY, s.radius, colorHex);

    // keep the scene populated — a fresh sphere flies in from off-screen a little later
    setTimeout(() => { if (spheres.length < COUNT) spawnSphere(true); }, 2200 + Math.random() * 1800);
  };

  // Popping is desktop-only for now — on mobile it caused both a real perf
  // problem and (after a since-reverted "optimization") broken hit-testing,
  // so it's simplest and most reliable to just not offer it there.
  const POP_ENABLED = !MOBILE;

  const tryPopAt = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    const meshes = spheres.map(s => s.mesh);
    const hits = raycaster.intersectObjects(meshes);
    if (!hits.length) return;
    const idx = spheres.findIndex(s => s.mesh === hits[0].object);
    if (idx !== -1) popSphere(idx, clientX, clientY);
  };

  if (POP_ENABLED) {
    window.addEventListener('pointerdown', (e) => {
      downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    }, { passive: true });

    window.addEventListener('pointerup', (e) => {
      if (!downAt) return;
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      const elapsed = performance.now() - downAt.t;
      downAt = null;
      if (moved > POP_MOVE_LIMIT || elapsed > POP_TIME_LIMIT) return; // was a drag/scroll, not a tap

      // don't hijack clicks on actual links/buttons/inputs
      const el = e.target;
      if (el && el.closest && el.closest('a, button, input, select, textarea, [role="button"]')) return;

      tryPopAt(e.clientX, e.clientY);
    }, { passive: true });
  }

  // Manual, capped virtual clock instead of THREE.Clock's wall-clock elapsed time.
  // Backgrounded tabs pause rAF entirely; on return, a raw elapsed-time read would
  // jump forward by however long the tab was hidden, snapping targetTheta/targetPhi
  // far ahead and making the spheres visibly "spin up" fast to catch up. Capping the
  // per-frame delta means a long pause just resumes smoothly instead of lurching.
  let lastFrameAt = performance.now();
  let virtualTime = 0;
  let theta = 0, targetTheta = 0, phi = Math.PI / 2, targetPhi = Math.PI / 2;

  const renderFrame = () => {
    window.__spFrames = (window.__spFrames || 0) + 1;
    const now = performance.now();
    let dt = (now - lastFrameAt) / 1000;
    lastFrameAt = now;
    dt = Math.min(Math.max(dt, 0), 1 / 30);
    virtualTime += dt;
    const t = virtualTime;
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;

    targetTheta = t * 0.2 + mouse.x * 0.25;
    targetPhi = Math.PI / 2 - (Math.sin(t * 0.1) * 0.1 + mouse.y * 0.12);
    targetPhi = Math.max(0.3, Math.min(Math.PI - 0.3, targetPhi));
    theta += (targetTheta - theta) * 0.03;
    phi += (targetPhi - phi) * 0.03;

    applyMouseForce();
    applyTextAvoidance();
    applyButtonAttraction();
    spheres.forEach(s => {
      if (s.flyIn) return; // still easing in from off-screen — plain physics kicks in once it arrives
      s.velocity.x += (s.basePos.x - s.mesh.position.x) * SPRING;
      s.velocity.y += (s.basePos.y - s.mesh.position.y) * SPRING;
      s.velocity.z += (s.basePos.z - s.mesh.position.z) * SPRING;
    });

    spheres.forEach(s => {
      if (s.flyIn) {
        s.flyIn.elapsed += dt;
        const et = easeOutCubic(Math.min(1, s.flyIn.elapsed / FLYIN_DURATION));
        s.mesh.position.x = s.flyIn.fromX + (s.basePos.x - s.flyIn.fromX) * et;
        s.mesh.position.y = s.flyIn.fromY + (s.basePos.y - s.flyIn.fromY) * et;
        s.mesh.position.z = s.flyIn.fromZ + (s.basePos.z - s.flyIn.fromZ) * et;
        if (et >= 1) s.flyIn = null;
        return;
      }
      const floatY = Math.sin(t * s.floatSpeed + s.phase) * s.floatAmp;
      const floatX = Math.cos(t * s.floatSpeed * 0.7 + s.phase) * s.floatAmp * 0.5;
      s.velocity.x *= DAMPING; s.velocity.y *= DAMPING; s.velocity.z *= DAMPING;
      const speed = Math.hypot(s.velocity.x, s.velocity.y, s.velocity.z);
      if (speed > MAX_SPEED) {
        const scale = MAX_SPEED / speed;
        s.velocity.x *= scale; s.velocity.y *= scale; s.velocity.z *= scale;
      }
      s.mesh.position.x += s.velocity.x + floatX * 0.05;
      s.mesh.position.y += s.velocity.y + floatY * 0.05;
      s.mesh.position.z += s.velocity.z;
      const bx = 8 * xSpread, b = 8;
      s.mesh.position.x = Math.max(-bx, Math.min(bx, s.mesh.position.x));
      s.mesh.position.y = Math.max(-b, Math.min(b, s.mesh.position.y));
      s.mesh.position.z = Math.max(-b, Math.min(b, s.mesh.position.z));
    });
    for (let p = 0; p < 3; p++) resolveCollisions();

    const breathe = 1 + Math.sin(t * 0.4) * 0.008;
    group.scale.set(breathe, breathe, breathe);
    group.rotation.set(-(phi - Math.PI / 2), theta, 0);

    renderer.render(scene, camera);
  };

  const tick = () => {
    requestAnimationFrame(tick);
    if (document.hidden) return; // saves GPU/battery, and avoids a big dt on return
    renderFrame();
  };
  tick();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) lastFrameAt = performance.now();
  });

  const onResize = () => {
    const s = sizeEl();
    w = s.w; h = s.h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    updateSpread();
  };
  window.addEventListener('resize', onResize);
}

const waitFor = () => {
  const c = document.getElementById('spheres-bg-canvas');
  if (c && (c.clientWidth || c.clientHeight)) init(c);
  else requestAnimationFrame(waitFor);
};
waitFor();
