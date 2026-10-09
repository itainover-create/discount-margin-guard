// Camera rig: cockpit (free look + zoom), chase (orbit), wing, tower,
// fly-by (runway) and free cinematic camera. Keeps cameras out of terrain
// and out of the airframe; transitions are smoothed.
import * as THREE from 'three';
import { EYE } from '../aircraft/cockpit.js';

export const VIEWS = ['cockpit', 'chase', 'wing', 'tower', 'flyby', 'free'];
export const VIEW_NAMES = { cockpit: 'Cockpit', chase: 'Chase', wing: 'Wing', tower: 'Tower', flyby: 'Fly-by', free: 'Free camera' };
export const VIEW_NAMES_HE = { cockpit: 'תא טייס', chase: 'מעקב', wing: 'כנף', tower: 'מגדל', flyby: 'חלוף', free: 'חופשית' };

const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();

export class CameraRig {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.view = 'cockpit';
    this.look = { yaw: 0, pitch: -0.08, fov: 68 };
    this.chase = { yaw: 0, pitch: 0.12, dist: 15, fov: 55 };
    this.free = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, fov: 60, speed: 60 };
    this.flyby = { pos: null };
    this.towerFov = 30;
    this.smoothPos = new THREE.Vector3();
    this.first = true;
    this.shake = 0;
  }

  setView(v, aircraft) {
    if (v === 'free' && this.view !== 'free') {
      this.free.pos.copy(this.camera.position);
      tmpE.setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.free.yaw = tmpE.y;
      this.free.pitch = tmpE.x;
    }
    if (v === 'flyby') this.flyby.pos = null;
    this.view = v;
    this.first = true;
    aircraft.setCockpitView(v === 'cockpit');
  }

  next(aircraft, dir = 1) {
    const i = VIEWS.indexOf(this.view);
    this.setView(VIEWS[(i + dir + VIEWS.length) % VIEWS.length], aircraft);
  }

  // input: { lookDX, lookDY, wheel, freeMove:{x,y,z}, fast, resetLook, hat:{x,y} }
  update(dt, aircraft, input) {
    const cam = this.camera;
    const root = aircraft.root;
    const o = aircraft.o;
    let fov = 60, near = 0.3;
    switch (this.view) {
      case 'cockpit': {
        if (input.resetLook) { this.look.yaw = 0; this.look.pitch = -0.08; this.look.fov = 68; }
        this.look.yaw = THREE.MathUtils.clamp(this.look.yaw - input.lookDX * 0.004 - (input.hat?.x || 0) * dt * 1.6, -2.6, 2.6);
        this.look.pitch = THREE.MathUtils.clamp(this.look.pitch - input.lookDY * 0.004 + (input.hat?.y || 0) * dt * 1.2, -1.2, 1.1);
        this.look.fov = THREE.MathUtils.clamp(this.look.fov + input.wheel * 0.03, 25, 95);
        // head moves slightly with load factor (vertical) and buffeting
        const bob = THREE.MathUtils.clamp((o.nz - 1) * -0.012, -0.03, 0.03);
        tmpV.copy(EYE).add(new THREE.Vector3(0, bob, 0));
        // lean the head when looking far to the sides to see past pillars
        tmpV.x += Math.sin(this.look.yaw) * 0.08;
        cam.position.copy(tmpV.applyMatrix4(root.matrixWorld));
        tmpQ.setFromEuler(tmpE.set(this.look.pitch, this.look.yaw, 0, 'YXZ'));
        cam.quaternion.copy(root.quaternion).multiply(tmpQ);
        if (this.shake > 0) {
          cam.position.x += (Math.random() - 0.5) * this.shake * 0.01;
          cam.position.y += (Math.random() - 0.5) * this.shake * 0.01;
        }
        fov = this.look.fov;
        near = 0.04;
        break;
      }
      case 'chase': {
        this.chase.yaw -= input.lookDX * 0.005;
        this.chase.pitch = THREE.MathUtils.clamp(this.chase.pitch + input.lookDY * 0.004, -0.35, 1.3);
        this.chase.dist = THREE.MathUtils.clamp(this.chase.dist * (1 + input.wheel * 0.001), 7, 400);
        if (input.resetLook) { this.chase.yaw = 0; this.chase.pitch = 0.12; this.chase.dist = 15; }
        // follow the heading (not roll); orbit offsets on top
        const hdg = o.psi;
        const yaw = -hdg + Math.PI + this.chase.yaw;
        const d = this.chase.dist;
        const target = root.position.clone().add(new THREE.Vector3(0, 1.2, 0));
        const off = new THREE.Vector3(Math.sin(yaw) * Math.cos(this.chase.pitch) * d, Math.sin(this.chase.pitch) * d, Math.cos(yaw) * Math.cos(this.chase.pitch) * d);
        const want = target.clone().add(off);
        if (this.first) { this.smoothPos.copy(want); this.first = false; }
        // spring toward the desired position (velocity-aware so fast flight does not lag)
        const k = 1 - Math.exp(-dt * 6);
        this.smoothPos.lerp(want, k);
        this.smoothPos.add(new THREE.Vector3(o.ve, o.vu, -o.vn).multiplyScalar(dt * (1 - k)));
        if (this.smoothPos.distanceTo(target) > d * 1.6) this.smoothPos.copy(want);
        cam.position.copy(this.smoothPos);
        cam.lookAt(target);
        fov = this.chase.fov;
        break;
      }
      case 'wing': {
        const p = new THREE.Vector3(-5.2, 1.05, 0.6).applyMatrix4(root.matrixWorld);
        cam.position.copy(p);
        const t = new THREE.Vector3(-1.2, 0.6, -6).applyMatrix4(root.matrixWorld);
        cam.up.set(0, 1, 0).applyQuaternion(root.quaternion);
        cam.lookAt(t);
        cam.up.set(0, 1, 0);
        fov = 62;
        near = 0.1;
        break;
      }
      case 'tower': {
        const tp = this.world.towerNear ? this.world.towerNear(o.x, o.y) : null;
        if (tp) cam.position.set(tp.x, tp.z + 1.6, -tp.y);
        else cam.position.set(o.x + 300, Math.max(o.z, this.world.heightAt(o.x + 300, o.y)) + 30, -o.y);
        cam.lookAt(root.position);
        const dist = cam.position.distanceTo(root.position);
        this.towerFov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(30 / Math.max(dist, 1))), 2.5, 60) * Math.pow(2, input.wheel * 0.002 || 0);
        fov = this.towerFov;
        near = 1;
        break;
      }
      case 'flyby': {
        const pos = root.position;
        const vel = new THREE.Vector3(o.ve, o.vu, -o.vn);
        const spd = Math.max(vel.length(), 5);
        if (!this.flyby.pos || this.flyby.pos.distanceTo(pos) > 1500 || vel.clone().normalize().dot(pos.clone().sub(this.flyby.pos)) > 250) {
          const ahead = pos.clone().add(vel.clone().normalize().multiplyScalar(Math.min(600, spd * 9)));
          const side = new THREE.Vector3(-vel.z, 0, vel.x).normalize().multiplyScalar(25 + Math.random() * 30);
          ahead.add(side);
          const gx = ahead.x, gy = -ahead.z;
          const gz = this.world.heightAt(gx, gy);
          ahead.y = Math.max(gz + 2.5, Math.min(pos.y - 6, gz + 40));
          this.flyby.pos = ahead;
        }
        cam.position.copy(this.flyby.pos);
        cam.lookAt(pos);
        fov = 40;
        break;
      }
      case 'free': {
        const f = this.free;
        f.yaw -= input.lookDX * 0.004;
        f.pitch = THREE.MathUtils.clamp(f.pitch - input.lookDY * 0.004, -1.5, 1.5);
        f.fov = THREE.MathUtils.clamp(f.fov + input.wheel * 0.03, 15, 100);
        const sp = f.speed * (input.fast ? 6 : 1);
        tmpQ.setFromEuler(tmpE.set(f.pitch, f.yaw, 0, 'YXZ'));
        const mv = new THREE.Vector3(input.freeMove.x, input.freeMove.z, -input.freeMove.y).applyQuaternion(tmpQ).multiplyScalar(sp * dt);
        f.pos.add(mv);
        cam.position.copy(f.pos);
        cam.quaternion.copy(tmpQ);
        fov = f.fov;
        break;
      }
      default:
        break;
    }
    // never below the ground (except cockpit, which is inside the airframe)
    if (this.view !== 'cockpit') {
      const gx = cam.position.x, gy = -cam.position.z;
      const g = Math.max(this.world.heightAt(gx, gy), 0);
      if (cam.position.y < g + 1.2) cam.position.y = g + 1.2;
      if (this.view === 'free') this.free.pos.y = cam.position.y;
    }
    if (Math.abs(cam.fov - fov) > 0.01 || cam.near !== near) {
      cam.fov = fov;
      cam.near = near;
      cam.updateProjectionMatrix();
    }
  }

  // camera position in world frame coords (x east, y north, z up)
  worldPos() { const p = this.camera.position; return { x: p.x, y: -p.z, z: p.y }; }
}
