import * as THREE from 'three';
import { radialTexture } from '../core/assets';

/**
 * "Manhole travel" gate that appears once a wave is cleared: the player steps
 * into it and the next wave starts. Keeps the beat between fights in the
 * player's hands instead of a hidden timer.
 */
export class WavePortal {
  group = new THREE.Group();
  private ring: THREE.Mesh;
  private disc: THREE.Mesh;
  private pillars: THREE.Mesh[] = [];
  private light: THREE.PointLight;
  private glow: THREE.Sprite;
  active = false;
  private t = 0;

  constructor(scene: THREE.Scene, color = 0x7ee04a) {
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.45, 40), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    this.group.add(this.ring);

    const discMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(1.15, 36), discMat);
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.position.y = 0.05;
    this.group.add(this.disc);

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 1.6, 6),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? 0x1de3c2 : color,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      pillar.position.set(Math.cos(a) * 1.3, 0.8, Math.sin(a) * 1.3);
      this.group.add(pillar);
      this.pillars.push(pillar);
    }

    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialTexture('rgba(126,224,74,0.9)', 'rgba(29,227,194,0)'),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
      }),
    );
    this.glow.scale.setScalar(4.2);
    this.glow.position.y = 0.8;
    this.group.add(this.glow);

    this.light = new THREE.PointLight(color, 0, 8, 2);
    this.light.position.y = 1.2;
    this.group.add(this.light);

    this.group.visible = false;
    this.group.position.y = 0.02;
    scene.add(this.group);
  }

  showAt(x: number, z: number) {
    this.group.position.set(x, 0.02, z);
    this.group.visible = true;
    this.active = true;
    this.t = 0;
    this.group.scale.setScalar(0.01);
  }

  hide() {
    this.active = false;
    this.group.visible = false;
  }

  get pos() {
    return this.group.position;
  }

  update(dt: number) {
    if (!this.active) return;
    this.t += dt;
    const s = Math.min(1, this.t * 4);
    this.group.scale.setScalar(0.6 + s * 0.4 + Math.sin(this.t * 3) * 0.03);
    this.ring.rotation.z += dt * 0.9;
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(this.t * 5) * 0.25;
    (this.disc.material as THREE.MeshBasicMaterial).opacity = 0.16 + Math.sin(this.t * 2.4) * 0.08;
    this.pillars.forEach((p, i) => {
      p.position.y = 0.8 + Math.sin(this.t * 2.2 + i * 0.7) * 0.22;
      p.scale.y = 0.85 + Math.sin(this.t * 3 + i) * 0.18;
    });
    this.glow.material.opacity = 0.35 + Math.sin(this.t * 2.8) * 0.12;
    this.light.intensity = 3 + Math.sin(this.t * 4) * 1.2;

    // spawn tiny dust motes rising from the seam
    if (Math.random() < 0.3 && this.ctxFx) {
      this.ctxFx.dust(this.group.position.x, 0.15, this.group.position.z, 1, 0x7ee04a);
    }
  }

  ctxFx?: import('./fx').FX;

  isInside(x: number, z: number) {
    return this.active && Math.hypot(x - this.group.position.x, z - this.group.position.z) < 1.55;
  }
}
