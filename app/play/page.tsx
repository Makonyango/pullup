'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sun,
  Moon,
  RotateCcw,
  Trophy,
  Crown,
  Users,
  Bot,
  Puzzle,
  Undo2,
  Car,
  Zap,
  ChevronLeft,
  ChevronRight,
  Bike,
} from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import NduthiSimulator from '../../components/NduthiSimulator';
import { supabase } from '@/lib/supabase';

// ==========================================
// CHESS TYPES & ENGINE
// ==========================================
type ActiveGame = 'chess' | 'drive' | 'nduthi';
type ChessMode = 'ai' | 'friend' | 'puzzle';
type DriveMode = 'solo' | 'ai' | 'friend';
type Color = 'w' | 'b';
type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

interface Piece {
  type: PieceType;
  color: Color;
  hasMoved?: boolean;
}

type Board = (Piece | null)[][];

interface Move {
  from: [number, number];
  to: [number, number];
  promotion?: PieceType;
}

const PIECE_SYMBOLS: Record<Color, Record<PieceType, string>> = {
  w: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};

const PIECE_VALUES: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

const createInitialBoard = (): Board => {
  const backRank: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: backRank[c], color: 'b', hasMoved: false };
    board[1][c] = { type: 'p', color: 'b', hasMoved: false };
    board[6][c] = { type: 'p', color: 'w', hasMoved: false };
    board[7][c] = { type: backRank[c], color: 'w', hasMoved: false };
  }
  return board;
};

const PUZZLES: { board: Board; hint: string }[] = [
  {
    hint: 'Back-rank strike with the Rook',
    board: (() => {
      const b: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
      b[0][6] = { type: 'k', color: 'b', hasMoved: true };
      b[1][5] = { type: 'p', color: 'b', hasMoved: false };
      b[1][6] = { type: 'p', color: 'b', hasMoved: false };
      b[1][7] = { type: 'p', color: 'b', hasMoved: false };
      b[4][0] = { type: 'r', color: 'w', hasMoved: true };
      b[7][6] = { type: 'k', color: 'w', hasMoved: true };
      return b;
    })(),
  },
  {
    hint: 'Queen & Bishop battery checkmate',
    board: (() => {
      const b: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
      b[0][7] = { type: 'k', color: 'b', hasMoved: true };
      b[1][7] = { type: 'p', color: 'b', hasMoved: false };
      b[3][5] = { type: 'q', color: 'w', hasMoved: true };
      b[4][4] = { type: 'b', color: 'w', hasMoved: true };
      b[7][4] = { type: 'k', color: 'w', hasMoved: true };
      return b;
    })(),
  },
  {
    hint: 'Smothered Knight checkmate',
    board: (() => {
      const b: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
      b[0][7] = { type: 'k', color: 'b', hasMoved: true };
      b[0][6] = { type: 'r', color: 'b', hasMoved: true };
      b[1][6] = { type: 'p', color: 'b', hasMoved: false };
      b[1][7] = { type: 'p', color: 'b', hasMoved: false };
      b[2][5] = { type: 'n', color: 'w', hasMoved: true };
      b[7][4] = { type: 'k', color: 'w', hasMoved: true };
      return b;
    })(),
  },
];

const cloneBoard = (board: Board): Board =>
  board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));

const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

function getPseudoMoves(board: Board, r: number, c: number, includeCastling = true): Move[] {
  const piece = board[r][c];
  if (!piece) return [];
  const moves: Move[] = [];
  const { type, color } = piece;
  const dir = color === 'w' ? -1 : 1;

  if (type === 'p') {
    const startRow = color === 'w' ? 6 : 1;
    const promoRow = color === 'w' ? 0 : 7;
    if (inBounds(r + dir, c) && !board[r + dir][c]) {
      moves.push({
        from: [r, c],
        to: [r + dir, c],
        promotion: r + dir === promoRow ? 'q' : undefined,
      });
      if (r === startRow && !board[r + 2 * dir][c]) {
        moves.push({ from: [r, c], to: [r + 2 * dir, c] });
      }
    }
    for (const dc of [-1, 1]) {
      const nr = r + dir;
      const nc = c + dc;
      if (inBounds(nr, nc) && board[nr][nc] && board[nr][nc]!.color !== color) {
        moves.push({
          from: [r, c],
          to: [nr, nc],
          promotion: nr === promoRow ? 'q' : undefined,
        });
      }
    }
  } else if (type === 'n') {
    const jumps = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1],
    ];
    for (const [dr, dc] of jumps) {
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(nr, nc) && board[nr][nc]?.color !== color) {
        moves.push({ from: [r, c], to: [nr, nc] });
      }
    }
  } else if (type === 'k') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (inBounds(nr, nc) && board[nr][nc]?.color !== color) {
          moves.push({ from: [r, c], to: [nr, nc] });
        }
      }
    }
    if (includeCastling && !piece.hasMoved && c === 4) {
      const kRook = board[r][7];
      if (kRook && kRook.type === 'r' && !kRook.hasMoved && !board[r][5] && !board[r][6]) {
        moves.push({ from: [r, c], to: [r, 6] });
      }
      const qRook = board[r][0];
      if (qRook && qRook.type === 'r' && !qRook.hasMoved && !board[r][1] && !board[r][2] && !board[r][3]) {
        moves.push({ from: [r, c], to: [r, 2] });
      }
    }
  } else {
    const dirs: [number, number][] = [];
    if (type === 'r' || type === 'q') dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    if (type === 'b' || type === 'q') dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    for (const [dr, dc] of dirs) {
      let nr = r + dr;
      let nc = c + dc;
      while (inBounds(nr, nc)) {
        const target = board[nr][nc];
        if (!target) {
          moves.push({ from: [r, c], to: [nr, nc] });
        } else {
          if (target.color !== color) moves.push({ from: [r, c], to: [nr, nc] });
          break;
        }
        nr += dr;
        nc += dc;
      }
    }
  }
  return moves;
}

