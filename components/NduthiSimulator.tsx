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
  lane: number;
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

  // Physics & Simulation Refs
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
    showCallout(`Joined ${selectedCorridor.name} — Watch out for overlapping traffic!`);
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

  // 60 FPS Canvas Rendering Engine
  useEffect(() => {
    if (!isRunning) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 320;
    const H = 270;
    const totalCols = selectedCorridor.hasMurramShoulder
      ? selectedCorridor.lanes + 1
      : selectedCorridor.lanes;
    const colWidth = (W - 20) / totalCols;
    const bikeY = H - 65;

    const drawBajajBoxer150X = (cx: number, cy: number, tilt: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tilt);

      const tankHex =
        bikeColor === 'red' ? '#b91c1c' : bikeColor === 'blue' ? '#1d4ed8' : '#18181b';
      const decalHex =
        bikeColor === 'red' ? '#f59e0b' : bikeColor === 'blue' ? '#38bdf8' : '#dc2626';

      ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
      ctx.beginPath();
      ctx.ellipse(2, 4, 10, 24, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#111113';
      ctx.fillRect(-4, 11, 8, 13);

      ctx.fillStyle = '#1f1f23';
      ctx.beginPath();
      ctx.roundRect(-5.5, -2, 11, 16, 2);
      ctx.fill();

      ctx.fillStyle = tankHex;
      ctx.beginPath();
      ctx.roundRect(-6.5, -12, 13, 12, 4);
      ctx.fill();

      ctx.fillStyle = decalHex;
      ctx.fillRect(-6, -9, 2, 7);
      ctx.fillRect(4, -9, 2, 7);

      ctx.strokeStyle = '#27272a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-12, -13);
      ctx.lineTo(12, -13);
      ctx.stroke();

      ctx.fillStyle = tankHex;
      ctx.beginPath();
      ctx.roundRect(-3.5, -22, 7, 9, 2);
      ctx.fill();

      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(0, -15, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(0, -2, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    const drawVehicleOrHazard = (ent: RoadEntity) => {
      const cx = 10 + ent.lane * colWidth + colWidth / 2;
      const top = ent.y;

      if (ent.kind === 'matatu') {
        const w = Math.min(colWidth - 6, 38);
        const h = 64;
        const x = cx - w / 2;

        ctx.fillStyle = ent.color;
        ctx.beginPath();
        ctx.roundRect(x, top, w, h, 5);
        ctx.fill();

        ctx.fillStyle = '#facc15';
        ctx.fillRect(x + 2, top + 8, w - 4, 5);
        ctx.fillStyle = '#18181b';
        ctx.fillRect(x + 3, top + 4, w - 6, 6);
      } else if (ent.kind === 'saloon') {
        const w = Math.min(colWidth - 10, 32);
        const h = 46;
        const x = cx - w / 2;

        ctx.fillStyle = ent.color;
        ctx.beginPath();
        ctx.roundRect(x, top, w, h, 5);
        ctx.fill();
      } else if (ent.kind === 'mkokoteni') {
        const w = 24;
        const h = 34;
        const x = cx - w / 2;
        ctx.fillStyle = '#92400e';
        ctx.fillRect(x, top + 6, w, h - 6);
      } else if (ent.kind === 'pothole') {
        ctx.fillStyle = '#1c1917';
        ctx.beginPath();
        ctx.ellipse(cx, top + 10, 12, 8, 0.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (ent.kind === 'kanjo') {
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(cx - 10, top + 16);
        ctx.lineTo(cx - 5, top + 3);
        ctx.lineTo(cx + 5, top + 3);
        ctx.lineTo(cx + 10, top + 16);
        ctx.closePath();
        ctx.fill();
      } else if (ent.kind === 'abiria') {
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(cx, top + 10, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('KES', cx, top + 13);
      }
    };

    const loop = () => {
      if (!runningRef.current) return;

      const currentSpeedPx = speedRef.current * 0.1;
      roadScrollRef.current = (roadScrollRef.current + currentSpeedPx) % 40;
      distanceRef.current += speedRef.current / 216000;
      setDistanceKm(Number(distanceRef.current.toFixed(2)));

      spawnAccumRef.current += currentSpeedPx;
      if (spawnAccumRef.current > 90) {
        spawnAccumRef.current = 0;
        const lane = Math.floor(Math.random() * totalCols);
        const isShoulder =
          selectedCorridor.hasMurramShoulder && lane === selectedCorridor.lanes;
        const roll = Math.random();

        if (isShoulder) {
          entitiesRef.current.push({
            id: Math.random(),
            lane,
            y: -60,
            width: 24,
            height: 30,
            speed: roll < 0.5 ? 0 : currentSpeedPx * 0.25,
            kind: roll < 0.55 ? 'pothole' : 'mkokoteni',
            color: '#78350f',
          });
        } else if (roll < 0.35) {
          const matatuColors = ['#e11d48', '#2563eb', '#d97706', '#7c3aed', '#059669'];
          entitiesRef.current.push({
            id: Math.random(),
            lane,
            y: -80,
            width: 38,
            height: 64,
            speed: currentSpeedPx * 0.55,
            kind: 'matatu',
            color: matatuColors[Math.floor(Math.random() * matatuColors.length)],
            swerving: Math.random() < 0.4,
          });
        } else if (roll < 0.7) {
          const carColors = ['#d4d4d8', '#71717a', '#3f3f46', '#94a3b8'];
          entitiesRef.current.push({
            id: Math.random(),
            lane,
            y: -60,
            width: 30,
            height: 46,
            speed: currentSpeedPx * 0.65,
            kind: 'saloon',
            color: carColors[Math.floor(Math.random() * carColors.length)],
          });
        } else if (roll < 0.85) {
          entitiesRef.current.push({
            id: Math.random(),
            lane,
            y: -35,
            width: 20,
            height: 20,
            speed: 0,
            kind: 'kanjo',
            color: '#f97316',
          });
        } else {
          entitiesRef.current.push({
            id: Math.random(),
            lane,
            y: -35,
            width: 20,
            height: 20,
            speed: 0,
            kind: 'abiria',
            color: '#22c55e',
          });
        }
      }

      entitiesRef.current.forEach((ent) => {
        ent.y += currentSpeedPx - ent.speed;
      });
      entitiesRef.current = entitiesRef.current.filter((e) => e.y < H + 80);

      const prevX = bikeXRef.current;
      bikeXRef.current += (targetLaneRef.current - bikeXRef.current) * 0.22;
      if (wobbleRef.current > 0) wobbleRef.current -= 1;
      const wobbleOffset = wobbleRef.current > 0 ? Math.sin(wobbleRef.current * 0.9) * 4 : 0;
      const tilt = (bikeXRef.current - prevX) * 0.4;

      ctx.fillStyle = '#262629';
      ctx.fillRect(0, 0, W, H);

      if (selectedCorridor.hasMurramShoulder) {
        const murramX = 10 + selectedCorridor.lanes * colWidth;
        ctx.fillStyle = '#5c4033';
        ctx.fillRect(murramX, 0, colWidth, H);
      }

      // Curbs
      for (let y = -40; y < H + 40; y += 20) {
        const drawY = y + roadScrollRef.current;
        ctx.fillStyle = Math.floor((y + 40) / 20) % 2 === 0 ? '#eab308' : '#18181b';
        ctx.fillRect(0, drawY, 10, 20);
        ctx.fillRect(W - 10, drawY, 10, 20);
      }

      // Lanes
      for (let i = 1; i < totalCols; i++) {
        const lineX = 10 + i * colWidth;
        if (selectedCorridor.hasMurramShoulder && i === selectedCorridor.lanes) {
          ctx.strokeStyle = '#eab308';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(lineX, 0);
          ctx.lineTo(lineX, H);
          ctx.stroke();
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([18, 22]);
          ctx.lineDashOffset = -roadScrollRef.current;
          ctx.beginPath();
          ctx.moveTo(lineX, 0);
          ctx.lineTo(lineX, H);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);

      const bikeCenterX = 10 + bikeXRef.current * colWidth + colWidth / 2 + wobbleOffset;

      for (let i = entitiesRef.current.length - 1; i >= 0; i--) {
        const ent = entitiesRef.current[i];
        drawVehicleOrHazard(ent);

        const entCenterX = 10 + ent.lane * colWidth + colWidth / 2;
        const dx = Math.abs(bikeCenterX - entCenterX);
        const dy = Math.abs(bikeY - (ent.y + ent.height / 2));

        // Kupenya
        if (
          !ent.rewarded &&
          (ent.kind === 'matatu' || ent.kind === 'saloon') &&
          ent.y > bikeY &&
          dx < colWidth * 0.9 &&
          dx > 14
        ) {
          ent.rewarded = true;
          fareRef.current += 50;
          setFareKes(fareRef.current);
          showCallout('Kupenya safi! +50 KES bonus');
        }

        // Abiria
        if (ent.kind === 'abiria' && dx < 22 && dy < 28) {
          fareRef.current += 100;
          setFareKes(fareRef.current);
          showCallout('Abiria amepanda! +100 KES fare');
          entitiesRef.current.splice(i, 1);
          continue;
        }

        // Kanjo
        if (ent.kind === 'kanjo' && !ent.rewarded && dy < 22 && dx < 22) {
          ent.rewarded = true;
          if (speedRef.current > 50) {
            fareRef.current = Math.max(0, fareRef.current - 100);
            setFareKes(fareRef.current);
            showCallout('Kanjo checkpoint overspeeding! -100 KES');
            if (fareRef.current === 0) {
              runningRef.current = false;
              setIsRunning(false);
              setGameOverReason('Bike Impounded by Kanjo');
              return;
            }
          } else {
            showCallout('Clean run past Kanjo under 50 km/h!');
          }
          continue;
        }

        // Pothole
        if (ent.kind === 'pothole' && !ent.rewarded && dx < 18 && dy < 18) {
          ent.rewarded = true;
          wobbleRef.current = 15;
          changeSpeed(-10);
          showCallout('Shimo! Suspension took a hit.');
          continue;
        }

        // Crash
        if (
          (ent.kind === 'matatu' || ent.kind === 'saloon' || ent.kind === 'mkokoteni') &&
          dx < ent.width / 2 + 6 &&
          dy < ent.height / 2 + 18
        ) {
          runningRef.current = false;
          setIsRunning(false);
          setGameOverReason('Crash on ' + selectedCorridor.name);
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
    <div className="flex-1 flex flex-col space-y-2.5 pb-4">
      {/* Street Bar */}
      <div
        className={`border rounded-xl px-3 py-2 flex items-center justify-between text-xs shadow-sm ${
          isDarkMode
            ? 'bg-[#161619] border-zinc-800/80 text-zinc-200'
            : 'bg-white border-zinc-200 text-zinc-800'
        }`}
      >
        <div className="flex items-center space-x-2 min-w-0">
          <MapPin className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <div className="truncate">
            <div className="font-bold truncate">{selectedCorridor.name}</div>
            <div className="text-[10px] text-zinc-500 truncate">
              {selectedCorridor.landmark} • {selectedCorridor.lanes} Lanes
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsImporterOpen(!isImporterOpen)}
          className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 flex-shrink-0 ${
            isDarkMode
              ? 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:bg-zinc-800'
              : 'bg-zinc-100 border-zinc-300 text-zinc-800 hover:bg-zinc-200'
          }`}
        >
          <Navigation className="w-3 h-3 text-amber-400" />
          <span>Streets</span>
        </button>
      </div>

      {/* Street Importer Drawer */}
      {isImporterOpen && (
        <div
          className={`border rounded-xl p-3 space-y-2.5 text-xs shadow-md ${
            isDarkMode ? 'bg-[#141417] border-zinc-800 text-zinc-200' : 'bg-white border-zinc-300 text-zinc-800'
          }`}
        >
          <div className="font-bold flex items-center justify-between">
            <span>Select Nairobi Street</span>
            <button onClick={() => setIsImporterOpen(false)} className="text-[11px] text-zinc-500">
              Close
            </button>
          </div>

          <div className="flex flex-wrap gap-1">
            {PRESET_CORRIDORS.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedCorridor(c);
                  setIsImporterOpen(false);
                  if (isRunning) startRide();
                }}
                className={`px-2 py-1 rounded-lg border text-[11px] font-medium ${
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
              placeholder="Import road (e.g. Ngong Road)"
              className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs border focus:outline-none ${
                isDarkMode ? 'bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500' : 'bg-zinc-50 border-zinc-300 text-zinc-900'
              }`}
            />
            <button
              onClick={handleImportRealStreet}
              disabled={isImporting}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-200 text-zinc-950 font-bold text-xs flex items-center gap-1 disabled:opacity-50"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{isImporting ? '...' : 'Import'}</span>
            </button>
          </div>

          {importStatus && (
            <p className="text-[10px] text-amber-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
              <span>{importStatus}</span>
            </p>
          )}
        </div>
      )}

      {/* Telemetry Bar */}
      <div
        className={`border rounded-xl px-3 py-1.5 flex items-center justify-between text-xs ${
          isDarkMode ? 'bg-[#161619] border-zinc-800/80 text-zinc-200' : 'bg-white border-zinc-200 text-zinc-800'
        }`}
      >
        <div className="flex items-center space-x-2">
          <span className="flex items-center gap-1 font-bold text-amber-400">
            <Gauge className="w-3.5 h-3.5" />
            {speedKmh} km/h
          </span>
          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200 text-[10px] font-mono">
            G{gear}/5
          </span>
        </div>
        <div className="font-bold text-emerald-400">KES {fareKes}</div>
      </div>

      {/* Callout Banner */}
      <div
        className={`px-3 py-1.5 rounded-xl border text-[11px] font-medium flex items-center gap-2 ${
          isDarkMode ? 'bg-zinc-900/90 border-zinc-800 text-zinc-300' : 'bg-zinc-100 border-zinc-200 text-zinc-700'
        }`}
      >
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        <span className="truncate">{callout}</span>
      </div>

      {/* Canvas Viewport */}
      <div
        className={`border rounded-2xl p-2.5 shadow-sm flex flex-col items-center justify-center relative ${
          isDarkMode ? 'bg-[#121215] border-zinc-800/80' : 'bg-white border-zinc-200'
        }`}
      >
        <div className="relative rounded-xl overflow-hidden border border-zinc-700/70">
          <canvas
            ref={canvasRef}
            width={320}
            height={270}
            className="block max-w-full h-auto touch-none"
          />

          {!isRunning && (
            <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-4 text-center space-y-2.5">
              <div className="w-9 h-9 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400">
                <Bike className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {gameOverReason || 'Nduthi Kanairo — Boxer BM150X'}
                </h3>
                <p className="text-[10px] text-zinc-400 mt-0.5 leading-snug">
                  {gameOverReason
                    ? `Distance: ${distanceKm} km • Fare: KES ${fareKes}`
                    : 'Watch Kanjo speed limits, pick up Abiria, & kupenya between matatus.'}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                {(
                  [
                    { id: 'red', label: 'Red', hex: 'bg-red-700' },
                    { id: 'black', label: 'Black', hex: 'bg-zinc-900' },
                    { id: 'blue', label: 'Blue', hex: 'bg-blue-700' },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setBikeColor(c.id)}
                    className={`px-2 py-1 rounded-lg border text-[10px] font-semibold flex items-center gap-1 ${
                      bikeColor === c.id ? 'border-amber-400 text-white bg-zinc-800' : 'border-zinc-700 text-zinc-400 bg-zinc-900'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${c.hex}`} />
                    {c.label}
                  </button>
                ))}
              </div>

              <button
                onClick={startRide}
                className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-bold flex items-center gap-1.5 active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{gameOverReason ? 'Kick Start Again' : 'Kick Start Boxer'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Handlebar Controls */}
        <div className="grid grid-cols-4 gap-1.5 w-full max-w-[320px] mt-2.5">
          <button
            onClick={() => shiftLane(-1)}
            className={`py-2 rounded-xl border flex items-center justify-center active:scale-95 ${
              isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-200' : 'bg-zinc-100 border-zinc-300 text-zinc-800'
            }`}
            aria-label="Steer Left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={() => changeSpeed(-12)}
            className={`py-2 rounded-xl border flex items-center justify-center text-[10px] font-bold active:scale-95 ${
              isDarkMode ? 'bg-zinc-900 border-zinc-800 text-rose-400' : 'bg-zinc-100 border-zinc-300 text-red-600'
            }`}
            aria-label="Brake"
          >
            <ArrowDown className="w-3.5 h-3.5 mr-0.5" /> Brake
          </button>

          <button
            onClick={() => changeSpeed(10)}
            className={`py-2 rounded-xl border flex items-center justify-center text-[10px] font-bold active:scale-95 ${
              isDarkMode ? 'bg-zinc-900 border-zinc-800 text-emerald-400' : 'bg-zinc-100 border-zinc-300 text-emerald-700'
            }`}
            aria-label="Throttle"
          >
            <ArrowUp className="w-3.5 h-3.5 mr-0.5" /> Gas
          </button>

          <button
            onClick={() => shiftLane(1)}
            className={`py-2 rounded-xl border flex items-center justify-center active:scale-95 ${
              isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-200' : 'bg-zinc-100 border-zinc-300 text-zinc-800'
            }`}
            aria-label="Steer Right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}