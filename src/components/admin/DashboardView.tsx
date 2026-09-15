import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Radio, 
  Users, 
  Server, 
  MessageSquare, 
  Key, 
  ArrowUpRight, 
  Send, 
  Copy, 
  Check, 
  Smartphone, 
  Search, 
  Trash2, 
  Plus, 
  Activity,
  Zap,
  TrendingUp,
  ShieldCheck,
  Globe
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { THEMES } from '../../utils/theme';
import { soundManager } from '../../utils/sound';
import { resolveCountryName, getCountryFromPhone, formatDateTime } from '../../utils/countryLookup';
import type { SmsMessage, SystemStats, Partition } from '../../types';

interface DashboardViewProps {
  onNavigate: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { session, settings } = useAuth();
  const theme = settings?.theme ? THEMES[settings.theme] : THEMES.emerald;

  const [stats, setStats] = useState<SystemStats | null>(null);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [partitions, setPartitions] = useState<Partition[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
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
      const [statsRes, smsRes, partsRes] = await Promise.all([
        fetch('/api/stats', { headers: { Authorization: `Bearer ${session.token}` } }),
        fetch('/api/sms?limit=50', { headers: { Authorization: `Bearer ${session.token}` } }),
        fetch('/api/partitions', { headers: { Authorization: `Bearer ${session.token}` } }),
      ]);

      if (statsRes.ok) {
        const d = await statsRes.json();
        setStats(d.stats);
      }
      if (smsRes.ok) {
        const d = await smsRes.json();
        setMessages(d.messages || []);
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

  const handleCopyOtp = (otp: string, id: string) => {
    navigator.clipboard.writeText(otp);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredMessages = messages.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      m.phone.toLowerCase().includes(q) ||
      m.sender.toLowerCase().includes(q) ||
      m.service.toLowerCase().includes(q) ||
      m.message.toLowerCase().includes(q) ||
      (m.otp && m.otp.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6" id="admin-dashboard-view">
      {/* Top Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative z-10 space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold">
              ADMIN CONTROL CENTER
            </span>
            <span className="text-xs text-slate-400 font-mono">
              VPS Gateway Active
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Welcome to the KB MAX Live SMS Dashboard
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 font-medium max-w-xl">
            Real-time SMS gateway relay and client access monitor. Connect external APIs or receive webhooks directly.
          </p>
        </div>

        {/* Quick Simulator Trigger */}
        <div className="relative z-10 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSimModal(true)}
            className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Simulate Incoming SMS</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('providers')}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Server className="w-4 h-4 text-emerald-400" />
            <span>Connect API</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Metric 1 */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Live SMS</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono">
              {stats?.totalSms ?? '...'}
            </div>
            <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3" />
              <span>{stats?.todaySms ?? 0} received today</span>
            </span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Live Clients</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono">
              {stats?.activeUsers ?? '...'}
            </div>
            <span className="text-[11px] text-blue-400 font-medium flex items-center gap-1 mt-1">
              <Activity className="w-3 h-3" />
              <span>{stats?.activeSessions ?? 0} active session(s)</span>
            </span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Connected APIs</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Server className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono">
              {stats?.activeProviders ?? '...'}
            </div>
            <span className="text-[11px] text-purple-400 font-medium flex items-center gap-1 mt-1">
              <Zap className="w-3 h-3" />
              <span>{partitions.length} partitions active</span>
            </span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">System Status</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono flex items-center gap-2">
              <span>99.99%</span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono mt-1 block">
              Auto-purge after 5 min
            </span>
          </div>
        </div>
      </div>

      {/* Recent Live Feed Section with Clean Table Layout */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Recent Live SMS Ingest</h3>
              <p className="text-xs text-slate-400">Streamed from your connected gateway providers</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search phone, OTP, or service..."
                className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-emerald-500 font-sans w-48 sm:w-64"
              />
            </div>
            <button
              type="button"
              onClick={() => onNavigate('livesms')}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
            >
              <span>View Full Feed</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800 text-[11px]">
                <th className="py-3 px-4 font-semibold whitespace-nowrap">DATE & TIME</th>
                <th className="py-3 px-4 font-semibold whitespace-nowrap">COUNTRY</th>
                <th className="py-3 px-4 font-semibold whitespace-nowrap">PHONE NUMBER</th>
                <th className="py-3 px-4 font-semibold whitespace-nowrap">CLI</th>
                <th className="py-3 px-4 font-semibold">SMS CONTENT</th>
                <th className="py-3 px-4 text-right font-semibold whitespace-nowrap">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredMessages.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 space-y-2">
                    <Radio className="w-8 h-8 text-slate-600 mx-auto animate-pulse" />
                    <p className="text-sm font-semibold text-slate-400">No recent live SMS records</p>
                    <p className="text-xs text-slate-500">
                      Incoming SMS messages will appear here instantly in real-time.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredMessages.slice(0, 15).map((msg) => {
                  const countryName = resolveCountryName(msg.country, msg.phone);
                  const cliName = msg.cli || msg.service || msg.sender;
                  const dateStr = formatDateTime(msg.timestamp);

                  return (
                    <tr key={msg.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 text-slate-400 whitespace-nowrap font-mono text-[11px]">
                        {dateStr}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
                          {countryName}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-white font-bold font-mono whitespace-nowrap">
                        {msg.phone || (msg as any).num || (msg as any).number || 'N/A'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-950/60 text-sky-300 border border-sky-500/30 font-mono">
                          {cliName}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-300 max-w-sm">
                        <div className="truncate" title={msg.message}>
                          {msg.message}
                        </div>
                        {msg.otp && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-mono text-emerald-400 font-bold">
                              OTP: {msg.otp}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {msg.otp ? (
                          <button
                            type="button"
                            onClick={() => handleCopyOtp(msg.otp!, msg.id)}
                            className="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] inline-flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                          >
                            {copiedId === msg.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedId === msg.id ? 'Copied' : 'Copy OTP'}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(msg.message);
                              setCopiedId(msg.id);
                              setTimeout(() => setCopiedId(null), 2000);
                            }}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-sans text-[11px] inline-flex items-center gap-1 cursor-pointer"
                          >
                            {copiedId === msg.id ? 'Copied' : 'Copy'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Simulator Modal with Dynamic Partition Selection */}
      {showSimModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-bold text-white">Simulate Incoming SMS</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSimModal(false)}
                className="text-slate-400 hover:text-white text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Instantly push a mock incoming SMS into KB MAX to test live client audio, real-time OTP detection, and relay.
            </p>

            <form onSubmit={handleSimulateSms} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Target SMS Stream / Partition</label>
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
                            ? 'bg-indigo-600 text-white shadow-sm'
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
