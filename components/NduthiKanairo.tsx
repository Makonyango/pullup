'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bike,
  MapPin,
  Gauge,
  AlertTriangle,
  Play,
  Navigation,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
} from 'lucide-react';

interface NduthiKanairoProps {
  isDarkMode: boolean;
}

interface NairobiCorridor {
  id: string;
  name: string;
  landmark: string;
  lanes: number;
  hasMurramShoulder: boolean;
  coords: [number, number];
}

const PRESET_CORRIDORS: NairobiCorridor[] = [
  {
    id: 'moi-ave',
    name: 'Moi Avenue (Archives - Globe)',
    landmark: 'Kenya National Archives',
    lanes: 3,
    hasMurramShoulder: false,
    coords: [-1.2848, 36.8249],
  },
  {
    id: 'tom-mboya',
    name: 'Tom Mboya Street',
    landmark: 'Fire Station / Odeon Stage',
    lanes: 2,
    hasMurramShoulder: false,
    coords: [-1.2833, 36.8267],
  },
  {
    id: 'uhuru-hwy',
    name: 'Uhuru Highway',
    landmark: 'Nyayo Stadium - Haile Selassie',
    lanes: 4,
    hasMurramShoulder: true,
    coords: [-1.2921, 36.8172],
  },
  {
    id: 'thika-rd',
    name: 'Thika Superhighway (A2)',
    landmark: 'Pangani - Muthaiga - Roysambu',
    lanes: 4,
    hasMurramShoulder: true,
    coords: [-1.2584, 36.8431],
  },
  {
    id: 'jogoo-rd',
    name: 'Jogoo Road',
    landmark: 'Makadara - Hamza - Donholm',
    lanes: 3,
    hasMurramShoulder: true,
    coords: [-1.2932, 36.8576],
  },
];

type BoxerColor = 'red' | 'black' | 'blue';

interface RoadEntity {
  id: number;
  lane: number; // 0 .. lanes-1, or lanes (murram off-road shoulder)
  y: number;
  width: number;
  height: number;
  speed: number;
  kind: 'matatu' | 'saloon' | 'mkokoteni' | 'pothole' | 'kanjo' | 'abiria';
  color: string;
  swerving?: boolean;
  rewarded?: boolean;
}

