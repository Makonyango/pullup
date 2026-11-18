'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, Radio, Gamepad2, User } from 'lucide-react';

interface BottomNavProps {
  isDarkMode: boolean;
}

export default function BottomNav({ isDarkMode }: BottomNavProps) {
  const pathname = usePathname();

  const navItems = [
    { name: 'Explore', href: '/', icon: Compass },
    { name: 'Radar', href: '/radar', icon: Radio },
    { name: 'Play', href: '/play', icon: Gamepad2 },
    { name: 'Profile', href: '/profile', icon: User },
  ];

  return (
    <nav
      className={`fixed bottom-0 inset-x-0 z-50 w-full sm:max-w-md mx-auto border-t sm:border-x backdrop-blur-md pb-[env(safe-area-inset-bottom)] transition-colors duration-200 ${
        isDarkMode
          ? 'bg-[#0d0d0d]/95 border-zinc-800 text-zinc-200'
          : 'bg-white/95 border-zinc-200 text-zinc-800'
      }`}
    >
      <div className="grid grid-cols-4 w-full">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex flex-col items-center justify-center py-3 space-y-1 transition-colors ${
                isActive
                  ? isDarkMode
                    ? 'text-white font-medium'
                    : 'text-zinc-950 font-medium'
                  : 'text-zinc-500 hover:text-zinc-400 font-normal'
              }`}
            >
              <Icon
                className={`w-5 h-5 ${
                  isActive ? 'stroke-[2.25px]' : 'stroke-[1.5px]'
                }`}
              />
              <span className="text-[11px] tracking-tight">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}