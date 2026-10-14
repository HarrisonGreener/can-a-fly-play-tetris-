// The 3D fly: NeuroMechFly v2 body meshes (Apache-2.0, NeLy-EPFL/flygym) on
// their measured skeleton, posed with forward kinematics and a small
// damped-least-squares IK solver so the front feet can tap keys.
// FK, surface shading and bristles adapted from Xenova/fruit-fly-simulation (MIT).
//
// Units are millimetres; the body frame is x forward, y to the fly's left, z up.

(function () {
  const D2R = Math.PI / 180;

  // ------------------------------------------------------------ kinematics
  function quatToMatrix([w, x, y, z]) {
    const n = Math.hypot(w, x, y, z) || 1;
    w /= n; x /= n; y /= n; z /= n;
    return [
      1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
      2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
      2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
    ];
  }
  function axisAngle([ax, ay, az], a) {
    const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
    return [
      c + t * ax * ax, t * ax * ay - s * az, t * ax * az + s * ay,
      t * ax * ay + s * az, c + t * ay * ay, t * ay * az - s * ax,
      t * ax * az - s * ay, t * ay * az + s * ax, c + t * az * az,
    ];
  }
  function m3(A, B) {
    const C = new Array(9);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    return C;
  }
  function m4(A, B) {
    const C = new Array(16);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++)
        C[i * 4 + j] = A[i * 4] * B[j] + A[i * 4 + 1] * B[4 + j] + A[i * 4 + 2] * B[8 + j] + A[i * 4 + 3] * B[12 + j];
    return C;
  }
  const hom = (R, p) => [R[0], R[1], R[2], p[0], R[3], R[4], R[5], p[1], R[6], R[7], R[8], p[2], 0, 0, 0, 1];

  function prepare(model) {
    const map = {};
    for (const d of model.dofs) {
      const k = d.parent + '>' + d.child;
      (map[k] = map[k] || []).push({ name: d.name, axis: model.axisVector[d.axis] || d.axis });
    }
    model.jointDofs = map;
    model.restH = {};
    for (const s of model.segments) {
      const r = model.rest[s];
      model.restH[s] = hom(quatToMatrix(r.quat), r.pos);
    }
  }
  /** World (body-frame) 4x4 transforms for the given segments' chain. */
  function transforms(model, angles, joints = model.joints) {
    const T = { [model.root]: model.restH[model.root] };
    for (const [p, c] of joints) {
      let R = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      for (const { name, axis } of model.jointDofs[p + '>' + c] || []) {
        const a = angles[name] || 0;
        if (a) R = m3(R, axisAngle(axis, a));
      }
      T[c] = m4(m4(T[p], model.restH[c]), hom(R, [0, 0, 0]));
    }
    return T;
  }

  // ------------------------------------------------------------ surfaces
  const DETAIL = `
varying vec3 vMacroPosition;
float macroHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float macroNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(mix(macroHash(i),macroHash(i+vec3(1,0,0)),f.x),mix(macroHash(i+vec3(0,1,0)),macroHash(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(macroHash(i+vec3(0,0,1)),macroHash(i+vec3(1,0,1)),f.x),mix(macroHash(i+vec3(0,1,1)),macroHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
vec3 macroBump(vec3 n,float h){vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);vec3 r1=cross(sy,n),r2=cross(n,sx);
 float det=dot(sx,r1);vec3 g=sign(det)*(dFdx(h)*r1+dFdy(h)*r2);return normalize(abs(det)*n-g+n*1e-15);}
vec2 macroEye(vec2 p){vec2 tile=vec2(1.0,1.7320508);vec2 a=mod(p,tile)-tile*.5;vec2 b=mod(p-tile*.5,tile)-tile*.5;
 vec2 cell=dot(a,a)<dot(b,b)?a:b;float edge=max(abs(cell.x),dot(abs(cell),vec2(.5,.8660254)));float aa=max(fwidth(edge),.012);
 float facet=1.0-smoothstep(.44-aa,.5+aa,edge);float resolved=1.0-smoothstep(.3,1.1,max(length(dFdx(p)),length(dFdy(p))));
 return vec2(mix(.84,facet,resolved),exp(-7.5*dot(cell,cell))*resolved);}
float macroSegment(vec2 p,vec2 a,vec2 b){vec2 ba=b-a;return length(p-a-ba*clamp(dot(p-a,ba)/dot(ba,ba),0.0,1.0));}
float macroWingVein(vec3 p){vec2 q=vec2(p.x+.678604,abs(p.y)+.105238)/vec2(1.083644,2.405973);float d=10.0;
 d=min(d,macroSegment(q,vec2(.62,.05),vec2(.84,.44)));d=min(d,macroSegment(q,vec2(.84,.44),vec2(.83,.86)));
 d=min(d,macroSegment(q,vec2(.62,.05),vec2(.60,.49)));d=min(d,macroSegment(q,vec2(.60,.49),vec2(.55,.98)));
 d=min(d,macroSegment(q,vec2(.62,.05),vec2(.40,.50)));d=min(d,macroSegment(q,vec2(.40,.50),vec2(.28,.91)));
 d=min(d,macroSegment(q,vec2(.62,.05),vec2(.23,.39)));d=min(d,macroSegment(q,vec2(.23,.39),vec2(.11,.71)));
 d=min(d,macroSegment(q,vec2(.60,.49),vec2(.81,.55)));d=min(d,macroSegment(q,vec2(.40,.50),vec2(.60,.56)));
 d=min(d,macroSegment(q,vec2(.30,.81),vec2(.57,.80)));float aa=max(fwidth(d),.0004);return 1.0-smoothstep(.0025-aa,.0025+aa,d);}
`;
  function surface(material, kind) {
    material.customProgramCacheKey = () => 'fly-surface-' + kind;
    material.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMacroPosition;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMacroPosition = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + DETAIL);
      let col, rough, nrm;
      if (kind === 'eye') {
        col = 'vec2 mf=macroEye(vMacroPosition.xz*74.0);float mh=mf.y*.0011;diffuseColor.rgb*=mix(.38,1.07,mf.x);';
        rough = 'roughnessFactor=clamp(roughnessFactor+(1.0-mf.x)*.13,.18,.7);';
        nrm = 'normal=macroBump(normal,mh);';
      } else if (kind === 'wing') {
        col = 'float mv=macroWingVein(vMacroPosition);float mm=macroNoise(vMacroPosition*17.0);diffuseColor.rgb*=.90+.12*mm;diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.40,.24,.105),mv*.8);diffuseColor.a*=mix(1.0,2.15,mv);';
        rough = 'roughnessFactor=mix(roughnessFactor,.32,mv);';
        nrm = '';
      } else {
        col = 'float mg=macroNoise(vMacroPosition*34.0);float mp=macroNoise(vMacroPosition*7.0);float mr=1.0-smoothstep(.008,.045,max(length(dFdx(vMacroPosition)),length(dFdy(vMacroPosition))));float mh=(mg-.5)*.0012*mr;diffuseColor.rgb*=.87+.19*mp+.045*mg;';
        rough = 'roughnessFactor=clamp(roughnessFactor+(mg-.5)*.09,.3,.85);';
        nrm = 'normal=macroBump(normal,mh);';
      }
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + col)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + rough)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + nrm);
    };
    return material;
  }
  function flyMaterial(kind) {
    const THREE = window.THREE;
    const colours = { cuticle: 0xb98745, abdomen: 0x8f6230, dark: 0x5a3a1e, eye: 0xa3141b, wing: 0xbec6d5 };
    const wing = kind === 'wing', eye = kind === 'eye';
    return surface(new THREE.MeshPhysicalMaterial({
      color: colours[kind], roughness: eye ? 0.29 : wing ? 0.26 : 0.47, metalness: 0, ior: 1.46,
      clearcoat: eye ? 0.18 : wing ? 0.1 : 0.13, clearcoatRoughness: 0.34,
      transparent: wing, opacity: wing ? 0.33 : 1, side: wing ? THREE.DoubleSide : THREE.FrontSide,
      depthWrite: !wing, iridescence: wing ? 0.32 : 0, iridescenceIOR: 1.31, iridescenceThicknessRange: [210, 390],
    }), kind);
  }

  function decodeMesh(md, mirror) {
    const THREE = window.THREE;
    const bin = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
    const q = new Uint16Array(bin(md.p));
    const idx = md.i32 ? new Uint32Array(bin(md.i)) : new Uint16Array(bin(md.i));
    const pos = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) pos[i] = md.lo[i % 3] + q[i] * md.sc[i % 3];
    if (mirror) for (let i = 1; i < pos.length; i += 3) pos[i] = -pos[i];
    const index = idx.slice();
    if (mirror) for (let i = 0; i < index.length; i += 3) { const t = index[i + 1]; index[i + 1] = index[i + 2]; index[i + 2] = t; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeVertexNormals();
    return g;
  }

  /** Fine sensory bristles on the dorsal thorax, head, abdomen and tibiae. */
  function addBristles(mesh, name, material) {
    const THREE = window.THREE;
    const thorax = name === 'c_thorax', head = name === 'c_head';
    const abdomen = name.includes('abdomen'), tibia = name.endsWith('_tibia');
    if (!thorax && !head && !abdomen && !tibia) return;
    const count = thorax ? 95 : head ? 24 : abdomen ? 22 : 15;
    const P = mesh.geometry.getAttribute('position'), N = mesh.geometry.getAttribute('normal'), I = mesh.geometry.index;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3();
    const tris = [], cdf = [];
    let area = 0;
    for (let t = 0; t < I.count / 3; t++) {
      const ids = [I.getX(3 * t), I.getX(3 * t + 1), I.getX(3 * t + 2)];
      a.fromBufferAttribute(P, ids[0]); b.fromBufferAttribute(P, ids[1]); c.fromBufferAttribute(P, ids[2]);
      fn.crossVectors(b.clone().sub(a), c.clone().sub(a));
      const w = fn.length() / 2;
      if (!(w > 1e-10)) continue;
      fn.normalize();
      if (!tibia && (fn.z < (head ? 0.38 : 0.12) || (a.z + b.z + c.z) / 3 < (thorax ? 0.04 : 0))) continue;
      tris.push(ids); area += w; cdf.push(area);
    }
    if (!tris.length) return;
    let seed = 2166136261;
    for (const ch of name) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const verts = [], faces = [];
    const n = new THREE.Vector3(), tan = new THREE.Vector3(), bin = new THREE.Vector3(), base = new THREE.Vector3(), bend = new THREE.Vector3();
    const up = new THREE.Vector3(0, 0, 1), side = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
    for (let h = 0; h < count; h++) {
      const target = rnd() * area;
      let lo = 0, hi = cdf.length - 1;
      while (lo < hi) { const mid = (lo + hi) >>> 1; if (cdf[mid] < target) lo = mid + 1; else hi = mid; }
      const [ia, ib, ic] = tris[lo];
      a.fromBufferAttribute(P, ia); b.fromBufferAttribute(P, ib); c.fromBufferAttribute(P, ic);
      const r = Math.sqrt(rnd()), s = rnd(), wa = 1 - r, wb = r * (1 - s), wc = r * s;
      base.copy(a).multiplyScalar(wa).addScaledVector(b, wb).addScaledVector(c, wc);
      n.fromBufferAttribute(N, ia).multiplyScalar(wa)
        .addScaledVector(tmp.fromBufferAttribute(N, ib), wb).addScaledVector(tmp.fromBufferAttribute(N, ic), wc).normalize();
      tan.crossVectors(n, Math.abs(n.z) > 0.85 ? side : up).normalize();
      bin.crossVectors(n, tan).normalize();
      const len = (tibia ? 0.04 : thorax ? 0.062 : 0.034) * (0.6 + rnd() * 0.9), rad = tibia ? 0.0017 : 0.002, ang = rnd() * Math.PI * 2;
      bend.copy(tan).multiplyScalar(Math.cos(ang)).addScaledVector(bin, Math.sin(ang));
      const start = verts.length / 3;
      for (let ring = 0; ring < 3; ring++) {
        const t = ring * 0.5, rr = rad * (1 - t) + 0.00012;
        for (let k = 0; k < 3; k++) {
          const th = (k * Math.PI * 2) / 3;
          const p = base.clone().addScaledVector(n, len * t + 0.0005).addScaledVector(bend, len * 0.23 * t * t)
            .addScaledVector(tan, Math.cos(th) * rr).addScaledVector(bin, Math.sin(th) * rr);
          verts.push(p.x, p.y, p.z);
        }
      }
      for (let ring = 0; ring < 2; ring++)
        for (let k = 0; k < 3; k++) {
          const p = start + ring * 3 + k, q = start + ring * 3 + ((k + 1) % 3);
          faces.push(p, q, p + 3, q, q + 3, p + 3);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(faces);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    mesh.add(m);
  }

  // ------------------------------------------------------------ the fly
  class Fly3D {
    constructor(model) {
      const THREE = window.THREE;
      this.model = model;
      prepare(model);
      this.angles = {};
      for (const d of model.dofs) this.angles[d.name] = (model.neutralDeg[d.name] || 0) * D2R;
      this.group = new THREE.Group();
      this.group.name = 'fly';
      this.meshes = [];
      const mats = {}, bristle = new THREE.MeshStandardMaterial({ color: 0x805021, roughness: 0.72, side: THREE.DoubleSide });
      for (const [name, m] of Object.entries(model.meshes)) {
        const kind = name.includes('wing') ? 'wing' : name.endsWith('eye') ? 'eye'
          : name.includes('abdomen') ? 'abdomen' : name.includes('tarsus') || name.includes('arista') ? 'dark' : 'cuticle';
        mats[kind] = mats[kind] || flyMaterial(kind);
        const mesh = new THREE.Mesh(decodeMesh(model.meshData[m.file], m.mirror), mats[kind]);
        mesh.matrixAutoUpdate = false;
        mesh.castShadow = kind !== 'wing';
        mesh.receiveShadow = kind !== 'wing';
        this.group.add(mesh);
        this.meshes.push({ name, mesh });
        addBristles(mesh, name, bristle);
      }
      // Per-leg IK chains, limited to the joints the biomechanics data constrains.
      this.legs = {};
      for (const leg of ['lf', 'rf', 'lm', 'rm', 'lh', 'rh']) {
        const joints = model.joints.filter(([, c]) => c.startsWith(leg + '_'));
        const dofs = model.dofs.filter((d) => d.child.startsWith(leg + '_') && d.limitDeg && (!d.child.includes('tarsus') || d.child.endsWith('tarsus1')));
        this.legs[leg] = { joints, dofs, tip: leg + '_tarsus5' };
      }
      this.wingFold();
      this.apply();
    }
    wingFold(open = 0, flutter = 0) {
      for (const side of ['l', 'r']) {
        const s = side === 'l' ? 1 : -1, p = `c_thorax-${side}_wing-`;
        this.angles[p + 'pitch'] = (30 - 20 * open) * D2R;
        this.angles[p + 'roll'] = -75 * open * s * D2R;
        this.angles[p + 'yaw'] = (5 + 15 * open + flutter) * s * D2R;
      }
    }
    tip(leg) {
      const L = this.legs[leg], t = transforms(this.model, this.angles, L.joints)[L.tip];
      return [t[3], t[7], t[11]];
    }
    /** Move a foot towards `target` (body frame) with damped least squares. */
    reach(leg, target, iterations = 8) {
      const L = this.legs[leg], eps = 1e-3, lambda = 0.02;
      for (let it = 0; it < iterations; it++) {
        const p = this.tip(leg), e = [target[0] - p[0], target[1] - p[1], target[2] - p[2]];
        if (Math.hypot(...e) < 5e-4) break;
        const J = L.dofs.map((d) => {
          this.angles[d.name] += eps;
          const q = this.tip(leg);
          this.angles[d.name] -= eps;
          return [(q[0] - p[0]) / eps, (q[1] - p[1]) / eps, (q[2] - p[2]) / eps];
        });
        // A = J Jᵀ + λ²I (3x3), solve A u = e, dq = Jᵀ u.
        const A = [[lambda * lambda, 0, 0], [0, lambda * lambda, 0], [0, 0, lambda * lambda]];
        for (const c of J) for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) A[r][k] += c[r] * c[k];
        const u = solve3(A, e);
        L.dofs.forEach((d, j) => {
          const step = J[j][0] * u[0] + J[j][1] * u[1] + J[j][2] * u[2];
          const [lo, hi] = d.limitDeg;
          this.angles[d.name] = Math.max(lo * D2R, Math.min(hi * D2R, this.angles[d.name] + Math.max(-0.3, Math.min(0.3, step))));
        });
      }
    }
    apply() {
      const T = transforms(this.model, this.angles);
      for (const { name, mesh } of this.meshes) {
        mesh.matrix.set(...T[name]);
        mesh.matrixWorldNeedsUpdate = true;
      }
    }
  }
  function solve3(A, b) {
    const [[a, bb, c], [d, e, f], [g, h, i]] = A;
    const det = a * (e * i - f * h) - bb * (d * i - f * g) + c * (d * h - e * g) || 1e-12;
    return [
      (b[0] * (e * i - f * h) - bb * (b[1] * i - f * b[2]) + c * (b[1] * h - e * b[2])) / det,
      (a * (b[1] * i - f * b[2]) - b[0] * (d * i - f * g) + c * (d * b[2] - b[1] * g)) / det,
      (a * (e * b[2] - b[1] * h) - bb * (d * b[2] - b[1] * g) + b[0] * (d * h - e * g)) / det,
    ];
  }

  window.Fly3D = Fly3D;
})();
