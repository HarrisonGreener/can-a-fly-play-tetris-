// The 3D world: a stark white bunker, a black desk, a beige box computer whose
// CRT shows the live game, the fly at the keyboard, and a camera that drifts
// between shots. World units are fly millimetres; z is up.

(function () {
  const ARROWS = {
    // key centres (x towards the screen, y to the fly's left)
    left: [1.3, 0.62], drop: [1.3, 0], right: [1.3, -0.62], rotate: [1.92, 0],
  };
  const KEY_LEG = { left: 'lf', drop: 'lf', right: 'rf', rotate: 'rf' };
  const HOME = { lf: 'left', rf: 'right' };
  const KEY_TOP = 0.34, KEY_TRAVEL = 0.07;
  const SCREEN = { x: 4.12, y: 1.6, z: 3.15, w: 3.36, h: 2.52 };

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  class World {
    constructor(canvas, flyModel) {
      const THREE = window.THREE, A = window.THREE_ADDONS;
      this.THREE = THREE;
      this.canvas = canvas;
      const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.toneMappingExposure = 1.0;
      const scene = (this.scene = new THREE.Scene());
      scene.background = new THREE.Color(0xf2f2f0);
      scene.fog = new THREE.Fog(0xf2f2f0, 90, 260);
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new A.RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.35;

      const camera = (this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 600));
      camera.up.set(0, 0, 1);
      this.controls = new A.OrbitControls(camera, canvas);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.minDistance = 1.5;
      this.controls.maxDistance = 70;
      this.controls.maxPolarAngle = Math.PI * 0.62;

      this.buildRoom();
      this.buildDesk();
      this.buildComputer();
      this.buildKeyboard();
      this.buildFly(flyModel);
      this.buildLights();

      const composer = (this.composer = new A.EffectComposer(renderer));
      composer.addPass(new A.RenderPass(scene, camera));
      this.bloom = new A.UnrealBloomPass(new THREE.Vector2(512, 512), 0.35, 0.25, 3.2);
      composer.addPass(this.bloom);
      composer.addPass(new A.OutputPass());

      this.director = new Director(this);
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }

    // ---------------------------------------------------------------- room
    buildRoom() {
      const THREE = this.THREE, s = this.scene;
      const FLOOR = -24, CEIL = 30, W = 170, Dp = 120;
      // Walls the camera must stay inside, and solid boxes it must stay out of.
      this.bounds = { x0: 10 - W / 2, x1: 10 + W / 2, y0: -Dp / 2, y1: Dp / 2, z0: FLOOR, z1: CEIL };
      this.solids = [];
      this.floorZ = FLOOR;
      const concrete = concreteTexture(THREE);
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(W, Dp),
        new THREE.MeshPhysicalMaterial({ color: 0xf4f4f2, roughness: 0.3, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.2, roughnessMap: concrete }),
      );
      floor.position.set(10, 0, FLOOR);
      floor.receiveShadow = true;
      s.add(floor);
      const wallMat = new THREE.MeshStandardMaterial({ color: 0xeeeeec, roughness: 0.92, map: concrete });
      const ceilMat = new THREE.MeshStandardMaterial({ color: 0xe6e6e4, roughness: 0.95 });
      const wall = (w, h, x, y, z, rx, rz) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
        m.position.set(x, y, z); m.rotation.set(rx, 0, rz);
        m.receiveShadow = true; s.add(m);
      };
      wall(W, CEIL - FLOOR, 10, Dp / 2, (CEIL + FLOOR) / 2, Math.PI / 2, Math.PI);
      wall(W, CEIL - FLOOR, 10, -Dp / 2, (CEIL + FLOOR) / 2, Math.PI / 2, 0);
      wall(Dp, CEIL - FLOOR, 10 + W / 2, 0, (CEIL + FLOOR) / 2, Math.PI / 2, Math.PI / 2);
      wall(Dp, CEIL - FLOOR, 10 - W / 2, 0, (CEIL + FLOOR) / 2, Math.PI / 2, -Math.PI / 2);
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, Dp), ceilMat);
      ceil.position.set(10, 0, CEIL); ceil.rotation.x = Math.PI; s.add(ceil);
      // Long rows of strip lights, like an underground garage.
      const strip = new THREE.MeshBasicMaterial({ color: 0xffffff });
      strip.color.multiplyScalar(9);
      const stripGeo = new THREE.BoxGeometry(150, 0.8, 0.25);
      for (let y = -48; y <= 48; y += 12) {
        const m = new THREE.Mesh(stripGeo, strip);
        m.position.set(10, y, CEIL - 0.2);
        s.add(m);
      }
      // Square concrete pillars receding into the distance.
      const pillarMat = new THREE.MeshStandardMaterial({ color: 0xf0f0ee, roughness: 0.85 });
      const pillarGeo = new THREE.BoxGeometry(4, 4, CEIL - FLOOR);
      for (const x of [-50, -20, 40, 70]) for (const y of [-34, 34]) {
        this.solids.push({ x0: x - 2, x1: x + 2, y0: y - 2, y1: y + 2, z0: FLOOR, z1: CEIL });
        const p = new THREE.Mesh(pillarGeo, pillarMat);
        p.position.set(x, y, (CEIL + FLOOR) / 2);
        p.castShadow = true; p.receiveShadow = true; s.add(p);
      }
      // Painted floor lines.
      const lineMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
      for (const y of [-26, 26]) {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(150, 0.35), lineMat);
        l.position.set(10, y, FLOOR + 0.02); s.add(l);
      }
    }

    buildDesk() {
      const THREE = this.THREE;
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(22, 13, 0.6),
        new THREE.MeshPhysicalMaterial({ color: 0x030303, roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.35, envMapIntensity: 0.08 }),
      );
      top.position.set(3, 1.5, -0.3);
      top.receiveShadow = true; top.castShadow = true;
      this.scene.add(top);
      const steel = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.5, metalness: 0.6 });
      for (const [x, y] of [[-7.2, -4.2], [13.2, -4.2], [-7.2, 7.2], [13.2, 7.2]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 23.4), steel);
        leg.position.set(x, y, -12.3);
        leg.castShadow = true; this.scene.add(leg);
      }
    }

    buildComputer() {
      const THREE = this.THREE, A = window.THREE_ADDONS, g = new THREE.Group();
      const beige = new THREE.MeshPhysicalMaterial({ color: 0xd9cfb4, roughness: 0.55, clearcoat: 0.15 });
      const beigeDark = new THREE.MeshStandardMaterial({ color: 0xbfb393, roughness: 0.7 });
      const black = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6 });
      const box = (w, d, h, mat, x, y, z, r = 0.12) => {
        const m = new THREE.Mesh(new A.RoundedBoxGeometry(d, w, h, 3, r), mat);
        m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
      };
      // System unit (desktop case) with two floppy drives.
      box(6.4, 4.6, 1.15, beige, 6.2, 1.6, 0.58);
      for (const y of [0.0, 3.1]) {
        box(2.4, 0.08, 0.62, beigeDark, 3.9, y + 0.05, 0.6, 0.03);
        const slot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.7, 0.06), black);
        slot.position.set(3.85, y + 0.05, 0.66); g.add(slot);
        const latch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.28), black);
        latch.position.set(3.85, y + 0.75, 0.6); g.add(latch);
      }
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), new THREE.MeshBasicMaterial({ color: 0x55ff66 }));
      led.position.set(3.88, -1.25, 0.35); g.add(led);
      // CRT monitor: chunky bezel + deep back.
      box(4.7, 2.0, 3.9, beige, 5.15, SCREEN.y, 3.12, 0.2);
      const back = new THREE.Mesh(new A.RoundedBoxGeometry(2.1, 3.5, 3.1, 3, 0.4), beige);
      back.position.set(7.0, SCREEN.y, 3.0); back.castShadow = true; g.add(back);
      box(1.8, 1.6, 0.25, beigeDark, 6.0, SCREEN.y, 1.27, 0.06); // swivel base
      // Recessed dark surround, then the glowing curved screen.
      const recess = new THREE.Mesh(new THREE.BoxGeometry(0.1, SCREEN.w + 0.3, SCREEN.h + 0.3), black);
      recess.position.set(SCREEN.x + 0.04, SCREEN.y, SCREEN.z); g.add(recess);
      const sc = (this.screenCanvas = document.createElement('canvas'));
      sc.width = 640; sc.height = 480;
      const tex = (this.screenTex = new THREE.CanvasTexture(sc));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const geo = new THREE.PlaneGeometry(SCREEN.w, SCREEN.h, 24, 18);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i) / (SCREEN.w / 2), v = p.getY(i) / (SCREEN.h / 2);
        p.setZ(i, 0.13 * (1 - 0.5 * (u * u + v * v)));
      }
      geo.computeVertexNormals();
      const screenMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      screenMat.color.setScalar(3.6);
      const screen = new THREE.Mesh(geo, screenMat);
      screen.position.set(SCREEN.x - 0.02, SCREEN.y, SCREEN.z);
      // Face the fly (-x): texture right -> world -y, texture up -> world +z.
      screen.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
        new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0)));
      g.add(screen);
      // Soft light thrown from the screen onto the fly and desk.
      this.screenLight = new THREE.PointLight(0x9fd4ff, 6, 6, 1.8);
      this.screenLight.position.set(SCREEN.x - 1.6, SCREEN.y, SCREEN.z - 0.6);
      g.add(this.screenLight);
      // Cable to the keyboard.
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(3.95, 3.6, 0.15), new THREE.Vector3(3.6, 4.6, 0.04), new THREE.Vector3(3.2, 5.6, 0.04),
      ]);
      const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.05, 6), black);
      cable.castShadow = true; g.add(cable);
      this.scene.add(g);
    }

    buildKeyboard() {
      const THREE = this.THREE, A = window.THREE_ADDONS;
      const kb = new THREE.Group();
      const beige = new THREE.MeshPhysicalMaterial({ color: 0xd6ccb0, roughness: 0.6, clearcoat: 0.1 });
      const base = new THREE.Mesh(new A.RoundedBoxGeometry(2.3, 7.4, 0.2, 2, 0.06), beige);
      base.position.set(1.95, 2.55, 0.1);
      base.castShadow = true; base.receiveShadow = true; kb.add(base);
      const capGeo = new A.RoundedBoxGeometry(0.5, 0.5, 0.16, 2, 0.05);
      const capMat = new THREE.MeshPhysicalMaterial({ color: 0xece5d2, roughness: 0.45, clearcoat: 0.2 });
      const darkMat = new THREE.MeshPhysicalMaterial({ color: 0x9d9478, roughness: 0.5 });
      this.keys = {};
      const addKey = (x, y, mat, name, label) => {
        const k = new THREE.Mesh(capGeo, mat);
        k.position.set(x, y, KEY_TOP - 0.08);
        k.castShadow = true; k.receiveShadow = true; kb.add(k);
        if (label) {
          const t = labelMesh(THREE, label);
          t.position.set(0, 0, 0.081);
          k.add(t);
        }
        if (name) this.keys[name] = { mesh: k, rest: k.position.z, press: 0 };
      };
      for (const [name, [x, y]] of Object.entries(ARROWS))
        addKey(x, y, darkMat, name, { left: '←', right: '→', rotate: '↑', drop: '↓' }[name]);
      // Main typing block to the fly's left.
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 9; c++) addKey(1.3 + r * 0.56, 1.45 + c * 0.56, r === 0 && c > 1 && c < 7 ? capMat : capMat);
      this.scene.add(kb);
    }

    buildFly(model) {
      const THREE = this.THREE;
      this.fly = new Fly3D(model);
      this.fly.group.position.set(0, 0, 0.12);
      this.fly.group.rotation.set(0, -0.14, 0); // nose tipped up, looking at the screen
      this.scene.add(this.fly.group);
      this.fly.group.updateMatrixWorld(true);
      this.invFly = new THREE.Matrix4().copy(this.fly.group.matrixWorld).invert();
      // Standing feet: mid and hind legs planted on the desk below where they naturally fall.
      this.plant = {};
      const ref = model.reference.neutralJointPositions;
      for (const leg of ['lm', 'rm', 'lh', 'rh']) {
        const w = new THREE.Vector3(...ref[leg + '_tarsus5']).applyMatrix4(this.fly.group.matrixWorld);
        w.z = 0.005;
        this.plant[leg] = w.applyMatrix4(this.invFly).toArray();
      }
      this.gesture = { lf: null, rf: null };
      this.lastPress = -10;
      this.t = 0;
      for (let i = 0; i < 6; i++) this.animateFly(0.016);
    }

    buildLights() {
      const THREE = this.THREE;
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b8b8, 0.75));
      const key = new THREE.DirectionalLight(0xffffff, 3.4);
      key.position.set(-4, 7, 26);
      key.target.position.set(2, 1, 0);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      Object.assign(key.shadow.camera, { left: -9, right: 11, top: 9, bottom: -7, near: 10, far: 45 });
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.01;
      this.scene.add(key, key.target);
      const rim = new THREE.DirectionalLight(0xffffff, 1.4);
      rim.position.set(-14, -10, 8);
      this.scene.add(rim);
    }

    // ---------------------------------------------------------------- fly motion
    press(button) {
      const leg = KEY_LEG[button];
      this.gesture[leg] = { key: button, t: 0 };
      this.lastPress = this.t;
    }
    keyTop(name, depth = 0) {
      const [x, y] = ARROWS[name];
      return new this.THREE.Vector3(x, y, KEY_TOP - depth + 0.03).applyMatrix4(this.invFly).toArray();
    }
    animateFly(dt) {
      const f = this.fly, t = (this.t += dt), a = f.angles;
      const idle = t - this.lastPress > 2.2;
      // Breathing, head and antennae.
      a['c_thorax-c_abdomen12-pitch'] = 0.04 * Math.sin(t * 2.1);
      a['c_thorax-c_head-pitch'] = -0.22 + 0.03 * Math.sin(t * 0.7);
      a['c_thorax-c_head-roll'] = 0.18 + 0.06 * Math.sin(t * 0.43);
      const tw = Math.sin(t * 9) > 0.96 ? 0.12 : 0;
      for (const s of ['l', 'r']) {
        const base = (f.model.neutralDeg[`c_head-${s}_pedicel-pitch`] || 0) * Math.PI / 180;
        a[`c_head-${s}_pedicel-pitch`] = base + 0.05 * Math.sin(t * 1.7 + (s === 'l' ? 0 : 1.3)) + tw;
        const hb = (f.model.neutralDeg[`c_thorax-${s}_haltere-yaw`] || 0) * Math.PI / 180;
        a[`c_thorax-${s}_haltere-yaw`] = hb + 0.08 * Math.sin(t * 7 + (s === 'l' ? 0 : 0.5));
      }
      // Wings: folded, with a nervous flick on DROP.
      const g = this.gesture.lf;
      const flick = g && g.key === 'drop' && g.t < 0.5 ? Math.sin(g.t * Math.PI * 2) * 0.25 : 0;
      f.wingFold(Math.max(0, flick), flick * 25);
      // Front feet: rest on ← and →, tap keys, or groom when bored.
      for (const leg of ['lf', 'rf']) {
        const gs = this.gesture[leg];
        let target;
        const home = this.keyTop(HOME[leg]);
        if (gs) {
          gs.t += dt / 0.24;
          const key = gs.key, p = Math.min(1, gs.t);
          const dest = this.keyTop(key);
          const toward = p < 0.45 ? ease(p / 0.45) : p < 0.6 ? 1 : 1 - ease((p - 0.6) / 0.4);
          const down = p > 0.35 && p < 0.65 ? Math.sin(((p - 0.35) / 0.3) * Math.PI) : 0;
          target = home.map((h, i) => h + (dest[i] - h) * toward);
          const lift = Math.sin(Math.min(1, p / 0.45) * Math.PI) * (key === HOME[leg] ? 0.12 : 0.28) * (p < 0.45 ? 1 : 0);
          target = new this.THREE.Vector3(...target).applyMatrix4(this.fly.group.matrixWorld);
          target.z += lift - down * KEY_TRAVEL;
          target = target.applyMatrix4(this.invFly).toArray();
          this.keys[key].press = down;
          if (gs.t >= 1) { this.gesture[leg] = null; this.keys[key].press = 0; }
        } else if (idle) {
          // Flies rub their front legs together when idle.
          const k = Math.min(1, (t - this.lastPress - 2.2) / 0.6);
          const rub = Math.sin(t * 14) * 0.05;
          const groom = [1.12 + rub, leg === 'lf' ? 0.1 : -0.1, 0.62 + (leg === 'lf' ? rub : -rub)];
          target = home.map((h, i) => h + (groom[i] - h) * ease(k));
        } else target = home;
        f.reach(leg, target, 6);
      }
      for (const leg of ['lm', 'rm', 'lh', 'rh']) f.reach(leg, this.plant[leg], 2);
      f.apply();
      for (const k of Object.values(this.keys)) k.mesh.position.z = k.rest - k.press * KEY_TRAVEL;
    }

    // ---------------------------------------------------------------- frame
    drawScreen(draw) {
      draw(this.screenCanvas.getContext('2d'), this.screenCanvas.width, this.screenCanvas.height);
      this.screenTex.needsUpdate = true;
    }
    resize() {
      const r = this.canvas.getBoundingClientRect();
      if (!r.width) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(r.width, r.height, false);
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(r.width, r.height);
      this.camera.aspect = r.width / r.height;
      this.camera.updateProjectionMatrix();
    }
    /** Stop the camera leaving the room or passing through pillars and the desk. */
    keepCameraInRoom() {
      const p = this.camera.position, b = this.bounds, m = 1.5;
      p.x = Math.min(b.x1 - m, Math.max(b.x0 + m, p.x));
      p.y = Math.min(b.y1 - m, Math.max(b.y0 + m, p.y));
      p.z = Math.min(b.z1 - m, Math.max(b.z0 + m, p.z));
      const solids = this.solids.concat([
        { x0: -8, x1: 14, y0: -5, y1: 8, z0: -0.6, z1: 0 },                  // desk top
        ...[[-7.2, -4.2], [13.2, -4.2], [-7.2, 7.2], [13.2, 7.2]].map(([x, y]) =>
          ({ x0: x - 0.35, x1: x + 0.35, y0: y - 0.35, y1: y + 0.35, z0: b.z0, z1: 0 })), // desk legs
      ]);
      const pad = 0.8;
      for (const s of solids) {
        const lo = [s.x0 - pad, s.y0 - pad, s.z0 - pad], hi = [s.x1 + pad, s.y1 + pad, s.z1 + pad], v = [p.x, p.y, p.z];
        if (v.every((c, i) => c > lo[i] && c < hi[i])) {
          // Push out along the axis with the smallest overlap.
          let best = 0, push = Infinity;
          for (let i = 0; i < 3; i++) {
            const a = v[i] - lo[i], c = hi[i] - v[i];
            if (a < Math.abs(push)) { push = -a; best = i; }
            if (c < Math.abs(push)) { push = c; best = i; }
          }
          v[best] += push;
          p.set(v[0], v[1], v[2]);
        }
      }
    }
    render(dt) {
      this.animateFly(dt);
      this.director.update(dt);
      this.controls.update();
      this.keepCameraInRoom();
      this.screenLight.intensity = 5.5 + Math.random() * 0.6;
      this.composer.render();
    }
  }

  // ------------------------------------------------------------ camera director
  // Slow cinematic drift between framed shots; drag to look around, and it
  // picks the drift back up after a pause.
  const SHOTS = [
    { name: 'wide', pos: [-46, 33, 11], target: [2.5, 1.2, 0.5], drift: [5, -3, 1] },
    { name: 'hero', pos: [3.4, -4.6, 2.2], target: [0.7, 0.2, 1.0], drift: [0.5, 0.5, 0.15] },
    { name: 'shoulder', pos: [-2.9, -1.5, 2.75], target: [4.1, 1.5, 2.55], drift: [0.4, 0.5, 0.0] },
    { name: 'keys', pos: [2.7, 2.8, 1.4], target: [0.95, -0.05, 0.6], drift: [0.25, -0.35, 0.1] },
    { name: 'low', pos: [-1.5, -9.5, 0.7], target: [2.2, 1.0, 1.6], drift: [1.0, 0.6, 0.0] },
    { name: 'top', pos: [0.2, 0.4, 7.0], target: [1.0, 0.0, 0.4], drift: [0.6, -0.4, -0.5] },
  ];
  const SCREEN_SHOT = { pos: [-9.5, -0.4, 4.9], target: [3.4, 1.6, 2.0], drift: [0.4, 0.2, 0] };

  class Director {
    constructor(world) {
      this.w = world;
      this.mode = 'auto';
      this.i = 0;
      this.from = null;
      this.t = 0;
      this.hold = 8;
      this.blend = 3.2;
      this.idle = 99;
      const c = world.controls;
      c.addEventListener('start', () => { this.idle = 0; this.user = true; });
      c.addEventListener('end', () => { this.idle = 0; });
      this.place(SHOTS[0], 0);
    }
    place(shot, k) {
      const { camera, controls } = this.w;
      camera.position.set(...shot.pos.map((v, i) => v + shot.drift[i] * k));
      controls.target.set(...shot.target);
    }
    show(i, hold = 8) {
      this.mode = 'auto'; this.user = false; this.i = i; this.hold = hold;
      this.go(SHOTS[i]);
    }
    setMode(mode) {
      this.mode = mode;
      this.user = false;
      this.idle = 99;
      this.go(mode === 'screen' ? SCREEN_SHOT : SHOTS[(this.i = 1)]);
    }
    go(shot) {
      const { camera, controls } = this.w;
      this.from = { pos: camera.position.clone(), target: controls.target.clone() };
      this.shot = shot;
      this.t = 0;
    }
    update(dt) {
      if (this.mode === 'free' || this.user) {
        this.idle += dt;
        if (this.mode !== 'free' && this.idle > 9) { this.user = false; this.go(this.mode === 'screen' ? SCREEN_SHOT : SHOTS[this.i]); }
        return;
      }
      if (!this.shot) this.shot = SHOTS[0];
      this.t += dt;
      const THREE = this.w.THREE, shot = this.shot;
      const k = Math.min(1, this.t / (this.blend + this.hold));
      const pos = new THREE.Vector3(...shot.pos.map((v, i) => v + shot.drift[i] * k));
      const tgt = new THREE.Vector3(...shot.target);
      if (this.from && this.t < this.blend) {
        const e = ease(this.t / this.blend);
        pos.lerpVectors(this.from.pos, pos, e);
        tgt.lerpVectors(this.from.target, tgt, e);
      }
      this.w.camera.position.copy(pos);
      this.w.controls.target.copy(tgt);
      if (this.mode === 'auto' && this.t > this.blend + this.hold) {
        this.i = (this.i + 1) % SHOTS.length;
        this.go(SHOTS[this.i]);
      }
    }
  }

  // ------------------------------------------------------------ helpers
  function concreteTexture(THREE) {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#f2f2f0'; x.fillRect(0, 0, 512, 512);
    const img = x.getImageData(0, 0, 512, 512), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = 236 + Math.random() * 16;
      d[i] = d[i + 1] = d[i + 2] = n;
    }
    x.putImageData(img, 0, 0);
    x.globalAlpha = 0.018;
    x.filter = 'blur(6px)';
    for (let i = 0; i < 260; i++) {
      x.fillStyle = Math.random() < 0.5 ? '#000' : '#fff';
      x.beginPath(); x.arc(Math.random() * 512, Math.random() * 512, 6 + Math.random() * 60, 0, 7); x.fill();
    }
    x.filter = 'none';
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 6);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function labelMesh(THREE, text) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#2a271f';
    x.font = 'bold 40px system-ui, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, 32, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    m.rotation.z = -Math.PI / 2; // text reads upright for the fly facing +x
    return m;
  }

  window.World = World;
})();
