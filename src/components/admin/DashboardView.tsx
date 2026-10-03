import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Radio, 
  Users, 
  Server, 
  MessageSquare, 
  Send, 
  Clock, 
  Calendar, 
  CheckCircle2, 
  RotateCcw, 
  TrendingUp, 
  ShieldCheck, 
  FileSpreadsheet, 
  ShieldAlert, 
  UploadCloud, 
  Activity, 
  Zap, 
  ChevronRight,
  ArrowUpRight
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { THEMES } from '../../utils/theme';
import { soundManager } from '../../utils/sound';
import type { SystemStats, Partition } from '../../types';

interface DashboardViewProps {
  onNavigate: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { session, settings } = useAuth();
  const theme = settings?.theme ? THEMES[settings.theme] : THEMES.emerald;

  const [stats, setStats] = useState<SystemStats | null>(null);
  const [partitions, setPartitions] = useState<Partition[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simForm, setSimForm] = useState({
    sender: 'WhatsApp',
    phone: '+1 (555) 392-8190',
    service: 'WhatsApp',
    otp: '782914',
    partId: 'part_1',
    partName: 'Part 1',
    part: 1,
    message: 'Your WhatsApp verification code is 782914. Do not share.',
  });
  const [showSimModal, setShowSimModal] = useState(false);

  const fetchDashboardData = async () => {
    if (!session) return;
    try {
      const [statsRes, partsRes] = await Promise.all([
        fetch('/api/stats', { headers: { Authorization: `Bearer ${session.token}` } }),
        fetch('/api/partitions', { headers: { Authorization: `Bearer ${session.token}` } }),
      ]);

      if (statsRes.ok) {
        const d = await statsRes.json();
        setStats(d.stats);
      }
      if (partsRes.ok) {
        const d = await partsRes.json();
        setPartitions(d.partitions || []);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 3000);
    return () => clearInterval(interval);
  }, [session]);

