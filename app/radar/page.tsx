'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon, MapPin, Users } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { supabase } from '@/lib/supabase';

interface Hangout {
  id: string;
  author_initial: string;
  author_name: string;
  title: string;
  venue: string;
  max_limit: number;
  attendees: string[];
}

export default function RadarPage() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [hangouts, setHangouts] = useState<Hangout[]>([]);
  const [selectedHangout, setSelectedHangout] = useState<Hangout | null>(null);

  const mainBg = '#090909';
  const cardBg = '#181515';

  useEffect(() => {
    const saved = localStorage.getItem('pullup_theme');
    if (saved !== null) setIsDarkMode(saved === 'dark');

    // Fetch live hangouts from Supabase
    async function fetchRadarData() {
      const { data, error } = await supabase
        .from('hangouts')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) {
        setHangouts(data);
        if (data.length > 0) setSelectedHangout(data[0]);
      }
      if (error) console.error('Error fetching radar data:', error);
    }

    fetchRadarData();
  }, []);

  const toggleTheme = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    localStorage.setItem('pullup_theme', next ? 'dark' : 'light');
  };

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap" rel="stylesheet" />
      <main
        style={{ backgroundColor: isDarkMode ? mainBg : '#f4f4f5' }}
        className={`min-h-[100dvh] w-full sm:max-w-md mx-auto pb-24 relative sm:border-x transition-colors duration-200 flex flex-col ${
          isDarkMode ? 'border-zinc-900 text-zinc-300' : 'border-zinc-300 text-zinc-800'
        }`}
      >
        <header className={`sticky top-0 backdrop-blur-md border-b px-5 py-4 flex justify-between items-center z-40 ${isDarkMode ? 'bg-[#090909]/90 border-zinc-900' : 'bg-white/90 border-zinc-200'}`}>
          <div className="flex items-center space-x-3">
            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center font-normal text-sm ${isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-zinc-100 border-zinc-300 text-zinc-700'}`}>
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
              className={`p-2 rounded-xl border transition-colors ${isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-400' : 'bg-white border-zinc-300 text-zinc-600'}`}
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setIsOnline(!isOnline)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-normal transition-colors ${
                isOnline
                  ? isDarkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-zinc-800 text-white'
                  : isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-500' : 'bg-white border-zinc-300 text-zinc-500'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-zinc-300' : 'bg-zinc-600'}`} />
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </button>
          </div>
        </header>

        <div className="flex-1 p-4 space-y-4 flex flex-col">
          <div className="flex justify-between items-center text-[11px] uppercase tracking-wider font-normal text-zinc-500 px-1">
            <span>Live Radar Map</span>
            <span className="lowercase">{hangouts.length} live signals loaded</span>
          </div>

          {/* Map Container */}
          <div
            style={{ backgroundColor: isDarkMode ? cardBg : '#ffffff' }}
            className={`flex-1 min-h-[340px] border rounded-2xl overflow-hidden relative flex flex-col ${
              isDarkMode ? 'border-zinc-800/80 shadow-sm' : 'border-zinc-200 shadow-sm'
            }`}
          >
            <div className={`absolute top-4 left-4 z-10 backdrop-blur-md border px-3.5 py-1.5 rounded-xl shadow-sm text-xs font-normal flex items-center space-x-2 ${
              isDarkMode ? 'bg-zinc-900/90 border-zinc-700 text-zinc-200' : 'bg-white/90 border-zinc-200 text-zinc-800'
            }`}>
              <MapPin className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>Scanning Supabase Nodes</span>
            </div>

            <iframe
              title="Radar Map"
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d15955.264771691285!2d38.5544!3d-3.3986!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x181507b1a20d4f35%3A0x8e83348601633513!2sVoi!5e0!3m2!1sen!2ske!4v1700000000000!5m2!1sen!2ske"
              className={`w-full flex-1 border-0 ${isDarkMode ? 'invert hue-rotate-180 contrast-125 opacity-75' : 'opacity-90'}`}
              loading="lazy"
            />
          </div>

          {/* Live Supabase Hangouts Quick Inspector */}
          {hangouts.length > 0 && (
            <div
              style={{ backgroundColor: isDarkMode ? cardBg : '#ffffff' }}
              className={`p-3.5 rounded-2xl border space-y-2 ${
                isDarkMode ? 'border-zinc-800/80' : 'border-zinc-200 bg-white'
              }`}
            >
              <div className="flex justify-between items-center text-[11px] text-zinc-500 uppercase tracking-wider px-1">
                <span>Active Radar Signals</span>
                <span className="font-mono">{hangouts.length} Total</span>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {hangouts.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedHangout(item)}
                    className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      selectedHangout?.id === item.id
                        ? isDarkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-zinc-100 border-zinc-300 text-zinc-900'
                        : isDarkMode ? 'bg-zinc-950/50 border-zinc-900 text-zinc-400 hover:bg-zinc-900' : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[10px] text-zinc-300">
                        {item.author_initial}
                      </div>
                      <div>
                        <div className="text-xs font-normal">{item.title}</div>
                        <div className="text-[10px] text-zinc-500">{item.venue}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-amber-400">
                      {item.attendees?.length || 0}/{item.max_limit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <BottomNav isDarkMode={isDarkMode} />
      </main>
    </>
  );
}