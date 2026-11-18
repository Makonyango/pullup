'use client';

import BottomNav from '@/components/BottomNav';
import { Radio } from 'lucide-react';

export default function RadarPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 pb-24 max-w-md mx-auto relative border-x border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col items-center justify-center p-6 text-center">
      <div className="relative flex items-center justify-center w-32 h-32 mb-6">
        <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping"></div>
        <div className="absolute inset-4 rounded-full bg-indigo-500/30 animate-pulse"></div>
        <div className="relative z-10 bg-indigo-600 text-white p-4 rounded-full shadow-lg">
          <Radio className="w-8 h-8 animate-spin" />
        </div>
      </div>
      
      <h1 className="text-xl font-bold mb-2">Radar Scanner Active</h1>
      <p className="text-xs text-zinc-500 max-w-xs mb-6">
        Scanning for micro-meetups and spontaneous pings within your 5km geofence radius...
      </p>

      <BottomNav />
    </main>
  );
}