import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface ThemeToggleProps {
  className?: string;
  size?: 'sm' | 'md';
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '', size = 'md' }) => {
  const { isDark, toggleThemeMode } = useTheme();

  const isSmall = size === 'sm';

  return (
    <button
      type="button"
      onClick={toggleThemeMode}
      className={`relative inline-flex items-center gap-1.5 rounded-xl transition-all cursor-pointer select-none active:scale-95 ${
        isDark
          ? 'bg-slate-900/90 hover:bg-slate-850 text-amber-400 border border-slate-800 hover:border-slate-700 shadow-sm'
          : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 shadow-sm'
      } ${isSmall ? 'p-1.5 text-xs' : 'px-2.5 py-1.5 text-xs font-semibold'} ${className}`}
      title={isDark ? 'Switch to Sun / Light Mode' : 'Switch to Dark Mode'}
      aria-label="Toggle Dark / Sun theme mode"
    >
      {isDark ? (
        <>
          <Moon className={`${isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-indigo-400 shrink-0`} />
          {!isSmall && <span className="text-slate-300 text-[11px] font-mono">Dark</span>}
        </>
      ) : (
        <>
          <Sun className={`${isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-amber-500 animate-spin-slow shrink-0`} />
          {!isSmall && <span className="text-amber-900 text-[11px] font-mono">Sun</span>}
        </>
      )}
    </button>
  );
};