export default function NduthiKanairo({ isDarkMode }: NduthiKanairoProps) {
  const [selectedCorridor, setSelectedCorridor] = useState<NairobiCorridor>(PRESET_CORRIDORS[0]);
  const [bikeColor, setBikeColor] = useState<BoxerColor>('red');
  const [isImporterOpen, setIsImporterOpen] = useState(false);
  const [streetQuery, setStreetQuery] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Live Game UI Readouts
  const [isRunning, setIsRunning] = useState(false);
  const [gear, setGear] = useState<number>(1);
  const [speedKmh, setSpeedKmh] = useState<number>(0);
  const [fareKes, setFareKes] = useState<number>(200);
  const [distanceKm, setDistanceKm] = useState<number>(0);
  const [callout, setCallout] = useState<string>('Ready at stage. Kick start & roll.');
  const [gameOverReason, setGameOverReason] = useState<string | null>(null);

  // Physics & Simulation Refs (Pure 60fps Canvas, zero AI filters)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runningRef = useRef(false);
  const bikeXRef = useRef(0);
  const targetLaneRef = useRef(0);
  const speedRef = useRef(0);
  const gearRef = useRef(1);
  const fareRef = useRef(200);
  const distanceRef = useRef(0);
  const roadScrollRef = useRef(0);
  const entitiesRef = useRef<RoadEntity[]>([]);
  const spawnAccumRef = useRef(0);
  const wobbleRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  const showCallout = useCallback((msg: string) => {
    setCallout(msg);
  }, []);

  // Import Real Street Geometry from OpenStreetMap (Overpass API)
  const handleImportRealStreet = async () => {
    const query = streetQuery.trim();
    if (!query) return;

    setIsImporting(true);
    setImportStatus('Querying OpenStreetMap Nairobi road network...');

    try {
      const overpassQuery = `
        [out:json][timeout:10];
        area["name"="Nairobi"]->.searchArea;
        way["highway"]["name"~"${query.replace(/"/g, '')}",i](area.searchArea);
        out body 1;
      `;
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: overpassQuery,
      });
      const data = await res.json();

      if (data.elements && data.elements.length > 0) {
        const way = data.elements[0];
        const tags = way.tags || {};
        const parsedLanes = Math.min(4, Math.max(2, Number(tags.lanes) || 2));
        const surface = (tags.surface || '').toLowerCase();
        const hasShoulder =
          surface.includes('unpaved') ||
          surface.includes('gravel') ||
          tags.highway === 'primary' ||
          tags.highway === 'trunk';

        const imported: NairobiCorridor = {
          id: `osm-${way.id}`,
          name: tags.name || query,
          landmark: tags['addr:suburb'] || tags.highway?.toUpperCase() || 'Nairobi County',
          lanes: parsedLanes,
          hasMurramShoulder: hasShoulder,
          coords: [-1.2864, 36.8172],
        };

        setSelectedCorridor(imported);
        setImportStatus(
          `Imported "${imported.name}" (${imported.lanes} lanes, surface: ${tags.surface || 'asphalt'})`
        );
        setIsImporterOpen(false);
      } else {
        setImportStatus('Street not matched in Nairobi OSM. Try "Kenyatta", "Ngong", or "Mombasa".');
      }
    } catch {
      setImportStatus('Offline or Overpass busy — using cached Nairobi street geometry.');
    } finally {
      setIsImporting(false);
    }
  };

  const startRide = useCallback(() => {
    runningRef.current = true;
    setIsRunning(true);
    setGameOverReason(null);
    targetLaneRef.current = 0;
    bikeXRef.current = 0;
    speedRef.current = 28;
    gearRef.current = 2;
    fareRef.current = 200;
    distanceRef.current = 0;
    entitiesRef.current = [];
    spawnAccumRef.current = 0;
    wobbleRef.current = 0;

    setSpeedKmh(28);
    setGear(2);
    setFareKes(200);
    setDistanceKm(0);
    showCallout(`Joined ${selectedCorridor.name} — Watch for overlapping!`);
  }, [selectedCorridor, showCallout]);

  const shiftLane = (delta: -1 | 1) => {
    if (!runningRef.current) return;
    const maxLane = selectedCorridor.hasMurramShoulder
      ? selectedCorridor.lanes
      : selectedCorridor.lanes - 1;
    const next = Math.max(0, Math.min(maxLane, targetLaneRef.current + delta));
    targetLaneRef.current = next;

    if (next === selectedCorridor.lanes && selectedCorridor.hasMurramShoulder) {
      showCallout('Off-Road Murram Bypass! Watch potholes & mkokoteni.');
    }
  };

  const changeSpeed = (delta: number) => {
    if (!runningRef.current) return;
    const nextSpeed = Math.max(15, Math.min(95, speedRef.current + delta));
    speedRef.current = nextSpeed;
    const computedGear =
      nextSpeed < 22 ? 1 : nextSpeed < 38 ? 2 : nextSpeed < 56 ? 3 : nextSpeed < 75 ? 4 : 5;
    gearRef.current = computedGear;
    setSpeedKmh(Math.round(nextSpeed));
    setGear(computedGear);
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!runningRef.current) return;
      if (e.key === 'ArrowLeft' || e.key === 'a') shiftLane(-1);
      if (e.key === 'ArrowRight' || e.key === 'd') shiftLane(1);
      if (e.key === 'ArrowUp' || e.key === 'w') changeSpeed(10);
      if (e.key === 'ArrowDown' || e.key === 's') changeSpeed(-12);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  // 60 FPS Realistic Top-Down Rendering Engine (Zero AI Filters)
  useEffect(() => {
    if (!isRunning) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 320;
    const H = 370;
    const totalCols = selectedCorridor.hasMurramShoulder
      ? selectedCorridor.lanes + 1
      : selectedCorridor.lanes;
    const colWidth = (W - 24) / totalCols;
    const bikeY = H - 82;

    // Realistic Top-Down Bajaj Boxer BM150X Drawing
    const drawBajajBoxer150X = (cx: number, cy: number, tilt: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tilt);

      const tankHex =
        bikeColor === 'red' ? '#b91c1c' : bikeColor === 'blue' ? '#1d4ed8' : '#18181b';
      const decalHex =
        bikeColor === 'red' ? '#f59e0b' : bikeColor === 'blue' ? '#38bdf8' : '#dc2626';

      // Ground contact shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
      ctx.beginPath();
      ctx.ellipse(2, 4, 11, 28, 0, 0, Math.PI * 2);
      ctx.fill();

      // Rear 100/90 x 17" Semi-Knobby Off-Road Tyre
      ctx.fillStyle = '#111113';
      ctx.fillRect(-4.5, 13, 9, 15);
      ctx.fillStyle = '#27272a';
      ctx.fillRect(-4.5, 15, 9, 2);
      ctx.fillRect(-4.5, 20, 9, 2);
      ctx.fillRect(-4.5, 25, 9, 2);

      // SNS Rear Twin Shock Springs & Chrome Carrier Rack
      ctx.strokeStyle = '#a1a1aa';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-6, 15, 12, 10);

      // Elongated Flat Ribbed Saddle Seat
      ctx.fillStyle = '#1f1f23';
      ctx.beginPath();
      ctx.roundRect(-6.5, -2, 13, 19, 3);
      ctx.fill();
      ctx.strokeStyle = '#3f3f46';
      ctx.lineWidth = 1;
      for (let sy = 2; sy <= 14; sy += 4) {
        ctx.beginPath();
        ctx.moveTo(-5, sy);
        ctx.lineTo(5, sy);
        ctx.stroke();
      }

      // 11-Litre Sculpted Bajaj Boxer Fuel Tank
      ctx.fillStyle = tankHex;
      ctx.beginPath();
      ctx.roundRect(-7.5, -14, 15, 14, 5);
      ctx.fill();

      // Boxer 150X Side Tank Decal Stripes
      ctx.fillStyle = decalHex;
      ctx.fillRect(-7, -11, 2.5, 8);
      ctx.fillRect(4.5, -11, 2.5, 8);

      // Fuel Cap
      ctx.fillStyle = '#d4d4d8';
      ctx.beginPath();
      ctx.arc(0, -8, 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Wide Off-Road Handlebar
      ctx.strokeStyle = '#27272a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-14, -15);
      ctx.lineTo(14, -15);
      ctx.stroke();

      // Rubber Grips
      ctx.fillStyle = '#09090b';
      ctx.fillRect(-15, -16.5, 4, 3);
      ctx.fillRect(11, -16.5, 4, 3);

      // High-Raised Off-Road Front Mudguard (BM150X signature)
      ctx.fillStyle = tankHex;
      ctx.beginPath();
      ctx.roundRect(-4, -27, 8, 11, 3);
      ctx.fill();

      // Front 3.00 x 17" Knobby Tyre peeking under mudguard
      ctx.fillStyle = '#111113';
      ctx.fillRect(-3.5, -30, 7, 4);

      // 12V HS-1 Round Headlamp
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(0, -18, 3, 0, Math.PI * 2);
      ctx.fill();

      // Rider Helmet
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(0, -2, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#18181b';
      ctx.fillRect(-4, -5, 8, 2.5);

      ctx.restore();
    };

    const drawVehicleOrHazard = (ent: RoadEntity) => {
      const cx = 12 + ent.lane * colWidth + colWidth / 2;
      const top = ent.y;

      if (ent.kind === 'matatu') {
        const w = Math.min(colWidth - 8, 44);
        const h = 76;
        const x = cx - w / 2;

        ctx.fillStyle = ent.color;
        ctx.beginPath();
        ctx.roundRect(x, top, w, h, 6);
        ctx.fill();

        ctx.fillStyle = '#facc15';
        ctx.fillRect(x + 3, top + 10, w - 6, 6);
        ctx.fillStyle = '#18181b';
        ctx.fillRect(x + 4, top + 6, w - 8, 8);
        ctx.fillRect(x + 4, top + h - 10, w - 8, 6);

        if (ent.swerving) {
          ctx.fillStyle = '#f97316';
          ctx.fillRect(x, top + 2, 5, 5);
          ctx.fillRect(x + w - 5, top + 2, 5, 5);
        }
      } else if (ent.kind === 'saloon') {
        const w = Math.min(colWidth - 12, 36);
        const h = 54;
        const x = cx - w / 2;

        ctx.fillStyle = ent.color;
        ctx.beginPath();
        ctx.roundRect(x, top, w, h, 7);
        ctx.fill();

        ctx.fillStyle = '#18181b';
        ctx.fillRect(x + 4, top + 10, w - 8, 12);
        ctx.fillRect(x + 5, top + 34, w - 10, 9);
      } else if (ent.kind === 'mkokoteni') {
        const w = 28;
        const h = 42;
        const x = cx - w / 2;
        ctx.fillStyle = '#92400e';
        ctx.fillRect(x, top + 8, w, h - 8);
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, top + 8, w, h - 8);
        ctx.beginPath();
        ctx.moveTo(x + 6, top);
        ctx.lineTo(x + 6, top + 8);
        ctx.moveTo(x + w - 6, top);
        ctx.lineTo(x + w - 6, top + 8);
        ctx.stroke();
      } else if (ent.kind === 'pothole') {
        ctx.fillStyle = '#1c1917';
        ctx.beginPath();
        ctx.ellipse(cx, top + 14, 14, 10, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#57534e';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (ent.kind === 'kanjo') {
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(cx - 12, top + 20);
        ctx.lineTo(cx - 6, top + 4);
        ctx.lineTo(cx + 6, top + 4);
        ctx.lineTo(cx + 12, top + 20);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx - 8, top + 10, 16, 4);
      } else if (ent.kind === 'abiria') {
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(cx, top + 14, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('KES', cx, top + 17);
      }
    };

    const loop = () => {
      if (!runningRef.current) return;

      const currentSpeedPx = speedRef.current * 0.11;
      roadScrollRef.current = (roadScrollRef.current + currentSpeedPx) % 48;
      distanceRef.current += speedRef.current / 216000;
      setDistanceKm(Number(distanceRef.current.toFixed(2)));

      spawnAccumRef.current += currentSpeedPx;
      if (spawnAccumRef.current > 105) {
        spawnAccumRef.current = 0;
        const lane = Math.floor(Math.random() * totalCols);
        const isShoulder =
          selectedCorridor.hasMurramShoulder && lane === selectedCorridor.lanes;
        const roll = Math.random();

        if (isShoulder) {
          entitiesRef.current.push({
            id: Math.random(),
            lane,
            y: -70,
            width: 28,
            height: 36,
            speed: roll < 0.5 ? 0 : currentSpeedPx * 0.25,
            kind: roll < 0.55 ? 'pothole' : 'mkokoteni',
            color: '#78350f',
          });
        } else if (roll < 0.35) {
          const matatuColors = ['#e11d48', '#2563eb', '#d97706', '#7c3aed', '#059669'];
          entitiesRef.current.push({
            id: Math.random(),
            lane,
            y: -90,
            width: 42,
            height: 76,
            speed: currentSpeedPx * 0.58,
            kind: 'matatu',
            color: matatuColors[Math.floor(Math.random() * matatuColors.length)],
            swerving: Math.random() < 0.45,
          });
        } else if (roll < 0.68) {
          const carColors = ['#d4d4d8', '#71717a', '#3f3f46', '#94a3b8'];
          entitiesRef.current.push({
            id: Math.random(),
            lane,
            y: -70,
            width: 34,
            height: 54,
            speed: currentSpeedPx * 0.68,
            kind: 'saloon',
            color: carColors[Math.floor(Math.random() * carColors.length)],
          });
        } else if (roll < 0.84) {
          entitiesRef.current.push({
            id: Math.random(),
            lane,
            y: -40,
            width: 24,
            height: 24,
            speed: 0,
            kind: 'kanjo',
            color: '#f97316',
          });
        } else {
          entitiesRef.current.push({
            id: Math.random(),
            lane,
            y: -40,
            width: 24,
            height: 24,
            speed: 0,
            kind: 'abiria',
            color: '#22c55e',
          });
        }
      }

      entitiesRef.current.forEach((ent) => {
        ent.y += currentSpeedPx - ent.speed;
        if (ent.kind === 'matatu' && ent.swerving && ent.y > 60 && ent.y < 140) {
          ent.swerving = false;
          if (ent.lane > 0) {
            ent.lane -= 1;
            showCallout('Weh! Matatu imeingia stage bila indicator!');
          }
        }
      });
      entitiesRef.current = entitiesRef.current.filter((e) => e.y < H + 100);

      const prevX = bikeXRef.current;
      bikeXRef.current += (targetLaneRef.current - bikeXRef.current) * 0.22;
      if (wobbleRef.current > 0) wobbleRef.current -= 1;
      const wobbleOffset = wobbleRef.current > 0 ? Math.sin(wobbleRef.current * 0.9) * 5 : 0;
      const tilt = (bikeXRef.current - prevX) * 0.45;

      // Road Surface
      ctx.fillStyle = '#262629';
      ctx.fillRect(0, 0, W, H);

      if (selectedCorridor.hasMurramShoulder) {
        const murramX = 12 + selectedCorridor.lanes * colWidth;
        ctx.fillStyle = '#5c4033';
        ctx.fillRect(murramX, 0, colWidth, H);
      }

      // Nairobi Black & Yellow Curbs
      for (let y = -48; y < H + 48; y += 24) {
        const drawY = y + roadScrollRef.current;
        ctx.fillStyle = Math.floor((y + 48) / 24) % 2 === 0 ? '#eab308' : '#18181b';
        ctx.fillRect(0, drawY, 12, 24);
        ctx.fillRect(W - 12, drawY, 12, 24);
      }

      // Lane Dividers
      for (let i = 1; i < totalCols; i++) {
        const lineX = 12 + i * colWidth;
        if (selectedCorridor.hasMurramShoulder && i === selectedCorridor.lanes) {
          ctx.strokeStyle = '#eab308';
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(lineX, 0);
          ctx.lineTo(lineX, H);
          ctx.stroke();
        } else if (i === Math.floor(selectedCorridor.lanes / 2)) {
          ctx.strokeStyle = '#eab308';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(lineX - 2, 0);
          ctx.lineTo(lineX - 2, H);
          ctx.moveTo(lineX + 2, 0);
          ctx.lineTo(lineX + 2, H);
          ctx.stroke();
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.lineWidth = 2;
          ctx.setLineDash([22, 26]);
          ctx.lineDashOffset = -roadScrollRef.current;
          ctx.beginPath();
          ctx.moveTo(lineX, 0);
          ctx.lineTo(lineX, H);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);

      const bikeCenterX = 12 + bikeXRef.current * colWidth + colWidth / 2 + wobbleOffset;

      for (let i = entitiesRef.current.length - 1; i >= 0; i--) {
        const ent = entitiesRef.current[i];
        drawVehicleOrHazard(ent);

        const entCenterX = 12 + ent.lane * colWidth + colWidth / 2;
        const dx = Math.abs(bikeCenterX - entCenterX);
        const dy = Math.abs(bikeY - (ent.y + ent.height / 2));

        // Kupenya (Lane Splitting Bonus)
        if (
          !ent.rewarded &&
          (ent.kind === 'matatu' || ent.kind === 'saloon') &&
          ent.y > bikeY &&
          dx < colWidth * 0.95 &&
          dx > 16
        ) {
          ent.rewarded = true;
          fareRef.current += 50;
          setFareKes(fareRef.current);
          showCallout('Kupenya safi! +50 KES bonus');
        }

        // Abiria Pickup
        if (ent.kind === 'abiria' && dx < 24 && dy < 32) {
          fareRef.current += 100;
          setFareKes(fareRef.current);
          showCallout('Abiria amepanda! +100 KES fare');
          entitiesRef.current.splice(i, 1);
          continue;
        }

        // Kanjo Checkpoint Speed Check
        if (ent.kind === 'kanjo' && !ent.rewarded && dy < 24 && dx < 24) {
          ent.rewarded = true;
          if (speedRef.current > 50) {
            fareRef.current = Math.max(0, fareRef.current - 100);
            setFareKes(fareRef.current);
            showCallout('Kanjo: Overspeeding checkpoint! -100 KES');
            if (fareRef.current === 0) {
              runningRef.current = false;
              setIsRunning(false);
              setGameOverReason('Bike Impounded by Kanjo (0 KES left)');
              return;
            }
          } else {
            showCallout('Passed Kanjo checkpoint cleanly under 50 km/h!');
          }
          continue;
        }

        // Pothole hit
        if (ent.kind === 'pothole' && !ent.rewarded && dx < 20 && dy < 22) {
          ent.rewarded = true;
          wobbleRef.current = 18;
          changeSpeed(-10);
          showCallout('Shimo! Boxer SNS suspension took the hit.');
          continue;
        }

        // Crash check
        if (
          (ent.kind === 'matatu' || ent.kind === 'saloon' || ent.kind === 'mkokoteni') &&
          dx < ent.width / 2 + 7 &&
          dy < ent.height / 2 + 22
        ) {
          runningRef.current = false;
          setIsRunning(false);
          setGameOverReason(
            ent.kind === 'matatu'
              ? 'Umegonga Nganya stage!'
              : ent.kind === 'mkokoteni'
              ? 'Umeingia Mkokoteni kwa shoulder!'
              : 'Accident on ' + selectedCorridor.name
          );
          return;
        }
      }

      drawBajajBoxer150X(bikeCenterX, bikeY, tilt);
      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [isRunning, selectedCorridor, bikeColor, showCallout]);

  return (
    <div className="flex-1 flex flex-col space-y-3">
      {/* Real Nairobi Street Bar + Importer Toggle */}
      <div
        className={`border rounded-2xl px-3.5 py-2.5 flex items-center justify-between text-xs shadow-sm ${
          isDarkMode
            ? 'bg-[#161619] border-zinc-800/80 text-zinc-200'
            : 'bg-white border-zinc-200 text-zinc-800'
        }`}
      >
        <div className="flex items-center space-x-2 min-w-0">
          <MapPin className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <div className="truncate">
            <div className="font-bold truncate">{selectedCorridor.name}</div>
            <div className="text-[10px] text-zinc-500 truncate">
              {selectedCorridor.landmark} • {selectedCorridor.lanes} Lanes
              {selectedCorridor.hasMurramShoulder ? ' + Murram' : ''}
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsImporterOpen(!isImporterOpen)}
          className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold flex items-center gap-1 flex-shrink-0 ${
            isDarkMode
              ? 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:bg-zinc-800'
              : 'bg-zinc-100 border-zinc-300 text-zinc-800 hover:bg-zinc-200'
          }`}
        >
          <Navigation className="w-3 h-3 text-amber-400" />
          <span>Streets</span>
        </button>
      </div>

      {/* Real Nairobi Street Importer Drawer */}
      {isImporterOpen && (
        <div
          className={`border rounded-2xl p-3.5 space-y-3 text-xs shadow-md ${
            isDarkMode
              ? 'bg-[#141417] border-zinc-800 text-zinc-200'
              : 'bg-white border-zinc-300 text-zinc-800'
          }`}
        >
          <div className="font-bold flex items-center justify-between">
            <span>Select or Import Real Nairobi Street</span>
            <button
              onClick={() => setIsImporterOpen(false)}
              className="text-[11px] text-zinc-500"
            >
              Close
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PRESET_CORRIDORS.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedCorridor(c);
                  setIsImporterOpen(false);
                  if (isRunning) startRide();
                }}
                className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-medium ${
                  selectedCorridor.id === c.id
                    ? 'bg-amber-400 text-zinc-950 border-amber-400 font-bold'
                    : isDarkMode
                    ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                    : 'bg-zinc-100 border-zinc-200 text-zinc-700'
                }`}
              >
                {c.name.split(' (')[0]}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5">
            <input
              type="text"
              value={streetQuery}
              onChange={(e) => setStreetQuery(e.target.value)}
              placeholder="Import Nairobi road (e.g. Ngong Road)"
              className={`flex-1 rounded-xl px-3 py-2 text-xs border focus:outline-none ${
                isDarkMode
                  ? 'bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500'
                  : 'bg-zinc-50 border-zinc-300 text-zinc-900'
              }`}
            />
            <button
              onClick={handleImportRealStreet}
              disabled={isImporting}
              className="px-3 py-2 rounded-xl bg-zinc-200 text-zinc-950 font-bold text-xs flex items-center gap-1 disabled:opacity-50"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{isImporting ? '...' : 'Import'}</span>
            </button>
          </div>

          {importStatus && (
            <p className="text-[11px] text-amber-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{importStatus}</span>
            </p>
          )}
        </div>
      )}

      {/* Bajaj Boxer 150X Telemetry */}
      <div
        className={`border rounded-2xl px-3.5 py-2 flex items-center justify-between text-xs ${
          isDarkMode
            ? 'bg-[#161619] border-zinc-800/80 text-zinc-200'
            : 'bg-white border-zinc-200 text-zinc-800'
        }`}
      >
        <div className="flex items-center space-x-3">
          <span className="flex items-center gap-1 font-bold text-amber-400">
            <Gauge className="w-3.5 h-3.5" />
            {speedKmh} km/h
          </span>
          <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-200 text-[10px] font-mono">
            GEAR {gear}/5
          </span>
        </div>
        <div className="font-bold text-emerald-400">KES {fareKes}</div>
      </div>

      {/* Live Nairobi Street Callout Banner */}
      <div
        className={`px-3.5 py-2 rounded-xl border text-[11px] font-medium flex items-center gap-2 ${
          isDarkMode
            ? 'bg-zinc-900/90 border-zinc-800 text-zinc-300'
            : 'bg-zinc-100 border-zinc-200 text-zinc-700'
        }`}
      >
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        <span className="truncate">{callout}</span>
      </div>

      {/* Canvas Road Viewport */}
      <div
        className={`border rounded-3xl p-3 shadow-sm flex-1 flex flex-col justify-center items-center relative ${
          isDarkMode
            ? 'bg-[#121215] border-zinc-800/80'
            : 'bg-white border-zinc-200 shadow-md'
        }`}
      >
        <div className="relative rounded-2xl overflow-hidden border border-zinc-700/70">
          <canvas
            ref={canvasRef}
            width={320}
            height={370}
            className="block max-w-full h-auto touch-none"
          />

          {!isRunning && (
            <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-5 text-center space-y-3">
              <div className="w-11 h-11 rounded-2xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400">
                <Bike className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {gameOverReason || 'Nduthi Kanairo — Boxer BM150X'}
                </h3>
                <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                  {gameOverReason
                    ? `Distance: ${distanceKm} km • Final Fare: KES ${fareKes}`
                    : 'Slow under 50 km/h at Kanjo checkpoints, pick up Abiria, and kupenya between matatus.'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {(
                  [
                    { id: 'red', label: 'Boxer Red', hex: 'bg-red-700' },
                    { id: 'black', label: 'Ebony Black', hex: 'bg-zinc-900' },
                    { id: 'blue', label: 'Blue Decal', hex: 'bg-blue-700' },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setBikeColor(c.id)}
                    className={`px-2.5 py-1 rounded-xl border text-[10px] font-semibold flex items-center gap-1.5 ${
                      bikeColor === c.id
                        ? 'border-amber-400 text-white bg-zinc-800'
                        : 'border-zinc-700 text-zinc-400 bg-zinc-900'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${c.hex}`} />
                    {c.label}
                  </button>
                ))}
              </div>

              <button
                onClick={startRide}
                className="px-6 py-2.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-bold flex items-center gap-1.5 active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{gameOverReason ? 'Kick Start Again' : 'Kick Start Boxer 150X'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Handlebar Controls */}
        <div className="grid grid-cols-4 gap-2 w-full max-w-[320px] mt-3">
          <button
            onClick={() => shiftLane(-1)}
            className={`py-2.5 rounded-xl border flex items-center justify-center active:scale-95 ${
              isDarkMode
                ? 'bg-zinc-900 border-zinc-800 text-zinc-200'
                : 'bg-zinc-100 border-zinc-300 text-zinc-800'
            }`}
            aria-label="Steer Left"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <button
            onClick={() => changeSpeed(-12)}
            className={`py-2.5 rounded-xl border flex items-center justify-center text-[11px] font-bold active:scale-95 ${
              isDarkMode
                ? 'bg-zinc-900 border-zinc-800 text-rose-400'
                : 'bg-zinc-100 border-zinc-300 text-red-600'
            }`}
            aria-label="Brake"
          >
            <ArrowDown className="w-4 h-4 mr-0.5" /> Brake
          </button>

          <button
            onClick={() => changeSpeed(10)}
            className={`py-2.5 rounded-xl border flex items-center justify-center text-[11px] font-bold active:scale-95 ${
              isDarkMode
                ? 'bg-zinc-900 border-zinc-800 text-emerald-400'
                : 'bg-zinc-100 border-zinc-300 text-emerald-700'
            }`}
            aria-label="Throttle"
          >
            <ArrowUp className="w-4 h-4 mr-0.5" /> Gas
          </button>

          <button
            onClick={() => shiftLane(1)}
            className={`py-2.5 rounded-xl border flex items-center justify-center active:scale-95 ${
              isDarkMode
                ? 'bg-zinc-900 border-zinc-800 text-zinc-200'
                : 'bg-zinc-100 border-zinc-300 text-zinc-800'
            }`}
            aria-label="Steer Right"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}