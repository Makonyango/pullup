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
const [selectedCorridor, setSelectedCorridor] = useState(PRESET_CORRIDORS[0]);
const [bikeColor, setBikeColor] = useState('red');
const [isImporterOpen, setIsImporterOpen] = useState(false);
const [streetQuery, setStreetQuery] = useState('');
const [importStatus, setImportStatus] = useState<string | null>(null);
const [isImporting, setIsImporting] = useState(false);

// Live Game UI Readouts
const [isRunning, setIsRunning] = useState(false);
const [gear, setGear] = useState(1);
const [speedKmh, setSpeedKmh] = useState(0);
const [fareKes, setFareKes] = useState(200);
const [distanceKm, setDistanceKm] = useState(0);
const [callout, setCallout] = useState('Ready at stage. Kick start & roll.');
const [gameOverReason, setGameOverReason] = useState<string | null>(null);

// Physics & Simulation Refs (Pure 60fps Canvas)
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
    setImportStatus(`Imported "${imported.name}" (${imported.lanes} lanes)`);
    setIsImporterOpen(false);
  } else {
    setImportStatus('Street not matched. Try "Kenyatta" or "Ngong".');
  }
} catch {
  setImportStatus('Offline — using cached Nairobi street geometry.');
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
showCallout(`Joined ${selectedCorridor.name} — Watch out!`);


}, [selectedCorridor, showCallout]);

