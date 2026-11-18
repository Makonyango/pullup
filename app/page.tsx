'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon, MapPin, Plus, Navigation, Users, Map as MapIcon, X, Check } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { supabase } from '@/lib/supabase';

interface Hangout {
  id: string;
  author_initial: string;
  author_name: string;
  timeAgo?: string;
  title: string;
  description: string;
  venue: string;
  max_limit: number;
  attendees: string[];
  isUserPulledUp?: boolean;
}

export default function ExplorePage() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [locating, setLocating] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>({
    lat: -3.3931, // Voi coordinates
    lng: 38.5563,
  });

  const mainBg = '#090909';
  const customHangoutCardBg = '#181515';

  const [hangouts, setHangouts] = useState<Hangout[]>([]);

  const [title, setTitle] = useState('');
  const [venue, setVenue] = useState('');
  const [desc, setDesc] = useState('');
  const [limit, setLimit] = useState(4);

  // Fetch hangouts from Supabase on load
  useEffect(() => {
    const saved = localStorage.getItem('pullup_theme');
    if (saved !== null) setIsDarkMode(saved === 'dark');

    async function fetchHangouts() {
      const { data, error } = await supabase
        .from('hangouts')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) {
        setHangouts(
          data.map((item) => ({
            ...item,
            timeAgo: 'Just now',
            isUserPulledUp: item.attendees?.includes('You'),
          }))
        );
      }
      if (error) console.error('Error fetching hangouts:', error);
    }

    fetchHangouts();
  }, []);

  const toggleTheme = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    localStorage.setItem('pullup_theme', next ? 'dark' : 'light');
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setSelectedCoords({ lat, lng });

        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
          const data = await res.json();
          const placeName = data.address?.suburb || data.address?.neighbourhood || data.address?.city || `Voi Pin (${lat.toFixed(2)}, ${lng.toFixed(2)})`;
          setVenue(placeName);
        } catch (err) {
          setVenue(`GPS Pin (${lat.toFixed(2)}, ${lng.toFixed(2)})`);
        } finally {
          setLocating(false);
        }
      },
      (error) => {
        console.error('Error getting location:', error);
        alert('Unable to retrieve your location accurately. Opening inline radar map.');
        setLocating(false);
        setShowMapPicker(true);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerLat = selectedCoords?.lat || -3.3931;
    const centerLng = selectedCoords?.lng || 38.5563;

    const lat = centerLat + (0.5 - y / rect.height) * 0.02;
    const lng = centerLng + (x / rect.width - 0.5) * 0.02;

    setSelectedCoords({ lat, lng });
    setVenue(`Voi Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
  };

  // Save new hangout to Supabase
  const handleCreateHangout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !venue) return;

    const newHangoutPayload = {
      author_name: 'You',
      author_initial: 'Y',
      title,
      description: desc || 'Come join the meetup!',
      venue,
      max_limit: Number(limit) || 4,
      attendees: [],
    };

    const { data, error } = await supabase
      .from('hangouts')
      .insert([newHangoutPayload])
      .select();

    if (data && data[0]) {
      const created = {
        ...data[0],
        timeAgo: 'Just now',
        isUserPulledUp: false,
      };
      setHangouts([created, ...hangouts]);
      setTitle('');
      setVenue('');
      setDesc('');
      setLimit(4);
      setShowForm(false);
      setShowMapPicker(false);
    } else if (error) {
      console.error('Error creating hangout:', error);
      alert('Failed to publish hangout. Check your table permissions.');
    }
  };

  // Update attendees list in Supabase when toggling PullUp
  const handlePullUpToggle = async (id: string) => {
    const target = hangouts.find((h) => h.id === id);
    if (!target) return;

    const isAlreadyIn = target.isUserPulledUp;
    const isFilled = target.attendees.length >= target.max_limit && !isAlreadyIn;
    if (isFilled) return;

    const updatedAttendees = isAlreadyIn
      ? target.attendees.filter((name) => name !== 'You')
      : [...target.attendees, 'You'];

    // Update in Supabase
    const { error } = await supabase
      .from('hangouts')
      .update({ attendees: updatedAttendees })
      .eq('id', id);

    if (!error) {
      setHangouts((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          return {
            ...item,
            isUserPulledUp: !isAlreadyIn,
            attendees: updatedAttendees,
          };
        })
      );
    }
  };

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap"
        rel="stylesheet"
      />

      <main
        style={{ backgroundColor: isDarkMode ? mainBg : '#f4f4f5' }}
        className={`min-h-[100dvh] w-full sm:max-w-md mx-auto pb-28 relative sm:border-x transition-colors duration-200 ${
          isDarkMode ? 'border-zinc-900 text-zinc-300' : 'border-zinc-300 text-zinc-800'
        }`}
      >
        {/* Header */}
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
              aria-label="Toggle Theme"
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

        {/* Content */}
        <div className="flex-1 p-4 space-y-4">
          {/* Create Hangout Action Button */}
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className={`w-full py-3.5 px-4 rounded-2xl border flex items-center justify-center gap-2 text-xs font-normal transition-all shadow-sm ${
                isDarkMode
                  ? 'bg-zinc-900/60 border-zinc-800/80 text-zinc-300 hover:bg-zinc-900'
                  : 'bg-white border-zinc-300 text-zinc-800 hover:bg-zinc-50'
              }`}
            >
              <Plus className="w-4 h-4 stroke-[1.5]" />
              <span>Create Hangout</span>
            </button>
          ) : (
            <form
              onSubmit={handleCreateHangout}
              className={`p-4 rounded-2xl border space-y-3 ${
                isDarkMode ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-zinc-300 shadow-sm'
              }`}
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-normal tracking-wider uppercase text-zinc-500">New Live Hangout</h3>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setShowMapPicker(false); }}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Cancel
                </button>
              </div>

              <input
                type="text"
                placeholder="Hangout Title (e.g. Coffee & Code)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={`w-full rounded-xl px-3 py-2 text-xs border focus:outline-none ${
                  isDarkMode
                    ? 'bg-zinc-950 border-zinc-800 text-zinc-200 focus:border-zinc-700'
                    : 'bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-zinc-400'
                }`}
                required
              />

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Venue / Location"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    className={`w-full rounded-xl pl-3 pr-28 py-2 text-xs border focus:outline-none ${
                      isDarkMode
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-200 focus:border-zinc-700'
                        : 'bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-zinc-400'
                    }`}
                    required
                  />
                  <div className="absolute right-1 top-1 bottom-1 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleUseMyLocation}
                      disabled={locating}
                      className={`px-2 py-1 rounded-lg text-[10px] font-normal flex items-center gap-1 border transition-colors ${
                        isDarkMode
                          ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                          : 'bg-zinc-100 border-zinc-300 text-zinc-700 hover:bg-zinc-200'
                      }`}
                    >
                      <Navigation className="w-3 h-3 stroke-[1.5]" />
                      <span>{locating ? '...' : 'GPS'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowMapPicker(!showMapPicker)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-normal flex items-center gap-1 border transition-colors ${
                        showMapPicker
                          ? 'bg-zinc-700 text-white border-zinc-600'
                          : isDarkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700' : 'bg-zinc-100 border-zinc-300 text-zinc-700 hover:bg-zinc-200'
                      }`}
                    >
                      <MapIcon className="w-3 h-3 stroke-[1.5]" />
                      <span>{showMapPicker ? 'Close' : 'Map'}</span>
                    </button>
                  </div>
                </div>

                <div className="w-24">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    placeholder="Limit"
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    className={`w-full rounded-xl px-3 py-2 text-xs border focus:outline-none ${
                      isDarkMode
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-200 focus:border-zinc-700'
                        : 'bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-zinc-400'
                    }`}
                    title="Max Attendees Limit"
                  />
                </div>
              </div>

              {/* Radar-Style Embedded Google Map Picker */}
              {showMapPicker && (
                <div className={`p-3 rounded-2xl border space-y-2 ${isDarkMode ? 'bg-[#181515] border-zinc-800' : 'bg-zinc-100 border-zinc-300'}`}>
                  <div className="flex justify-between items-center text-[11px] text-zinc-400 px-1">
                    <span className="uppercase tracking-wider">Live Radar Map Picker</span>
                    <button
                      type="button"
                      onClick={() => setShowMapPicker(false)}
                      className="text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" /> Close
                    </button>
                  </div>

                  <div className="w-full h-48 rounded-xl overflow-hidden border border-zinc-800 relative cursor-crosshair">
                    <iframe
                      title="Radar Map Venue Picker"
                      src={`https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d15955.35!2d${selectedCoords?.lng || 38.5563}!3d${selectedCoords?.lat || -3.3931}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zM8KwMjMnMzUuMiJTIDM4wrAzMy9MjIuOCJF!5e0!3m2!1sen!2ske!4v1650000000000!5m2!1sen!2ske`}
                      width="100%"
                      height="100%"
                      style={{
                        border: 0,
                        filter: isDarkMode ? 'invert(90%) hue-rotate(180deg) contrast(90%)' : 'none',
                      }}
                      loading="lazy"
                    />

                    <div className="absolute top-3 left-3 bg-zinc-900/90 border border-zinc-700/80 backdrop-blur-md px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-[10px] text-zinc-200 pointer-events-none shadow-md">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                      <span>Tap map to drop pin</span>
                    </div>

                    <div
                      onClick={handleMapClick}
                      className="absolute inset-0 z-10 bg-transparent flex items-center justify-center"
                    >
                      <div className="absolute w-4 h-4 rounded-full bg-amber-400 border-2 border-white shadow-xl animate-bounce transform -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2 pointer-events-none" />
                    </div>
                  </div>
                </div>
              )}

              <textarea
                placeholder="Optional: Description or Vibe"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={2}
                className={`w-full rounded-xl px-3 py-2 text-xs border resize-none focus:outline-none ${
                  isDarkMode
                    ? 'bg-zinc-950 border-zinc-800 text-zinc-200 focus:border-zinc-700'
                    : 'bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-zinc-400'
                }`}
              />

              <button
                type="submit"
                className={`w-full py-2.5 rounded-xl text-xs font-normal transition-colors ${
                  isDarkMode
                    ? 'bg-zinc-200 text-zinc-900 hover:bg-white'
                    : 'bg-zinc-900 text-white hover:bg-zinc-800'
                }`}
              >
                Publish to Supabase
              </button>
            </form>
          )}

          {/* Section Header */}
          <div className="flex justify-between items-center pt-2 px-1">
            <h2 className="text-[11px] uppercase tracking-wider font-normal text-zinc-500">
              Live Supabase Hangouts
            </h2>
            <div className={`flex items-center gap-1.5 text-[11px] font-normal px-2 py-0.5 rounded-full ${isDarkMode ? 'text-zinc-400 bg-zinc-900/80 border border-zinc-800/50' : 'text-zinc-600 bg-zinc-200'}`}>
                <Users className="w-3.5 h-3.5 stroke-[1.5]" />
                <span>{hangouts.length} active</span>
            </div>
          </div>

          {/* Hangouts Cards Feed */}
          <div className="space-y-3">
            {hangouts.length === 0 ? (
              <div className={`p-6 rounded-2xl border text-center text-xs text-zinc-500 ${isDarkMode ? 'border-zinc-800 bg-[#181515]' : 'border-zinc-200 bg-white'}`}>
                No live hangouts found in Supabase yet. Create one above!
              </div>
            ) : (
              hangouts.map((item) => {
                const attendeesCount = item.attendees?.length || 0;
                const isFilled = attendeesCount >= item.max_limit;

                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      isDarkMode
                        ? 'border-zinc-800/80 shadow-sm'
                        : 'border-zinc-200 bg-white shadow-sm'
                    }`}
                    style={{ 
                        backgroundColor: isDarkMode ? customHangoutCardBg : '#ffffff' 
                    }}
                  >
                    {/* Author Info & Filled Badge Row */}
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center space-x-2.5">
                        <div className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs font-normal ${
                          isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-zinc-100 border-zinc-300 text-zinc-600'
                        }`}>
                          {item.author_initial}
                        </div>
                        <span className="text-xs font-normal text-zinc-300">
                          {item.author_name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isFilled && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-normal bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            Filled ({attendeesCount}/{item.max_limit})
                          </span>
                        )}
                        {!isFilled && (
                          <span className="text-[11px] text-zinc-500 font-mono">
                            {attendeesCount}/{item.max_limit} slots
                          </span>
                        )}
                        <span className="text-[11px] text-zinc-600 font-mono">• {item.timeAgo}</span>
                      </div>
                    </div>

                    {/* Hangout Title & Description */}
                    <div className="space-y-1 mb-3">
                      <h3 className="text-xs font-normal tracking-tight text-zinc-200">
                        {item.title}
                      </h3>
                      <p className="text-[11px] leading-relaxed font-normal text-zinc-400">
                        {item.description}
                      </p>
                    </div>

                    {/* Attendees Visibility */}
                    {attendeesCount > 0 && (
                      <div className={`mb-3 p-2 rounded-xl border text-[11px] flex flex-wrap items-center gap-1.5 ${
                        isDarkMode ? 'bg-zinc-950/60 border-zinc-800/80 text-zinc-400' : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                      }`}>
                        <span className="text-zinc-500 font-normal">Pulling up:</span>
                        {item.attendees.map((attendee, idx) => (
                          <span key={idx} className={`px-2 py-0.5 rounded-md text-[10px] ${isDarkMode ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-200 text-zinc-800'}`}>
                            {attendee}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Location & PullUp / PulledUp Button Row */}
                    <div className={`flex justify-between items-center pt-3 border-t ${isDarkMode ? 'border-zinc-800/60' : 'border-zinc-100'}`}>
                      <div className="flex items-center space-x-1.5 text-[11px] text-zinc-400">
                        <MapPin className="w-3.5 h-3.5 stroke-[1.5]" />
                        <span>{item.venue}</span>
                      </div>

                      <button
                        onClick={() => handlePullUpToggle(item.id)}
                        disabled={isFilled && !item.isUserPulledUp}
                        className={`px-4 py-1.5 rounded-xl border transition-all shadow-sm flex items-center gap-1.5 ${
                          item.isUserPulledUp
                            ? isDarkMode
                              ? 'bg-zinc-800 border-zinc-700 text-amber-400'
                              : 'bg-zinc-900 text-amber-400 border-zinc-900'
                            : isFilled
                            ? 'opacity-50 cursor-not-allowed bg-zinc-900 border-zinc-800 text-zinc-500'
                            : isDarkMode
                            ? 'bg-zinc-900/80 border-zinc-800 text-zinc-200 hover:bg-zinc-900'
                            : 'bg-white border-zinc-300 text-zinc-900 hover:bg-zinc-50'
                        }`}
                      >
                        {item.isUserPulledUp && <Check className="w-3 h-3 text-amber-400 stroke-[2]" />}
                        <span
                          style={{ fontFamily: "'Great Vibes', cursive", fontSize: '22px' }}
                          className="tracking-wide font-normal leading-none pt-0.5 inline-block"
                        >
                          {item.isUserPulledUp ? 'PulledUp' : isFilled ? 'Filled' : 'PullUp'}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <BottomNav isDarkMode={isDarkMode} />
      </main>
    </>
  );
}