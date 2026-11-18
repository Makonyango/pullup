'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
  Camera,
  Volume2,
  Lightbulb,
  MapPin,
  Navigation,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  AlertTriangle,
  Compass,
  Gauge,
  Bike,
  Power,
  Wrench,
  Fuel,
  RotateCcw,
} from 'lucide-react';
import {
  importNairobiStreet3D,
  NAIROBI_PRESETS,
  NairobiMapSceneData,
  Point2D,
} from '../lib/nduthi/nairobiOsmImporter';
import {
  createBajajBoxer150X,
  Boxer150Rig,
  BoxerPaintColor,
  CameraPerspective,
} from '../lib/nduthi/boxer150Model';
import { buildRealisticNairobiEnvironment } from '../lib/nduthi/nairobiWorldBuilder';

interface NduthiSimulatorProps {
  onExit?: () => void;
}

interface TrafficVehicle3D {
  id: number;
  mesh: THREE.Group;
  roadIndex: number;
  segmentIndex: number;
  segmentT: number;
  laneOffset: number;
  targetLaneOffset: number;
  speedMs: number;
  kind: 'matatu' | 'saloon';
  swerveCooldown: number;
  passedRewarded: boolean;
}

interface Checkpoint3D {
  position: Point2D;
  mesh: THREE.Group;
  triggered: boolean;
}

const GEAR_SPECS: Record<number, { label: string; maxSpeedMs: number; accelMs2: number }> = {
  '-1': { label: 'R', maxSpeedMs: -4.5, accelMs2: 5.0 },
  0: { label: 'N', maxSpeedMs: 0, accelMs2: 0 },
  1: { label: '1', maxSpeedMs: 7.5, accelMs2: 8.5 },
  2: { label: '2', maxSpeedMs: 13.0, accelMs2: 6.8 },
  3: { label: '3', maxSpeedMs: 18.5, accelMs2: 5.2 },
  4: { label: '4', maxSpeedMs: 23.0, accelMs2: 3.9 },
  5: { label: '5', maxSpeedMs: 27.2, accelMs2: 2.9 },
};

const SHARED_WHEEL_GEO = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 10);
SHARED_WHEEL_GEO.rotateZ(Math.PI / 2);
const SHARED_WHEEL_MAT = new THREE.MeshLambertMaterial({ color: 0x111113 });
const SHARED_GLASS_MAT = new THREE.MeshLambertMaterial({ color: 0x18181b });
const SHARED_PSV_STRIPE_MAT = new THREE.MeshLambertMaterial({ color: 0xfacc15 });

function buildTrafficVehicleMesh(kind: 'matatu' | 'saloon'): THREE.Group {
  const group = new THREE.Group();

  if (kind === 'matatu') {
    const colors = [0xe11d48, 0x2563eb, 0xd97706, 0x7c3aed, 0x059669];
    const bodyColor = colors[Math.floor(Math.random() * colors.length)];

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.25, 2.35, 6.4),
      new THREE.MeshLambertMaterial({ color: bodyColor })
    );
    body.position.y = 1.45;
    group.add(body);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.29, 0.35, 6.44),
      SHARED_PSV_STRIPE_MAT
    );
    stripe.position.y = 1.3;
    group.add(stripe);

    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(2.27, 0.75, 5.8),
      SHARED_GLASS_MAT
    );
    glass.position.y = 1.95;
    group.add(glass);
  } else {
    const colors = [0xd4d4d8, 0x52525b, 0x1e293b, 0x94a3b8];
    const bodyColor = colors[Math.floor(Math.random() * colors.length)];

    const lowerBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.85, 0.72, 4.3),
      new THREE.MeshLambertMaterial({ color: bodyColor })
    );
    lowerBody.position.y = 0.62;
    group.add(lowerBody);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.58, 2.2),
      SHARED_GLASS_MAT
    );
    cabin.position.set(0, 1.22, 0.1);
    group.add(cabin);
  }

  const zOffsets = kind === 'matatu' ? [-2.1, 2.1] : [-1.35, 1.35];
  const xOffsets = kind === 'matatu' ? [-1.05, 1.05] : [-0.88, 0.88];

  for (const z of zOffsets) {
    for (const x of xOffsets) {
      const w = new THREE.Mesh(SHARED_WHEEL_GEO, SHARED_WHEEL_MAT);
      w.position.set(x, 0.36, z);
      group.add(w);
    }
  }

  return group;
}

