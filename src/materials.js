import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const INK = 0x1d1426;

let grad;
export function gradientMap() {
  if (!grad) {
    grad = new THREE.DataTexture(new Uint8Array([120, 200, 255]), 3, 1, THREE.RedFormat);
    grad.minFilter = grad.magFilter = THREE.NearestFilter;
    grad.generateMipmaps = false;
    grad.needsUpdate = true;
  }
  return grad;
}

const toonCache = new Map();
export function toon(color, opts = {}) {
  const key = color + '|' + JSON.stringify(opts);
  let m = toonCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...opts });
    toonCache.set(key, m);
  }
  return m;
}

// Inverted-hull outline: pushes vertices along their normals and draws back faces.
const outlineCache = new Map();
export function outlineMat(thick = 0.035, color = INK) {
  const key = thick + '|' + color;
  let m = outlineCache.get(key);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { uThick: { value: thick }, uColor: { value: new THREE.Color(color) } },
      vertexShader: /* glsl */ `
        uniform float uThick;
        void main() {
          vec4 p = vec4(position + normal * uThick, 1.0);
          #ifdef USE_INSTANCING
            p = instanceMatrix * p;
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * p;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        void main() { gl_FragColor = vec4(uColor, 1.0); }`,
      side: THREE.BackSide,
    });
    outlineCache.set(key, m);
  }
  return m;
}

// Hull for hard-edged convex shapes (boxes) where normal-extrusion would crack at corners.
export const hullMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

// Drawn only where a character is hidden behind a wall (depth test inverted), before
// the character itself, so visible parts overwrite it.
const silCache = new Map();
export function silMat(color = 0x8fd8ff) {
  let m = silCache.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color, opacity: 0.55, depthWrite: false, depthFunc: THREE.GreaterDepth,
      blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    silCache.set(color, m);
  }
  return m;
}

// A mesh with an outline (and optionally an x-ray silhouette) as children.
export function part(geo, mat, parent, { thick = 0.035, sil = null, shadow = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.renderOrder = 2;
  const o = new THREE.Mesh(geo, outlineMat(thick));
  o.renderOrder = 2;
  m.add(o);
  if (sil !== null) {
    const s = new THREE.Mesh(geo, silMat(sil));
    s.renderOrder = 1;
    m.add(s);
  }
  if (parent) parent.add(m);
  return m;
}

export function paint(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Merge geometries after making their attribute sets compatible.
export function merge(geos) {
  const prepped = geos.map((g) => {
    let x = g.index ? g.toNonIndexed() : g;
    if (!x.attributes.uv) x.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2));
    if (!x.attributes.normal) x.computeVertexNormals();
    return x;
  });
  return mergeGeometries(prepped);
}

// Block with vertical colour gradient, a dark rim on top and an inset lighter cap.
export function blockGeo(w, h, d, { bottom, top, rim, cap, inset = 0.14 }) {
  const box = new THREE.BoxGeometry(w, h, d);
  box.translate(0, h / 2, 0);
  const cb = new THREE.Color(bottom), ct = new THREE.Color(top), cr = new THREE.Color(rim);
  const pos = box.attributes.position, nor = box.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    if (nor.getY(i) > 0.5) tmp.copy(cr);
    else if (nor.getY(i) < -0.5) tmp.copy(cb);
    else {
      const f = Math.min(1, Math.max(0, pos.getY(i) / h)); // translate() can leave -1e-16 -> pow() NaN
      tmp.copy(cb).lerp(ct, Math.pow(f, 0.8));
    }
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  box.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const plate = new THREE.PlaneGeometry(w - inset * 2, d - inset * 2);
  plate.rotateX(-Math.PI / 2);
  plate.translate(0, h + 0.01, 0);
  paint(plate, cap);
  return merge([box, plate]);
}
