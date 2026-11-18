import * as THREE from 'three';
import { gpsToLocalMeters, NairobiMapSceneData, RoadSegment3D } from './nairobiOsmImporter';

export interface WorldAssets {
  tarmacMap: THREE.CanvasTexture;
  murramMap: THREE.CanvasTexture;
  facadeTextures: THREE.CanvasTexture[];
  dispose: () => void;
}

// 1. Lightweight 256x256 Procedural Asphalt Texture (Low VRAM footprint for 3-4GB RAM phones)
function createTarmacTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 256;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#252629';
  ctx.fillRect(0, 0, w, h);

  // Subtle mineral aggregate noise
  for (let i = 0; i < 4500; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const shade = 28 + Math.floor(Math.random() * 24);
    ctx.fillStyle = `rgb(${shade},${shade},${shade + 2})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Dark rubber tyre tracks
  const laneCenters = [w * 0.25, w * 0.75];
  for (const cx of laneCenters) {
    ctx.fillStyle = 'rgba(15, 15, 18, 0.22)';
    ctx.fillRect(cx - 24, 0, 48, h);
  }

  // Outer white edge lines
  ctx.fillStyle = 'rgba(228, 228, 231, 0.72)';
  ctx.fillRect(10, 0, 3, h);
  ctx.fillRect(w - 13, 0, 3, h);

  // Double yellow Kenyan center divider
  ctx.fillStyle = '#eab308';
  ctx.fillRect(w / 2 - 4, 0, 2, h);
  ctx.fillRect(w / 2 + 2, 0, 2, h);

  // Dashed white lane dividers
  ctx.fillStyle = 'rgba(244, 244, 245, 0.8)';
  for (let y = 12; y < h; y += 64) {
    ctx.fillRect(w * 0.25 - 1, y, 2, 28);
    ctx.fillRect(w * 0.75 - 1, y, 2, 28);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 2;
  return map;
}

// 2. Lightweight 256x256 Red-Brown Kenyan Murram Ground Texture
function createMurramGroundTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#5a4332';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 3500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    if (Math.random() < 0.26) {
      ctx.fillStyle = '#435834';
    } else {
      const r = 82 + Math.floor(Math.random() * 30);
      const g = 58 + Math.floor(Math.random() * 20);
      const b = 40 + Math.floor(Math.random() * 15);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
    }
    ctx.fillRect(x, y, 3, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(80, 80);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 3. Lightweight 256x256 Nairobi Building Facade Texture (Windows + Shopfronts)
function createNairobiFacadeTexture(
  style: 'glass_tower' | 'concrete_office' | 'terracotta_commercial'
): THREE.CanvasTexture {
  const w = 256;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle =
    style === 'glass_tower'
      ? '#1e293b'
      : style === 'concrete_office'
      ? '#cfc9be'
      : '#b88b68';
  ctx.fillRect(0, 0, w, h);

  const rows = 6;
  const cols = 6;
  const padX = 6;
  const topAreaH = h * 0.78;
  const cellW = (w - padX * 2) / cols;
  const cellH = topAreaH / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = padX + c * cellW + 3;
      const wy = 8 + r * cellH + 3;
      const ww = cellW - 6;
      const wh = cellH - 7;

      ctx.fillStyle = style === 'glass_tower' ? '#0284c7' : '#334155';
      ctx.fillRect(wx, wy, ww, wh);
    }
  }

  // Ground-Floor Kenyan Shopfronts
  const groundY = h * 0.8;
  const groundH = h * 0.2;
  ctx.fillStyle = '#27272a';
  ctx.fillRect(0, groundY, w, groundH);

  const shopSigns = [
    { text: 'M-PESA', bg: '#16a34a', fg: '#ffffff' },
    { text: 'CHEMIST', bg: '#0284c7', fg: '#ffffff' },
    { text: 'CAFE', bg: '#d97706', fg: '#18181b' },
    { text: 'SPARES', bg: '#dc2626', fg: '#ffffff' },
  ];

  const bayW = w / 4;
  for (let s = 0; s < 4; s++) {
    const bx = s * bayW;
    const sign = shopSigns[s];
    ctx.fillStyle = sign.bg;
    ctx.fillRect(bx + 2, groundY + 2, bayW - 4, 12);
    ctx.fillStyle = sign.fg;
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(sign.text, bx + bayW / 2, groundY + 10);

    ctx.fillStyle = '#18181b';
    ctx.fillRect(bx + 6, groundY + 17, bayW - 12, groundH - 20);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  return tex;
}

// 4. Low-Poly KICC Landmark
function buildKiccLandmark(originLat: number, originLon: number): THREE.Group {
  const kiccGroup = new THREE.Group();
  const localPos = gpsToLocalMeters(-1.2886, 36.8231, originLat, originLon);
  kiccGroup.position.set(localPos.x, 0, localPos.z);

  const terracottaMat = new THREE.MeshLambertMaterial({ color: 0xa16247 });
  const helipadMat = new THREE.MeshLambertMaterial({ color: 0x3f3f46 });

  const towerHeight = 105;
  const towerRadius = 14.5;
  const coreCylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(towerRadius, towerRadius, towerHeight, 16),
    terracottaMat
  );
  coreCylinder.position.y = towerHeight / 2;
  kiccGroup.add(coreCylinder);

  const helipadDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(18.5, 13.5, 3.5, 16),
    helipadMat
  );
  helipadDisc.position.y = towerHeight + 1.5;
  kiccGroup.add(helipadDisc);

  const plenaryHall = new THREE.Mesh(
    new THREE.CylinderGeometry(12, 22, 22, 14),
    terracottaMat
  );
  plenaryHall.position.set(32, 11, 14);
  kiccGroup.add(plenaryHall);

  return kiccGroup;
}

// 5. Populate Mobile-Optimized Nairobi 3D Environment
export function buildRealisticNairobiEnvironment(
  scene: THREE.Scene,
  mapData: NairobiMapSceneData,
  lowPowerMode = true
): WorldAssets {
  const tarmacMap = createTarmacTexture();
  const murramMap = createMurramGroundTexture();

  const facadeTextures = [
    createNairobiFacadeTexture('glass_tower'),
    createNairobiFacadeTexture('concrete_office'),
    createNairobiFacadeTexture('terracotta_commercial'),
  ];

  // Ground Plane (MeshLambertMaterial is ~3x faster on mobile GPUs than MeshStandardMaterial)
  const groundGeo = new THREE.PlaneGeometry(1600, 1600);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshLambertMaterial({ map: murramMap });
  scene.add(new THREE.Mesh(groundGeo, groundMat));

  // Shared Road Materials (Prevents duplicate texture uploads in VRAM)
  const sharedRoadMat = new THREE.MeshLambertMaterial({ map: tarmacMap });
  const curbYellowMat = new THREE.MeshLambertMaterial({ color: 0xd97706 });
  const curbDarkMat = new THREE.MeshLambertMaterial({ color: 0x27272a });
  const zebraMat = new THREE.MeshBasicMaterial({ color: 0xf4f4f5 });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x52525b });
  const treeTrunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3728 });
  const jacarandaMat = new THREE.MeshLambertMaterial({ color: 0x7e22ce });
  const acaciaMat = new THREE.MeshLambertMaterial({ color: 0x2f5e2e });

  // Shared Geometries for Props
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 7.5, 6);
  const canopyGeo = new THREE.DodecahedronGeometry(2.2, 0);

  mapData.roads.forEach((road: RoadSegment3D, rIdx: number) => {
    for (let i = 0; i < road.points.length - 1; i++) {
      const p1 = road.points[i];
      const p2 = road.points[i + 1];
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const length = Math.hypot(dx, dz);
      if (length < 1) continue;

      const midX = (p1.x + p2.x) / 2;
      const midZ = (p1.z + p2.z) / 2;
      const angle = Math.atan2(dx, dz);

      const roadGroup = new THREE.Group();
      roadGroup.position.set(midX, 0.03, midZ);
      roadGroup.rotation.y = angle;

      // Asphalt surface using shared material + UV scaling
      const roadGeo = new THREE.PlaneGeometry(road.widthMeters, length + 1.2);
      const uvAttr = roadGeo.attributes.uv;
      const vRepeat = Math.max(1, length / 16);
      for (let u = 0; u < uvAttr.count; u++) {
        uvAttr.setY(u, uvAttr.getY(u) * vRepeat);
      }
      const roadSlab = new THREE.Mesh(roadGeo, sharedRoadMat);
      roadSlab.rotation.x = -Math.PI / 2;
      roadGroup.add(roadSlab);

      // Raised Curbstones
      const halfW = road.widthMeters / 2 + 0.2;
      for (const side of [-1, 1]) {
        const curb = new THREE.Mesh(
          new THREE.BoxGeometry(0.36, 0.16, length),
          (i + (side > 0 ? 1 : 0)) % 2 === 0 ? curbYellowMat : curbDarkMat
        );
        curb.position.set(side * halfW, 0.08, 0);
        roadGroup.add(curb);
      }

      // Zebra Crossings on main segments
      if (i % 3 === 0 && length > 20) {
        const stripeCount = Math.floor(road.widthMeters / 1.2);
        for (let s = 0; s < stripeCount; s++) {
          const sx = -road.widthMeters / 2 + 0.8 + s * 1.15;
          const zStripe = new THREE.Mesh(
            new THREE.PlaneGeometry(0.55, 3.0),
            zebraMat
          );
          zStripe.rotation.x = -Math.PI / 2;
          zStripe.position.set(sx, 0.02, -length / 2 + 4.5);
          roadGroup.add(zStripe);
        }
      }

      // Streetlights & Trees (Thinned in Low-Power Mode for locked 60 FPS)
      const propStep = lowPowerMode ? 2 : 1;
      if (rIdx < 3 && length > 26 && i % propStep === 0) {
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(halfW + 0.6, 3.75, 0);
        roadGroup.add(pole);

        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.26, 3.2, 5),
          treeTrunkMat
        );
        trunk.position.set(-(halfW + 2.3), 1.6, 4);
        roadGroup.add(trunk);

        const canopy = new THREE.Mesh(
          canopyGeo,
          (rIdx + i) % 3 === 0 ? jacarandaMat : acaciaMat
        );
        canopy.scale.set(1.2, 0.65, 1.2);
        canopy.position.set(-(halfW + 2.3), 3.7, 4);
        roadGroup.add(canopy);
      }

      scene.add(roadGroup);
    }
  });

  // Cap Extruded Buildings to Nearest 75 on Mid-Range Phones to Prevent GPU Draw-Call Bottlenecks
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x52525b });
  const sharedWallMats = facadeTextures.map(
    (tex) => new THREE.MeshLambertMaterial({ map: tex })
  );

  const maxBuildings = lowPowerMode ? 75 : 160;
  const visibleBuildings = mapData.buildings.slice(0, maxBuildings);

  visibleBuildings.forEach((bld, idx) => {
    if (bld.polygon.length < 3) return;
    const shape = new THREE.Shape();
    shape.moveTo(bld.polygon[0].x, -bld.polygon[0].z);
    for (let i = 1; i < bld.polygon.length; i++) {
      shape.lineTo(bld.polygon[i].x, -bld.polygon[i].z);
    }
    shape.closePath();

    const extrudeGeo = new THREE.ExtrudeGeometry(shape, {
      depth: bld.heightMeters,
      bevelEnabled: false,
    });
    extrudeGeo.rotateX(-Math.PI / 2);

    const wallMat =
      bld.heightMeters > 32
        ? sharedWallMats[0]
        : sharedWallMats[(idx % 2) + 1];

    const bMesh = new THREE.Mesh(extrudeGeo, [roofMat, wallMat]);
    scene.add(bMesh);
  });

  // Add KICC Landmark
  scene.add(buildKiccLandmark(mapData.originLat, mapData.originLon));

  return {
    tarmacMap,
    murramMap,
    facadeTextures,
    dispose() {
      tarmacMap.dispose();
      murramMap.dispose();
      facadeTextures.forEach((t) => t.dispose());
    },
  };
}