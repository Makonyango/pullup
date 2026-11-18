import * as THREE from 'three';

export type BoxerPaintColor = 'red' | 'black' | 'blue';
export type CameraPerspective = 'chase' | 'cockpit';

export interface Boxer150Rig {
  root: THREE.Group;
  leanGroup: THREE.Group;
  steeringPivot: THREE.Group;
  frontWheel: THREE.Group;
  rearWheel: THREE.Group;
  headlightBeam: THREE.SpotLight;
  leftIndicator: THREE.Mesh;
  rightIndicator: THREE.Mesh;
  brakeLight: THREE.Mesh;
  update: (params: {
    speedMs: number;
    steerAngleRad: number;
    leanAngleRad: number;
    isBraking: boolean;
    headlightOn: boolean;
    indicatorState: 'none' | 'left' | 'right' | 'hazard';
    elapsedSec: number;
    dt: number;
  }) => void;
  updateCamera: (
    camera: THREE.PerspectiveCamera,
    perspective: CameraPerspective,
    dt: number
  ) => void;
  dispose: () => void;
}

const PAINT_PALETTE: Record<
  BoxerPaintColor,
  { primary: number; stripe: number }
> = {
  red: { primary: 0xb91c1c, stripe: 0xf59e0b },
  black: { primary: 0x18181b, stripe: 0xdc2626 },
  blue: { primary: 0x1d4ed8, stripe: 0x38bdf8 },
};

function buildSpokedWheel(radius: number, tyreWidth: number): THREE.Group {
  const wheelGroup = new THREE.Group();

  // Off-road semi-knobby tyre torus
  const tyreGeo = new THREE.TorusGeometry(radius - tyreWidth * 0.45, tyreWidth * 0.48, 12, 28);
  tyreGeo.rotateY(Math.PI / 2);
  const tyreMat = new THREE.MeshStandardMaterial({
    color: 0x151517,
    roughness: 0.88,
    metalness: 0.05,
  });
  const tyreMesh = new THREE.Mesh(tyreGeo, tyreMat);
  tyreMesh.castShadow = true;
  wheelGroup.add(tyreMesh);

  // Off-road tread knobs around circumference
  const knobGeo = new THREE.BoxGeometry(tyreWidth * 0.85, 0.025, 0.04);
  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 2;
    const knob = new THREE.Mesh(knobGeo, tyreMat);
    knob.position.set(
      0,
      Math.cos(angle) * (radius - 0.01),
      Math.sin(angle) * (radius - 0.01)
    );
    knob.rotation.x = angle;
    wheelGroup.add(knob);
  }

  // Steel rim
  const rimGeo = new THREE.TorusGeometry(radius - tyreWidth * 0.85, 0.018, 8, 24);
  rimGeo.rotateY(Math.PI / 2);
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xd4d4d8,
    roughness: 0.25,
    metalness: 0.85,
  });
  wheelGroup.add(new THREE.Mesh(rimGeo, chromeMat));

  // Center drum hub
  const hubGeo = new THREE.CylinderGeometry(0.065, 0.065, tyreWidth * 1.1, 16);
  hubGeo.rotateZ(Math.PI / 2);
  const hubMat = new THREE.MeshStandardMaterial({
    color: 0x3f3f46,
    roughness: 0.4,
    metalness: 0.7,
  });
  wheelGroup.add(new THREE.Mesh(hubGeo, hubMat));

  // Wire spokes
  const spokeGeo = new THREE.CylinderGeometry(0.004, 0.004, (radius - tyreWidth * 0.85) * 2, 6);
  for (let s = 0; s < 8; s++) {
    const spoke = new THREE.Mesh(spokeGeo, chromeMat);
    spoke.rotation.x = (s / 8) * Math.PI;
    wheelGroup.add(spoke);
  }

  return wheelGroup;
}

