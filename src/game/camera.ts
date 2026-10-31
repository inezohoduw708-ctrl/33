import * as THREE from 'three';
import { clamp, damp, angleLerp, lerp } from '../core/utils';

/**
 * Third-person follow camera with orbit, look-ahead, additive trauma shake
 * and cinematic focus used for combos / boss intros.
 */
export class GameCamera {
  camera: THREE.PerspectiveCamera;
  yaw = Math.PI;
  pitch = 0.3;
  distance = 9.2;
  targetDistance = 9.2;
  private trauma = 0;
  private shakeTime = 0;
  private lookAt = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private focus: THREE.Vector3 | null = null;
  private focusBlend = 0;
  fovBase = 62;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.1, 400);
    this.camera.position.set(0, 6, 34);
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  shake(amount: number) {
    this.trauma = clamp(this.trauma + amount, 0, 1.2);
  }

  /** Cinematic look at a world point (boss intros). */
  setFocus(pos: THREE.Vector3 | null) {
    this.focus = pos;
  }

  private userYawTimer = 0;

  update(
    dt: number,
    target: THREE.Vector3,
    camInputX: number,
    opts: { moving?: boolean; inCombat?: boolean; zoomOut?: number; playerFacing?: number } = {},
  ) {
    this.yaw -= camInputX * 1.0;
    if (Math.abs(camInputX) > 0.0005) {
      this.userYawTimer = 1.8;
      this.yaw = this.yaw % (Math.PI * 2);
    } else if (this.userYawTimer > 0) {
      this.userYawTimer -= dt;
    } else if (opts.playerFacing !== undefined && opts.moving) {
      // lazily swing back behind the turtle while running, unless the player is steering the camera
      const want = opts.playerFacing + Math.PI;
      let d = ((want - this.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) > 0.25) this.yaw += d * (1 - Math.exp(-1.15 * dt));
    }
    this.targetDistance = lerp(this.targetDistance, 9.2 + (opts.zoomOut ?? 0), 1 - Math.exp(-3 * dt));
    this.distance = damp(this.distance, this.targetDistance, 4, dt);
    this.pitch = damp(this.pitch, 0.34, 3, dt);

    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const horiz = Math.cos(this.pitch) * this.distance;
    const vert = Math.sin(this.pitch) * this.distance;

    this.desired.set(
      target.x + sinY * horiz,
      target.y + vert + 2.4,
      target.z + cosY * horiz,
    );
    // keep camera inside the street canyon & above the sidewalk
    this.desired.x = clamp(this.desired.x, -13.2, 13.2);
    this.desired.z = clamp(this.desired.z, -84, 84);
    this.desired.y = Math.max(1.8, this.desired.y);

    this.camera.position.lerp(this.desired, 1 - Math.exp(-9 * dt));

    this.focusBlend = damp(this.focusBlend, this.focus ? 1 : 0, 5, dt);
    const baseLook = new THREE.Vector3(target.x, target.y + 1.45, target.z);
    if (this.focus) baseLook.lerp(this.focus, this.focusBlend);
    this.lookAt.lerp(baseLook, 1 - Math.exp(-12 * dt));
    this.camera.lookAt(this.lookAt);

    // shake
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 1.9);
      this.shakeTime += dt * 40;
      const t = this.trauma * this.trauma;
      const ox = Math.sin(this.shakeTime * 1.7) * t * 0.55;
      const oy = Math.cos(this.shakeTime * 2.3) * t * 0.45;
      const oz = Math.sin(this.shakeTime * 1.1) * t * 0.35;
      this.camera.position.x += ox;
      this.camera.position.y += oy;
      this.camera.position.z += oz;
      this.camera.rotateZ(Math.sin(this.shakeTime * 1.3) * t * 0.05);
    }

    // combat punch-in
    const wantFov = this.fovBase - (opts.inCombat ? 2 : 0);
    if (Math.abs(this.camera.fov - wantFov) > 0.01) {
      this.camera.fov = damp(this.camera.fov, wantFov, 4, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  snap(target: THREE.Vector3) {
    this.camera.position.set(
      target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance,
      target.y + Math.sin(this.pitch) * this.distance + 2.4,
      target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance,
    );
    this.lookAt.set(target.x, target.y + 1.45, target.z);
    this.camera.lookAt(this.lookAt);
  }

  /** Slow cinematic orbit for menus. */
  menuOrbit(t: number, center: THREE.Vector3) {
    const r = 13;
    this.camera.position.set(
      center.x + Math.sin(t * 0.18) * r,
      center.y + 2.6 + Math.sin(t * 0.3) * 0.7,
      center.z + Math.cos(t * 0.18) * r,
    );
    this.camera.lookAt(center.x, center.y + 1.3, center.z);
  }
}
