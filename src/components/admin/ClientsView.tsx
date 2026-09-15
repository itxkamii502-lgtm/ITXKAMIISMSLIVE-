import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  UserPlus, 
  Trash2, 
  Edit3, 
  Key, 
  ShieldCheck, 
  ShieldAlert, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock,
  Power,
  Sparkles,
  Radio,
  AlertTriangle,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { THEMES } from '../../utils/theme';
import type { ClientAccount } from '../../types';

export const ClientsView: React.FC = () => {
  const { session, settings } = useAuth();
  const theme = settings?.theme ? THEMES[settings.theme] : THEMES.emerald;

  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientAccount | null>(null);
  const [clientToDelete, setClientToDelete] = useState<ClientAccount | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [messageNotice, setMessageNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    allowedServices: '*' as string, // '*' or comma separated
    notes: '',
    status: 'active' as 'active' | 'inactive',
    maxConcurrentSessions: 3,
  });

  const fetchClients = async () => {
    if (!session) return;
    try {
      const res = await fetch('/api/clients', {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients || []);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchClients();
    const interval = setInterval(fetchClients, 2500);
    return () => clearInterval(interval);
  }, [session]);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setMessageNotice({ text, type });
    setTimeout(() => setMessageNotice(null), 4000);
  };

  const handleOpenAdd = () => {
    setEditingClient(null);
    setFormData({
      username: '',
      password: 'client' + Math.floor(1000 + Math.random() * 9000),
      allowedServices: '*',
      notes: '',
      status: 'active',
      maxConcurrentSessions: 3,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: ClientAccount) => {
    setEditingClient(c);
    setFormData({
      username: c.username,
      password: c.password || '',
      allowedServices: c.allowedServices.join(', '),
      notes: c.notes || '',
      status: c.status,
      maxConcurrentSessions: c.maxConcurrentSessions || 3,
    });
    setIsModalOpen(true);
  };

  const handleUnlockClient = async (clientId: string) => {
    if (!session) return;
    setActionLoadingId(clientId);
    try {
      const res = await fetch(`/api/clients/${clientId}/unlock`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (res.ok) {
        showToast('Client account unlocked immediately. Users can now sign in.', 'success');
        await fetchClients();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to unlock client', 'error');
      }
    } catch {
      showToast('Network error unlocking client', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResetSessions = async (clientId: string) => {
    if (!session) return;
    setActionLoadingId(clientId);
    try {
      const res = await fetch(`/api/clients/${clientId}/reset-sessions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        showToast(data.message || 'All active user sessions terminated.', 'success');
        await fetchClients();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to reset sessions', 'error');
      }
    } catch {
      showToast('Network error resetting sessions', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    const servicesArray = formData.allowedServices
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      username: formData.username,
      password: formData.password,
      allowedServices: servicesArray.length > 0 ? servicesArray : ['*'],
      notes: formData.notes,
      status: formData.status,
      maxConcurrentSessions: Number(formData.maxConcurrentSessions) || 3,
    };

    try {
      if (editingClient) {
        const res = await fetch(`/api/clients/${editingClient.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          showToast(`Client "${formData.username}" updated successfully.`, 'success');
          setIsModalOpen(false);
          fetchClients();
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to update client', 'error');
        }
      } else {
        const res = await fetch('/api/clients', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          showToast(`New Client "${formData.username}" created successfully.`, 'success');
          setIsModalOpen(false);
          fetchClients();
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to create client', 'error');
        }
      }
    } catch {
      showToast('Network error saving client account', 'error');
    }
  };

  const confirmDeleteClient = async () => {
    if (!clientToDelete || !session) return;
    setIsDeleting(true);

    try {
      // Optimistic update
      setClients((prev) => prev.filter((c) => c.id !== clientToDelete.id));

      const res = await fetch(`/api/clients/${clientToDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.token}` },
      });

      if (res.ok) {
        showToast(`Client "${clientToDelete.username}" deleted successfully!`, 'success');
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to delete client', 'error');
      }
      fetchClients();
    } catch {
      showToast('Network error while deleting client', 'error');
      fetchClients();
    } finally {
      setIsDeleting(false);
      setClientToDelete(null);
    }
  };

  const togglePasswordVisibility = (id: string) => {
    setShowPasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6" id="admin-clients-view">
      {/* Header Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold">
              CLIENT ACCESS CONTROL
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Client Accounts
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl">
            Create client credentials for Live SMS stream access. Each client session is strictly restricted to Live SMS with an automatic 5-minute timeout.
          </p>
        </div>

        <button
          id="btn-add-new-client"
          type="button"
          onClick={handleOpenAdd}
          className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add New Client</span>
        </button>
      </div>

      {/* Notice Banner */}
      <AnimatePresence>
        {messageNotice && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-4 rounded-2xl text-xs flex items-center gap-2.5 font-medium ${
              messageNotice.type === 'success'
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
            }`}
          >
            {messageNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{messageNotice.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clients Cards / Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Registered Clients ({clients.length})</h3>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            Auto-Logout: {settings?.clientSessionMinutes || 5} min session limit
          </span>
        </div>

        {clients.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <Users className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-300">No client accounts created yet</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Click &quot;Add New Client&quot; to generate login credentials for your clients or customers.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Client User</th>
                  <th className="py-3 px-4">Password</th>
                  <th className="py-3 px-4">Allowed Services</th>
                  <th className="py-3 px-4">Status & Sessions</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {clients.map((c) => {
                  const isVisible = !!showPasswords[c.id];
                  return (
                    <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* Username */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-emerald-400">
                            {c.username.slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-white block font-mono text-xs">{c.username}</span>
                            {c.notes && <span className="text-[10px] text-slate-400 block">{c.notes}</span>}
                          </div>
                        </div>
                      </td>

                      {/* Password with Eye Toggle */}
                      <td className="py-3.5 px-4 font-mono">
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-950 border border-slate-800">
                          <span className="text-slate-300 font-bold">
                            {isVisible ? c.password : '••••••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePasswordVisibility(c.id)}
                            className="text-slate-500 hover:text-slate-300 p-0.5 ml-1"
                            title={isVisible ? 'Hide Password' : 'Show Password'}
                          >
                            {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>

                      {/* Allowed Services */}
                      <td className="py-3.5 px-4">
                        {c.allowedServices.includes('*') ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            <Sparkles className="w-3 h-3" />
                            <span>ALL SERVICES (*)</span>
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {c.allowedServices.map((s) => (
                              <span
                                key={s}
                                className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Status & Sessions */}
                      <td className="py-3.5 px-4">
                        {(() => {
                          const isLocked = !!c.isLocked || (!!c.lockedUntil && Date.now() < c.lockedUntil);
                          const remainingSec = c.lockedUntil ? Math.max(0, Math.floor((c.lockedUntil - Date.now()) / 1000)) : 0;
                          const remMin = Math.floor(remainingSec / 60);
                          const remSec = remainingSec % 60;
                          const remTimeStr = `${remMin}m ${remSec}s`;
                          const maxLimit = c.maxConcurrentSessions || 3;
                          const onlineCount = c.activeSessionsCount || 0;

                          if (isLocked) {
                            return (
                              <div className="space-y-1.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                                  <ShieldAlert className="w-3 h-3 text-rose-400" />
                                  <span>LOCKED (4 USERS VIOLATION)</span>
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono text-amber-300 font-bold">
                                    ⏳ {remTimeStr} left
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleUnlockClient(c.id)}
                                    disabled={actionLoadingId === c.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold transition-all shadow-sm"
                                    title="Instant unlock client account"
                                  >
                                    <Unlock className="w-2.5 h-2.5" />
                                    <span>Unlock Now</span>
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    c.status === 'active'
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                  }`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      c.status === 'active' ? 'bg-emerald-400' : 'bg-rose-400'
                                    }`}
                                  />
                                  <span className="uppercase">{c.status}</span>
                                </span>

                                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                                  onlineCount >= maxLimit 
                                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' 
                                    : onlineCount > 0 
                                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' 
                                      : 'bg-slate-800 text-slate-400 border-slate-700'
                                }`}>
                                  {onlineCount}/{maxLimit} users online
                                </span>
                              </div>

                              {onlineCount > 0 && (
                                <div className="flex items-center gap-1 text-[10px]">
                                  <button
                                    type="button"
                                    onClick={() => handleResetSessions(c.id)}
                                    disabled={actionLoadingId === c.id}
                                    className="text-amber-400/90 hover:text-amber-200 underline flex items-center gap-1 font-mono"
                                    title="Force logout all connected users"
                                  >
                                    <Power className="w-2.5 h-2.5" />
                                    <span>Disconnect all users</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      {/* Created Date */}
                      <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {(c.isLocked || (c.lockedUntil && Date.now() < c.lockedUntil)) && (
                            <button
                              type="button"
                              onClick={() => handleUnlockClient(c.id)}
                              disabled={actionLoadingId === c.id}
                              className="p-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition-all"
                              title="Instant Unlock Client"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {(c.activeSessionsCount || 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => handleResetSessions(c.id)}
                              disabled={actionLoadingId === c.id}
                              className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 transition-all"
                              title="Disconnect all sessions"
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(c)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all"
                            title="Edit Client"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setClientToDelete(c)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-500/40 transition-all"
                            title="Delete Client"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {clientToDelete && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Delete Client Account</h3>
                  <p className="text-xs text-slate-400 font-mono">{clientToDelete.username}</p>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Are you sure you want to delete this client? Any active session for <span className="text-white font-bold font-mono">@{clientToDelete.username}</span> will be immediately terminated.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setClientToDelete(null)}
                  disabled={isDeleting}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteClient}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-all shadow-md active:scale-95"
                >
                  {isDeleting ? 'Deleting...' : 'Yes, Delete Client'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">
                  {editingClient ? `Edit Client (${editingClient.username})` : 'Create New Client User'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Client Username</label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="e.g. client_vip or partner1"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Client Password</label>
                <input
                  type="text"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Secret password"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Allowed SMS Services</label>
                <input
                  type="text"
                  value={formData.allowedServices}
                  onChange={(e) => setFormData({ ...formData, allowedServices: e.target.value })}
                  placeholder="* (for all) or WhatsApp, Telegram, Google"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-sans"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Type &quot;*&quot; for unrestricted SMS access, or separate service names with commas.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Max Concurrent Users (Limit: 3)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="10"
                    required
                    value={formData.maxConcurrentSessions}
                    onChange={(e) => setFormData({ ...formData, maxConcurrentSessions: parseInt(e.target.value) || 3 })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                  />
                </div>
                <p className="text-[10px] text-amber-400/90 mt-1">
                  🔒 Ek time mn sirf 3 users hi panel access kr skte hain. Agr 4th user access krne ki koshish kre ga to yeh client ID 15 minute k lye mukammal lock ho jaye gi (kisi k pas open nahi hogi).
                </p>
              </div>

              {editingClient && (editingClient.isLocked || (editingClient.lockedUntil && Date.now() < editingClient.lockedUntil)) && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-rose-300 text-xs">
                    <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Currently locked due to 4-user limit breach</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await handleUnlockClient(editingClient.id);
                      setIsModalOpen(false);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-all"
                  >
                    Unlock Now
                  </button>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Account Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                >
                  <option value="active">Active (Permit Live SMS Access)</option>
                  <option value="inactive">Inactive / Suspended (Block & Kick)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Internal Notes</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Optional customer reference or contact info"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold"
                >
                  {editingClient ? 'Update Client' : 'Create Client'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};