export function createBajajBoxer150X(
  paintColor: BoxerPaintColor = 'red'
): Boxer150Rig {
  const palette = PAINT_PALETTE[paintColor];

  const root = new THREE.Group();
  const leanGroup = new THREE.Group();
  root.add(leanGroup);

  // Shared realistic materials (matte/metallic physical surfaces, no artificial glow)
  const paintMat = new THREE.MeshStandardMaterial({
    color: palette.primary,
    roughness: 0.35,
    metalness: 0.25,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: palette.stripe,
    roughness: 0.4,
    metalness: 0.15,
  });
  const frameBlackMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.55,
    metalness: 0.6,
  });
  const engineAlloyMat = new THREE.MeshStandardMaterial({
    color: 0x71717a,
    roughness: 0.38,
    metalness: 0.75,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe4e4e7,
    roughness: 0.2,
    metalness: 0.9,
  });
  const seatLeatherMat = new THREE.MeshStandardMaterial({
    color: 0x1f1f23,
    roughness: 0.85,
    metalness: 0.05,
  });

  // 1. Rear Wheel (100/90 - 17")
  const rearWheelRadius = 0.31;
  const rearWheel = buildSpokedWheel(rearWheelRadius, 0.11);
  rearWheel.position.set(0, rearWheelRadius, 0.64);
  leanGroup.add(rearWheel);

  // Rear Swingarm & SNS Twin Shock Springs
  const swingarm = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.04, 0.52),
    frameBlackMat
  );
  swingarm.position.set(0, 0.32, 0.38);
  leanGroup.add(swingarm);

  for (const side of [-0.11, 0.11]) {
    const shock = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.36, 10),
      chromeMat
    );
    shock.position.set(side, 0.52, 0.52);
    shock.rotation.x = -0.32;
    leanGroup.add(shock);
  }

  // 2. Tubular Frame & 144.8cc Air-Cooled Engine Block
  const engineBlock = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.24, 0.26),
    engineAlloyMat
  );
  engineBlock.position.set(0, 0.41, 0.02);
  engineBlock.castShadow = true;
  leanGroup.add(engineBlock);

  // Cooling fins on cylinder
  const cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 0.18, 12),
    frameBlackMat
  );
  cylinder.position.set(0, 0.56, -0.05);
  cylinder.rotation.x = 0.22;
  leanGroup.add(cylinder);

  // Exhaust pipe & muffler (Right side)
  const exhaustPipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.65, 10),
    chromeMat
  );
  exhaustPipe.rotation.x = Math.PI / 2;
  exhaustPipe.position.set(0.13, 0.31, 0.24);
  leanGroup.add(exhaustPipe);

  const muffler = new THREE.Mesh(
    new THREE.CylinderGeometry(0.046, 0.042, 0.46, 12),
    frameBlackMat
  );
  muffler.rotation.x = Math.PI / 2 - 0.08;
  muffler.position.set(0.14, 0.36, 0.54);
  leanGroup.add(muffler);

  // 3. Sculpted 11L Bajaj Boxer Fuel Tank
  const tankGroup = new THREE.Group();
  tankGroup.position.set(0, 0.77, -0.14);
  const tankBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.19, 0.42),
    paintMat
  );
  tankBody.castShadow = true;
  tankGroup.add(tankBody);

  // Side Boxer 150X decal stripes
  for (const side of [-0.132, 0.132]) {
    const decal = new THREE.Mesh(
      new THREE.BoxGeometry(0.008, 0.05, 0.32),
      stripeMat
    );
    decal.position.set(side, 0.01, 0);
    tankGroup.add(decal);
  }

  // Chrome fuel cap
  const fuelCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.032, 0.02, 14),
    chromeMat
  );
  fuelCap.position.set(0, 0.1, -0.04);
  tankGroup.add(fuelCap);
  leanGroup.add(tankGroup);

  // 4. Elongated Ribbed Saddle Seat & Heavy-Duty Carrier Rack
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(0.23, 0.11, 0.56),
    seatLeatherMat
  );
  seat.position.set(0, 0.74, 0.33);
  seat.castShadow = true;
  leanGroup.add(seat);

  const carrierRack = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.025, 0.24),
    chromeMat
  );
  carrierRack.position.set(0, 0.76, 0.71);
  leanGroup.add(carrierRack);

  // Rear Mudguard & Tail/Brake Light + Indicators
  const rearFender = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.04, 0.28),
    frameBlackMat
  );
  rearFender.position.set(0, 0.64, 0.78);
  rearFender.rotation.x = 0.45;
  leanGroup.add(rearFender);

  const brakeMat = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    emissive: 0x450a0a,
    roughness: 0.3,
  });
  const brakeLight = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.045, 0.03),
    brakeMat
  );
  brakeLight.position.set(0, 0.67, 0.87);
  leanGroup.add(brakeLight);

  const leftIndMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    emissive: 0x000000,
  });
  const rightIndMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    emissive: 0x000000,
  });
  const leftIndicator = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 8, 8),
    leftIndMat
  );
  leftIndicator.position.set(-0.12, 0.67, 0.85);
  const rightIndicator = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 8, 8),
    rightIndMat
  );
  rightIndicator.position.set(0.12, 0.67, 0.85);
  leanGroup.add(leftIndicator, rightIndicator);

  // 5. Rider Silhouette (Torso, Arms gripping handlebars, High-Vis Helmet)
  const jacketMat = new THREE.MeshStandardMaterial({
    color: 0x27272a,
    roughness: 0.8,
  });
  const reflectorVestMat = new THREE.MeshStandardMaterial({
    color: 0x84cc16, // Authentic Kenyan Boda Neon Green Reflector Jacket
    roughness: 0.6,
  });
  const helmetMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.25,
    metalness: 0.2,
  });

  const riderTorso = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.42, 0.18),
    reflectorVestMat
  );
  riderTorso.position.set(0, 1.02, 0.16);
  riderTorso.rotation.x = -0.18;
  riderTorso.castShadow = true;
  leanGroup.add(riderTorso);

  const riderHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.115, 16, 16),
    helmetMat
  );
  riderHead.position.set(0, 1.32, 0.1);
  riderHead.castShadow = true;
  leanGroup.add(riderHead);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.17, 0.055, 0.06),
    frameBlackMat
  );
  visor.position.set(0, 1.32, 0.0);
  leanGroup.add(visor);

  for (const side of [-0.17, 0.17]) {
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.032, 0.42, 8),
      jacketMat
    );
    arm.position.set(side, 0.98, -0.08);
    arm.rotation.x = Math.PI / 2 - 0.25;
    leanGroup.add(arm);
  }

  // 6. Articulated Front Steering Assembly (Forks, High Mudguard, Headlamp, Handlebars, Front Wheel)
  const steeringPivot = new THREE.Group();
  steeringPivot.position.set(0, 0.72, -0.42);
  steeringPivot.rotation.x = 0.36; // Authentic 26° rake angle
  leanGroup.add(steeringPivot);

  // Telescopic Front Forks
  for (const side of [-0.085, 0.085]) {
    const upperFork = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.42, 10),
      frameBlackMat
    );
    upperFork.position.set(side, -0.12, 0);
    steeringPivot.add(upperFork);

    const lowerSlider = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.026, 0.32, 10),
      engineAlloyMat
    );
    lowerSlider.position.set(side, -0.44, 0);
    steeringPivot.add(lowerSlider);
  }

  // High-Raised Off-Road Front Mudguard (Signature Boxer BM150X feature)
  const highFender = new THREE.Mesh(
    new THREE.BoxGeometry(0.13, 0.035, 0.42),
    paintMat
  );
  highFender.position.set(0, -0.22, -0.06);
  highFender.rotation.x = -0.15;
  steeringPivot.add(highFender);

  // Wide Off-Road Handlebars & Speedometer Console
  const handlebar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, 0.72, 10),
    chromeMat
  );
  handlebar.rotation.z = Math.PI / 2;
  handlebar.position.set(0, 0.16, 0.02);
  steeringPivot.add(handlebar);

  for (const side of [-0.33, 0.33]) {
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.12, 10),
      frameBlackMat
    );
    grip.rotation.z = Math.PI / 2;
    grip.position.set(side, 0.16, 0.02);
    steeringPivot.add(grip);

    // Side Mirror Stalk + Mirror
    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.14, 6),
      frameBlackMat
    );
    stalk.position.set(side * 0.78, 0.24, 0.02);
    stalk.rotation.z = side < 0 ? 0.25 : -0.25;
    steeringPivot.add(stalk);

    const mirror = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.055, 0.015),
      frameBlackMat
    );
    mirror.position.set(side * 0.85, 0.31, 0.02);
    steeringPivot.add(mirror);
  }

  // Analog Boxer Instrument Cluster (visible in 1st-person cockpit view)
  const speedoHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.065, 0.06, 0.05, 16),
    frameBlackMat
  );
  speedoHousing.position.set(0, 0.18, -0.05);
  speedoHousing.rotation.x = -0.45;
  steeringPivot.add(speedoHousing);

  // 12V HS-1 Round Headlamp + Spotlight Beam
  const headlampHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.075, 0.11, 16),
    frameBlackMat
  );
  headlampHousing.rotation.x = Math.PI / 2;
  headlampHousing.position.set(0, 0.04, -0.08);
  steeringPivot.add(headlampHousing);

  const lensMat = new THREE.MeshStandardMaterial({
    color: 0xfef9c3,
    emissive: 0xfef08a,
    emissiveIntensity: 0.9,
  });
  const headlampLens = new THREE.Mesh(
    new THREE.CircleGeometry(0.078, 16),
    lensMat
  );
  headlampLens.rotation.y = Math.PI;
  headlampLens.position.set(0, 0.04, -0.136);
  steeringPivot.add(headlampLens);

  const headlightBeam = new THREE.SpotLight(0xfffbeb, 3.2, 42, Math.PI / 5, 0.45, 1.2);
  headlightBeam.position.set(0, 0.04, -0.15);
  const beamTarget = new THREE.Object3D();
  beamTarget.position.set(0, -1.2, -16);
  steeringPivot.add(beamTarget);
  headlightBeam.target = beamTarget;
  steeringPivot.add(headlightBeam);

  // Front Wheel (3.00 - 17")
  const frontWheelRadius = 0.31;
  const frontWheel = buildSpokedWheel(frontWheelRadius, 0.085);
  frontWheel.position.set(0, -0.58, 0);
  steeringPivot.add(frontWheel);

  // Camera smoothing vectors
  const currentCamPos = new THREE.Vector3(0, 2.2, 3.6);
  const currentLookAt = new THREE.Vector3(0, 1.0, -8);

  return {
    root,
    leanGroup,
    steeringPivot,
    frontWheel,
    rearWheel,
    headlightBeam,
    leftIndicator,
    rightIndicator,
    brakeLight,

    update({
      speedMs,
      steerAngleRad,
      leanAngleRad,
      isBraking,
      headlightOn,
      indicatorState,
      elapsedSec,
      dt,
    }) {
      // Spin wheels according to real linear velocity (omega = v / r)
      const wheelAngularVel = speedMs / rearWheelRadius;
      frontWheel.rotation.x -= wheelAngularVel * dt;
      rearWheel.rotation.x -= wheelAngularVel * dt;

      // Turn handlebars & lean chassis into corner
      steeringPivot.rotation.y = steerAngleRad;
      leanGroup.rotation.z = leanAngleRad;

      // Brake light illumination
      brakeMat.emissive.setHex(isBraking ? 0xef4444 : 0x3b0707);
      brakeMat.emissiveIntensity = isBraking ? 1.4 : 0.4;

      // Headlight toggle
      headlightBeam.visible = headlightOn;
      lensMat.emissiveIntensity = headlightOn ? 0.95 : 0.05;

      // Turn indicator blinking (2 Hz)
      const blinkOn = Math.floor(elapsedSec * 4) % 2 === 0;
      leftIndMat.emissive.setHex(
        blinkOn && (indicatorState === 'left' || indicatorState === 'hazard')
          ? 0xf59e0b
          : 0x000000
      );
      rightIndMat.emissive.setHex(
        blinkOn && (indicatorState === 'right' || indicatorState === 'hazard')
          ? 0xf59e0b
          : 0x000000
      );
    },

    updateCamera(
      camera: THREE.PerspectiveCamera,
      perspective: CameraPerspective,
      dt: number
    ) {
      root.updateMatrixWorld();

      if (perspective === 'cockpit') {
        // 1st-Person Handlebar / Rider Eye View
        const localEye = new THREE.Vector3(0, 1.24, -0.18);
        const localLook = new THREE.Vector3(0, 1.05, -14);
        const worldEye = localEye.applyMatrix4(root.matrixWorld);
        const worldLook = localLook.applyMatrix4(root.matrixWorld);

        camera.position.copy(worldEye);
        camera.lookAt(worldLook);
      } else {
        // 3rd-Person BUSSID Chase View
        const desiredLocalPos = new THREE.Vector3(0, 2.05, 3.45);
        const desiredLocalLook = new THREE.Vector3(0, 1.05, -9.0);

        const worldPos = desiredLocalPos.applyMatrix4(root.matrixWorld);
        const worldLook = desiredLocalLook.applyMatrix4(root.matrixWorld);

        const lerpAlpha = 1 - Math.exp(-10 * dt);
        currentCamPos.lerp(worldPos, lerpAlpha);
        currentLookAt.lerp(worldLook, lerpAlpha);

        camera.position.copy(currentCamPos);
        camera.lookAt(currentLookAt);
      }
    },

    dispose() {
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    },
  };
}