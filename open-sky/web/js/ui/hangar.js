// Hangar: turntable preview of a fleet aircraft on its own small renderer
// (menu aircraft picker; also used by dev/hangar.html for model checks).
import * as THREE from 'three';
import { createAircraftModel, poseAircraft } from '../aircraft/jets.js';
import { createTrainer } from '../aircraft/models.js';

export class Hangar {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 2000);
    const hemi = new THREE.HemisphereLight(0xdfe8f5, 0x2a2f38, 1.1);
    const key = new THREE.DirectionalLight(0xfff2dd, 2.4);
    key.position.set(-40, 60, -30);
    const rim = new THREE.DirectionalLight(0xd4a85c, 1.2);
    rim.position.set(50, 20, 60);
    this.scene.add(hemi, key, rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: 0x0c1420, transparent: true, opacity: 0.55 }));
    floor.rotation.x = -Math.PI / 2;
    this.floor = floor;
    this.scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.98, 1.0, 96), new THREE.MeshBasicMaterial({ color: 0xd4a85c, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    ring.position.z = 0.002;
    floor.add(ring);
    this.angle = 0.9;
    this.model = null;
    this.cache = new Map();
    this.pose = { flapsDeg: 0, gearPos: 1, n1_0: 22, n1_1: 22, n1_2: 22, n1_3: 22 };
  }

  show(f) {
    if (this.model) this.scene.remove(this.model.root);
    let m = this.cache.get(f.id);
    if (!m) {
      if (f.style === 'trainer') { const t = createTrainer(); m = { root: t.root, trainer: true }; }
      else m = createAircraftModel(f);
      this.cache.set(f.id, m);
    }
    this.model = m;
    this.f = f;
    this.scene.add(m.root);
    // frame the model
    const box = new THREE.Box3().setFromObject(m.root);
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z);
    this.dist = span * 1.75 + 2;
    this.target = new THREE.Vector3(0, box.min.y + size.y * 0.42, 0);
    this.floor.scale.setScalar(span * 0.62);
    this.floor.position.y = box.min.y - 0.02;
    m.root.position.set(0, 0, 0);
  }

  resize() {
    const w = this.canvas.clientWidth || 640, h = this.canvas.clientHeight || 360;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame(dt, spin = true) {
    if (!this.model) return;
    if (spin) this.angle += dt * 0.25;
    const d = this.dist;
    this.camera.position.set(this.target.x + Math.sin(this.angle) * d, this.target.y + d * 0.28, this.target.z + Math.cos(this.angle) * d);
    this.camera.lookAt(this.target);
    if (!this.model.trainer) poseAircraft(this.model, this.pose, dt);
    this.renderer.render(this.scene, this.camera);
  }
}