  const handleSimulateSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setIsSimulating(true);
    try {
      const res = await fetch('/api/sms/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify(simForm),
      });
      if (res.ok) {
        soundManager.playOtpAlert();
        setShowSimModal(false);
        fetchDashboardData();
      }
    } catch {
      // Ignore
    } finally {
      setIsSimulating(false);
    }
  };

  // 7 Days Chart data calculation
  const dailyStats = stats?.dailyStats && stats.dailyStats.length > 0 ? stats.dailyStats : [
    { date: '2026-09-26', count: Math.round((stats?.totalSms || 10) * 0.1), label: 'Day 1' },
    { date: '2026-09-27', count: Math.round((stats?.totalSms || 10) * 0.12), label: 'Day 2' },
    { date: '2026-09-28', count: Math.round((stats?.totalSms || 10) * 0.15), label: 'Day 3' },
    { date: '2026-09-29', count: Math.round((stats?.totalSms || 10) * 0.18), label: 'Day 4' },
    { date: '2026-09-30', count: Math.round((stats?.totalSms || 10) * 0.22), label: 'Day 5' },
    { date: '2026-10-01', count: stats?.yesterdaySms || 0, label: 'Yesterday' },
    { date: '2026-10-02', count: stats?.todaySms || 0, label: 'Today' },
  ];

  const maxDaily = Math.max(...dailyStats.map(d => d.count), 10);
  const chartHeight = 130;
  const chartWidth = 500;
  const paddingX = 35;
  const paddingY = 20;

  // Build SVG path points
  const points = dailyStats.map((item, index) => {
    const x = paddingX + (index / (dailyStats.length - 1)) * (chartWidth - paddingX * 2);
    const y = chartHeight - paddingY - (item.count / maxDaily) * (chartHeight - paddingY * 2);
    return { x, y, count: item.count, label: item.label };
  });

  const linePath = points.reduce((acc, pt, idx) => {
    return idx === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`;
  }, '');

  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x},${chartHeight - paddingY} L ${points[0].x},${chartHeight - paddingY} Z`
    : '';

  return (
    <div className="space-y-6" id="admin-dashboard-view">
      {/* Clean Dashboard Top Bar (As requested in video: clean "Dashboard" title, no redundant banner) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <span>Dashboard</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Real-time SMS gateway relay and client access monitor. Connect external APIs or receive webhooks directly.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setShowSimModal(true)}
            className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-950/30 transition-all active:scale-95 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Simulate SMS</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('providers')}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Server className="w-3.5 h-3.5 text-blue-400" />
            <span>Connect API</span>
          </button>
        </div>
      </div>

      {/* Quick Access Shortcuts Grid (Matching Reference at 03:17) */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-400">Quick Access</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <button
            type="button"
            onClick={() => onNavigate('sms')}
            className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 text-left transition-all group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <div className="text-xs font-bold text-white">Live SMS</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Stream Relay</div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-blue-500/50 text-left transition-all group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-white">SMS Reports</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Manual Queries</div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('client-filters')}
            className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 text-left transition-all group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-white">CLI Filter</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Rule Manager</div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('bulk-numbers')}
            className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 text-left transition-all group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-white">Bulk Numbers</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Ranges & Mappings</div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('providers')}
            className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 text-left transition-all group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <Server className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-white">API Gateway</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Sync Connectors</div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('clients')}
            className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 text-left transition-all group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <Users className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-white">Clients</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Users & Accounts</div>
          </button>
        </div>
      </div>

      {/* VOLUME OVERVIEW SECTION (Matching Video at 03:18: Today SMS, Yesterday SMS, SMS This Week, SMS This Month) */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-400">Volume Overview</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: Today SMS */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-300">Today SMS</span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-black text-white font-mono">
                {(stats?.todaySms ?? 0).toLocaleString()}
              </div>
              <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1 mt-1">
                <TrendingUp className="w-3 h-3" />
                <span>Real-time count</span>
              </span>
            </div>
          </div>

          {/* Card 2: Yesterday SMS */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-300">Yesterday SMS</span>
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <RotateCcw className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-black text-white font-mono">
                {(stats?.yesterdaySms ?? 0).toLocaleString()}
              </div>
              <span className="text-[11px] text-blue-400 font-medium flex items-center gap-1 mt-1">
                <span>Yesterday total</span>
              </span>
            </div>
          </div>

          {/* Card 3: SMS This Week */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-300">SMS This Week</span>
              <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-black text-white font-mono">
                {(stats?.thisWeekSms ?? 0).toLocaleString()}
              </div>
              <span className="text-[11px] text-teal-400 font-medium flex items-center gap-1 mt-1">
                <span>Last 7 days cumulative</span>
              </span>
            </div>
          </div>

          {/* Card 4: SMS This Month */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-300">SMS This Month</span>
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-black text-white font-mono">
                {(stats?.thisMonthSms ?? 0).toLocaleString()}
              </div>
              <span className="text-[11px] text-purple-400 font-medium flex items-center gap-1 mt-1">
                <span>Current month total</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SMS STATS LAST 7 DAYS CHART (Matching Reference at 03:22) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              SMS Stats Last 7 Days
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              <strong className="text-emerald-400 font-mono font-bold">{(stats?.todaySms ?? 0).toLocaleString()}</strong> SMS today
            </p>
          </div>
          <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
            Total Gateway SMS: {(stats?.totalSms ?? 0).toLocaleString()}
          </span>
        </div>

        {/* SVG Area & Line Chart */}
        <div className="w-full overflow-hidden">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full h-40 sm:h-48 overflow-visible"
          >
            <defs>
              <linearGradient id="smsAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines */}
            <line x1={paddingX} y1={paddingY} x2={chartWidth - paddingX} y2={paddingY} stroke="#1e293b" strokeDasharray="3 3" />
            <line x1={paddingX} y1={chartHeight / 2} x2={chartWidth - paddingX} y2={chartHeight / 2} stroke="#1e293b" strokeDasharray="3 3" />
            <line x1={paddingX} y1={chartHeight - paddingY} x2={chartWidth - paddingX} y2={chartHeight - paddingY} stroke="#334155" />

            {/* Filled Area */}
            {areaPath && (
              <path d={areaPath} fill="url(#smsAreaGradient)" />
            )}

            {/* Line */}
            {linePath && (
              <path d={linePath} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            )}

            {/* Points & Data Callouts */}
            {points.map((pt, idx) => (
              <g key={idx}>
                <circle cx={pt.x} cy={pt.y} r="4" fill="#0284c7" stroke="#ffffff" strokeWidth="2" />
                <text
                  x={pt.x}
                  y={pt.y - 8}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {pt.count.toLocaleString()}
                </text>
                <text
                  x={pt.x}
                  y={chartHeight - 4}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize="9"
                  fontFamily="sans-serif"
                >
                  {pt.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* SYSTEM HEALTH CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-semibold uppercase">API Providers</div>
            <div className="text-xl font-bold text-white font-mono mt-1">
              {stats?.activeProviders ?? 0} Connected
            </div>
            <div className="text-[10px] text-purple-400 font-mono mt-0.5">
              {partitions.length} partitions active
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Server className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-semibold uppercase">Active Clients</div>
            <div className="text-xl font-bold text-white font-mono mt-1">
              {stats?.activeClients ?? 0} Clients
            </div>
            <div className="text-[10px] text-blue-400 font-mono mt-0.5">
              {stats?.activeSessions ?? 0} session(s) active
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-semibold uppercase">Gateway Status</div>
            <div className="text-xl font-bold text-emerald-400 font-mono mt-1">
              99.99% Uptime
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              Auto-purge after 5 min
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Simulator Modal (Preserved for Admin) */}
      {showSimModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-400" />
                <span>Simulate Incoming SMS</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowSimModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSimulateSms} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Target Stream / Partition</label>
                <div className="grid grid-cols-2 gap-2">
                  {partitions.map((p) => {
                    const isSelected = simForm.partId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSimForm({
                          ...simForm,
                          partId: p.id,
                          partName: p.name,
                          part: p.id === 'part_2' ? 2 : 1,
                        })}
                        className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-slate-950 text-slate-400 border border-slate-800'
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Service / App Name</label>
                <input
                  type="text"
                  required
                  value={simForm.service}
                  onChange={(e) => setSimForm({ ...simForm, service: e.target.value, sender: e.target.value })}
                  placeholder="e.g. WhatsApp, Telegram, Google, Binance"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Recipient Phone Number</label>
                <input
                  type="text"
                  required
                  value={simForm.phone}
                  onChange={(e) => setSimForm({ ...simForm, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">OTP Code</label>
                <input
                  type="text"
                  value={simForm.otp}
                  onChange={(e) => {
                    const o = e.target.value;
                    setSimForm({
                      ...simForm,
                      otp: o,
                      message: `Your ${simForm.service} code is: ${o}. Do not share this code.`,
                    });
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">SMS Message Body</label>
                <textarea
                  rows={3}
                  required
                  value={simForm.message}
                  onChange={(e) => setSimForm({ ...simForm, message: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSimModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSimulating}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold cursor-pointer"
                >
                  {isSimulating ? 'Pushing...' : 'Push Live SMS'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};
