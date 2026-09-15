import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Lock, 
  User, 
  ShieldCheck, 
  Radio, 
  AlertCircle, 
  ArrowRight,
  Eye,
  EyeOff,
  Clock,
  Server,
  KeyRound
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BrandLogo } from './common/BrandLogo';
import { ThemeToggle } from './common/ThemeToggle';
import { THEMES } from '../utils/theme';

export const LoginScreen: React.FC = () => {
  const { login, logoutReason, clearLogoutReason, settings } = useAuth();
  const theme = settings?.theme ? THEMES[settings.theme] : THEMES.emerald;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [remainingLockSec, setRemainingLockSec] = useState<number>(0);

  // Live countdown ticker for 15-minute lock duration
  useEffect(() => {
    if (!lockedUntil) {
      setRemainingLockSec(0);
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setRemainingLockSec(remaining);
      if (remaining <= 0) {
        setLockedUntil(null);
        setError(null);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim();
    const cleanPass = password.trim();

    if (!cleanUser || !cleanPass) {
      setError('Please enter both username and password.');
      return;
    }

    if (lockedUntil && Date.now() < lockedUntil) {
      setError('Yeh Client ID abhi locked hai. Baraye meherbani timer khatam hone tak intezar karein.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await login(cleanUser, cleanPass);
    if (!result.success) {
      if (result.isLocked && result.lockedUntil) {
        setLockedUntil(result.lockedUntil);
      }
      setError(result.error || 'Incorrect username or password. Please check your credentials.');
      setIsSubmitting(false);
    }
  };

  const lockMinutes = Math.floor(remainingLockSec / 60);
  const lockSeconds = remainingLockSec % 60;

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Floating Dark & Sun Theme Mode Toggle */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
        <ThemeToggle />
      </div>

      {/* Ambient background glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.12),rgba(255,255,255,0))]" />
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Grid Pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.025] pointer-events-none" 
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='30' height='30' viewBox='0 0 30 30' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1.5 0H0V1.5V30H1.5V1.5H30V0H1.5Z' fill='%23FFFFFF'/%3E%3C/svg%3E")`
        }} 
      />

      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        {/* Main Brand Logo Header (Large & Prominent) */}
        <div className="mb-7 flex flex-col items-center justify-center">
          <BrandLogo size="2xl" layout="vertical" />
        </div>

        {/* Clean Login Card */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="w-full bg-slate-900/95 border border-slate-800 rounded-3xl shadow-2xl backdrop-blur-xl p-7 sm:p-9"
          id="login-card-container"
        >
          {/* Header Title */}
          <div className="text-center space-y-1 mb-6">
            <h1 className="text-2xl font-black text-white tracking-tight">
              Sign In
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              Enter your credentials to access the portal
            </p>
          </div>

          {/* Session Terminated / Logout Reason Banner */}
          <AnimatePresence>
            {logoutReason && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-5 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5"
              >
                <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-amber-300">Session Ended</p>
                  <p className="mt-0.5 text-slate-300">{logoutReason}</p>
                </div>
                <button
                  type="button"
                  onClick={clearLogoutReason}
                  className="text-amber-400 hover:text-amber-200 text-xs font-bold px-1"
                >
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 15-Minute Concurrency Violation Lockout Banner */}
          <AnimatePresence>
            {lockedUntil && remainingLockSec > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -8 }}
                className="mb-5 p-4 rounded-2xl bg-rose-950/90 border-2 border-rose-500/60 shadow-xl shadow-rose-950/50 text-rose-100 text-xs space-y-2.5"
                id="lockout-timer-banner"
              >
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded-lg bg-rose-500/20 text-rose-400">
                    <Lock className="w-4 h-4 animate-bounce" />
                  </span>
                  <div className="flex-1">
                    <span className="font-bold text-rose-300 block text-xs tracking-wide uppercase">
                      Client ID Locked (15 Minutes)
                    </span>
                    <span className="text-[11px] text-rose-200/90 leading-tight block">
                      Max 3 users allowed. 4th user access attempt triggered complete security lockout.
                    </span>
                  </div>
                </div>

                <div className="bg-slate-950/90 border border-rose-500/30 rounded-xl p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-slate-300 font-medium text-[11px]">
                    <Clock className="w-3.5 h-3.5 text-rose-400" />
                    <span>Auto-Unlock In:</span>
                  </div>
                  <div className="font-mono font-black text-rose-300 text-sm tracking-widest px-2.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/30">
                    {String(lockMinutes).padStart(2, '0')}:{String(lockSeconds).padStart(2, '0')}
                  </div>
                </div>

                <p className="text-[10px] text-rose-300/80 italic text-center">
                  ⚠️ Yeh Client ID is waqt kisi ke paas bhi open nahi ho sakti. Timer khatam hone ka intezar karein ya Admin se contact karein.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Instant Authentication Error Banner */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                key={error}
                initial={{ opacity: 0, scale: 0.95, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -6 }}
                transition={{ duration: 0.2 }}
                className="mb-5 p-3.5 rounded-2xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs flex items-center gap-2.5 shadow-lg shadow-rose-950/30"
                id="login-error-notice"
              >
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 animate-pulse" />
                <p className="font-semibold flex-1 leading-snug">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4" id="login-form">
            <div>
              <label 
                className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5" 
                htmlFor="username-input"
              >
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="username-input"
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Enter username"
                  className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                />
              </div>
            </div>

            <div>
              <label 
                className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5" 
                htmlFor="password-input"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Enter password"
                  className="w-full pl-10 pr-10 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-3.5 px-4 rounded-xl ${theme.primaryBg} shadow-lg shadow-emerald-500/20 font-bold transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed mt-4 cursor-pointer`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
};
