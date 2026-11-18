'use client';

import BottomNav from '../components/BottomNav';
import { User, Settings, ShieldCheck, Bell } from 'lucide-react';

export default function ProfilePage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 pb-24 max-w-md mx-auto relative border-x border-zinc-200 dark:border-zinc-800 shadow-2xl">
      <header className="sticky top-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 z-40">
        <h1 className="text-xl font-bold">Your Profile</h1>
        <p className="text-xs text-zinc-500">Manage your identity and preferences</p>
      </header>

      <div className="p-6 space-y-6">
        {/* User Card */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 flex items-center space-x-4 shadow-sm">
          <img
            src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces"
            alt="User Avatar"
            className="w-16 h-16 rounded-full object-cover border-2 border-indigo-500"
          />
          <div>
            <h2 className="text-base font-bold">Alex Rivera</h2>
            <p className="text-xs text-zinc-500">@alexrivera • Active Host</p>
            <span className="inline-block mt-2 text-[10px] bg-emerald-500/10 text-emerald-600 font-semibold px-2 py-0.5 rounded-full">
              Location Shared (5km radius)
            </span>
          </div>
        </div>

        {/* Settings Options */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-2 shadow-sm space-y-1">
          <div className="flex items-center justify-between p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-xl cursor-pointer">
            <div className="flex items-center space-x-3 text-sm">
              <Bell className="w-4 h-4 text-indigo-500" />
              <span>Push Notifications</span>
            </div>
            <span className="text-xs text-zinc-400">Enabled</span>
          </div>

          <div className="flex items-center justify-between p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-xl cursor-pointer">
            <div className="flex items-center space-x-3 text-sm">
              <ShieldCheck className="w-4 h-4 text-indigo-500" />
              <span>Privacy & Geofence</span>
            </div>
            <span className="text-xs text-zinc-400">5 km</span>
          </div>

          <div className="flex items-center justify-between p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-xl cursor-pointer">
            <div className="flex items-center space-x-3 text-sm">
              <Settings className="w-4 h-4 text-indigo-500" />
              <span>App Preferences</span>
            </div>
            <span className="text-xs text-zinc-400">Dark Mode</span>
          </div>
        </div>
      </div>

      <BottomNav />
    </main>
  );
}