export default function NduthiSimulator({ onExit }: NduthiSimulatorProps) {
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('moi_avenue');
  const [mapData, setMapData] = useState<NairobiMapSceneData | null>(null);
  const [isLoadingMap, setIsLoadingMap] = useState<boolean>(true);
  const [customStreetName, setCustomStreetName] = useState<string>('');
  const [isStreetModalOpen, setIsStreetModalOpen] = useState<boolean>(false);
  const [isStationModalOpen, setIsStationModalOpen] = useState<boolean>(false);

  // Graphics Quality & Vehicle State
  const [lowPowerMode, setLowPowerMode] = useState<boolean>(true);
  const [fpsDisplay, setFpsDisplay] = useState<number>(60);
  const [engineRunning, setEngineRunning] = useState<boolean>(false);
  const [fuelPercent, setFuelPercent] = useState<number>(100);
  const [odometerKm, setOdometerKm] = useState<number>(0.0);

  // Vehicle & HUD State
  const [paintColor, setPaintColor] = useState<BoxerPaintColor>('red');
  const [cameraView, setCameraView] = useState<CameraPerspective>('chase');
  const [headlightOn, setHeadlightOn] = useState<boolean>(true);
  const [indicator, setIndicator] = useState<'none' | 'left' | 'right' | 'hazard'>('none');
  const [gear, setGear] = useState<number>(0); // Neutral
  const [speedKmh, setSpeedKmh] = useState<number>(0);
  const [fareKes, setFareKes] = useState<number>(300);
  const [radioMessage, setRadioMessage] = useState<string>(
    'Boxer ready. Use left gear lever for R, N, 1-5. Tap START IGNITION.'
  );

  // Continuous Control Refs
  const containerRef = useRef<HTMLDivElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const throttleHeldRef = useRef<boolean>(false);
  const brakeHeldRef = useRef<boolean>(false);
  const steerInputRef = useRef<number>(0);
  const gearRef = useRef<number>(0);
  const speedMsRef = useRef<number>(0);
  const bikePosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 80));
  const bikeHeadingRef = useRef<number>(0);
  const fareRef = useRef<number>(300);
  const fuelRef = useRef<number>(100);
  const odometerRef = useRef<number>(0);
  const cameraViewRef = useRef<CameraPerspective>('chase');
  const headlightRef = useRef<boolean>(true);
  const indicatorRef = useRef<'none' | 'left' | 'right' | 'hazard'>('none');
  const engineRunningRef = useRef<boolean>(false);

  // Web Audio Synthesizer Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const engineOscRef = useRef<OscillatorNode | null>(null);
  const engineGainRef = useRef<GainNode | null>(null);
  const engineFilterRef = useRef<BiquadFilterNode | null>(null);

  useEffect(() => {
    gearRef.current = gear;
  }, [gear]);

  useEffect(() => {
    cameraViewRef.current = cameraView;
  }, [cameraView]);

  useEffect(() => {
    headlightRef.current = headlightOn;
  }, [headlightOn]);

  useEffect(() => {
    indicatorRef.current = indicator;
  }, [indicator]);

  useEffect(() => {
    engineRunningRef.current = engineRunning;
  }, [engineRunning]);

  const initEngineAudioSystem = useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioCtxRef.current) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;

        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(45, ctx.currentTime);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(180, ctx.currentTime);
        filter.Q.setValueAtTime(3.0, ctx.currentTime);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0, ctx.currentTime);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start();

        engineOscRef.current = osc;
        engineFilterRef.current = filter;
        engineGainRef.current = gain;
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    } catch {
      // Audio blocked
    }
  }, []);

  // 1. Peep-Peep Horn Sound
  const playPeepPeepHorn = useCallback(() => {
    initEngineAudioSystem();
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.12);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(980, now + 0.15);
      gain2.gain.setValueAtTime(0.12, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.28);

      setRadioMessage('Peep-peep! Horn sounded at traffic.');
    } catch {
      // Ignore
    }
  }, [initEngineAudioSystem]);

  // 2. Realistic Crash Sound
  const playCrashSound = useCallback(() => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(25, now + 0.45);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    } catch {
      // Ignore
    }
  }, []);

  // 3. Refuse / Denied Sound
  const playRefuseSound = useCallback(() => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.setValueAtTime(95, now + 0.12);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch {
      // Ignore
    }
  }, []);

  const toggleEngineIgnition = useCallback(() => {
    initEngineAudioSystem();
    if (fuelRef.current <= 0) {
      playRefuseSound();
      setRadioMessage('Tank empty! Visit a petrol station attendant to refuel.');
      setIsStationModalOpen(true);
      return;
    }

    const nextState = !engineRunningRef.current;
    setEngineRunning(nextState);

    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const now = ctx.currentTime;

      if (nextState) {
        for (let i = 0; i < 6; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(80 + i * 15, now + i * 0.08);
          gain.gain.setValueAtTime(0.05, now + i * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.06);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + i * 0.08);
          osc.stop(now + i * 0.08 + 0.07);
        }

        if (engineGainRef.current) {
          engineGainRef.current.gain.setTargetAtTime(0.045, now + 0.6, 0.1);
        }
        setRadioMessage('Washa! Boxer 150X engine started.');
      } else {
        if (engineGainRef.current) {
          engineGainRef.current.gain.setTargetAtTime(0.0, now, 0.05);
        }
        setRadioMessage('Engine killed. Bike parked.');
      }
    } catch {
      // Ignore
    }
  }, [initEngineAudioSystem, playRefuseSound]);

  // Attendant Refuel Action
  const refuelAtStation = useCallback(() => {
    if (fareRef.current < 100) {
      playRefuseSound();
      setRadioMessage('Attendant: "SinaChange/Huna pesa! Fuel costs 100 KES." Earn fare from stages!');
      return;
    }
    fareRef.current -= 100;
    fuelRef.current = 100;
    setFareKes(fareRef.current);
    setFuelPercent(100);
    setIsStationModalOpen(false);
    setRadioMessage('Attendant: "Tank imetimia!" Full tank refilled (-100 KES).');
  }, [playRefuseSound]);

  // Reset Bike to Default State
  const resetBikeToDefault = useCallback(() => {
    speedMsRef.current = 0;
    setSpeedKmh(0);
    setGear(0);
    setEngineRunning(false);
    fuelRef.current = 100;
    setFuelPercent(100);
    if (mapData && mapData.roads.length > 0) {
      const p0 = mapData.roads[0].points[0];
      const p1 = mapData.roads[0].points[1];
      bikePosRef.current.set(p0.x, 0, p0.z);
      bikeHeadingRef.current = Math.atan2(-(p1.x - p0.x), -(p1.z - p0.z));
    } else {
      bikePosRef.current.set(0, 0, 80);
      bikeHeadingRef.current = 0;
    }
    setRadioMessage('Bike reset to default position in Neutral. Engine OFF.');
  }, [mapData]);

  useEffect(() => {
    let active = true;
    const preset = NAIROBI_PRESETS[selectedPresetKey] || NAIROBI_PRESETS.moi_avenue;
    setIsLoadingMap(true);

    importNairobiStreet3D(preset.label, preset.lat, preset.lon, preset.radiusMeters).then(
      (sceneData) => {
        if (!active) return;
        setMapData(sceneData);
        setIsLoadingMap(false);
        setRadioMessage(`Loaded real OSM street network: ${sceneData.corridorName}`);
      }
    );

    return () => {
      active = false;
    };
  }, [selectedPresetKey]);

  const handleSearchAndImportStreet = async () => {
    const q = customStreetName.trim();
    if (!q) return;
    setIsLoadingMap(true);
    setRadioMessage(`Locating "${q}, Nairobi" via OpenStreetMap...`);

    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
          `${q}, Nairobi, Kenya`
        )}`
      );
      const geoData = await geoRes.json();

      const lat = geoData?.[0]?.lat ? parseFloat(geoData[0].lat) : -1.2864;
      const lon = geoData?.[0]?.lon ? parseFloat(geoData[0].lon) : 36.8172;
      const resolvedName = geoData?.[0]?.display_name?.split(',')[0] || q;

      const sceneData = await importNairobiStreet3D(resolvedName, lat, lon, 450);
      setMapData(sceneData);
      setIsStreetModalOpen(false);
      setRadioMessage(`Imported 3D street geometry for ${resolvedName}`);
    } catch {
      setRadioMessage('Could not reach geocoder — loaded fallback Nairobi street.');
    } finally {
      setIsLoadingMap(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      initEngineAudioSystem();
      if (e.key === 'ArrowUp' || e.key === 'w') throttleHeldRef.current = true;
      if (e.key === 'ArrowDown' || e.key === 's') brakeHeldRef.current = true;
      if (e.key === 'ArrowLeft' || e.key === 'a') steerInputRef.current = -1;
      if (e.key === 'ArrowRight' || e.key === 'd') steerInputRef.current = 1;
      if (e.key === 'h') playPeepPeepHorn();
      if (e.key === 'e') setGear((g) => Math.min(5, g + 1));
      if (e.key === 'q') setGear((g) => Math.max(-1, g - 1));
      if (e.key === 'c') setCameraView((v) => (v === 'chase' ? 'cockpit' : 'chase'));
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w') throttleHeldRef.current = false;
      if (e.key === 'ArrowDown' || e.key === 's') brakeHeldRef.current = false;
      if (
        e.key === 'ArrowLeft' ||
        e.key === 'a' ||
        e.key === 'ArrowRight' ||
        e.key === 'd'
      ) {
        steerInputRef.current = 0;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [playPeepPeepHorn, initEngineAudioSystem]);

  // ==========================================
  // 3D THREE.JS SCENE & LOCKED 60 FPS LOOP
  // ==========================================
  useEffect(() => {
    if (!mapData || !containerRef.current) return;
    const container = containerRef.current;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: !lowPowerMode,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(
      lowPowerMode
        ? Math.min(window.devicePixelRatio, 1.15)
        : Math.min(window.devicePixelRatio, 1.75)
    );
    renderer.shadowMap.enabled = !lowPowerMode;
    if (!lowPowerMode) {
      renderer.shadowMap.type = THREE.BasicShadowMap;
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x93c5fd);
    scene.fog = new THREE.Fog(
      0x93c5fd,
      lowPowerMode ? 80 : 110,
      lowPowerMode ? 250 : 380
    );

    const camera = new THREE.PerspectiveCamera(
      62,
      width / height,
      0.2,
      lowPowerMode ? 270 : 420
    );

    const hemiLight = new THREE.HemisphereLight(0xf8fafc, 0x4b5563, 0.95);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffbeb, 1.3);
    sunLight.position.set(70, 125, 60);
    if (!lowPowerMode) {
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.set(512, 512);
    }
    scene.add(sunLight);

    const worldAssets = buildRealisticNairobiEnvironment(scene, mapData, lowPowerMode);

    for (const st of mapData.stages) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.6, 2.3, 16),
        new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(st.position.x, 0.08, st.position.z);
      scene.add(ring);
    }

    const checkpoints: Checkpoint3D[] = [];
    const primaryRoad = mapData.roads[0];
    if (primaryRoad && primaryRoad.points.length >= 3) {
      const cpPt = primaryRoad.points[Math.floor(primaryRoad.points.length / 2)];
      const cpGroup = new THREE.Group();
      cpGroup.position.set(cpPt.x, 0, cpPt.z);

      const coneGeo = new THREE.ConeGeometry(0.28, 0.75, 8);
      const coneMat = new THREE.MeshLambertMaterial({ color: 0xf97316 });
      for (const offset of [-3, 0, 3]) {
        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.position.set(offset, 0.375, 0);
        cpGroup.add(cone);
      }
      scene.add(cpGroup);
      checkpoints.push({ position: cpPt, mesh: cpGroup, triggered: false });
    }

    const bikeRig: Boxer150Rig = createBajajBoxer150X(paintColor);
    if (primaryRoad && primaryRoad.points.length >= 2) {
      const p0 = primaryRoad.points[0];
      const p1 = primaryRoad.points[1];
      bikePosRef.current.set(p0.x, 0, p0.z);
      bikeHeadingRef.current = Math.atan2(-(p1.x - p0.x), -(p1.z - p0.z));
    } else {
      bikePosRef.current.set(0, 0, 80);
      bikeHeadingRef.current = 0;
    }
    speedMsRef.current = 0;
    scene.add(bikeRig.root);

    const trafficVehicles: TrafficVehicle3D[] = [];
    const usableRoads = mapData.roads.filter((r) => r.points.length >= 2);
    const maxTraffic = lowPowerMode ? 8 : 12;

    for (let t = 0; t < Math.min(maxTraffic, usableRoads.length * 3); t++) {
      const rIdx = t % usableRoads.length;
      const road = usableRoads[rIdx];
      const segIdx = Math.floor(Math.random() * (road.points.length - 1));
      const kind = t % 2 === 0 ? 'matatu' : 'saloon';
      const mesh = buildTrafficVehicleMesh(kind);
      scene.add(mesh);

      const laneOff = (Math.random() > 0.5 ? 1 : -1) * (road.widthMeters * 0.25);
      trafficVehicles.push({
        id: t,
        mesh,
        roadIndex: rIdx,
        segmentIndex: segIdx,
        segmentT: Math.random(),
        laneOffset: laneOff,
        targetLaneOffset: laneOff,
        speedMs: kind === 'matatu' ? 7.5 : 9.5,
        kind,
        swerveCooldown: 2 + Math.random() * 4,
        passedRewarded: false,
      });
    }

    const handleResize = () => {
      if (!container) return;
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', handleResize);

    let lastTime = performance.now();
    let elapsedSec = 0;
    let hudSyncTimer = 0;
    let minimapTimer = 0;
    let frameCounter = 0;
    let fpsTimer = 0;
    let animId = 0;

    const animate = (now: number) => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      elapsedSec += dt;

      frameCounter++;
      fpsTimer += dt;
      if (fpsTimer >= 0.5) {
        setFpsDisplay(Math.min(60, Math.round(frameCounter / fpsTimer)));
        frameCounter = 0;
        fpsTimer = 0;
      }

      // Fuel consumption logic
      if (engineRunningRef.current && fuelRef.current > 0) {
        const consumption = (0.012 + (Math.abs(speedMsRef.current) / 25) * 0.035) * dt;
        fuelRef.current = Math.max(0, fuelRef.current - consumption);
        if (fuelRef.current <= 0) {
          setEngineRunning(false);
          setGear(0);
          playRefuseSound();
          setRadioMessage('Out of fuel! Engine stalled. Visit petrol station to refuel.');
        }
      }

      const currentGearSpec = GEAR_SPECS[gearRef.current] || GEAR_SPECS[1];
      let v = speedMsRef.current;

      if (engineRunningRef.current && fuelRef.current > 0 && throttleHeldRef.current && gearRef.current !== 0) {
        if (gearRef.current === -1) {
          // Reverse: target max negative speed is -4.5 m/s
          if (v > currentGearSpec.maxSpeedMs) {
            v = Math.max(currentGearSpec.maxSpeedMs, v - currentGearSpec.accelMs2 * dt);
          }
        } else {
          // Forward gears
          if (v < currentGearSpec.maxSpeedMs) {
            v = Math.min(currentGearSpec.maxSpeedMs, v + currentGearSpec.accelMs2 * dt);
          } else {
            v = Math.max(currentGearSpec.maxSpeedMs, v - 5.0 * dt);
          }
        }
      } else {
        // Coasting / friction deceleration towards 0
        if (v > 0) v = Math.max(0, v - 3.0 * dt);
        else if (v < 0) v = Math.min(0, v + 3.0 * dt);
      }

      if (brakeHeldRef.current) {
        if (v > 0) v = Math.max(0, v - 16.5 * dt);
        else if (v < 0) v = Math.min(0, v + 16.5 * dt);
      }

      speedMsRef.current = v;

      // Accumulate Odometer
      const distDeltaKm = (Math.abs(v) * dt) / 1000;
      odometerRef.current += distDeltaKm;

      // Update Web Audio Engine Synthesizer
      if (engineOscRef.current && engineFilterRef.current && audioCtxRef.current) {
        if (engineRunningRef.current) {
          const baseHz = gearRef.current === 0 ? 45 : 55 + Math.abs(v) * 3.8 - Math.abs(gearRef.current) * 7;
          const throttleBoost = throttleHeldRef.current ? 22 : 0;
          const targetHz = Math.max(45, Math.min(320, baseHz + throttleBoost));
          engineOscRef.current.frequency.setTargetAtTime(targetHz, audioCtxRef.current.currentTime, 0.08);

          const filterHz = 180 + Math.abs(v) * 12 + (throttleHeldRef.current ? 120 : 0);
          engineFilterRef.current.frequency.setTargetAtTime(filterHz, audioCtxRef.current.currentTime, 0.08);
        }
      }

      const steer = steerInputRef.current;
      const turnRate = (Math.abs(v) > 0.4 ? 1.65 : 0) * (1 - Math.min(0.45, Math.abs(v) / 45));
      bikeHeadingRef.current -= steer * turnRate * (gearRef.current === -1 ? -1 : 1) * dt;

      const forwardX = -Math.sin(bikeHeadingRef.current);
      const forwardZ = -Math.cos(bikeHeadingRef.current);
      bikePosRef.current.x += forwardX * v * dt;
      bikePosRef.current.z += forwardZ * v * dt;

      // =======================================================
      // ROBUST BUILDING & WALL BOUNDING-BOX COLLISION SYSTEM
      // =======================================================
      for (const bld of mapData.buildings) {
        if (!bld.polygon || bld.polygon.length < 3) continue;

        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;

        for (const pt of bld.polygon) {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.z < minZ) minZ = pt.z;
          if (pt.z > maxZ) maxZ = pt.z;
        }

        const margin = 1.2;
        if (
          bikePosRef.current.x >= minX - margin &&
          bikePosRef.current.x <= maxX + margin &&
          bikePosRef.current.z >= minZ - margin &&
          bikePosRef.current.z <= maxZ + margin &&
          Math.abs(v) > 1.2
        ) {
          speedMsRef.current = 0;
          v = 0;
          setGear(0);
          setEngineRunning(false);
          playCrashSound();
          fareRef.current = Math.max(0, fareRef.current - 100);
          setFareKes(fareRef.current);
          setRadioMessage('WIPEOUT! Umegonga ukuta CBD! Engine stalled (-100 KES)');
          break;
        }
      }

      bikeRig.root.position.copy(bikePosRef.current);
      bikeRig.root.rotation.y = bikeHeadingRef.current;

      const targetLean = -steer * Math.min(0.42, (Math.abs(v) / 22) * 0.42);
      bikeRig.update({
        speedMs: v,
        steerAngleRad: -steer * 0.38,
        leanAngleRad: targetLean,
        isBraking: brakeHeldRef.current,
        headlightOn: headlightRef.current,
        indicatorState: indicatorRef.current,
        elapsedSec,
        dt,
      });

      bikeRig.updateCamera(camera, cameraViewRef.current, dt);

      for (const tv of trafficVehicles) {
        const road = usableRoads[tv.roadIndex];
        const pA = road.points[tv.segmentIndex];
        const pB = road.points[tv.segmentIndex + 1];
        const segLen = Math.max(1, Math.hypot(pB.x - pA.x, pB.z - pA.z));

        tv.segmentT += (tv.speedMs * dt) / segLen;
        if (tv.segmentT >= 1) {
          tv.segmentT = 0;
          tv.segmentIndex = (tv.segmentIndex + 1) % (road.points.length - 1);
          tv.passedRewarded = false;
        }

        if (tv.kind === 'matatu') {
          tv.swerveCooldown -= dt;
          if (tv.swerveCooldown <= 0) {
            tv.swerveCooldown = 4 + Math.random() * 5;
            tv.targetLaneOffset =
              tv.targetLaneOffset > 0 ? -road.widthMeters * 0.28 : road.widthMeters * 0.28;
          }
        }
        tv.laneOffset += (tv.targetLaneOffset - tv.laneOffset) * 2.5 * dt;

        const curA = road.points[tv.segmentIndex];
        const curB = road.points[tv.segmentIndex + 1];
        const lenInv = 1 / Math.max(0.1, Math.hypot(curB.x - curA.x, curB.z - curA.z));
        const dirX = (curB.x - curA.x) * lenInv;
        const dirZ = (curB.z - curA.z) * lenInv;

        const wx = curA.x + (curB.x - curA.x) * tv.segmentT - dirZ * tv.laneOffset;
        const wz = curA.z + (curB.z - curA.z) * tv.segmentT + dirX * tv.laneOffset;

        tv.mesh.position.set(wx, 0, wz);
        tv.mesh.rotation.y = Math.atan2(dirX, dirZ);

        const distToBike = Math.hypot(wx - bikePosRef.current.x, wz - bikePosRef.current.z);
        if (distToBike < 2.2) {
          speedMsRef.current = Math.max(0, speedMsRef.current * 0.25);
          playCrashSound();
          fareRef.current = Math.max(0, fareRef.current - 50);
          setFareKes(fareRef.current);
          setRadioMessage(
            tv.kind === 'matatu'
              ? 'Umegonga Nganya bumper! -50 KES repair'
              : 'Traffic bump! Watch your clearance (-50 KES)'
          );
        } else if (!tv.passedRewarded && distToBike < 4.5 && Math.abs(v) > 9) {
          tv.passedRewarded = true;
          fareRef.current += 30;
          setFareKes(fareRef.current);
          setRadioMessage('Kupenya safi! +30 KES');
        }
      }

      for (const st of mapData.stages) {
        const dStage = Math.hypot(
          st.position.x - bikePosRef.current.x,
          st.position.z - bikePosRef.current.z
        );
        if (dStage < 4.0 && Math.abs(v) < 4.5) {
          fareRef.current += 100;
          setFareKes(fareRef.current);
          setRadioMessage(`Picked up Abiria at ${st.name}! +100 KES`);
          st.position.x += 9999;
        }
      }

      for (const cp of checkpoints) {
        const dCp = Math.hypot(
          cp.position.x - bikePosRef.current.x,
          cp.position.z - bikePosRef.current.z
        );
        if (!cp.triggered && dCp < 6.0) {
          cp.triggered = true;
          const kmh = Math.abs(v) * 3.6;
          if (kmh > 50) {
            fareRef.current = Math.max(0, fareRef.current - 100);
            setFareKes(fareRef.current);
            setRadioMessage(`Kanjo Radar: ${Math.round(kmh)} km/h in 50 zone! -100 KES`);
          } else {
            setRadioMessage('Kanjo Checkpoint cleared under 50 km/h.');
          }
        }
      }

      minimapTimer += dt;
      if (minimapTimer >= 0.05) {
        minimapTimer = 0;
        const miniCanvas = minimapCanvasRef.current;
        if (miniCanvas) {
          const mCtx = miniCanvas.getContext('2d');
          if (mCtx) {
            const mw = miniCanvas.width;
            const mh = miniCanvas.height;
            mCtx.fillStyle = '#18181b';
            mCtx.fillRect(0, 0, mw, mh);

            mCtx.save();
            mCtx.translate(mw / 2, mh / 2);
            mCtx.rotate(bikeHeadingRef.current);
            const scale = 0.35;

            mCtx.strokeStyle = '#71717a';
            mCtx.lineWidth = 4;
            for (const road of mapData.roads) {
              mCtx.beginPath();
              road.points.forEach((pt, idx) => {
                const rx = (pt.x - bikePosRef.current.x) * scale;
                const rz = (pt.z - bikePosRef.current.z) * scale;
                if (idx === 0) mCtx.moveTo(rx, rz);
                else mCtx.lineTo(rx, rz);
              });
              mCtx.stroke();
            }

            mCtx.fillStyle = '#22c55e';
            for (const st of mapData.stages) {
              const sx = (st.position.x - bikePosRef.current.x) * scale;
              const sz = (st.position.z - bikePosRef.current.z) * scale;
              mCtx.beginPath();
              mCtx.arc(sx, sz, 3.5, 0, Math.PI * 2);
              mCtx.fill();
            }
            mCtx.restore();

            mCtx.fillStyle = '#facc15';
            mCtx.beginPath();
            mCtx.moveTo(mw / 2, mh / 2 - 6);
            mCtx.lineTo(mw / 2 - 4, mh / 2 + 5);
            mCtx.lineTo(mw / 2 + 4, mh / 2 + 5);
            mCtx.closePath();
            mCtx.fill();
          }
        }
      }

      hudSyncTimer += dt;
      if (hudSyncTimer >= 0.08) {
        hudSyncTimer = 0;
        setSpeedKmh(Math.round(v * 3.6));
        setFuelPercent(Math.round(fuelRef.current));
        setOdometerKm(parseFloat(odometerRef.current.toFixed(2)));
      }

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      worldAssets.dispose();
      bikeRig.dispose();
      renderer.dispose();
    };
  }, [mapData, paintColor, lowPowerMode, playCrashSound]);

  return (
    <div
      onPointerDown={initEngineAudioSystem}
      className="fixed inset-0 z-50 bg-zinc-950 text-white select-none overflow-hidden flex flex-col"
    >
      {/* 3D WebGL Full-Screen Canvas Viewport */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      {/* POLISHED NAIROBI LOADING SCREEN */}
      {isLoadingMap && (
        <div className="absolute inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center p-6 text-center space-y-6 overflow-hidden">
          <style
            dangerouslySetInnerHTML={{
              __html: `
            @keyframes zoomAndFade {
              0% { transform: translateX(-90px) scale(0.85); opacity: 0.2; }
              50% { transform: translateX(0px) scale(1.1); opacity: 1; }
              100% { transform: translateX(110px) scale(0.9); opacity: 0; }
            }
          `,
            }}
          />

          <div className="absolute w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative w-full max-w-xs h-24 flex items-center justify-center">
            <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-amber-400/60 to-transparent animate-pulse" />
            <div className="relative flex items-center space-x-2 animate-[zoomAndFade_1.8s_ease-in-out_infinite]">
              <div className="p-3.5 rounded-2xl bg-amber-400 text-zinc-950 shadow-[0_0_25px_rgba(250,204,21,0.4)]">
                <Bike className="w-8 h-8 animate-bounce" />
              </div>
            </div>
          </div>

          <div className="space-y-2 z-10">
            <h3 className="text-sm font-extrabold tracking-wide text-white">
              Washa Boxer: Loading Kanairo...
            </h3>
            <p className="text-xs text-zinc-400 max-w-xs mx-auto animate-pulse">
              Importing real OSM splines, extruding CBD towers & calibrating 5-speed gearbox
            </p>
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-[bounce_1s_infinite_100ms]" />
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-[bounce_1s_infinite_200ms]" />
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-[bounce_1s_infinite_300ms]" />
          </div>
        </div>
      )}

      {/* TOP BUSSID HUD BAR */}
      <div className="relative z-20 flex items-start justify-between p-3 pointer-events-none">
        <div className="pointer-events-auto flex items-center space-x-2.5">
          <div className="relative rounded-2xl overflow-hidden border-2 border-zinc-700 shadow-lg bg-zinc-900">
            <canvas ref={minimapCanvasRef} width={92} height={92} className="block" />
            <span className="absolute bottom-1 left-1.5 text-[9px] font-bold uppercase tracking-wider text-amber-400 bg-black/70 px-1 rounded">
              GPS
            </span>
          </div>

          <div className="space-y-1.5">
            {onExit && (
              <button
                onClick={onExit}
                className="px-3 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-700 text-xs font-bold flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Exit</span>
              </button>
            )}

            <button
              onClick={() => setIsStreetModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-700 text-xs font-semibold flex items-center gap-1.5 max-w-[180px]"
            >
              <MapPin className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span className="truncate">{mapData?.corridorName || 'Nairobi Street'}</span>
            </button>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="px-3 py-1 rounded-xl bg-emerald-950/90 border border-emerald-700/60 text-xs font-bold text-emerald-400">
                KES {fareKes}
              </div>
              <button
                onClick={() => setIsStationModalOpen(true)}
                className="px-2.5 py-1 rounded-xl bg-amber-500/90 hover:bg-amber-400 text-zinc-950 font-extrabold text-[11px] flex items-center gap-1 shadow"
              >
                <Fuel className="w-3 h-3" />
                <span>Petrol Station</span>
              </button>
            </div>
          </div>
        </div>

        <div className="pointer-events-auto flex flex-col items-end space-y-1.5">
          <div className="flex items-center space-x-1.5">
            <button
              onClick={toggleEngineIgnition}
              className={`px-3 py-2 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 active:scale-95 shadow-lg ${
                engineRunning
                  ? 'bg-emerald-500 text-zinc-950 border-emerald-400 animate-pulse'
                  : 'bg-rose-950/90 text-rose-300 border-rose-600/70'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{engineRunning ? 'ENGINE ON' : 'START IGNITION'}</span>
            </button>

            <button
              onClick={resetBikeToDefault}
              className="px-3 py-2 rounded-xl bg-zinc-900/90 border border-zinc-700 text-xs font-bold flex items-center gap-1 text-amber-400 active:scale-95 shadow-lg"
              aria-label="Reset Bike"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button
              onClick={() =>
                setCameraView((v) => (v === 'chase' ? 'cockpit' : 'chase'))
              }
              className="px-2.5 py-2 rounded-xl bg-zinc-900/90 border border-zinc-700 text-xs font-bold flex items-center gap-1 active:scale-95"
            >
              <Camera className="w-3.5 h-3.5 text-amber-400" />
              <span>{cameraView === 'chase' ? '3rd' : '1st'}</span>
            </button>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setHeadlightOn((h) => !h)}
              className={`p-2 rounded-xl border active:scale-95 ${
                headlightOn
                  ? 'bg-amber-400 text-zinc-950 border-amber-300'
                  : 'bg-zinc-900/90 text-zinc-400 border-zinc-700'
              }`}
              aria-label="Toggle Headlight"
            >
              <Lightbulb className="w-4 h-4" />
            </button>

            <button
              onClick={() => setLowPowerMode((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-xl border text-[10px] font-bold flex items-center gap-1 ${
                lowPowerMode
                  ? 'bg-emerald-950/90 border-emerald-600/60 text-emerald-300'
                  : 'bg-zinc-900/90 border-zinc-700 text-amber-300'
              }`}
            >
              <Gauge className="w-3 h-3" />
              <span>{fpsDisplay} FPS</span>
            </button>
          </div>

          <div className="flex items-center gap-1 bg-zinc-900/90 border border-zinc-700 p-1 rounded-xl">
            {(['red', 'black', 'blue'] as BoxerPaintColor[]).map((col) => (
              <button
                key={col}
                onClick={() => setPaintColor(col)}
                className={`w-5 h-5 rounded-lg border ${
                  paintColor === col ? 'border-amber-400 scale-110' : 'border-zinc-600'
                } ${
                  col === 'red'
                    ? 'bg-red-700'
                    : col === 'black'
                    ? 'bg-zinc-900'
                    : 'bg-blue-700'
                }`}
                aria-label={`Boxer ${col}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="relative z-20 mx-auto mt-1 px-3.5 py-1.5 rounded-full bg-zinc-950/80 border border-zinc-800 text-[11px] font-medium text-zinc-200 flex items-center gap-1.5 max-w-[92%]">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        <span className="truncate">{radioMessage}</span>
      </div>

      <div className="flex-1" />

      {/* BOTTOM DRIVING CONTROLS (Gearbox on Left for Phone Users) */}
      <div className="relative z-20 p-4 pb-6 flex items-end justify-between pointer-events-none">
        <div className="pointer-events-auto space-y-2.5">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIndicator((i) => (i === 'left' ? 'none' : 'left'))}
              className={`px-3 py-2 rounded-xl border text-xs font-bold ${
                indicator === 'left'
                  ? 'bg-amber-400 text-zinc-950 border-amber-300'
                  : 'bg-zinc-900/90 border-zinc-700 text-zinc-300'
              }`}
            >
              ◀
            </button>

            <button
              onClick={playPeepPeepHorn}
              className="px-3.5 py-2 rounded-xl bg-amber-400 active:bg-amber-300 text-zinc-950 font-extrabold text-xs flex items-center gap-1 shadow-lg active:scale-95"
            >
              <Volume2 className="w-4 h-4" />
              <span>HORN</span>
            </button>

            <button
              onClick={() => setIndicator((i) => (i === 'right' ? 'none' : 'right'))}
              className={`px-3 py-2 rounded-xl border text-xs font-bold ${
                indicator === 'right'
                  ? 'bg-amber-400 text-zinc-950 border-amber-300'
                  : 'bg-zinc-900/90 border-zinc-700 text-zinc-300'
              }`}
            >
              ▶
            </button>
          </div>

          {/* Left-Hand Gear Selector (R, N, 1, 2, 3, 4, 5) */}
          <div className="flex items-center gap-1 bg-zinc-900/95 border border-zinc-700 p-1.5 rounded-2xl shadow-lg">
            {([-1, 0, 1, 2, 3, 4, 5] as number[]).map((g) => (
              <button
                key={g}
                onClick={() => {
                  initEngineAudioSystem();
                  setGear(g);
                }}
                className={`w-7 h-8 rounded-xl text-xs font-extrabold transition-colors flex items-center justify-center ${
                  gear === g
                    ? 'bg-amber-400 text-zinc-950 shadow'
                    : 'text-zinc-400 hover:text-white bg-zinc-950/60'
                }`}
              >
                {GEAR_SPECS[g].label}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              onPointerDown={() => {
                initEngineAudioSystem();
                steerInputRef.current = -1;
              }}
              onPointerUp={() => (steerInputRef.current = 0)}
              onPointerLeave={() => (steerInputRef.current = 0)}
              className="w-16 h-16 rounded-2xl bg-zinc-900/90 active:bg-zinc-700 border-2 border-zinc-700 flex items-center justify-center shadow-lg"
              aria-label="Steer Left"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>

            <button
              onPointerDown={() => {
                initEngineAudioSystem();
                steerInputRef.current = 1;
              }}
              onPointerUp={() => (steerInputRef.current = 0)}
              onPointerLeave={() => (steerInputRef.current = 0)}
              className="w-16 h-16 rounded-2xl bg-zinc-900/90 active:bg-zinc-700 border-2 border-zinc-700 flex items-center justify-center shadow-lg"
              aria-label="Steer Right"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          </div>
        </div>

        <div className="pointer-events-auto flex flex-col items-center space-y-2">
          <div className="px-4 py-2.5 rounded-2xl bg-zinc-950/90 border border-zinc-700 text-center shadow-lg space-y-1">
            <div className="text-2xl font-black font-mono tracking-tight text-white leading-none">
              {speedKmh}
            </div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-amber-400">
              KM/H • {gear === -1 ? 'REV' : `GEAR ${GEAR_SPECS[gear]?.label}`}
            </div>
            <div className="flex items-center justify-center gap-3 pt-1 border-t border-zinc-800 text-[10px] font-mono text-zinc-300">
              <span>{odometerKm} KM</span>
              <span className={`flex items-center gap-1 ${fuelPercent < 20 ? 'text-rose-400 font-bold animate-pulse' : 'text-emerald-400'}`}>
                <Fuel className="w-3 h-3" />
                {fuelPercent}%
              </span>
            </div>
          </div>
        </div>

        <div className="pointer-events-auto flex items-end space-x-2.5">
          <button
            onPointerDown={() => {
              initEngineAudioSystem();
              brakeHeldRef.current = true;
            }}
            onPointerUp={() => (brakeHeldRef.current = false)}
            onPointerLeave={() => (brakeHeldRef.current = false)}
            className="w-14 h-20 rounded-2xl bg-rose-950/90 active:bg-rose-700 border-2 border-rose-600/70 flex flex-col items-center justify-center text-rose-200 font-extrabold text-[11px] shadow-lg"
          >
            <span>BRAKE</span>
          </button>

          <button
            onPointerDown={() => {
              initEngineAudioSystem();
              throttleHeldRef.current = true;
            }}
            onPointerUp={() => (throttleHeldRef.current = false)}
            onPointerLeave={() => (throttleHeldRef.current = false)}
            className="w-16 h-24 rounded-2xl bg-emerald-950/90 active:bg-emerald-600 border-2 border-emerald-500/80 flex flex-col items-center justify-center text-emerald-200 font-extrabold text-xs shadow-lg"
          >
            <span>GAS</span>
          </button>
        </div>
      </div>

      {/* KANAIRO PETROL STATION ATTENDANT MODAL */}
      {isStationModalOpen && (
        <div className="absolute inset-0 z-40 bg-black/85 flex items-center justify-center p-5">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-700 p-5 space-y-4 text-center">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-1.5 text-amber-400">
                <Fuel className="w-4 h-4" />
                <span>Kanairo Petrol Station (Attendant)</span>
              </h3>
              <button
                onClick={() => setIsStationModalOpen(false)}
                className="text-xs text-zinc-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <p className="text-xs text-zinc-300">
              Attendant: "Sasa bro! Unataka Ksh 100 ya V-Power ama Regular?"
            </p>

            <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-800 space-y-2 text-left text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-400">Current Fuel:</span>
                <span className="font-bold text-amber-400">{fuelPercent}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Full Tank Price:</span>
                <span className="font-bold text-emerald-400">100 KES</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Your Fare Balance:</span>
                <span className="font-bold text-emerald-400">KES {fareKes}</span>
              </div>
            </div>

            <button
              onClick={refuelAtStation}
              className="w-full py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-lg"
            >
              <Fuel className="w-4 h-4" />
              <span>Pay Attendant & Refill Tank (100 KES)</span>
            </button>
          </div>
        </div>
      )}

      {/* STREET SELECTOR MODAL */}
      {isStreetModalOpen && (
        <div className="absolute inset-0 z-40 bg-black/85 flex items-center justify-center p-5">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-700 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-1.5">
                <Navigation className="w-4 h-4 text-amber-400" />
                <span>Import Real Nairobi Street (OSM 3D)</span>
              </h3>
              <button
                onClick={() => setIsStreetModalOpen(false)}
                className="text-xs text-zinc-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] text-zinc-400 font-semibold">Preset Nairobi Corridors</p>
              <div className="grid grid-cols-1 gap-1.5">
                {Object.entries(NAIROBI_PRESETS).map(([key, item]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setSelectedPresetKey(key);
                      setIsStreetModalOpen(false);
                    }}
                    className={`px-3 py-2 rounded-xl border text-left text-xs font-semibold ${
                      selectedPresetKey === key
                        ? 'bg-amber-400 text-zinc-950 border-amber-300'
                        : 'bg-zinc-800 text-zinc-200 border-zinc-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] text-zinc-400 font-semibold">
                Or Import Any Nairobi Street by Name
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customStreetName}
                  onChange={(e) => setCustomStreetName(e.target.value)}
                  placeholder="e.g. Kenyatta Avenue, Jogoo Road"
                  className="flex-1 rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-white focus:outline-none"
                />
                <button
                  onClick={handleSearchAndImportStreet}
                  className="px-3.5 py-2 rounded-xl bg-amber-400 text-zinc-950 font-bold text-xs flex items-center gap-1"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Load</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}