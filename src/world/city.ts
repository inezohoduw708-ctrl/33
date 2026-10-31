import * as THREE from 'three';
import {
  asphaltTexture,
  sidewalkTexture,
  buildingTexture,
  neonSignTexture,
  graffitiTexture,
  stdMat,
  makeSky,
  radialTexture,
} from '../core/assets';
import { mulberry32 } from '../core/utils';
import type { LevelDef } from '../types';

export interface Collider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  tall?: boolean;
}

const STREET_MIN_Z = -78;
const STREET_MAX_Z = 78;
const ROAD_HALF = 9;
const WALK_OUTER = 14.2;

export class City {
  group = new THREE.Group();
  colliders: Collider[] = [];
  bounds = { minX: -WALK_OUTER, maxX: WALK_OUTER, minZ: STREET_MIN_Z + 2, maxZ: STREET_MAX_Z - 2 };
  private steamEmitters: { mesh: THREE.Sprite; offset: number; speed: number }[] = [];
  private neonMeshes: { mesh: THREE.Mesh; base: number; speed: number }[] = [];
  private blinkers: { mat: THREE.MeshStandardMaterial; phase: number }[] = [];
  private rain?: THREE.Points;
  private rainVel?: Float32Array;
  private time = 0;
  private movingCars: { obj: THREE.Object3D; dir: number; speed: number }[] = [];
  skyMesh: THREE.Mesh;
  keyLight?: THREE.DirectionalLight;
  fogColor: THREE.Color;

  constructor(public scene: THREE.Scene, public level: LevelDef) {
    const sky = makeSky(level.timeOfDay);
    this.skyMesh = sky.mesh;
    this.fogColor = sky.fogColor;
    this.skyMesh.renderOrder = -1;
    this.group.add(this.skyMesh);
    this.build(level.seed);
    scene.add(this.group);

    scene.fog = new THREE.FogExp2(sky.fogColor.getHex(), level.timeOfDay === 'storm' ? 0.028 : 0.019);
    if (level.timeOfDay === 'storm') this.buildRain();
  }

  private addCollider(c: Collider) {
    this.colliders.push(c);
  }

