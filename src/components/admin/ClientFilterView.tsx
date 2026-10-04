import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldAlert, 
  Plus, 
  Trash2, 
  Search, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  SlidersHorizontal,
  FileText,
  Phone,
  Power,
  Sparkles,
  Info,
  Layers,
  Globe
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ClientFilterRule } from '../../types';

export const ClientFilterView: React.FC = () => {
  const { session } = useAuth();
  const [rules, setRules] = useState<ClientFilterRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'cli' | 'sms_body' | 'range'>('all');

  // Form state for creating new blacklist rule
  const [targetType, setTargetType] = useState<'cli' | 'sms_body' | 'range' | 'all'>('cli');
  const [pattern, setPattern] = useState('');
  const [matchType, setMatchType] = useState<'contains' | 'exact' | 'starts_with'>('contains');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Live Tester state
  const [testCli, setTestCli] = useState('');
  const [testBody, setTestBody] = useState('');
  const [testRange, setTestRange] = useState('');

  const fetchRules = async () => {
    if (!session) return;
    try {
      setLoading(true);
      const res = await fetch('/api/client-filters', {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules || []);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, [session]);

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setFormError('');
    setFormSuccess('');

    const cleanPattern = pattern.trim();
    if (!cleanPattern) {
      setFormError('Please enter a CLI, App name, Range name, or SMS body keyword to block.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/client-filters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          type: targetType,
          pattern: cleanPattern,
          matchType,
          notes: notes.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setFormError(data.error || 'Failed to create blacklist rule');
        return;
      }

      setFormSuccess(`Blacklist rule added: Matching ${targetType.toUpperCase()} "${cleanPattern}" is now 100% blocked and hidden from all Client Panels.`);
      setPattern('');
      setNotes('');
      fetchRules();
    } catch (err: any) {
      setFormError(err?.message || 'Network error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (id: string) => {
    if (!session) return;
    try {
      const res = await fetch(`/api/client-filters/${id}/toggle`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules || []);
      }
    } catch {
      // Ignore
    }
  };

  const handleDelete = async (id: string) => {
    if (!session) return;
    if (!window.confirm('Are you sure you want to delete this blacklist rule? Clients will be able to receive matching SMS again.')) {
      return;
    }

    try {
      const res = await fetch(`/api/client-filters/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules || []);
      }
    } catch {
      // Ignore
    }
  };

  // Filtered rules for display
  const displayedRules = useMemo(() => {
    return rules.filter((r) => {
      const matchesType = filterType === 'all' || r.type === filterType;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || r.pattern.toLowerCase().includes(q) || (r.notes && r.notes.toLowerCase().includes(q));
      return matchesType && matchesSearch;
    });
  }, [rules, filterType, searchQuery]);

  // Live Tester calculation
  const testResult = useMemo(() => {
    if (!testCli.trim() && !testBody.trim() && !testRange.trim()) return null;

    const activeRules = rules.filter((r) => r.enabled);
    const cliLower = testCli.toLowerCase().trim();
    const bodyLower = testBody.toLowerCase().trim();
    const rangeLower = testRange.toLowerCase().trim();

    for (const rule of activeRules) {
      const rawPat = (rule.pattern || '').toLowerCase().trim();
      if (!rawPat) continue;

      const subPatterns = rawPat.includes(',')
        ? rawPat.split(',').map((p) => p.toLowerCase().trim()).filter(Boolean)
        : [rawPat];

      const matchType = rule.matchType || 'contains';

      for (const pat of subPatterns) {
        const checkStr = (val: string): boolean => {
          if (!val) return false;
          const clean = val.toLowerCase().trim();
          if (matchType === 'exact') return clean === pat;
          if (matchType === 'starts_with') return clean.startsWith(pat);
          return clean.includes(pat); // contains default
        };

        if (rule.type === 'cli') {
          if (checkStr(cliLower) || checkStr(bodyLower)) {
            return { blocked: true, rule, reason: `Matches CLI / App rule: "${pat}" (${matchType})` };
          }
        } else if (rule.type === 'sms_body') {
          if (checkStr(bodyLower) || checkStr(cliLower)) {
            return { blocked: true, rule, reason: `Matches SMS body keyword: "${pat}" (${matchType})` };
          }
        } else if (rule.type === 'range') {
          if (checkStr(rangeLower)) {
            return { blocked: true, rule, reason: `Matches Range / Country rule: "${pat}" (${matchType})` };
          }
        } else {
          // 'all'
          if (checkStr(cliLower) || checkStr(bodyLower) || checkStr(rangeLower)) {
            return { blocked: true, rule, reason: `Matches Global Blacklist rule: "${pat}" (${matchType})` };
          }
        }
      }
    }

    return { blocked: false, reason: 'Allowed: This SMS & OTP will be visible in Client panels' };
  }, [rules, testCli, testBody, testRange]);

  const activeCount = rules.filter((r) => r.enabled).length;
  const cliCount = rules.filter((r) => r.type === 'cli').length;
  const bodyCount = rules.filter((r) => r.type === 'sms_body').length;
  const rangeCount = rules.filter((r) => r.type === 'range').length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-md">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                Clients CLI, Range & SMS Blacklist
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-500/40 font-mono font-bold">
                  Strict Blacklist
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Block specific CLIs, App names, Range names, or SMS keywords from Client Panels (both Live SMS and Reports).
              </p>
            </div>
          </div>
        </div>

        {/* Quick Stats Chips */}
        <div className="flex items-center gap-2 flex-wrap sm:self-center">
          <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
            <span className="text-slate-400">Active Rules: </span>
            <span className="text-emerald-400 font-bold">{activeCount}</span> / {rules.length}
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
            <span className="text-slate-400">CLI: </span>
            <span className="text-sky-400 font-bold">{cliCount}</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
            <span className="text-slate-400">Body: </span>
            <span className="text-purple-400 font-bold">{bodyCount}</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
            <span className="text-slate-400">Range: </span>
            <span className="text-amber-400 font-bold">{rangeCount}</span>
          </div>
          <button
            type="button"
            onClick={fetchRules}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
            title="Refresh Rules"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Urdu & English Clarity Notice Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-start gap-3 text-xs text-slate-300">
        <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed">
          <div className="font-semibold text-white">
            How Client Blacklist Works:
          </div>
          <div className="text-slate-400">
            Whenever a rule is added below (e.g. CLI <code className="text-amber-300 font-mono">Apple</code>, Range <code className="text-amber-300 font-mono">Guinea Orange</code>, or Body <code className="text-amber-300 font-mono">code</code>), matching SMS and OTPs are <strong className="text-white">completely blocked and hidden</strong> from all Client screens and client reports. Admin retains all messages.
          </div>
          <div className="text-slate-500 font-sans pt-0.5" dir="rtl">
            جب آپ یہاں کسی ایپلیکیشن کا نام (جیسے Apple یا WhatsApp) یا کسی رینج کا نام بلیک لسٹ میں درج کریں گے، تو کلائنٹ کے پینل سے وہ پورا میسج اور او ٹی پی مکمل طور پر غائب ہو جائے گا اور ان کے پاس شو نہیں ہوگا۔
          </div>
        </div>
      </div>

      {/* Grid: Left Column (Add Rule & Simulator), Right Column (Rules List) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form & Simulator */}
        <div className="lg:col-span-5 space-y-6">
          {/* Create Rule Form */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
              <Plus className="w-4 h-4 text-rose-400" />
              <h2 className="text-sm font-bold text-white">Add New Blacklist Rule</h2>
            </div>

            {formError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{formSuccess}</span>
              </div>
            )}

            <form onSubmit={handleCreateRule} className="space-y-4">
              {/* Type Selection: CLI, SMS Body, Range Name, All */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Filter Target Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetType('cli')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      targetType === 'cli'
                        ? 'bg-sky-500/20 border-sky-500/50 text-sky-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>CLI / App Name</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetType('sms_body')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      targetType === 'sms_body'
                        ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>SMS Body Text</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetType('range')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      targetType === 'range'
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Range Name</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetType('all')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      targetType === 'all'
                        ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>All Fields (Any)</span>
                  </button>
                </div>
              </div>

              {/* Pattern / Keyword Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {targetType === 'cli' && 'CLI / Sender / App Name to Block'}
                  {targetType === 'sms_body' && 'SMS Text / Keyword to Block'}
                  {targetType === 'range' && 'Range Name or Country to Block'}
                  {targetType === 'all' && 'Global Keyword / Pattern to Block'}
                </label>
                <input
                  type="text"
                  required
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  placeholder={
                    targetType === 'cli'
                      ? 'e.g. Apple, WhatsApp, Google, Facebook, +1202...'
                      : targetType === 'sms_body'
                      ? 'e.g. Apple ID code, verification, confidential...'
                      : targetType === 'range'
                      ? 'e.g. Guinea Orange, Tanzania LX, Ukraine...'
                      : 'e.g. Apple, WhatsApp, RangeName...'
                  }
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs font-mono focus:outline-none focus:border-rose-500 transition-colors"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  {targetType === 'cli' && 'Any SMS matching this CLI, App name, or Sender will NOT be delivered to clients.'}
                  {targetType === 'sms_body' && 'Any SMS containing this word or phrase in its message body will be hidden from clients.'}
                  {targetType === 'range' && 'Any SMS coming from this Range or Country will NOT be shown or delivered to clients.'}
                  {targetType === 'all' && 'Matches anywhere in CLI, Sender, Body, Range, or Country.'}
                </p>
              </div>

              {/* Match Criteria */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Matching Criteria
                </label>
                <select
                  value={matchType}
                  onChange={(e: any) => setMatchType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-rose-500 font-sans cursor-pointer"
                >
                  <option value="contains">Contains (Default - Matches if pattern is anywhere in text)</option>
                  <option value="exact">Exact Match (Strictly identical match)</option>
                  <option value="starts_with">Starts With (Matches beginning of text)</option>
                </select>
              </div>

              {/* Optional Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Internal Note (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Blocked for privacy, competitor filter, etc."
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-rose-500 font-sans"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || !pattern.trim()}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-950/40 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>{isSubmitting ? 'Adding Rule...' : 'Save Blacklist Rule'}</span>
              </button>
            </form>
          </div>

          {/* Live Tester / Verification Tool */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3.5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-400" />
              <h2 className="text-sm font-bold text-white">Live Filter Simulator</h2>
            </div>
            <p className="text-xs text-slate-400">
              Type any CLI, Range, or SMS content below to test if your active rules will hide it from clients.
            </p>

            <div className="space-y-2.5">
              <input
                type="text"
                value={testCli}
                onChange={(e) => setTestCli(e.target.value)}
                placeholder="Test CLI / App Name (e.g. Apple, WhatsApp)"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs font-mono focus:outline-none focus:border-sky-500"
              />
              <input
                type="text"
                value={testRange}
                onChange={(e) => setTestRange(e.target.value)}
                placeholder="Test Range Name (e.g. Guinea Orange, Tanzania)"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs font-mono focus:outline-none focus:border-sky-500"
              />
              <textarea
                value={testBody}
                onChange={(e) => setTestBody(e.target.value)}
                placeholder="Test SMS Message body (e.g. Your Apple ID verification code is 123456)"
                rows={2}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-sky-500 resize-none font-sans"
              />
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 transition-all ${
                  testResult.blocked
                    ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                    : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                }`}
              >
                {testResult.blocked ? (
                  <XCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                )}
                <div>
                  <p className="font-bold">
                    {testResult.blocked ? 'BLOCKED from Client Panel' : 'ALLOWED for Client Panel'}
                  </p>
                  <p className="text-[11px] opacity-80 mt-0.5">{testResult.reason}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Existing Blacklist Rules List */}
        <div className="lg:col-span-7 space-y-4">
          {/* Controls Bar: Search & Category Filter */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search filter rules by pattern or notes..."
                className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-rose-500 font-sans"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 self-end sm:self-auto flex-wrap">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-slate-800 text-rose-400 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All ({rules.length})
              </button>

              <button
                type="button"
                onClick={() => setFilterType('cli')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  filterType === 'cli'
                    ? 'bg-sky-500/20 text-sky-400 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                CLI ({cliCount})
              </button>

              <button
                type="button"
                onClick={() => setFilterType('sms_body')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  filterType === 'sms_body'
                    ? 'bg-purple-500/20 text-purple-400 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Body ({bodyCount})
              </button>

              <button
                type="button"
                onClick={() => setFilterType('range')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  filterType === 'range'
                    ? 'bg-amber-500/20 text-amber-400 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Range ({rangeCount})
              </button>
            </div>
          </div>

          {/* Rules List Container */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            {displayedRules.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 mx-auto flex items-center justify-center text-slate-500">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">No Blacklist Rules Configured</p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Add a rule using the form on the left to block specific CLIs, App names, Range names, or SMS text from appearing in client consoles.
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {displayedRules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`p-4 flex items-center justify-between gap-4 transition-colors ${
                      rule.enabled ? 'hover:bg-slate-850/50' : 'bg-slate-950/40 opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-0.5">
                        {rule.type === 'cli' && (
                          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                            <Phone className="w-4 h-4" />
                          </div>
                        )}
                        {rule.type === 'sms_body' && (
                          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                            <FileText className="w-4 h-4" />
                          </div>
                        )}
                        {rule.type === 'range' && (
                          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                            <Layers className="w-4 h-4" />
                          </div>
                        )}
                        {rule.type === 'all' && (
                          <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                            <Globe className="w-4 h-4" />
                          </div>
                        )}
                      </div>

                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-bold text-white bg-slate-950 px-2.5 py-0.5 rounded-lg border border-slate-800 break-all">
                            {rule.pattern}
                          </span>

                          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {rule.matchType || 'contains'}
                          </span>

                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              rule.type === 'cli'
                                ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                                : rule.type === 'sms_body'
                                ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                                : rule.type === 'range'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            {rule.type === 'cli' ? 'CLI / APP' : rule.type === 'sms_body' ? 'SMS BODY' : rule.type === 'range' ? 'RANGE' : 'ALL FIELDS'}
                          </span>
                        </div>

                        {rule.notes && (
                          <p className="text-xs text-slate-400 italic">
                            "{rule.notes}"
                          </p>
                        )}

                        <div className="text-[11px] text-slate-500 font-mono">
                          Added: {new Date(rule.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggle(rule.id)}
                        className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                          rule.enabled
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                        title={rule.enabled ? 'Disable Rule' : 'Enable Rule'}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{rule.enabled ? 'Active' : 'Disabled'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(rule.id)}
                        className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors cursor-pointer"
                        title="Delete Rule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
