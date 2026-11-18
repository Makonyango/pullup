'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon, Bike, MapPin, Shield, Edit3, Heart, Video, Bookmark, X } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import { supabase } from '@/lib/supabase';

interface Hangout {
  id: string;
  author_name: string;
  title: string;
  venue: string;
  attendees: string[];
}

export default function ProfilePage() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'likes' | 'saved'>('posts');

  // Clean initial state (shows empty placeholders until data is keyed in)
  const [profile, setProfile] = useState({
    name: 'Set your name',
    handle: '@username',
    bio: 'Add a brief bio about yourself...',
    avatar: '?',
    following: 0,
    followers: 0,
    likesCount: '0',
  });

  const [userHangouts, setUserHangouts] = useState<Hangout[]>([]);
  const [tempName, setTempName] = useState('');
  const [tempHandle, setTempHandle] = useState('');
  const [tempBio, setTempBio] = useState('');

  const mainBg = '#090909';
  const cardBg = '#181515';

  // Fetch live data from Supabase on load
  useEffect(() => {
    const saved = localStorage.getItem('pullup_theme');
    if (saved !== null) setIsDarkMode(saved === 'dark');

    async function loadUserProfile() {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (data) {
        setProfile({
          name: data.display_name || 'Set your name',
          handle: data.user_handle || '@username',
          bio: data.bio || 'Add a brief bio about yourself...',
          avatar: data.display_name
            ? data.display_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
            : '?',
          following: data.following || 0,
          followers: data.followers || 0,
          likesCount: data.likes_count || '0',
        });
        setTempName(data.display_name || '');
        setTempHandle(data.user_handle || '');
        setTempBio(data.bio || '');
      }

      // Fetch user hangouts to show in the feed & calculate real stats
      const { data: hangoutsData } = await supabase
        .from('hangouts')
        .select('*')
        .order('created_at', { ascending: false });

      if (hangoutsData) {
        const mine = hangoutsData.filter(
          (h) => h.author_name === 'You' || h.author_name === profile.name
        );
        setUserHangouts(mine);
      }
    }

    loadUserProfile();
  }, []);

  const toggleTheme = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    localStorage.setItem('pullup_theme', next ? 'dark' : 'light');
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const updatedAvatar = tempName
      ? tempName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
      : '?';

    // Generate a secure client-side UUID fallback to prevent null id constraint errors
    const fallbackId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });

    const payload = {
      id: fallbackId,
      user_handle: tempHandle || '@username',
      display_name: tempName || 'Set your name',
      bio: tempBio,
      avatar: updatedAvatar,
    };

    const { data, error } = await supabase
      .from('profiles')
      .upsert([payload], { onConflict: 'user_handle' })
      .select();

    if (!error) {
      setProfile((prev) => ({
        ...prev,
        name: tempName || 'Set your name',
        handle: tempHandle || '@username',
        bio: tempBio || 'Add a brief bio about yourself...',
        avatar: updatedAvatar,
      }));
      setShowEditModal(false);
      alert('Profile updated and synced to Supabase!');
    } else {
      console.error('Detailed Supabase Profile Error:', error);
      alert(`Failed to save: ${error.message || JSON.stringify(error)}`);
    }
  };

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap" rel="stylesheet" />
      <main
        style={{ backgroundColor: isDarkMode ? mainBg : '#f4f4f5' }}
        className={`min-h-[100dvh] w-full sm:max-w-md mx-auto pb-28 relative sm:border-x transition-colors duration-200 flex flex-col ${
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
          <div className="flex justify-between items-center text-[11px] uppercase tracking-wider font-normal text-zinc-500 px-1">
            <span>User Credentials🫂</span>
            <span className="lowercase">Synced</span>
          </div>

          {/* Profile Header Card */}
          <div
            style={{ backgroundColor: isDarkMode ? cardBg : '#ffffff' }}
            className={`p-5 rounded-2xl border flex flex-col items-center text-center space-y-3 ${
              isDarkMode ? 'border-zinc-800/80 shadow-sm' : 'border-zinc-200 shadow-sm'
            }`}
          >
            {/* Avatar */}
            <div className="w-16 h-16 rounded-full border-2 border-zinc-700 flex items-center justify-center text-lg font-normal bg-zinc-900 text-zinc-200 shadow-md">
              {profile.avatar}
            </div>

            {/* Name & Handle */}
            <div className="space-y-0.5">
              <h2 className={`text-sm font-normal ${isDarkMode ? 'text-zinc-100' : 'text-zinc-900'}`}>{profile.name}</h2>
              <p className="text-xs text-zinc-500 font-mono">{profile.handle}</p>
            </div>

            {/* Bio */}
            <p className="text-xs text-zinc-400 font-normal max-w-xs leading-relaxed">
              {profile.bio}
            </p>

            {/* Social Stats Bar */}
            <div className="flex justify-center gap-6 py-2 w-full border-y border-zinc-800/60 my-1">
              <div className="text-center">
                <div className={`text-sm font-normal ${isDarkMode ? 'text-zinc-200' : 'text-zinc-900'}`}>{profile.following}</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Following</div>
              </div>
              <div className="text-center">
                <div className={`text-sm font-normal ${isDarkMode ? 'text-zinc-200' : 'text-zinc-900'}`}>{profile.followers}</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Followers</div>
              </div>
              <div className="text-center">
                <div className={`text-sm font-normal ${isDarkMode ? 'text-zinc-200' : 'text-zinc-900'}`}>{profile.likesCount}</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Likes</div>
              </div>
            </div>

            {/* Edit Profile Button */}
            <button
              onClick={() => setShowEditModal(true)}
              className={`w-full py-2 rounded-xl border text-xs font-normal flex items-center justify-center gap-1.5 transition-all ${
                isDarkMode
                  ? 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:bg-zinc-800'
                  : 'bg-zinc-100 border-zinc-300 text-zinc-800 hover:bg-zinc-200'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>Edit Profile & Key In Data</span>
            </button>
          </div>

          {/* TikTok Content Feed Tabs */}
          <div
            style={{ backgroundColor: isDarkMode ? cardBg : '#ffffff' }}
            className={`p-1 rounded-2xl border grid grid-cols-3 gap-1 ${
              isDarkMode ? 'border-zinc-800/80' : 'border-zinc-200 shadow-sm'
            }`}
          >
            <button
              onClick={() => setActiveTab('posts')}
              className={`py-2 rounded-xl text-xs font-normal flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'posts'
                  ? isDarkMode ? 'bg-zinc-800 text-zinc-100 border border-zinc-700/60' : 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:text-zinc-400'
              }`}
            >
              <Video className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>Hangouts ({userHangouts.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('likes')}
              className={`py-2 rounded-xl text-xs font-normal flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'likes'
                  ? isDarkMode ? 'bg-zinc-800 text-zinc-100 border border-zinc-700/60' : 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:text-zinc-400'
              }`}
            >
              <Heart className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>Liked</span>
            </button>
            <button
              onClick={() => setActiveTab('saved')}
              className={`py-2 rounded-xl text-xs font-normal flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'saved'
                  ? isDarkMode ? 'bg-zinc-800 text-zinc-100 border border-zinc-700/60' : 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:text-zinc-400'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>Saved</span>
            </button>
          </div>

          {/* Tab Content Feed Display */}
          <div
            style={{ backgroundColor: isDarkMode ? cardBg : '#ffffff' }}
            className={`p-4 rounded-2xl border min-h-[140px] flex flex-col space-y-2 ${
              isDarkMode ? 'border-zinc-800/80 shadow-sm' : 'border-zinc-200 shadow-sm'
            }`}
          >
            {activeTab === 'posts' && (
              userHangouts.length === 0 ? (
                <div className="text-center py-6 text-xs text-zinc-500">
                  No published hangouts yet. Create one on the Explore tab!
                </div>
              ) : (
                userHangouts.map((h) => (
                  <div key={h.id} className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 text-xs space-y-1">
                    <div className="flex justify-between font-normal text-zinc-200">
                      <span>{h.title}</span>
                      <span className="text-amber-400 font-mono text-[10px]">{h.attendees?.length || 0} joined</span>
                    </div>
                    <div className="text-[10px] text-zinc-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {h.venue}
                    </div>
                  </div>
                ))
              )
            )}
            {activeTab === 'likes' && (
              <div className="text-center py-6 text-xs text-zinc-500">
                No liked hangouts yet.
              </div>
            )}
            {activeTab === 'saved' && (
              <div className="text-center py-6 text-xs text-zinc-500">
                Your saved bookmarks are empty.
              </div>
            )}
          </div>
        </div>

        {/* Edit Profile Modal */}
        {showEditModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <form
              onSubmit={handleSaveProfile}
              style={{ backgroundColor: cardBg }}
              className="w-full max-w-sm rounded-2xl border border-zinc-800 p-5 space-y-4 shadow-2xl"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-normal uppercase tracking-wider text-zinc-300">Set Profile Details</h3>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-zinc-500 block mb-1">Display Name</label>
                  <input
                    type="text"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    placeholder="e.g. Brain Onyango"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700"
                  />
                </div>

                <div>
                  <label className="text-zinc-500 block mb-1">Username / Handle</label>
                  <input
                    type="text"
                    value={tempHandle}
                    onChange={(e) => setTempHandle(e.target.value)}
                    placeholder="e.g. @brain_onyango"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700"
                  />
                </div>

                <div>
                  <label className="text-zinc-500 block mb-1">Bio</label>
                  <textarea
                    value={tempBio}
                    onChange={(e) => setTempBio(e.target.value)}
                    placeholder="Write a short bio..."
                    rows={3}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-200 resize-none focus:outline-none focus:border-zinc-700"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-800 text-xs text-zinc-400 hover:bg-zinc-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-zinc-200 text-zinc-950 text-xs font-normal hover:bg-white"
                >
                  Save & Sync
                </button>
              </div>
            </form>
          </div>
        )}

        <BottomNav isDarkMode={isDarkMode} />
      </main>
    </>
  );
}