const shiftLane = (delta: -1 | 1) => {
if (!runningRef.current) return;
const maxLane = selectedCorridor.hasMurramShoulder
? selectedCorridor.lanes
: selectedCorridor.lanes - 1;
const next = Math.max(0, Math.min(maxLane, targetLaneRef.current + delta));
targetLaneRef.current = next;

if (next === selectedCorridor.lanes && selectedCorridor.hasMurramShoulder) {
  showCallout('Off-Road Murram Bypass! Watch potholes.');
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

// 60 FPS Mobile-Optimized Canvas Engine (Height 280)
useEffect(() => {
if (!isRunning) return;
const canvas = canvasRef.current;
if (!canvas) return;
const ctx = canvas.getContext('2d');
if (!ctx) return;

const W = 320;
const H = 280; // Compact height to eliminate mobile vertical overlap
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
  ctx.roundRect(-6, -2, 12, 16, 3);
  ctx.fill();

  ctx.fillStyle = tankHex;
  ctx.beginPath();
  ctx.roundRect(-7, -12, 14, 12, 4);
  ctx.fill();

  ctx.fillStyle = decalHex;
  ctx.fillRect(-6, -9, 2, 7);
  ctx.fillRect(4, -9, 2, 7);

  ctx.strokeStyle = '#27272a';
  ctx.lineWidth = 2.5;
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
    const h = 60;
    const x = cx - w / 2;
    ctx.fillStyle = ent.color;
    ctx.beginPath();
    ctx.roundRect(x, top, w, h, 5);
    ctx.fill();
    ctx.fillStyle = '#facc15';
    ctx.fillRect(x + 2, top + 8, w - 4, 5);
  } else if (ent.kind === 'saloon') {
    const w = Math.min(colWidth - 10, 32);
    const h = 44;
    const x = cx - w / 2;
    ctx.fillStyle = ent.color;
    ctx.beginPath();
    ctx.roundRect(x, top, w, h, 5);
    ctx.fill();
  } else if (ent.kind === 'pothole') {
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.ellipse(cx, top + 10, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (ent.kind === 'kanjo') {
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(cx, top + 10, 10, 0, Math.PI * 2);
    ctx.fill();
  } else if (ent.kind === 'abiria') {
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(cx, top + 10, 9, 0, Math.PI * 2);
    ctx.fill();
  }
};

const loop = () => {
  if (!runningRef.current) return;

  const currentSpeedPx = speedRef.current * 0.09;
  roadScrollRef.current = (roadScrollRef.current + currentSpeedPx) % 40;
  distanceRef.current += speedRef.current / 216000;
  setDistanceKm(Number(distanceRef.current.toFixed(2)));

  spawnAccumRef.current += currentSpeedPx;
  if (spawnAccumRef.current > 120) {
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
        height: 24,
        speed: 0,
        kind: 'pothole',
        color: '#78350f',
      });
    } else if (roll < 0.4) {
      const colors = ['#e11d48', '#2563eb', '#d97706'];
      entitiesRef.current.push({
        id: Math.random(),
        lane,
        y: -70,
        width: 38,
        height: 60,
        speed: currentSpeedPx * 0.5,
        kind: 'matatu',
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    } else {
      entitiesRef.current.push({
        id: Math.random(),
        lane,
        y: -50,
        width: 30,
        height: 44,
        speed: currentSpeedPx * 0.6,
        kind: 'saloon',
        color: '#71717a',
      });
    }
  }

  entitiesRef.current.forEach((ent) => {
    ent.y += currentSpeedPx - ent.speed;
  });
  entitiesRef.current = entitiesRef.current.filter((e) => e.y < H + 80);

  const prevX = bikeXRef.current;
  bikeXRef.current += (targetLaneRef.current - bikeXRef.current) * 0.22;
  const tilt = (bikeXRef.current - prevX) * 0.4;

  ctx.fillStyle = '#262629';
  ctx.fillRect(0, 0, W, H);

  // Curbs
  for (let y = -40; y < H + 40; y += 20) {
    const drawY = y + roadScrollRef.current;
    ctx.fillStyle = Math.floor((y + 40) / 20) % 2 === 0 ? '#eab308' : '#18181b';
    ctx.fillRect(0, drawY, 10, 20);
    ctx.fillRect(W - 10, drawY, 10, 20);
  }

  const bikeCenterX = 10 + bikeXRef.current * colWidth + colWidth / 2;

  entitiesRef.current.forEach((ent) => {
    drawVehicleOrHazard(ent);
    const entCenterX = 10 + ent.lane * colWidth + colWidth / 2;
    const dx = Math.abs(bikeCenterX - entCenterX);
    const dy = Math.abs(bikeY - (ent.y + ent.height / 2));

    if (
      (ent.kind === 'matatu' || ent.kind === 'saloon') &&
      dx < ent.width / 2 + 6 &&
      dy < ent.height / 2 + 18
    ) {
      runningRef.current = false;
      setIsRunning(false);
      setGameOverReason('Accident on ' + selectedCorridor.name);
      return;
    }
  });

  drawBajajBoxer150X(bikeCenterX, bikeY, tilt);
  frameRef.current = requestAnimationFrame(loop);
};

frameRef.current = requestAnimationFrame(loop);
return () => {
  if (frameRef.current) cancelAnimationFrame(frameRef.current);
};


}, [isRunning, selectedCorridor, bikeColor, showCallout]);

return (

{/* Compact Corridor Bar */}
<div
className={border rounded-xl px-3 py-2 flex items-center justify-between text-xs shadow-sm ${ isDarkMode ? 'bg-[#161619] border-zinc-800/80 text-zinc-200' : 'bg-white border-zinc-200 text-zinc-800' }}
>



{selectedCorridor.name}
{selectedCorridor.landmark}



    <button
      onClick={() => setIsImporterOpen(!isImporterOpen)}
      className={`px-2 py-1 rounded-lg border text-[10px] font-semibold flex items-center gap-1 flex-shrink-0 ${
        isDarkMode
          ? 'bg-zinc-900 border-zinc-700 text-zinc-200'
          : 'bg-zinc-100 border-zinc-300 text-zinc-800'
      }`}
    >
      <Navigation className="w-3 h-3 text-amber-400" />
      <span>Streets</span>
    </button>
  </div>

  {/* Importer Drawer */}
  {isImporterOpen && (
    <div
      className={`border rounded-xl p-3 space-y-2.5 text-xs shadow-md ${
        isDarkMode ? 'bg-[#141417] border-zinc-800 text-zinc-200' : 'bg-white border-zinc-300 text-zinc-800'
      }`}
    >
      <div className="font-bold flex items-center justify-between text-[11px]">
        <span>Select Nairobi Corridor</span>
        <button onClick={() => setIsImporterOpen(false)} className="text-[10px] text-zinc-500">Close</button>
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
            className={`px-2 py-1 rounded-lg border text-[10px] font-medium ${
              selectedCorridor.id === c.id
                ? 'bg-amber-400 text-zinc-950 border-amber-400 font-bold'
                : isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-zinc-100 border-zinc-200 text-zinc-700'
            }`}
          >
            {c.name.split(' (')[0]}
          </button>
        ))}
      </div>
    </div>
  )}

  {/* Telemetry Bar */}
  <div
    className={`border rounded-xl px-3 py-1.5 flex items-center justify-between text-xs ${
      isDarkMode ? 'bg-[#161619] border-zinc-800/80 text-zinc-200' : 'bg-white border-zinc-200 text-zinc-800'
    }`}
  >
    <div className="flex items-center space-x-2 text-[11px]">
      <span className="flex items-center gap-1 font-bold text-amber-400">
        <Gauge className="w-3 h-3" /> {speedKmh} km/h
      </span>
      <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200 text-[9px] font-mono">
        G{gear}
      </span>
    </div>
    <div className="font-bold text-emerald-400 text-[11px]">KES {fareKes}</div>
  </div>

  {/* Canvas Viewport (Fixed Height 280 for Mobile) */}
  <div
    className={`border rounded-2xl p-2 shadow-sm flex flex-col justify-center items-center relative ${
      isDarkMode ? 'bg-[#121215] border-zinc-800/80' : 'bg-white border-zinc-200'
    }`}
  >
    <div className="relative rounded-xl overflow-hidden border border-zinc-700/70">
      <canvas
        ref={canvasRef}
        width={320}
        height={280}
        className="block max-w-full h-auto touch-none"
      />

      {!isRunning && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-4 text-center space-y-2.5">
          <div className="w-9 h-9 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400">
            <Bike className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              {gameOverReason || 'Nduthi Kanairo — Boxer BM150X'}
            </h3>
            <p className="text-[10px] text-zinc-400 mt-0.5">
              {gameOverReason ? `Distance: ${distanceKm} km • KES ${fareKes}` : 'Tap Kick Start to roll Nairobi streets.'}
            </p>
          </div>

          <button
            onClick={startRide}
            className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-bold flex items-center gap-1 active:scale-95"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>{gameOverReason ? 'Try Again' : 'Kick Start Boxer'}</span>
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
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        onClick={() => changeSpeed(-12)}
        className={`py-2 rounded-xl border flex items-center justify-center text-[10px] font-bold active:scale-95 ${
          isDarkMode ? 'bg-zinc-900 border-zinc-800 text-rose-400' : 'bg-zinc-100 border-zinc-300 text-red-600'
        }`}
      >
        <ArrowDown className="w-3 h-3 mr-0.5" /> Brake
      </button>
      <button
        onClick={() => changeSpeed(10)}
        className={`py-2 rounded-xl border flex items-center justify-center text-[10px] font-bold active:scale-95 ${
          isDarkMode ? 'bg-zinc-900 border-zinc-800 text-emerald-400' : 'bg-zinc-100 border-zinc-300 text-emerald-700'
        }`}
      >
        <ArrowUp className="w-3 h-3 mr-0.5" /> Gas
      </button>
      <button
        onClick={() => shiftLane(1)}
        className={`py-2 rounded-xl border flex items-center justify-center active:scale-95 ${
          isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-200' : 'bg-zinc-100 border-zinc-300 text-zinc-800'
        }`}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  </div>
</div>


);
}