function applyMoveToBoard(board: Board, move: Move): Board {
  const next = cloneBoard(board);
  const [fr, fc] = move.from;
  const [tr, tc] = move.to;
  const piece = next[fr][fc]!;
  if (piece.type === 'k' && Math.abs(tc - fc) === 2) {
    if (tc === 6) {
      next[tr][5] = { ...next[tr][7]!, hasMoved: true };
      next[tr][7] = null;
    } else if (tc === 2) {
      next[tr][3] = { ...next[tr][0]!, hasMoved: true };
      next[tr][0] = null;
    }
  }
  next[tr][tc] = {
    type: move.promotion || piece.type,
    color: piece.color,
    hasMoved: true,
  };
  next[fr][fc] = null;
  return next;
}

function isKingInCheck(board: Board, color: Color): boolean {
  let kingPos: [number, number] | null = null;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]?.type === 'k' && board[r][c]?.color === color) {
        kingPos = [r, c];
        break;
      }
    }
  }
  if (!kingPos) return true;
  const enemy: Color = color === 'w' ? 'b' : 'w';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]?.color === enemy) {
        const enemyMoves = getPseudoMoves(board, r, c, false);
        if (enemyMoves.some((m) => m.to[0] === kingPos![0] && m.to[1] === kingPos![1])) {
          return true;
        }
      }
    }
  }
  return false;
}

function getAllLegalMoves(board: Board, color: Color): Move[] {
  const legal: Move[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]?.color === color) {
        const pseudo = getPseudoMoves(board, r, c, true);
        for (const m of pseudo) {
          if (board[r][c]?.type === 'k' && Math.abs(m.to[1] - c) === 2) {
            if (isKingInCheck(board, color)) continue;
            const midCol = (c + m.to[1]) / 2;
            const midBoard = applyMoveToBoard(board, { from: [r, c], to: [r, midCol] });
            if (isKingInCheck(midBoard, color)) continue;
          }
          const simulated = applyMoveToBoard(board, m);
          if (!isKingInCheck(simulated, color)) legal.push(m);
        }
      }
    }
  }
  return legal;
}

// ==========================================
// CAR DRIVING CHALLENGE COMPONENT
// ==========================================
interface Obstacle {
  id: number;
  lane: number;
  y: number;
  type: 'traffic' | 'nitro';
  color: string;
}

