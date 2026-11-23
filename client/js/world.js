// Builds the scenery for a map: sky, lights, terrain, water, trees and clouds.
// Call world.dispose() before building a different map.
import * as THREE from 'three';
import { makeRng } from '/shared/terrain.js';

// ---------- Low-poly tree shapes (each = trunk + crown, drawn instanced) ----------
const TREE_TYPES = {
  palm: () => ({
    trunk: new THREE.CylinderGeometry(0.35, 0.6, 9, 5).translate(0, 4.5, 0), trunkColor: 0x8a5a35,
    crown: new THREE.ConeGeometry(4.5, 2.2, 6).translate(0, 9.6, 0), crownColor: 0x2f9e3a
  }),
  pine: () => {
    const crown = new THREE.ConeGeometry(3.6, 8, 6).translate(0, 7, 0);
    return {
      trunk: new THREE.CylinderGeometry(0.4, 0.6, 4, 5).translate(0, 2, 0), trunkColor: 0x5a3d2a,
      crown, crownColor: 0x2a5a36
    };
  },
  cactus: () => ({
    trunk: new THREE.CylinderGeometry(0.7, 0.8, 7, 6).translate(0, 3.5, 0), trunkColor: 0x4f8a3a,
    crown: new THREE.BoxGeometry(5, 0.9, 0.9).translate(0, 4.2, 0), crownColor: 0x4f8a3a // the "arms"
  })
};

export function buildWorld(scene, map, terrain) {
  const rng = makeRng(map.seed);
  const objects = [];
  const add = (o) => { scene.add(o); objects.push(o); return o; };

  // ---------- Sky & fog ----------
  scene.background = new THREE.Color(map.sky.horizon);
  scene.fog = new THREE.Fog(map.sky.horizon, map.fog.near, map.fog.far);

  const sky = add(new THREE.Mesh(
    new THREE.SphereGeometry(5000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(map.sky.top) },
        bottom: { value: new THREE.Color(map.sky.horizon) }
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 top;
        uniform vec3 bottom;
        varying vec3 vDir;
        void main() {
          float h = normalize(vDir).y;
          gl_FragColor = vec4(mix(bottom, top, smoothstep(0.0, 0.45, h)), 1.0);
          #include <colorspace_fragment>
        }`
    })
  ));
  sky.renderOrder = -1;

  // ---------- Lights ----------
  add(new THREE.HemisphereLight(0xdff4ff, 0x6a8a5a, 1.4));
  const sun = add(new THREE.DirectionalLight(map.sun ?? 0xfff1d6, 2.2));
  sun.position.set(800, 1200, 400);

  // ---------- Terrain ----------
  const c = map.colors, b = map.bands;
  const col = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, new THREE.Color(v)]));
  let geo = new THREE.PlaneGeometry(map.size, map.size, map.resolution, map.resolution);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrain.heightAt(pos.getX(i), pos.getZ(i)));
  geo = geo.toNonIndexed();          // every triangle gets its own vertices = flat low-poly look
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  const colors = new Float32Array(p.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    const h = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const steep = n.getY(i) < 0.72;
    let base;
    if (h < 1) base = col.seabed;
    else if (h < b.shore) base = col.shore;
    else if (steep && h > b.shore + 10) base = col.steep ?? col.rock;
    else if (h < b.grass) base = col.grass;
    else if (h < b.forest) base = col.forest;
    else if (h < b.rock) base = col.rock;
    else base = col.peak;
    tmp.copy(base);
    if (map.stripes && steep) tmp.offsetHSL(0, 0, Math.floor(h / 14) % 2 ? 0.05 : -0.04); // layered cliffs
    tmp.offsetHSL(0, 0, (rng() - 0.5) * 0.05);
    for (let k = 0; k < 3; k++) tmp.toArray(colors, (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));

  // ---------- Water / ice ----------
  const water = add(new THREE.Mesh(
    new THREE.PlaneGeometry(map.size * 3, map.size * 3),
    new THREE.MeshPhongMaterial({
      color: map.water, transparent: true, opacity: map.waterOpacity ?? 0.82,
      shininess: 90, specular: 0x99ddff
    })
  ));
  water.rotation.x = -Math.PI / 2;
  water.position.y = map.waterLevel;

  // ---------- Trees (instanced = cheap to draw hundreds) ----------
  const T = map.trees;
  const shape = TREE_TYPES[T.type]();
  const trunks = add(new THREE.InstancedMesh(shape.trunk, new THREE.MeshLambertMaterial({ color: shape.trunkColor, flatShading: true }), T.count));
  const crowns = add(new THREE.InstancedMesh(shape.crown, new THREE.MeshLambertMaterial({ color: shape.crownColor, flatShading: true }), T.count));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let placed = 0;
  for (let tries = 0; tries < T.count * 25 && placed < T.count; tries++) {
    const x = (rng() - 0.5) * map.boundary * 2.2;
    const z = (rng() - 0.5) * map.boundary * 2.2;
    const h = terrain.heightAt(x, z);
    if (h < T.minH || h > T.maxH) continue;
    const slope = Math.abs(terrain.heightAt(x + 4, z) - h) + Math.abs(terrain.heightAt(x, z + 4) - h);
    if (slope > 5) continue;
    const scale = 0.8 + rng() * 0.7;
    q.setFromAxisAngle(up, rng() * Math.PI * 2);
    m.compose(v.set(x, h - 0.5, z), q, s.set(scale, scale, scale));
    trunks.setMatrixAt(placed, m);
    crowns.setMatrixAt(placed, m);
    placed++;
  }
  trunks.count = crowns.count = placed;

  // ---------- Clouds ----------
  const C = map.clouds;
  const cloudGeo = new THREE.IcosahedronGeometry(1, 0);
  const cloudMat = new THREE.MeshLambertMaterial({ color: C.color, flatShading: true, emissive: 0xb8c4d0 });
  const clouds = [];
  for (let i = 0; i < C.count; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 4);
    for (let j = 0; j < puffs; j++) {
      const puff = new THREE.Mesh(cloudGeo, cloudMat);
      const r = 18 + rng() * 22;
      puff.scale.set(r, r * 0.7, r);
      puff.position.set((j - puffs / 2) * 22 + rng() * 10, rng() * 10, rng() * 20 - 10);
      puff.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      cloud.add(puff);
    }
    cloud.position.set((rng() - 0.5) * map.size, C.minY + rng() * (C.maxY - C.minY), (rng() - 0.5) * map.size);
    cloud.rotation.y = rng() * Math.PI;
    add(cloud);
    clouds.push(cloud);
  }

  return {
    update(dt, camera) {
      sky.position.copy(camera.position);
      const half = map.size / 2;
      for (const cl of clouds) {
        cl.position.x += 4 * dt;                 // gentle wind
        if (cl.position.x > half) cl.position.x -= map.size;
      }
    },
    /** Remove everything this world added and free GPU memory. */
    dispose() {
      for (const o of objects) {
        scene.remove(o);
        o.traverse((child) => {
          child.geometry?.dispose();
          if (child.material) [].concat(child.material).forEach((mat) => mat.dispose());
        });
      }
    }
  };
}
