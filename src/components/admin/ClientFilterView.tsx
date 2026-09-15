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
  Info
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ClientFilterRule } from '../../types';

export const ClientFilterView: React.FC = () => {
  const { session } = useAuth();
  const [rules, setRules] = useState<ClientFilterRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'cli' | 'sms_body'>('all');

  // Form state for creating new rule
  const [targetType, setTargetType] = useState<'cli' | 'sms_body'>('cli');
  const [pattern, setPattern] = useState('');
  const [matchType, setMatchType] = useState<'contains' | 'exact' | 'starts_with'>('contains');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Live Tester state
  const [testCli, setTestCli] = useState('');
  const [testBody, setTestBody] = useState('');

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
      setFormError('Please enter a CLI or SMS body pattern/keyword to block.');
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
        setFormError(data.error || 'Failed to create filter rule');
        return;
      }

      setFormSuccess(`Blacklist rule added: All matching ${targetType === 'cli' ? 'CLIs' : 'SMS text'} are now hidden from Client panels.`);
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
    if (!window.confirm('Are you sure you want to delete this blacklist rule? Clients will be able to see matching SMS again.')) {
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
    if (!testCli.trim() && !testBody.trim()) return null;

    const activeRules = rules.filter((r) => r.enabled);
    const cliLower = testCli.toLowerCase().trim();
    const bodyLower = testBody.toLowerCase().trim();

    for (const rule of activeRules) {
      const pat = rule.pattern.toLowerCase().trim();
      if (!pat) continue;

      if (rule.type === 'cli' && cliLower) {
        if (rule.matchType === 'exact' && cliLower === pat) {
          return { blocked: true, rule, reason: `Matches CLI rule (Exact match: "${rule.pattern}")` };
        }
        if (rule.matchType === 'starts_with' && cliLower.startsWith(pat)) {
          return { blocked: true, rule, reason: `Matches CLI rule (Starts with: "${rule.pattern}")` };
        }
        if ((!rule.matchType || rule.matchType === 'contains') && cliLower.includes(pat)) {
          return { blocked: true, rule, reason: `Matches CLI rule (Contains: "${rule.pattern}")` };
        }
      }

      if (rule.type === 'sms_body' && bodyLower) {
        if (rule.matchType === 'exact' && bodyLower === pat) {
          return { blocked: true, rule, reason: `Matches SMS body rule (Exact match: "${rule.pattern}")` };
        }
        if (rule.matchType === 'starts_with' && bodyLower.startsWith(pat)) {
          return { blocked: true, rule, reason: `Matches SMS body rule (Starts with: "${rule.pattern}")` };
        }
        if ((!rule.matchType || rule.matchType === 'contains') && bodyLower.includes(pat)) {
          return { blocked: true, rule, reason: `Matches SMS body rule (Contains: "${rule.pattern}")` };
        }
      }
    }

    return { blocked: false, reason: 'Allowed: This SMS will be visible in Client panels' };
  }, [rules, testCli, testBody]);

  const activeCount = rules.filter((r) => r.enabled).length;
  const cliCount = rules.filter((r) => r.type === 'cli').length;
  const bodyCount = rules.filter((r) => r.type === 'sms_body').length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                Clients CLI & SMS Filter
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-400 border border-amber-500/30 font-mono">
                  Blacklist
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Hide specific CLIs (Sender IDs) or SMS text from Client Panels while keeping them visible in Admin.
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
            <span className="text-slate-400">CLI Rules: </span>
            <span className="text-sky-400 font-bold">{cliCount}</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
            <span className="text-slate-400">Body Rules: </span>
            <span className="text-purple-400 font-bold">{bodyCount}</span>
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

      {/* Grid: Left Column (Add Rule & Simulator), Right Column (Rules List) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form & Simulator */}
        <div className="lg:col-span-5 space-y-6">
          {/* Create Rule Form */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
              <Plus className="w-4 h-4 text-emerald-400" />
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
              {/* Type Selection */}
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
                    <span>CLI / Sender ID</span>
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
                    <span>SMS Body Content</span>
                  </button>
                </div>
              </div>

              {/* Pattern / Keyword Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {targetType === 'cli' ? 'CLI / Sender to Block' : 'SMS Text / Keyword to Block'}
                </label>
                <input
                  type="text"
                  required
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  placeholder={
                    targetType === 'cli'
                      ? 'e.g. WHATSAPP, FACEBOOK, +1202, TEST_CLI...'
                      : 'e.g. sensitive_code, confidential, otp test...'
                  }
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs font-mono focus:outline-none focus:border-amber-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  {targetType === 'cli'
                    ? 'Any SMS arriving with this CLI/Sender will NOT be delivered or shown to clients.'
                    : 'Any SMS containing this word or phrase will NOT be shown to clients.'}
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
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500 font-sans cursor-pointer"
                >
                  <option value="contains">Contains (Default - Matches if pattern is anywhere in text)</option>
                  <option value="exact">Exact Match (Strictly identical match)</option>
                  <option value="starts_with">Starts With (Matches beginning of text or phone)</option>
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
                  placeholder="e.g. Private route testing, competitor filter, etc."
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-amber-500 font-sans"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || !pattern.trim()}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white text-xs font-bold rounded-xl shadow-lg shadow-amber-950/40 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
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
              Type any CLI or SMS content below to test if your active rules will hide it from clients.
            </p>

            <div className="space-y-2.5">
              <input
                type="text"
                value={testCli}
                onChange={(e) => setTestCli(e.target.value)}
                placeholder="Test CLI / Sender ID (e.g. WhatsApp)"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs font-mono focus:outline-none focus:border-sky-500"
              />
              <textarea
                value={testBody}
                onChange={(e) => setTestBody(e.target.value)}
                placeholder="Test SMS Message body (e.g. Your verification code is 123456)"
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
                className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-amber-500 font-sans"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-slate-800 text-amber-400 font-bold'
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
                    ? 'bg-slate-800 text-sky-400 font-bold'
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
                    ? 'bg-slate-800 text-purple-400 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                SMS Body ({bodyCount})
              </button>
            </div>
          </div>

          {/* Rules List Cards */}
          {displayedRules.length === 0 ? (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-10 text-center space-y-3">
              <ShieldAlert className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-bold text-slate-300">No blacklist rules found</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {searchQuery
                  ? 'No rules match your current search query.'
                  : 'Add a CLI or SMS Body rule on the left to hide specific messages from client panels.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {displayedRules.map((rule) => (
                <div
                  key={rule.id}
                  className={`bg-slate-900/90 border rounded-2xl p-4 shadow-lg transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 ${
                    rule.enabled
                      ? 'border-slate-800 hover:border-slate-700'
                      : 'border-slate-800/50 opacity-60 bg-slate-950/40'
                  }`}
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold border ${
                          rule.type === 'cli'
                            ? 'bg-sky-950/80 text-sky-400 border-sky-500/30'
                            : 'bg-purple-950/80 text-purple-400 border-purple-500/30'
                        }`}
                      >
                        {rule.type === 'cli' ? <Phone className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                        <span>{rule.type === 'cli' ? 'CLI Rule' : 'SMS Body Rule'}</span>
                      </span>

                      <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-[10.5px] text-slate-400 font-mono">
                        {rule.matchType === 'exact' ? 'Exact Match' : rule.matchType === 'starts_with' ? 'Starts With' : 'Contains'}
                      </span>

                      {!rule.enabled && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          Paused
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-bold text-white bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 break-all select-all">
                        {rule.pattern}
                      </span>
                    </div>

                    {rule.notes && (
                      <p className="text-xs text-slate-400 flex items-center gap-1.5">
                        <Info className="w-3 h-3 text-slate-500 shrink-0" />
                        <span>{rule.notes}</span>
                      </p>
                    )}
                  </div>

                  {/* Right Actions: Toggle & Delete */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/80 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => handleToggle(rule.id)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        rule.enabled
                          ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-400 hover:bg-emerald-950'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                      title={rule.enabled ? 'Click to Pause Rule' : 'Click to Activate Rule'}
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>{rule.enabled ? 'Active' : 'Disabled'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(rule.id)}
                      className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-all cursor-pointer"
                      title="Delete Rule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