  private build(seed: number) {
    const rnd = mulberry32(seed);
    const g = this.group;

    /* ---------------- ground ---------------- */
    const asphalt = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HALF * 2, STREET_MAX_Z - STREET_MIN_Z),
      new THREE.MeshStandardMaterial({
        map: asphaltTexture(),
        roughness: 0.68,
        metalness: 0.22,
        color: 0xb9c1c8,
      }),
    );
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.receiveShadow = true;
    g.add(asphalt);

    // lane markings
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xd8c56a,
      roughness: 0.7,
      emissive: 0x4a4020,
      emissiveIntensity: 0.5,
    });
    for (let z = STREET_MIN_Z + 3; z < STREET_MAX_Z; z += 7) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 3), lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.012, z);
      dash.receiveShadow = false;
      g.add(dash);
    }
    // crosswalk stripes
    for (const cz of [-26, 26]) {
      for (let i = -7; i <= 7; i++) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 3.6), lineMat);
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(i * 1.05, 0.014, cz);
        g.add(stripe);
      }
    }

    // sidewalks
    const walkMat = new THREE.MeshStandardMaterial({
      map: sidewalkTexture(),
      roughness: 0.85,
      metalness: 0.1,
      color: 0xc8cdd2,
    });
    for (const side of [-1, 1]) {
      const w = WALK_OUTER - ROAD_HALF;
      const walk = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, STREET_MAX_Z - STREET_MIN_Z), walkMat);
      walk.position.set(side * (ROAD_HALF + w / 2), 0.14, (STREET_MAX_Z + STREET_MIN_Z) / 2);
      walk.receiveShadow = true;
      walk.castShadow = false;
      g.add(walk);
      // curb
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.32, STREET_MAX_Z - STREET_MIN_Z),
        stdMat(0x9aa1a6, { rough: 0.7 }),
      );
      curb.position.set(side * ROAD_HALF, 0.16, (STREET_MAX_Z + STREET_MIN_Z) / 2);
      curb.receiveShadow = true;
      g.add(curb);
    }

    // manholes + steam
    for (const z of [-40, -8, 22, 52]) {
      const hole = new THREE.Mesh(
        new THREE.CircleGeometry(0.75, 20),
        stdMat(0x2a2c30, { rough: 0.9, metal: 0.6 }),
      );
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(rnd() * 5 - 2.5, 0.015, z);
      g.add(hole);
      this.addSteam(hole.position.x, z);
    }

    // puddles
    for (let i = 0; i < 12; i++) {
      const p = new THREE.Mesh(
        new THREE.CircleGeometry(0.7 + rnd() * 1.6, 14),
        new THREE.MeshStandardMaterial({
          color: 0x2b3b45,
          roughness: 0.06,
          metalness: 0.95,
          transparent: true,
          opacity: 0.72,
        }),
      );
      p.rotation.x = -Math.PI / 2;
      p.position.set((rnd() - 0.5) * 16, 0.018, STREET_MIN_Z + rnd() * (STREET_MAX_Z - STREET_MIN_Z));
      p.scale.set(1, 1 + rnd(), 1);
      g.add(p);
    }

    /* ---------------- buildings ---------------- */
    const tints = ['#3d332f', '#463c37', '#39363b', '#4a3a30', '#333a42'];
    const litRatio = this.level.timeOfDay === 'night' ? 0.42 : this.level.timeOfDay === 'dusk' ? 0.3 : 0.18;
    let bIdx = 0;
    let neonLights = 0;

    for (const side of [-1, 1]) {
      let z = STREET_MIN_Z;
      while (z < STREET_MAX_Z) {
        // leave a cross-street gap at z ~ 0 and varied alleys
        const depthZ = 10 + rnd() * 9;
        const isGap = (z < 2 && z + depthZ > -2) || rnd() < 0.12;
        if (isGap) {
          z += depthZ * 0.6;
          continue;
        }
        const height = 14 + rnd() * 26;
        const depthX = 11 + rnd() * 6;
        const tint = tints[Math.floor(rnd() * tints.length)];
        const tex = buildingTexture(100 + bIdx * 7, tint, litRatio);
        const facade = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.9,
          metalness: 0.08,
          emissiveMap: tex,
          emissive: new THREE.Color(0xffffff),
          emissiveIntensity: this.level.timeOfDay === 'night' ? 0.55 : 0.3,
        });
        const plain = stdMat(0x2b2a2d, { rough: 0.95 });
        const mats = [facade, facade, plain, plain, facade, facade];
        const building = new THREE.Mesh(new THREE.BoxGeometry(depthX, height, depthZ), mats);
        const x = side * (WALK_OUTER + depthX / 2 - 0.2);
        building.position.set(x, height / 2, z + depthZ / 2);
        building.castShadow = true;
        building.receiveShadow = true;
        g.add(building);

        // rooftop parapet
        const parapet = new THREE.Mesh(
          new THREE.BoxGeometry(depthX + 0.4, 0.7, depthZ + 0.4),
          stdMat(0x22262a, { rough: 0.9 }),
        );
        parapet.position.set(x, height + 0.35, z + depthZ / 2);
        parapet.castShadow = true;
        g.add(parapet);

        // fire escape (simple suggested geometry)
        if (rnd() < 0.55) {
          const feMat = stdMat(0x2a2c30, { rough: 0.6, metal: 0.7 });
          for (let f = 0; f < 4; f++) {
            const y = 4 + f * 3.4;
            const platform = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1.1), feMat);
            platform.position.set(side * (WALK_OUTER - 0.6), y, z + depthZ / 2 + (f % 2 ? 1.4 : -1.4));
            platform.castShadow = true;
            g.add(platform);
            const rail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.06), feMat);
            rail.position.set(side * (WALK_OUTER - 0.6), y + 0.55, platform.position.z + 0.5);
            g.add(rail);
          }
        }

        // water tower on wide roofs
        if (depthZ > 13 && rnd() < 0.5) {
          const wt = new THREE.Group();
          const legs = stdMat(0x2c2318, { rough: 0.9 });
          for (const [lx, lz] of [
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3, 6), legs);
            leg.position.set(lx * 0.9, 1.5, lz * 0.9);
            wt.add(leg);
          }
          const tank = new THREE.Mesh(
            new THREE.CylinderGeometry(1.4, 1.5, 2.6, 14),
            stdMat(0x5a4029, { rough: 0.95 }),
          );
          tank.position.y = 4.2;
          tank.castShadow = true;
          wt.add(tank);
          const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.9, 14), stdMat(0x3a2a1a, { rough: 1 }));
          roof.position.y = 5.9;
          wt.add(roof);
          wt.position.set(x, height, z + depthZ / 2);
          g.add(wt);
        }

        // neon sign on some storefronts
        if (rnd() < 0.5) {
          const words = [
            ['PIZZA', '#ff8a1f'],
            ['ARCADE', '#1de3c2'],
            ['DOJO', '#ff3b7a'],
            ['NOODLES', '#ffd23b'],
            ['24H', '#7ee04a'],
            ['TATTOO', '#b46bff'],
          ] as const;
          const [word, col] = words[Math.floor(rnd() * words.length)];
          const signTex = neonSignTexture(word, col);
          const signMat = new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false });
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), signMat);
          sign.position.set(side * (WALK_OUTER - 0.35), 4.2 + rnd() * 2, z + depthZ / 2);
          sign.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
          g.add(sign);
          this.neonMeshes.push({ mesh: sign, base: 0.75, speed: 0.5 + rnd() * 2 });

          // keep the real-light count low; extra signs still glow via emissive maps
          if (neonLights < 3) {
            neonLights++;
            const light = new THREE.PointLight(new THREE.Color(col), 6, 14, 2);
            light.position.copy(sign.position);
            light.position.x -= side * 1.2;
            light.position.y -= 0.4;
            g.add(light);
          }
        }

        // graffiti on lower wall
        if (rnd() < 0.4) {
          const graf = new THREE.Mesh(
            new THREE.PlaneGeometry(4, 2),
            new THREE.MeshBasicMaterial({
              map: graffitiTexture(Math.floor(rnd() * 9999)),
              transparent: true,
              depthWrite: false,
              opacity: 0.9,
            }),
          );
          graf.position.set(side * (WALK_OUTER - 0.3), 1.9, z + depthZ / 2);
          graf.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
          g.add(graf);
        }

        this.addCollider({
          minX: side > 0 ? x - depthX / 2 : x - depthX / 2,
          maxX: x + depthX / 2,
          minZ: z,
          maxZ: z + depthZ,
          tall: true,
        });

        bIdx++;
        z += depthZ + 0.6;
      }
    }

    /* ---------------- street furniture ---------------- */
    const lampMat = stdMat(0x1e2226, { rough: 0.5, metal: 0.8 });
    for (let z = STREET_MIN_Z + 6; z < STREET_MAX_Z; z += 15) {
      for (const side of [-1, 1]) {
        const post = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 6.4, 8), lampMat);
        pole.position.y = 3.2;
        pole.castShadow = true;
        post.add(pole);
        const armCurve = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 6, 12, Math.PI / 2), lampMat);
        armCurve.position.set(0, 6.4, 0);
        armCurve.rotation.z = side > 0 ? Math.PI : 0;
        armCurve.rotation.y = Math.PI / 2;
        post.add(armCurve);
        const head = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.16, 0.3),
          stdMat(0x2a2f34, { rough: 0.4, metal: 0.7 }),
        );
        head.position.set(-side * 0.9, 6.35, 0);
        post.add(head);
        const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0, toneMapped: false });
        const bulb = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.24), bulbMat);
        bulb.rotation.x = -Math.PI / 2;
        bulb.position.set(-side * 0.9, 6.25, 0);
        post.add(bulb);
        const glow = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: radialTexture('rgba(255,224,160,0.95)', 'rgba(255,200,120,0)'),
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
            opacity: 0.55,
          }),
        );
        glow.scale.setScalar(4.2);
        glow.position.set(-side * 0.9, 6.2, 0);
        post.add(glow);
        post.position.set(side * (ROAD_HALF + 0.8), 0, z + (side > 0 ? 0 : 5));
        g.add(post);
        this.addCollider({
          minX: post.position.x - 0.25,
          maxX: post.position.x + 0.25,
          minZ: post.position.z - 0.25,
          maxZ: post.position.z + 0.25,
          tall: true,
        });
      }
    }

    // traffic lights at crosswalks
    for (const cz of [-27, 27]) {
      for (const side of [-1, 1]) {
        const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.95, 0.24), stdMat(0x22262a, { rough: 0.6 }));
        boxMesh.position.set(side * (ROAD_HALF + 1.4), 4.4, cz);
        g.add(boxMesh);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.4, 6), lampMat);
        pole.position.set(side * (ROAD_HALF + 1.4), 2.2, cz);
        g.add(pole);
        const colors = [0xff2f2f, 0xffcf3d, 0x33ff88];
        const c = colors[Math.floor(rnd() * 3)];
        const lamp = new THREE.Mesh(
          new THREE.CircleGeometry(0.1, 12),
          new THREE.MeshBasicMaterial({ color: c, toneMapped: false }),
        );
        lamp.position.set(side * (ROAD_HALF + 1.4) + side * -0.13, 4.6, cz);
        lamp.rotation.y = -side * Math.PI / 2;
        g.add(lamp);
      }
    }

    // fire hydrants, bins, newspaper boxes
    for (let i = 0; i < 10; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const z = STREET_MIN_Z + 8 + i * 15 + rnd() * 4;
      const hyd = new THREE.Group();
      const hydMat = stdMat(0xb8342a, { rough: 0.6, metal: 0.3 });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.6, 8), hydMat);
      base.position.y = 0.3;
      base.castShadow = true;
      hyd.add(base);
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), hydMat);
      top.position.y = 0.62;
      hyd.add(top);
      for (const s of [-1, 1]) {
        const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 6), hydMat);
        noz.rotation.z = Math.PI / 2;
        noz.position.set(s * 0.19, 0.42, 0);
        hyd.add(noz);
      }
      hyd.position.set(side * (ROAD_HALF + 1.5), 0.28, z);
      g.add(hyd);

      if (rnd() < 0.6) {
        const can = new THREE.Mesh(
          new THREE.CylinderGeometry(0.33, 0.28, 0.95, 10),
          stdMat(0x2d3b34, { rough: 0.75, metal: 0.4 }),
        );
        can.position.set(side * (ROAD_HALF + 2.4), 0.75, z + 2);
        can.castShadow = true;
        g.add(can);
        this.addCollider({
          minX: can.position.x - 0.4,
          maxX: can.position.x + 0.4,
          minZ: can.position.z - 0.4,
          maxZ: can.position.z + 0.4,
        });
      }
    }

    /* ---------------- parked cars ---------------- */
    const carColors = [0xf2c12e, 0xd94b3a, 0x3a6ea8, 0x2f3238];
    for (let i = 0; i < 5; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const car = this.buildCar(carColors[i % carColors.length], rnd() < 0.4);
      car.position.set(side * (ROAD_HALF - 1.4), 0, STREET_MIN_Z + 14 + i * 27);
      car.rotation.y = side > 0 ? 0 : Math.PI;
      g.add(car);
      this.addCollider({
        minX: car.position.x - 1.1,
        maxX: car.position.x + 1.1,
        minZ: car.position.z - 2.3,
        maxZ: car.position.z + 2.3,
      });
    }

    // one moving car for life in the background
    const moving = this.buildCar(0xe8e2d0, false);
    moving.position.set(ROAD_HALF - 2.2, 0, STREET_MIN_Z);
    g.add(moving);
    this.movingCars.push({ obj: moving, dir: 1, speed: 7 });

    /* ---------------- distant skyline ---------------- */
    const skylineMat = new THREE.MeshBasicMaterial({ color: 0x111a24 });
    const skyline2 = new THREE.MeshBasicMaterial({ color: 0x0a1018 });
    for (let i = 0; i < 42; i++) {
      const h = 24 + rnd() * 80;
      const w = 8 + rnd() * 16;
      const bx = (rnd() > 0.5 ? 1 : -1) * (40 + rnd() * 110);
      const bz = STREET_MIN_Z - 20 + rnd() * (STREET_MAX_Z - STREET_MIN_Z + 80);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), rnd() > 0.5 ? skylineMat : skyline2);
      m.position.set(bx, h / 2 - 2, bz);
      this.group.add(m);
    }

    // moon / sun disc
    const moon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialTexture('rgba(230,240,255,1)', 'rgba(180,210,255,0)'),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        opacity: 0.9,
      }),
    );
    moon.scale.setScalar(70);
    moon.position.set(-120, 150, -260);
    this.group.add(moon);

    /* ---------------- lights ---------------- */
    const hemi = new THREE.HemisphereLight(
      this.level.timeOfDay === 'dusk' ? 0xd07a4a : 0x4a6a9a,
      0x14161a,
      this.level.timeOfDay === 'night' ? 0.55 : this.level.timeOfDay === 'storm' ? 0.5 : 0.85,
    );
    this.group.add(hemi);

    const amb = new THREE.AmbientLight(0x6a8296, this.level.timeOfDay === 'night' ? 0.5 : 0.72);
    this.group.add(amb);

    // moon key light with shadows (single shadow-casting dir light for perf)
    const key = new THREE.DirectionalLight(
      this.level.timeOfDay === 'dusk' ? 0xffb070 : 0xa9c8ff,
      this.level.timeOfDay === 'night' ? 0.9 : 1.25,
    );
    key.position.set(-28, 46, 26);
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    key.shadow.camera.left = -34;
    key.shadow.camera.right = 34;
    key.shadow.camera.top = 46;
    key.shadow.camera.bottom = -46;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 130;
    key.shadow.bias = -0.0012;
    key.shadow.normalBias = 0.03;
    this.group.add(key);
    this.group.add(key.target);
    this.keyLight = key;

    // cool rim light from behind so silhouettes pop out of the fog
    const rim = new THREE.DirectionalLight(0x74c8ff, this.level.timeOfDay === 'dusk' ? 0.35 : 0.6);
    rim.position.set(26, 16, -34);
    this.group.add(rim);
    const rimWarm = new THREE.DirectionalLight(0xff9a55, 0.28);
    rimWarm.position.set(-26, 10, 34);
    this.group.add(rimWarm);

    // warm counter light from the signs side
    const fill = new THREE.PointLight(0xff9a4a, 14, 40, 2);
    fill.position.set(0, 7, 0);
    this.group.add(fill);

  }

  private buildCar(color: number, taxi: boolean): THREE.Group {
    const car = new THREE.Group();
    const bodyMat = stdMat(color, { rough: 0.35, metal: 0.6 });
    const glass = new THREE.MeshStandardMaterial({
      color: 0x0b1418,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.85,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.62, 4.2), bodyMat);
    body.position.y = 0.62;
    body.castShadow = true;
    car.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.6, 2.1), glass);
    cabin.position.set(0, 1.16, -0.15);
    car.add(cabin);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.12, 1.9), bodyMat);
    roof.position.set(0, 1.44, -0.15);
    car.add(roof);
    const wheelMat = stdMat(0x0d0d10, { rough: 0.9 });
    for (const [wx, wz] of [
      [-0.85, 1.35],
      [0.85, 1.35],
      [-0.85, -1.35],
      [0.85, -1.35],
    ]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.36, wz);
      car.add(wheel);
    }
    for (const s of [-1, 1]) {
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.16, 0.08),
        new THREE.MeshBasicMaterial({ color: 0xfff3c4, toneMapped: false }),
      );
      head.position.set(s * 0.62, 0.66, 2.11);
      car.add(head);
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.14, 0.06),
        new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false }),
      );
      tail.position.set(s * 0.62, 0.66, -2.11);
      car.add(tail);
    }
    if (taxi) {
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.24, 0.34),
        new THREE.MeshBasicMaterial({ map: neonSignTexture('TAXI', '#ffcf3d', '#151006'), toneMapped: false }),
      );
      sign.position.set(0, 1.62, -0.15);
      car.add(sign);
    }
    return car;
  }

  private addSteam(x: number, z: number) {
    for (let i = 0; i < 4; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: radialTexture('rgba(220,235,245,0.55)', 'rgba(200,220,235,0)'),
          transparent: true,
          depthWrite: false,
          opacity: 0.24,
          blending: THREE.NormalBlending,
        }),
      );
      sprite.position.set(x + (Math.random() - 0.5) * 0.5, 0.2, z + (Math.random() - 0.5) * 0.5);
      sprite.scale.setScalar(1.6 + i * 0.5);
      this.group.add(sprite);
      this.steamEmitters.push({ mesh: sprite, offset: i * 0.8, speed: 0.5 + Math.random() * 0.4 });
    }
  }

  private buildRain() {
    const count = 2600;
    const positions = new Float32Array(count * 3);
    this.rainVel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 26;
      positions[i * 3 + 2] = -40 + Math.random() * 80;
      this.rainVel![i] = 22 + Math.random() * 18;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.rain = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xbcd8ea,
        size: 0.09,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.group.add(this.rain);
  }

  setQualityLow() {
    if (this.rain) this.rain.visible = false;
    if (this.keyLight) this.keyLight.castShadow = false;
  }

  setQualityHigh() {
    if (this.rain) this.rain.visible = true;
    if (this.keyLight) this.keyLight.castShadow = true;
  }

  update(dt: number) {
    this.time += dt;
    // steam drift
    for (const s of this.steamEmitters) {
      s.mesh.position.y += dt * s.speed * 0.7;
      const mat = s.mesh.material as THREE.SpriteMaterial;
      const cycle = (this.time * s.speed + s.offset) % 3;
      s.mesh.position.y = 0.2 + cycle * 1.5;
      s.mesh.scale.setScalar(1.6 + cycle * 1.5);
      mat.opacity = 0.22 * (1 - cycle / 3);
      s.mesh.position.x += Math.sin(this.time * 0.7 + s.offset) * dt * 0.14;
    }
    // neon flicker
    for (const n of this.neonMeshes) {
      const mat = n.mesh.material as THREE.MeshBasicMaterial;
      const flick = 0.75 + Math.sin(this.time * n.speed * 6) * 0.12 + (Math.random() < 0.008 ? -0.5 : 0);
      mat.opacity = 1;
      mat.color.setScalar(Math.max(0.35, flick));
    }
    // rain
    if (this.rain && this.rainVel) {
      const pos = this.rain.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < this.rainVel.length; i++) {
        arr[i * 3 + 1] -= this.rainVel[i] * dt;
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3 + 1] = 24 + Math.random() * 4;
          arr[i * 3] = (Math.random() - 0.5) * 60;
        }
      }
      pos.needsUpdate = true;
    }
    // moving car loops down the street
    for (const c of this.movingCars) {
      c.obj.position.z += c.dir * c.speed * dt;
      if (c.obj.position.z > STREET_MAX_Z + 6) c.obj.position.z = STREET_MIN_Z - 6;
      if (c.obj.position.z < STREET_MIN_Z - 6) c.obj.position.z = STREET_MAX_Z + 6;
    }
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      // sprites share one geometry instance in three.js — never dispose it
      if (m.isMesh && !(o as any).isSprite && m.geometry) m.geometry.dispose();
    });
    this.scene.remove(this.group);
    this.colliders.length = 0;
  }
}