function CarChallenge({ isDarkMode }: { isDarkMode: boolean }) {
  const [driveMode, setDriveMode] = useState<DriveMode>('solo');
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameOverText, setGameOverText] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const p1LaneRef = useRef(1);
  const p1VisualXRef = useRef(1);
  const p2LaneRef = useRef(2);
  const p2VisualXRef = useRef(2);
  const p2DistanceRef = useRef(0);
  const p1DistanceRef = useRef(0);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const roadOffsetRef = useRef(0);
  const speedRef = useRef(4.5);
  const frameIdRef = useRef<number | null>(null);
  const spawnTimerRef = useRef(0);
  const activeRef = useRef(false);

  const cardBg = '#181515';

  useEffect(() => {
    const savedBest = localStorage.getItem('pullup_drive_best');
    if (savedBest) setBestScore(Number(savedBest));
  }, []);

  const startRace = useCallback((selectedMode: DriveMode) => {
    setDriveMode(selectedMode);
    setGameOverText(null);
    setScore(0);
    p1LaneRef.current = 1;
    p1VisualXRef.current = 1;
    p2LaneRef.current = 2;
    p2VisualXRef.current = 2;
    p1DistanceRef.current = 0;
    p2DistanceRef.current = 0;
    obstaclesRef.current = [];
    speedRef.current = 4.5;
    spawnTimerRef.current = 0;
    activeRef.current = true;
    setIsPlaying(true);
  }, []);

  const steerPlayer = (player: 1 | 2, delta: -1 | 1) => {
    if (!activeRef.current) return;
    if (player === 1) {
      p1LaneRef.current = Math.max(0, Math.min(3, p1LaneRef.current + delta));
    } else if (driveMode === 'friend') {
      p2LaneRef.current = Math.max(0, Math.min(3, p2LaneRef.current + delta));
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!activeRef.current) return;
      if (e.key === 'ArrowLeft' || e.key === 'a') steerPlayer(1, -1);
      if (e.key === 'ArrowRight' || e.key === 'd') steerPlayer(1, 1);
      if (driveMode === 'friend') {
        if (e.key === 'j') steerPlayer(2, -1);
        if (e.key === 'l') steerPlayer(2, 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const syncDriveScoreToSupabase = async (finalMeters: number) => {
    const { error } = await supabase.from('hangouts').insert([
      {
        author_name: 'You',
        author_initial: 'Y',
        title: `🎮 Car Rush High Score`,
        description: `Achieved distance: ${finalMeters}m on Kanairo Expressway`,
        venue: 'Kanairo Arcade Node',
        max_limit: 10,
        attendees: ['You'],
      },
    ]);
    if (!error) {
      alert(`Successfully synced ${finalMeters}m score to Supabase!`);
    } else {
      console.error('Error syncing score:', error);
    }
  };

  useEffect(() => {
    if (!isPlaying) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 320;
    const H = 370;
    const laneWidth = W / 4;
    const carW = 34;
    const carH = 56;
    const playerY = H - 78;

    const drawCar = (xCenter: number, yTop: number, bodyColor: string, accentColor: string) => {
      const x = xCenter - carW / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.roundRect(x + 3, yTop + 4, carW, carH, 9);
      ctx.fill();

      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.roundRect(x, yTop, carW, carH, 9);
      ctx.fill();

      ctx.fillStyle = '#18181b';
      ctx.beginPath();
      ctx.roundRect(x + 5, yTop + 12, carW - 10, 14, 4);
      ctx.fill();

      ctx.beginPath();
      ctx.roundRect(x + 6, yTop + 36, carW - 12, 10, 3);
      ctx.fill();

      ctx.fillStyle = accentColor;
      ctx.fillRect(x + 5, yTop + 1, 6, 3);
      ctx.fillRect(x + carW - 11, yTop + 1, 6, 3);
    };

    const loop = () => {
      if (!activeRef.current) return;

      speedRef.current = Math.min(10.5, speedRef.current + 0.0018);
      roadOffsetRef.current = (roadOffsetRef.current + speedRef.current) % 40;
      p1DistanceRef.current += speedRef.current * 0.25;

      const currentMeters = Math.floor(p1DistanceRef.current);
      setScore(currentMeters);

      spawnTimerRef.current += speedRef.current;
      if (spawnTimerRef.current > 95) {
        spawnTimerRef.current = 0;
        const lane = Math.floor(Math.random() * 4);
        const isNitro = Math.random() < 0.22;
        const trafficColors = ['#71717a', '#52525b', '#a1a1aa', '#3f3f46'];
        obstaclesRef.current.push({
          id: Math.random(),
          lane,
          y: -65,
          type: isNitro ? 'nitro' : 'traffic',
          color: trafficColors[Math.floor(Math.random() * trafficColors.length)],
        });
      }

      obstaclesRef.current.forEach((obs) => {
        obs.y += obs.type === 'traffic' ? speedRef.current * 0.72 : speedRef.current;
      });
      obstaclesRef.current = obstaclesRef.current.filter((obs) => obs.y < H + 80);

      if (driveMode === 'ai') {
        p2DistanceRef.current += speedRef.current * 0.245;
        const dangerAhead = obstaclesRef.current.find(
          (o) =>
            o.type === 'traffic' &&
            o.lane === p2LaneRef.current &&
            o.y > playerY - 140 &&
            o.y < playerY + 40
        );
        if (dangerAhead) {
          const safeLanes = [0, 1, 2, 3].filter(
            (l) =>
              !obstaclesRef.current.some(
                (o) =>
                  o.type === 'traffic' &&
                  o.lane === l &&
                  o.y > playerY - 130 &&
                  o.y < playerY + 50
              )
          );
          if (safeLanes.length > 0) {
            p2LaneRef.current = safeLanes[0];
          }
        }
      }

      p1VisualXRef.current += (p1LaneRef.current - p1VisualXRef.current) * 0.25;
      p2VisualXRef.current += (p2LaneRef.current - p2VisualXRef.current) * 0.25;

      ctx.fillStyle = isDarkMode ? '#121010' : '#27272a';
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = isDarkMode ? '#09090b' : '#18181b';
      ctx.fillRect(0, 0, 8, H);
      ctx.fillRect(W - 8, 0, 8, H);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 2;
      ctx.setLineDash([20, 20]);
      ctx.lineDashOffset = -roadOffsetRef.current;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(i * laneWidth, 0);
        ctx.lineTo(i * laneWidth, H);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      const p1CenterX = p1VisualXRef.current * laneWidth + laneWidth / 2;
      const p2CenterX = p2VisualXRef.current * laneWidth + laneWidth / 2;

      for (let i = obstaclesRef.current.length - 1; i >= 0; i--) {
        const obs = obstaclesRef.current[i];
        const obsCenterX = obs.lane * laneWidth + laneWidth / 2;

        if (obs.type === 'nitro') {
          ctx.fillStyle = '#d4d4d8';
          ctx.beginPath();
          ctx.arc(obsCenterX, obs.y + 20, 10, 0, Math.PI * 2);
          ctx.fill();

          if (
            Math.abs(obsCenterX - p1CenterX) < 26 &&
            Math.abs(obs.y + 20 - (playerY + carH / 2)) < 32
          ) {
            p1DistanceRef.current += 50;
            obstaclesRef.current.splice(i, 1);
            continue;
          }
        } else {
          drawCar(obsCenterX, obs.y, obs.color, '#a1a1aa');

          if (
            Math.abs(obsCenterX - p1CenterX) < carW - 6 &&
            Math.abs(obs.y - playerY) < carH - 8
          ) {
            activeRef.current = false;
            setIsPlaying(false);
            const finalMeters = Math.floor(p1DistanceRef.current);
            setBestScore((prev) => {
              const nextBest = Math.max(prev, finalMeters);
              localStorage.setItem('pullup_drive_best', String(nextBest));
              return nextBest;
            });
            setGameOverText(
              driveMode === 'friend'
                ? 'P2 Wins! P1 Crashed'
                : driveMode === 'ai'
                ? 'AI Rival Wins! You Crashed'
                : `Crashed at ${finalMeters}m!`
            );
            return;
          }

          if (
            driveMode === 'friend' &&
            Math.abs(obsCenterX - p2CenterX) < carW - 6 &&
            Math.abs(obs.y - playerY) < carH - 8
          ) {
            activeRef.current = false;
            setIsPlaying(false);
            setGameOverText('P1 Wins! P2 Crashed');
            return;
          }
        }
      }

      drawCar(p1CenterX, playerY, '#d4d4d8', '#ffffff');

      if (driveMode === 'ai' || driveMode === 'friend') {
        const rivalY =
          driveMode === 'friend'
            ? playerY
            : playerY - (p2DistanceRef.current - p1DistanceRef.current) * 1.5;
        drawCar(p2CenterX, rivalY, '#71717a', '#e4e4e7');

        if (driveMode === 'ai' && p1DistanceRef.current >= 1000) {
          activeRef.current = false;
          setIsPlaying(false);
          setGameOverText('You Beat the AI to 1,000m!');
          return;
        }
        if (driveMode === 'ai' && p2DistanceRef.current >= 1000) {
          activeRef.current = false;
          setIsPlaying(false);
          setGameOverText('AI Rival Reached 1,000m First!');
          return;
        }
      }

      frameIdRef.current = requestAnimationFrame(loop);
    };

    frameIdRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
    };
  }, [isPlaying, driveMode, isDarkMode]);

  return (
    <div className="flex-1 flex flex-col space-y-3">
      {/* Drive Mode Selector */}
      <div
        style={{ backgroundColor: isDarkMode ? cardBg : '#ffffff' }}
        className={`grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl border ${
          isDarkMode ? 'border-zinc-800/80' : 'border-zinc-200 shadow-sm'
        }`}
      >
        {[
          { id: 'solo', label: 'Solo Run', icon: Zap },
          { id: 'ai', label: 'Vs AI Race', icon: Bot },
          { id: 'friend', label: '2 Players', icon: Users },
        ].map((item) => {
          const Icon = item.icon;
          const active = driveMode === item.id;
          return (
            <button
              key={item.id}
              onClick={() => startRace(item.id as DriveMode)}
              className={`flex items-center justify-center space-x-1.5 py-2 rounded-xl text-xs font-normal transition-all ${
                active
                  ? isDarkMode
                    ? 'bg-zinc-800 text-zinc-100 border border-zinc-700/60'
                    : 'bg-zinc-900 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-400'
              }`}
            >
              <Icon className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Telemetry Bar */}
      <div
        style={{ backgroundColor: isDarkMode ? cardBg : '#ffffff' }}
        className={`border rounded-2xl px-4 py-2.5 flex items-center justify-between text-xs shadow-sm ${
          isDarkMode ? 'border-zinc-800/80 text-zinc-300' : 'border-zinc-200 text-zinc-800'
        }`}
      >
        <div className="flex items-center space-x-2 font-normal">
          <Car className="w-4 h-4 text-zinc-400 stroke-[1.5]" />
          <span>{driveMode === 'ai' ? `${score}m / 1000m` : `Distance: ${score}m`}</span>
        </div>
        <span className="text-[11px] text-zinc-500 font-normal">Best: {bestScore}m</span>
      </div>

      {/* Highway Canvas Arena */}
      <div
        style={{ backgroundColor: isDarkMode ? cardBg : '#ffffff' }}
        className={`border rounded-2xl p-3 shadow-sm flex-1 flex flex-col justify-center items-center relative ${
          isDarkMode ? 'border-zinc-800/80' : 'border-zinc-200'
        }`}
      >
        <div className="relative rounded-xl overflow-hidden border border-zinc-700/50 shadow-inner">
          <canvas
            ref={canvasRef}
            width={320}
            height={370}
            className="block max-w-full h-auto touch-none"
          />

          {isPlaying && driveMode !== 'friend' && (
            <div className="absolute inset-0 grid grid-cols-2">
              <button
                type="button"
                aria-label="Steer Left"
                onClick={() => steerPlayer(1, -1)}
                className="w-full h-full active:bg-white/5 focus:outline-none"
              />
              <button
                type="button"
                aria-label="Steer Right"
                onClick={() => steerPlayer(1, 1)}
                className="w-full h-full active:bg-white/5 focus:outline-none"
              />
            </div>
          )}

          {!isPlaying && (
            <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300">
                <Trophy className="w-5 h-5 stroke-[1.5]" />
              </div>
              <div>
                <h3 className="text-sm font-normal text-zinc-200">
                  {gameOverText || 'Night Drive Challenge'}
                </h3>
                <p className="text-xs text-zinc-500 mt-1 font-normal">
                  {driveMode === 'friend'
                    ? 'Use buttons below to steer P1 & P2'
                    : 'Tap sides or use buttons to dodge traffic'}
                </p>
              </div>
              <div className="flex gap-2 w-full">
                {gameOverText && (
                  <button
                    onClick={() => syncDriveScoreToSupabase(score)}
                    className="flex-1 py-2 rounded-xl border border-zinc-700 text-zinc-200 text-xs font-normal hover:bg-zinc-900 transition-colors"
                  >
                    Sync to Supabase
                  </button>
                )}
                <button
                  onClick={() => startRace(driveMode)}
                  className="flex-1 py-2 rounded-xl bg-zinc-200 hover:bg-white text-zinc-950 text-xs font-normal shadow transition-all active:scale-95"
                >
                  {gameOverText ? 'Race Again' : 'Start Engine'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Dedicated Tactile Steering Buttons */}
        {driveMode === 'friend' ? (
          <div className="grid grid-cols-2 gap-3 w-full max-w-[320px] mt-3">
            <div className="flex gap-1.5">
              <button
                onClick={() => steerPlayer(1, -1)}
                className="flex-1 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center justify-center active:scale-95 text-xs font-normal"
              >
                <ChevronLeft className="w-4 h-4" /> P1 Left
              </button>
              <button
                onClick={() => steerPlayer(1, 1)}
                className="flex-1 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center justify-center active:scale-95 text-xs font-normal"
              >
                P1 Right <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => steerPlayer(2, -1)}
                className="flex-1 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center justify-center active:scale-95 text-xs font-normal"
              >
                <ChevronLeft className="w-4 h-4" /> P2 Left
              </button>
              <button
                onClick={() => steerPlayer(2, 1)}
                className="flex-1 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center justify-center active:scale-95 text-xs font-normal"
              >
                P2 Right <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 w-full max-w-[320px] mt-3">
            <button
              onClick={() => steerPlayer(1, -1)}
              className={`py-2 rounded-xl border flex items-center justify-center gap-1 text-xs font-normal active:scale-95 ${
                isDarkMode
                  ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                  : 'bg-zinc-100 border-zinc-200 text-zinc-800'
              }`}
            >
              <ChevronLeft className="w-4 h-4" /> Left
            </button>
            <button
              onClick={() => steerPlayer(1, 1)}
              className={`py-2 rounded-xl border flex items-center justify-center gap-1 text-xs font-normal active:scale-95 ${
                isDarkMode
                  ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                  : 'bg-zinc-100 border-zinc-200 text-zinc-800'
              }`}
            >
              Right <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// MAIN PLAY PAGE
// ==========================================
export default function PlayPage() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [activeGame, setActiveGame] = useState<ActiveGame>('chess');

  const [mode, setMode] = useState<ChessMode>('ai');
  const [board, setBoard] = useState<Board>(createInitialBoard);
  const [history, setHistory] = useState<Board[]>([]);
  const [turn, setTurn] = useState<Color>('w');
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string>('White to move');
  const [gameOver, setGameOver] = useState<'w' | 'b' | 'draw' | null>(null);

  const mainBg = '#090909';
  const cardBg = '#181515';

  useEffect(() => {
    const saved = localStorage.getItem('pullup_theme');
    if (saved !== null) setIsDarkMode(saved === 'dark');
  }, []);

  const toggleTheme = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    localStorage.setItem('pullup_theme', next ? 'dark' : 'light');
  };

  const syncChessScoreToSupabase = async (gameTitle: string) => {
    const { error } = await supabase.from('hangouts').insert([
      {
        author_name: 'You',
        author_initial: 'Y',
        title: `🎮 ${gameTitle}`,
        description: `Successfully completed chess match/puzzle challenge`,
        venue: 'Kanairo Arcade Node',
        max_limit: 10,
        attendees: ['You'],
      },
    ]);
    if (!error) {
      alert(`Successfully synced match result to Supabase!`);
    } else {
      console.error('Error syncing score:', error);
    }
  };

  const resetGame = useCallback((selectedMode: ChessMode, nextPuzzleIdx = 0) => {
    setMode(selectedMode);
    setSelected(null);
    setLastMove(null);
    setHistory([]);
    setGameOver(null);
    setTurn('w');

    if (selectedMode === 'puzzle') {
      const idx = nextPuzzleIdx % PUZZLES.length;
      setPuzzleIndex(idx);
      setBoard(cloneBoard(PUZZLES[idx].board));
      setStatusMessage(`Mate in 1: ${PUZZLES[idx].hint}`);
    } else {
      setBoard(createInitialBoard());
      setStatusMessage('White to move');
    }
  }, []);

  const evaluateGameState = useCallback(
    (nextBoard: Board, nextColor: Color, currentMode: ChessMode) => {
      const legalMoves = getAllLegalMoves(nextBoard, nextColor);
      const inCheck = isKingInCheck(nextBoard, nextColor);

      if (legalMoves.length === 0) {
        if (inCheck) {
          const winnerColor = nextColor === 'w' ? 'b' : 'w';
          setGameOver(winnerColor);
          setStatusMessage(
            currentMode === 'puzzle'
              ? 'Puzzle Solved! Checkmate!'
              : `Checkmate! ${winnerColor === 'w' ? 'White' : 'Black'} wins`
          );
        } else {
          setGameOver('draw');
          setStatusMessage('Stalemate — Draw!');
        }
        return true;
      }

      if (currentMode === 'puzzle' && nextColor === 'b') {
        setStatusMessage('Not checkmate! Undo or try again.');
        return false;
      }

      if (inCheck) {
        setStatusMessage(`${nextColor === 'w' ? 'White' : 'Black'} is in Check!`);
      } else {
        setStatusMessage(`${nextColor === 'w' ? 'White' : 'Black'} to move`);
      }
      return false;
    },
    []
  );

  const makeMove = useCallback(
    (move: Move) => {
      setHistory((prev) => [...prev, cloneBoard(board)]);
      const nextBoard = applyMoveToBoard(board, move);
      const nextTurn: Color = turn === 'w' ? 'b' : 'w';

      setBoard(nextBoard);
      setLastMove(move);
      setSelected(null);
      setTurn(nextTurn);
      evaluateGameState(nextBoard, nextTurn, mode);
    },
    [board, turn, mode, evaluateGameState]
  );

  useEffect(() => {
    if (activeGame !== 'chess' || mode !== 'ai' || turn !== 'b' || gameOver) return;

    const timer = setTimeout(() => {
      const legalMoves = getAllLegalMoves(board, 'b');
      if (legalMoves.length === 0) return;

      let bestScore = -Infinity;
      let bestMoves: Move[] = [];

      for (const move of legalMoves) {
        const simBoard = applyMoveToBoard(board, move);
        let score = 0;

        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const p = simBoard[r][c];
            if (!p) continue;
            const centerBonus = (3.5 - Math.abs(3.5 - r) + (3.5 - Math.abs(3.5 - c))) * 4;
            const val = PIECE_VALUES[p.type] + centerBonus;
            score += p.color === 'b' ? val : -val;
          }
        }

        const oppMoves = getAllLegalMoves(simBoard, 'w');
        if (oppMoves.length === 0 && isKingInCheck(simBoard, 'w')) {
          score += 99999;
        } else if (isKingInCheck(simBoard, 'w')) {
          score += 45;
        }

        score += Math.random() * 12;

        if (score > bestScore) {
          bestScore = score;
          bestMoves = [move];
        } else if (Math.abs(score - bestScore) < 5) {
          bestMoves.push(move);
        }
      }

      const chosen = bestMoves[Math.floor(Math.random() * bestMoves.length)];
      if (chosen) makeMove(chosen);
    }, 450);

    return () => clearTimeout(timer);
  }, [activeGame, mode, turn, gameOver, board, makeMove]);

  const handleSquareClick = (r: number, c: number) => {
    if (gameOver) return;
    if (mode === 'ai' && turn === 'b') return;

    const clickedPiece = board[r][c];

    if (selected) {
      const legalFromSelected = getAllLegalMoves(board, turn).filter(
        (m) => m.from[0] === selected[0] && m.from[1] === selected[1]
      );
      const chosenMove = legalFromSelected.find((m) => m.to[0] === r && m.to[1] === c);

      if (chosenMove) {
        makeMove(chosenMove);
        return;
      }
    }

    if (clickedPiece && clickedPiece.color === turn) {
      setSelected([r, c]);
    } else {
      setSelected(null);
    }
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const stepsBack = mode === 'ai' && turn === 'w' && history.length >= 2 ? 2 : 1;
    const targetBoard = history[history.length - stepsBack];
    if (!targetBoard) return;

    setBoard(targetBoard);
    setHistory((prev) => prev.slice(0, prev.length - stepsBack));
    setTurn(stepsBack === 2 ? 'w' : turn === 'w' ? 'b' : 'w');
    setSelected(null);
    setLastMove(null);
    setGameOver(null);
    setStatusMessage('Move undone');
  };

  const legalDestinations = selected
    ? getAllLegalMoves(board, turn).filter(
        (m) => m.from[0] === selected[0] && m.from[1] === selected[1]
      )
    : [];

  const inCheckNow = !gameOver && isKingInCheck(board, turn);

  if (activeGame === 'nduthi') {
    return <NduthiSimulator onExit={() => setActiveGame('chess')} />;
  }

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap" rel="stylesheet" />
      <main
        style={{ backgroundColor: isDarkMode ? mainBg : '#f4f4f5' }}
        className={`min-h-[100dvh] w-full sm:max-w-md mx-auto pb-24 relative sm:border-x transition-colors duration-200 flex flex-col ${
          isDarkMode ? 'border-zinc-900 text-zinc-300' : 'border-zinc-300 text-zinc-800'
        }`}
      >
        {/* Header */}
        <header
          className={`sticky top-0 backdrop-blur-md border-b px-5 py-4 flex justify-between items-center z-40 ${
            isDarkMode ? 'bg-[#090909]/90 border-zinc-900' : 'bg-white/90 border-zinc-200'
          }`}
        >
          <div className="flex items-center space-x-3">
            <div
              className={`w-9 h-9 rounded-xl border flex items-center justify-center font-normal text-sm ${
                isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-zinc-100 border-zinc-300 text-zinc-700'
              }`}
            >
              P
            </div>
            <span
              style={{ fontFamily: "'Great Vibes', cursive", fontSize: '32px' }}
              className={`font-normal tracking-wide pt-1 opacity-90 ${isDarkMode ? 'text-zinc-200' : 'text-zinc-800'}`}
            >
              PullUp
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-xl border transition-colors ${
                isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-400' : 'bg-white border-zinc-300 text-zinc-600'
              }`}
              aria-label="Toggle Theme"
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {activeGame === 'chess' && (
              <>
                <button
                  onClick={handleUndo}
                  disabled={history.length === 0}
                  className={`p-2 rounded-xl border transition-colors disabled:opacity-40 ${
                    isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-400' : 'bg-white border-zinc-300 text-zinc-600'
                  }`}
                  aria-label="Undo Move"
                >
                  <Undo2 className="w-4 h-4" />
                </button>

                <button
                  onClick={() => resetGame(mode, puzzleIndex)}
                  className={`p-2 rounded-xl border transition-colors active:scale-95 ${
                    isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-400' : 'bg-white border-zinc-300 text-zinc-600'
                  }`}
                  aria-label="Reset Board"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 px-4 pt-4 space-y-3 flex flex-col">
          {/* Top 3-Game Arcade Switcher */}
          <div
            style={{ backgroundColor: isDarkMode ? cardBg : '#ffffff' }}
            className={`grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl border ${
              isDarkMode ? 'border-zinc-800/80' : 'border-zinc-200 shadow-sm'
            }`}
          >
            <button
              onClick={() => setActiveGame('chess')}
              className={`flex items-center justify-center space-x-1.5 py-2 rounded-xl text-xs font-normal transition-all ${
                activeGame === 'chess'
                  ? isDarkMode
                    ? 'bg-zinc-800 text-zinc-100 border border-zinc-700/60'
                    : 'bg-zinc-900 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-400'
              }`}
            >
              <Crown className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>Chess</span>
            </button>

            <button
              onClick={() => setActiveGame('drive')}
              className={`flex items-center justify-center space-x-1.5 py-2 rounded-xl text-xs font-normal transition-all ${
                activeGame === 'drive'
                  ? isDarkMode
                    ? 'bg-zinc-800 text-zinc-100 border border-zinc-700/60'
                    : 'bg-zinc-900 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-400'
              }`}
            >
              <Car className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>Car Rush</span>
            </button>

            <button
              onClick={() => setActiveGame('nduthi')}
              className="flex items-center justify-center space-x-1.5 py-2 rounded-xl text-xs font-normal transition-all text-zinc-400 hover:text-zinc-200"
            >
              <Bike className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>Nduthi 3D</span>
            </button>
          </div>

          {/* Active Game View */}
          {activeGame === 'drive' ? (
            <CarChallenge isDarkMode={isDarkMode} />
          ) : (
            <>
              {/* Chess Mode Selector Pills */}
              <div
                style={{ backgroundColor: isDarkMode ? cardBg : '#ffffff' }}
                className={`grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl border ${
                  isDarkMode ? 'border-zinc-800/80' : 'border-zinc-200 shadow-sm'
                }`}
              >
                {[
                  { id: 'ai', label: 'Vs AI', icon: Bot },
                  { id: 'friend', label: '2 Players', icon: Users },
                  { id: 'puzzle', label: 'Mate Puzzle', icon: Puzzle },
                ].map((item) => {
                  const Icon = item.icon;
                  const active = mode === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => resetGame(item.id as ChessMode, 0)}
                      className={`flex items-center justify-center space-x-1.5 py-2 rounded-xl text-xs font-normal transition-all ${
                        active
                          ? isDarkMode
                            ? 'bg-zinc-800 text-zinc-100 border border-zinc-700/60'
                            : 'bg-zinc-900 text-white shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-400'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 stroke-[1.5]" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Status Bar */}
              <div
                style={{ backgroundColor: isDarkMode ? cardBg : '#ffffff' }}
                className={`border rounded-2xl px-4 py-2.5 flex items-center justify-between text-xs shadow-sm ${
                  inCheckNow
                    ? 'border-zinc-700 text-zinc-300 bg-zinc-900/80'
                    : isDarkMode
                    ? 'border-zinc-800/80 text-zinc-300'
                    : 'border-zinc-200 text-zinc-800'
                }`}
              >
                <div className="flex items-center space-x-2 font-normal">
                  <Crown className="w-4 h-4 flex-shrink-0 text-zinc-400 stroke-[1.5]" />
                  <span>{statusMessage}</span>
                </div>
                <span className="text-[11px] text-zinc-500 font-normal">
                  {mode === 'ai'
                    ? turn === 'b' && !gameOver
                      ? 'AI thinking...'
                      : 'You: Yellow'
                    : mode === 'puzzle'
                    ? `#${puzzleIndex + 1}/${PUZZLES.length}`
                    : 'Pass & Play'}
                </span>
              </div>

              {/* Chessboard Container */}
              <div
                style={{ backgroundColor: isDarkMode ? cardBg : '#ffffff' }}
                className={`border rounded-2xl p-3 shadow-sm flex-1 flex flex-col justify-center items-center relative ${
                  isDarkMode ? 'border-zinc-800/80' : 'border-zinc-200'
                }`}
              >
                <div
                  className={`grid grid-cols-8 w-full aspect-square max-w-[340px] rounded-xl overflow-hidden border shadow-inner ${
                    isDarkMode ? 'border-zinc-800' : 'border-zinc-300'
                  }`}
                >
                  {board.map((row, rIdx) =>
                    row.map((piece, cIdx) => {
                      const isLightSq = (rIdx + cIdx) % 2 === 0;
                      const isSelected = selected?.[0] === rIdx && selected?.[1] === cIdx;
                      const isTarget = legalDestinations.some(
                        (m) => m.to[0] === rIdx && m.to[1] === cIdx
                      );
                      const isLastMoveSq =
                        (lastMove?.from[0] === rIdx && lastMove?.from[1] === cIdx) ||
                        (lastMove?.to[0] === rIdx && lastMove?.to[1] === cIdx);
                      const isCheckedKing =
                        inCheckNow && piece?.type === 'k' && piece?.color === turn;

                      let sqBg = isLightSq
                        ? isDarkMode
                          ? 'bg-zinc-800/60'
                          : 'bg-zinc-200'
                        : isDarkMode
                        ? 'bg-zinc-950/80'
                        : 'bg-zinc-500';

                      if (isSelected) {
                        sqBg = isDarkMode ? 'bg-zinc-700' : 'bg-zinc-400';
                      } else if (isCheckedKing) {
                        sqBg = 'bg-zinc-800 border border-zinc-600';
                      } else if (isLastMoveSq) {
                        sqBg = isLightSq ? 'bg-zinc-700/50' : 'bg-zinc-900';
                      }

                      return (
                        <button
                          key={`${rIdx}-${cIdx}`}
                          onClick={() => handleSquareClick(rIdx, cIdx)}
                          className={`aspect-square flex items-center justify-center relative select-none transition-colors ${sqBg}`}
                        >
                          {isTarget && !piece && (
                            <span className="w-2.5 h-2.5 rounded-full bg-zinc-400/60 pointer-events-none" />
                          )}
                          {isTarget && piece && (
                            <span className="absolute inset-0.5 rounded-lg border-2 border-zinc-400/70 pointer-events-none" />
                          )}

                          {piece && (
                            <span
                              className={`text-[26px] sm:text-[30px] leading-none transition-transform select-none ${
                                piece.color === 'w' ? 'text-amber-400 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]' : 'text-rose-500 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]'
                              }`}
                            >
                              {PIECE_SYMBOLS[piece.color][piece.type]}
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>

                {gameOver && (
                  <div className="absolute inset-3 rounded-xl bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-3 z-20">
                    <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300">
                      <Trophy className="w-5 h-5 stroke-[1.5]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-normal text-zinc-200">{statusMessage}</h3>
                      <p className="text-xs text-zinc-500 mt-1 font-normal">
                        {mode === 'puzzle' ? 'Ready for the next tactical puzzle?' : 'Want a rematch?'}
                      </p>
                    </div>
                    <div className="flex gap-2 w-full">
                      <button
                        onClick={() => syncChessScoreToSupabase('Tactical Chess Match')}
                        className="flex-1 py-2 rounded-xl border border-zinc-700 text-zinc-200 text-xs font-normal hover:bg-zinc-900 transition-colors"
                      >
                        Sync to Supabase
                      </button>
                      <button
                        onClick={() =>
                          resetGame(mode, mode === 'puzzle' ? puzzleIndex + 1 : 0)
                        }
                        className="flex-1 py-2 rounded-xl bg-zinc-200 hover:bg-white text-zinc-950 text-xs font-normal shadow transition-all active:scale-95"
                      >
                        {mode === 'puzzle' ? 'Next Puzzle' : 'Play Again'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Bottom Navigation */}
        <BottomNav isDarkMode={isDarkMode} />
      </main>
    </>
  );
}