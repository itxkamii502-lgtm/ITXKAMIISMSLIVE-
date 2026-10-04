import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileSpreadsheet, 
  Clock, 
  LogOut, 
  ShieldAlert, 
  User, 
  ShieldCheck, 
  Layers,
  Radio
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { BrandLogo } from '../common/BrandLogo';
import { THEMES } from '../../utils/theme';
import { SMSReportsView } from '../reports/SMSReportsView';
import { ClientLiveSMS } from './ClientLiveSMS';

export const ClientPortalLayout: React.FC = () => {
  const { session, logout, formattedTimeRemaining, timeRemaining, isExpiringSoon, settings } = useAuth();
  const theme = settings?.theme ? THEMES[settings.theme] : THEMES.emerald;

  const [activeTab, setActiveTab] = useState<'live' | 'reports'>('live');

  // Ping client activity / panel open on mount
  useEffect(() => {
    if (!session) return;
    fetch('/api/client/activity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
    }).catch(() => {});
  }, [session]);

  // Sync browser URL with client routes
  useEffect(() => {
    const targetPath = activeTab === 'reports' ? '/client/sms-reports' : '/client/live-sms';
    if (window.location.pathname !== targetPath) {
      window.history.replaceState(null, '', targetPath);
    }

    const handlePopState = () => {
      if (window.location.pathname === '/client/sms-reports') {
        setActiveTab('reports');
      } else {
        setActiveTab('live');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Header Navigation for Member Portal */}
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          {/* Logo & Navigation Tabs */}
          <div className="flex items-center gap-2.5 sm:gap-4">
            <BrandLogo size="sm" showTagline={false} />

            <div className="h-5 w-px bg-slate-800 hidden sm:block" />

            {/* Portal Tab Switcher: Live SMS vs SMS Reports */}
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('live')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'live'
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Radio className={`w-3.5 h-3.5 ${activeTab === 'live' ? 'animate-pulse' : ''}`} />
                <span>Live SMS</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('reports')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'reports'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>SMS Reports</span>
              </button>
            </div>
          </div>

          {/* User Session, Timer & Logout */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* User badge */}
            <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
              <div className="w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[10px]">
                <User className="w-3 h-3" />
              </div>
              <span className="font-semibold text-white truncate max-w-[120px]">{session?.username}</span>
              <span className="text-[10px] text-slate-500 font-mono">Client</span>
            </div>

            {/* Countdown Session Timer */}
            <div
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition-colors ${
                isExpiringSoon
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 animate-pulse'
                  : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}
              title="Automatic session auto-logout countdown (5 minutes strict)"
            >
              <Clock className={`w-3.5 h-3.5 ${isExpiringSoon ? 'text-rose-400' : 'text-emerald-400'}`} />
              <span className="hidden xs:inline text-slate-500 font-sans font-normal text-[11px]">Session:</span>
              <span className="text-white font-mono">{formattedTimeRemaining}</span>
            </div>

            {/* Logout Button */}
            <button
              id="btn-client-logout"
              type="button"
              onClick={() => logout('Logged out successfully.')}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-all cursor-pointer"
              title="Logout from Member Console"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Security Warning Bar when <= 60 seconds left */}
        <AnimatePresence>
          {isExpiringSoon && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-rose-600 text-white text-xs px-4 py-1 text-center font-medium flex items-center justify-center gap-2"
            >
              <ShieldAlert className="w-3.5 h-3.5 animate-bounce" />
              <span>Security notice: Your session is expiring in {timeRemaining} seconds!</span>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main Member Viewport */}
      <main className="flex-1 w-full mx-auto">
        {activeTab === 'live' ? (
          <ClientLiveSMS />
        ) : (
          <SMSReportsView embeddedInClient={true} />
        )}
      </main>
    </div>
  );
};

export default ClientPortalLayout;