export const STREET = { minZ: STREET_MIN_Z, maxZ: STREET_MAX_Z, roadHalf: ROAD_HALF, walkOuter: WALK_OUTER };

/**
 * Circle-vs-AABB resolution with sliding: pushes the body out of every
 * overlapping collider and cancels the velocity component pointing into it,
 * so characters glide along walls instead of sticking to them.
 */
export function resolveCircleColliders(
  pos: { x: number; z: number },
  vel: { x: number; z: number } | null,
  radius: number,
  colliders: Collider[],
): boolean {
  let touched = false;
  for (let iter = 0; iter < 2; iter++) {
    let moved = false;
    for (const c of colliders) {
      if (pos.x < c.minX - radius || pos.x > c.maxX + radius) continue;
      if (pos.z < c.minZ - radius || pos.z > c.maxZ + radius) continue;

      // closest point on the box to the circle centre
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      let dx = pos.x - cx;
      let dz = pos.z - cz;
      let dist = Math.hypot(dx, dz);

      if (dist > radius) continue;

      if (dist < 1e-4) {
        // centre inside the box: push out via the shallowest face
        const dxl = pos.x - c.minX;
        const dxr = c.maxX - pos.x;
        const dzl = pos.z - c.minZ;
        const dzr = c.maxZ - pos.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) {
          pos.x = c.minX - radius;
          dx = -1;
          dz = 0;
        } else if (m === dxr) {
          pos.x = c.maxX + radius;
          dx = 1;
          dz = 0;
        } else if (m === dzl) {
          pos.z = c.minZ - radius;
          dx = 0;
          dz = -1;
        } else {
          pos.z = c.maxZ + radius;
          dx = 0;
          dz = 1;
        }
        dist = 0.0001 + radius;
      }

      const nx = dx / Math.max(dist, 1e-5);
      const nz = dz / Math.max(dist, 1e-5);
      const push = radius - dist;
      if (push > 0) {
        pos.x += nx * push;
        pos.z += nz * push;
        moved = true;
        touched = true;
      }
      if (vel) {
        const into = vel.x * -nx + vel.z * -nz;
        if (into > 0) {
          // remove the inward component → slide
          vel.x += nx * into;
          vel.z += nz * into;
        }
      }
    }
    if (!moved) break;
  }
  return touched;
}
