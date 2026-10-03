import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Search, 
  Copy, 
  Check, 
  RefreshCw, 
  SlidersHorizontal, 
  Calendar, 
  Phone, 
  MessageSquare, 
  Layers, 
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
  Clock,
  X,
  FileSpreadsheet,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime, resolveRangeName } from '../../utils/countryLookup';
import type { SmsMessage, NumberRange, SmsReportGroup } from '../../types';

interface SMSReportsViewProps {
  embeddedInClient?: boolean;
}

/**
 * Formats date into Pakistan Standard Time "YYYY-MM-DD 00:00:00" and "YYYY-MM-DD 23:59:59"
 * matching the default display.
 */
function getTodayDateRange(): { from: string; to: string } {
  const pktDate = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const yyyy = pktDate.getUTCFullYear();
  const mm = String(pktDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(pktDate.getUTCDate()).padStart(2, '0');
  return {
    from: `${yyyy}-${mm}-${dd} 00:00:00`,
    to: `${yyyy}-${mm}-${dd} 23:59:59`,
  };
}

/**
 * Formats SMS message text into clean lines of maximum ~40 characters as requested.
 * Wraps naturally on word boundaries or at 40 characters for contiguous strings.
 */
function formatSmsInto40CharLines(text: string, maxCharsPerLine = 40): string {
  if (!text) return '';
  const paragraphs = text.split(/\r?\n/);
  const formattedParagraphs = paragraphs.map((para) => {
    const words = para.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if (!word) continue;

      if (word.length > maxCharsPerLine) {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = '';
        }
        for (let i = 0; i < word.length; i += maxCharsPerLine) {
          lines.push(word.slice(i, i + maxCharsPerLine));
        }
        continue;
      }

      if (!currentLine) {
        currentLine = word;
      } else if (currentLine.length + 1 + word.length <= maxCharsPerLine) {
        currentLine += ' ' + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines.join('\n');
  });

  return formattedParagraphs.join('\n');
}

export const SMSReportsView: React.FC<SMSReportsViewProps> = ({ embeddedInClient = false }) => {
  const { session } = useAuth();

  // Available Ranges for dropdown
  const [ranges, setRanges] = useState<NumberRange[]>([]);

  // Default From/To: Today 00:00:00 to 23:59:59
  const defaultDates = useMemo(() => getTodayDateRange(), []);
  const [fromDateStr, setFromDateStr] = useState<string>(defaultDates.from);
  const [toDateStr, setToDateStr] = useState<string>(defaultDates.to);
  const [selectedRange, setSelectedRange] = useState<string>('All');
  const [numberFilter, setNumberFilter] = useState<string>('');
  const [cliFilter, setCliFilter] = useState<string>('');

  // Group By State (Hour, Date, Month, Range, Number, CLI) - Client option removed as requested
  const [groupBy, setGroupBy] = useState<{
    hour: boolean;
    date: boolean;
    month: boolean;
    range: boolean;
    number: boolean;
    cli: boolean;
  }>({
    hour: false,
    date: false,
    month: false,
    range: false,
    number: false,
    cli: false,
  });

  // Table In-Search & Controls State
  const [tableSearch, setTableSearch] = useState<string>('');
  const [recordsPerPage, setRecordsPerPage] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showColumnsMenu, setShowColumnsMenu] = useState<boolean>(false);
  const columnsMenuRef = useRef<HTMLDivElement>(null);

  // Column Visibility toggles (Date, Range, Number, CLI, SMS) - Client column removed as requested
  const [visibleColumns, setVisibleColumns] = useState<{
    date: boolean;
    range: boolean;
    number: boolean;
    cli: boolean;
    sms: boolean;
  }>({
    date: true,
    range: true,
    number: true,
    cli: true,
    sms: true,
  });

  // Query Results State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [groups, setGroups] = useState<SmsReportGroup[]>([]);
  const [isGroupedMode, setIsGroupedMode] = useState<boolean>(false);
  const [appliedGroupFields, setAppliedGroupFields] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [filteredCount, setFilteredCount] = useState<number>(0);

  // Synchronized Buffer Capacity / Limit (50, 100, 150, 500, 1000, 5000, 10000, All)
  const [capacityLimit, setCapacityLimit] = useState<number | 'all'>(1000);
  const [showClearModal, setShowClearModal] = useState<boolean>(false);
  const [clearTarget, setClearTarget] = useState<'client' | 'table' | 'all'>('client');
  const [isClearing, setIsClearing] = useState<boolean>(false);

  // Close columns dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) {
        setShowColumnsMenu(false);
      }
    };
    if (showColumnsMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showColumnsMenu]);

  // Fetch Ranges for dropdown
  useEffect(() => {
    if (!session) return;
    fetch('/api/ranges', {
      headers: { Authorization: `Bearer ${session.token}` },
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.ranges) {
          setRanges(data.ranges);
        }
      })
      .catch(() => {});
  }, [session]);

  // Parse date string reliably
  const parseSafeDate = (dStr: string): number => {
    if (!dStr || !dStr.trim()) return NaN;
    const isoFormat = dStr.trim().replace(' ', 'T');
    const t = new Date(isoFormat).getTime();
    if (!isNaN(t)) return t;
    return new Date(dStr).getTime();
  };

  // Execute Show Report Query (Strictly on button click)
  const handleShowReport = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);

    try {
      // Determine active group fields at execution time
      const activeGroups = Object.entries(groupBy)
        .filter(([_, active]) => active)
        .map(([key]) => key);

      const parsedFrom = parseSafeDate(fromDateStr);
      const parsedTo = parseSafeDate(toDateStr);

      const params = new URLSearchParams();
      if (!isNaN(parsedFrom)) params.set('from', String(parsedFrom));
      if (!isNaN(parsedTo)) params.set('to', String(parsedTo));
      if (selectedRange && selectedRange !== 'All') params.set('range', selectedRange);
      if (numberFilter.trim()) params.set('number', numberFilter.trim());
      if (cliFilter.trim()) params.set('cli', cliFilter.trim());
      if (tableSearch.trim()) params.set('q', tableSearch.trim());
      if (activeGroups.length > 0) params.set('groupBy', activeGroups.join(','));
      const queryLimit = capacityLimit === 'all' ? '50000' : String(capacityLimit || 1000);
      params.set('limit', queryLimit);

      const res = await fetch(`/api/sms/reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setTotalCount(data.totalCount || 0);
        setFilteredCount(data.filteredCount || 0);

        if (activeGroups.length > 0 && Array.isArray(data.groups)) {
          setGroups(data.groups);
          setMessages([]);
          setIsGroupedMode(true);
          setAppliedGroupFields(activeGroups);
        } else {
          const newMsgs: SmsMessage[] = data.messages || [];
          setMessages(newMsgs);
          setGroups([]);
          setIsGroupedMode(false);
          setAppliedGroupFields([]);
        }
        setCurrentPage(1);
      }
    } catch (err) {
      console.error('Failed to load SMS report', err);
    } finally {
      setIsLoading(false);
    }
  }, [session, fromDateStr, toDateStr, selectedRange, numberFilter, cliFilter, groupBy, tableSearch, capacityLimit]);

  // Synchronize capacity / retention limit with Live SMS gateway settings
  const handleCapacityChange = async (newLimit: number | 'all') => {
    setCapacityLimit(newLimit);
    if (!session) return;
    try {
      const capNum = newLimit === 'all' ? 50000 : newLimit;
      await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          clientMaxRetention: capNum,
          maxSmsRetention: capNum,
        }),
      });
    } catch {
      // Ignore
    }
  };

  // Clear Logs handler (Support clearing client logs, table, or master buffer)
  const handleConfirmClear = async () => {
    if (!session) return;
    setIsClearing(true);
    try {
      if (clearTarget === 'table') {
        setMessages([]);
        setGroups([]);
        setTotalCount(0);
        setFilteredCount(0);
      } else {
        const url = `/api/sms/clear?target=${encodeURIComponent(clearTarget)}`;
        await fetch(url, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${session.token}` },
        });
        setMessages([]);
        setGroups([]);
        setTotalCount(0);
        setFilteredCount(0);
      }
    } catch {
      // Ignore
    } finally {
      setIsClearing(false);
      setShowClearModal(false);
    }
  };

  // Initial load on mount
  useEffect(() => {
    handleShowReport();
  }, []);

  // Filter messages / groups locally with tableSearch for instant responsiveness
  const displayItems = useMemo(() => {
    if (isGroupedMode) {
      if (!tableSearch.trim()) return groups;
      const q = tableSearch.toLowerCase().trim();
      return groups.filter(g => {
        return Object.values(g).some(val => String(val).toLowerCase().includes(q));
      });
    } else {
      if (!tableSearch.trim()) return messages;
      const q = tableSearch.toLowerCase().trim();
      return messages.filter(m => {
        const rName = m.rangeName || resolveRangeName(m.country, m.phone, ranges);
        return (
          (m.phone || '').toLowerCase().includes(q) ||
          (m.cli || m.service || m.sender || '').toLowerCase().includes(q) ||
          (m.message || '').toLowerCase().includes(q) ||
          rName.toLowerCase().includes(q)
        );
      });
    }
  }, [isGroupedMode, groups, messages, tableSearch, ranges]);

  // Pagination calculation
  const totalEntries = displayItems.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / recordsPerPage));
  const safePage = Math.max(1, Math.min(currentPage, totalPages));
  const startIndex = (safePage - 1) * recordsPerPage;
  const paginatedItems = displayItems.slice(startIndex, startIndex + recordsPerPage);

  // Toggle individual Group By checkbox
  const handleToggleGroup = (field: keyof typeof groupBy) => {
    setGroupBy(prev => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  // Export functions (Copy, CSV, Excel, PDF)
  const handleExportCopy = () => {
    if (displayItems.length === 0) {
      alert('No data to copy.');
      return;
    }
    if (isGroupedMode) {
      const activeKeys = appliedGroupFields;
      const header = [...activeKeys.map(k => k.toUpperCase()), 'TOTAL'].join('\t');
      const rows = (displayItems as SmsReportGroup[]).map(g => {
        return [...activeKeys.map(k => g[k] || ''), g.count].join('\t');
      });
      navigator.clipboard.writeText([header, ...rows].join('\n'));
    } else {
      const header = ['Date', 'Range', 'Number', 'CLI', 'SMS'].join('\t');
      const rows = (displayItems as SmsMessage[]).map(m => {
        const rName = m.rangeName || resolveRangeName(m.country, m.phone, ranges);
        const cliName = m.cli || m.service || m.sender || 'Direct';
        return [
          formatDateTime(m.timestamp),
          rName,
          m.phone,
          cliName,
          m.message.replace(/\t|\n/g, ' ')
        ].join('\t');
      });
      navigator.clipboard.writeText([header, ...rows].join('\n'));
    }
    setCopiedId('table-all');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportCsv = () => {
    if (displayItems.length === 0) {
      alert('No data to export.');
      return;
    }
    let csvContent = 'data:text/csv;charset=utf-8,';
    if (isGroupedMode) {
      const activeKeys = appliedGroupFields;
      const header = [...activeKeys.map(k => k.toUpperCase()), 'TOTAL'].join(',');
      const rows = (displayItems as SmsReportGroup[]).map(g => {
        return [...activeKeys.map(k => `"${String(g[k] || '').replace(/"/g, '""')}"`), g.count].join(',');
      });
      csvContent += [header, ...rows].join('\n');
    } else {
      const header = ['Date', 'Range', 'Number', 'CLI', 'SMS'].join(',');
      const rows = (displayItems as SmsMessage[]).map(m => {
        const rName = m.rangeName || resolveRangeName(m.country, m.phone, ranges);
        const cliName = m.cli || m.service || m.sender || 'Direct';
        return [
          `"${formatDateTime(m.timestamp)}"`,
          `"${rName.replace(/"/g, '""')}"`,
          `"${(m.phone || '').replace(/"/g, '""')}"`,
          `"${cliName.replace(/"/g, '""')}"`,
          `"${(m.message || '').replace(/"/g, '""')}"`
        ].join(',');
      });
      csvContent += [header, ...rows].join('\n');
    }
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SMS_Reports_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    if (displayItems.length === 0) {
      alert('No data to export.');
      return;
    }
    let exportData: any[] = [];
    if (isGroupedMode) {
      const activeKeys = appliedGroupFields;
      exportData = (displayItems as SmsReportGroup[]).map(g => {
        const item: any = {};
        for (const k of activeKeys) {
          item[k.toUpperCase()] = g[k] || '';
        }
        item['TOTAL'] = g.count;
        return item;
      });
    } else {
      exportData = (displayItems as SmsMessage[]).map(m => ({
        'Date': formatDateTime(m.timestamp),
        'Range': m.rangeName || resolveRangeName(m.country, m.phone, ranges),
        'Number': m.phone,
        'CLI': m.cli || m.service || m.sender || 'Direct',
        'SMS': m.message,
      }));
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'SMS Reports');
    XLSX.writeFile(workbook, `SMS_Reports_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-[#edf2f7] p-2.5 sm:p-5 lg:p-6 font-sans text-slate-800 -m-2 sm:-m-4 lg:-m-6">
      <div className="max-w-4xl mx-auto space-y-4" id="sms-reports-view">
        
        {/* TOP HEADER: Clean Title, Log Capacity Selector, Clear Logs Button, and Refresh */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-1 px-0.5">
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-serif font-bold text-slate-800 tracking-tight select-none">
              SMS Reports
            </h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              Live Gateway Sync
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Box Capacity / Buffer Size Selector (50, 100, 150, 500, 1000, 5000, 10000, All) */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs shadow-2xs">
              <span className="text-slate-500 font-medium">Box Limit:</span>
              <select
                value={capacityLimit}
                onChange={(e) => {
                  const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                  handleCapacityChange(val);
                }}
                className="bg-transparent font-bold text-blue-700 focus:outline-none cursor-pointer"
                title="Synchronized live retention & report buffer size"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={150}>150</option>
                <option value={500}>500</option>
                <option value={1000}>1,000</option>
                <option value={5000}>5,000</option>
                <option value={10000}>10,000</option>
                <option value="all">All</option>
              </select>
            </div>

            {/* Clear Logs Button */}
            <button
              type="button"
              onClick={() => setShowClearModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              title="Clear Logs"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span>Clear Logs</span>
            </button>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={handleShowReport}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh Report"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Clear Logs Confirmation Modal */}
        {showClearModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 animate-fadeIn">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Clear Logs Management</h3>
                  <p className="text-xs text-slate-500">Choose log scope to clear</p>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <label 
                  onClick={() => setClearTarget('client')}
                  className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                    clearTarget === 'client' ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="clearScope"
                    checked={clearTarget === 'client'}
                    onChange={() => setClearTarget('client')}
                    className="mt-0.5 text-blue-600 focus:ring-0"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-800">Clear Client Portal Logs (Recommended)</div>
                    <div className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                      Clears logs from client screens & history. Admin records remain saved and Dashboard cumulative counts never drop.
                    </div>
                  </div>
                </label>

                <label 
                  onClick={() => setClearTarget('table')}
                  className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                    clearTarget === 'table' ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="clearScope"
                    checked={clearTarget === 'table'}
                    onChange={() => setClearTarget('table')}
                    className="mt-0.5 text-blue-600 focus:ring-0"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-800">Clear Current Report Results</div>
                    <div className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                      Empties the current report table and results without clearing backend logs.
                    </div>
                  </div>
                </label>

                <label 
                  onClick={() => setClearTarget('all')}
                  className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                    clearTarget === 'all' ? 'border-rose-500 bg-rose-50/60 ring-2 ring-rose-500/20' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="clearScope"
                    checked={clearTarget === 'all'}
                    onChange={() => setClearTarget('all')}
                    className="mt-0.5 text-rose-600 focus:ring-0"
                  />
                  <div>
                    <div className="text-xs font-bold text-rose-800">Clear Master Live Stream Buffer</div>
                    <div className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                      Flushes live gateway buffer memory. Dashboard cumulative total SMS count is permanent and will not decrease.
                    </div>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowClearModal(false)}
                  disabled={isClearing}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClear}
                  disabled={isClearing}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isClearing ? 'Clearing...' : 'Confirm Clear'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MAIN FILTER CARD: Side-by-side inputs (From & To in Row 1, Range, CLI, Number in Row 2) */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
          <form onSubmit={(e) => { e.preventDefault(); handleShowReport(); }} className="space-y-4">
            {/* Inputs Grid: Row 1 = From & To (Horizontally side-by-side in one row) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-serif text-slate-500 mb-1">
                  From
                </label>
                <input
                  type="text"
                  value={fromDateStr}
                  onChange={(e) => setFromDateStr(e.target.value)}
                  placeholder="YYYY-MM-DD HH:mm:ss"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 font-sans shadow-2xs focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-serif text-slate-500 mb-1">
                  To
                </label>
                <input
                  type="text"
                  value={toDateStr}
                  onChange={(e) => setToDateStr(e.target.value)}
                  placeholder="YYYY-MM-DD HH:mm:ss"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 font-sans shadow-2xs focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            {/* Row 2 = Range, CLI, Number (Clean symmetrical boxes side-by-side) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-serif text-slate-500 mb-1">
                  Range
                </label>
                <div className="relative">
                  <select
                    value={selectedRange}
                    onChange={(e) => setSelectedRange(e.target.value)}
                    className="w-full appearance-none px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 font-sans shadow-2xs focus:outline-none focus:border-blue-500 cursor-pointer pr-8 transition-colors"
                  >
                    <option value="All">All</option>
                    {ranges.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-serif text-slate-500 mb-1">
                  CLI
                </label>
                <input
                  type="text"
                  value={cliFilter}
                  onChange={(e) => setCliFilter(e.target.value)}
                  placeholder="CLI contains..."
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 font-sans shadow-2xs focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-serif text-slate-500 mb-1">
                  Number
                </label>
                <input
                  type="text"
                  value={numberFilter}
                  onChange={(e) => setNumberFilter(e.target.value)}
                  placeholder="Number contains..."
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 font-sans shadow-2xs focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            {/* Group By Section with 6 neat chips (Client removed) */}
            <div className="pt-2 border-t border-slate-100 space-y-2.5">
              <div className="text-xs sm:text-sm font-medium text-slate-700">
                Group By :
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { key: 'hour', label: 'Hour' },
                    { key: 'date', label: 'Date' },
                    { key: 'month', label: 'Month' },
                    { key: 'range', label: 'Range' },
                    { key: 'number', label: 'Number' },
                    { key: 'cli', label: 'CLI' },
                  ] as const
                ).map(({ key, label }) => {
                  const isChecked = groupBy[key];
                  return (
                    <label
                      key={key}
                      onClick={() => handleToggleGroup(key)}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium cursor-pointer transition-all select-none shadow-2xs ${
                        isChecked
                          ? 'border-blue-500 bg-blue-50 text-blue-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons: Export Report (Amber/Orange) & Show Report (Vivid Blue) */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={handleExportExcel}
                className="w-full py-2.5 sm:py-3 px-4 rounded-xl bg-[#d97706] hover:bg-[#b45309] active:scale-[0.98] text-white font-medium text-sm sm:text-base shadow-xs transition-all text-center cursor-pointer"
              >
                Export Report
              </button>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 sm:py-3 px-4 rounded-xl bg-[#0080c6] hover:bg-[#006ea8] active:scale-[0.98] text-white font-medium text-sm sm:text-base shadow-xs transition-all text-center cursor-pointer disabled:opacity-50"
              >
                {isLoading ? 'Loading...' : 'Show Report'}
              </button>
            </div>
          </form>
        </div>

        {/* TABLE CONTROLS & RESULTS CARD */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-5 shadow-xs space-y-3">
          {/* Row 1: Search & Show Records */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input with Magnifier */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => {
                  setTableSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Number, CLI, message, range..."
                className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-2xs font-sans transition-colors"
              />
              {tableSearch && (
                <button
                  type="button"
                  onClick={() => setTableSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Show Records Dropdown */}
            <div className="flex items-center gap-2 justify-end shrink-0">
              <span className="text-xs text-slate-600 font-medium whitespace-nowrap">
                Show Records
              </span>
              <div className="relative">
                <select
                  value={recordsPerPage}
                  onChange={(e) => {
                    setRecordsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="appearance-none pl-3 pr-7 py-1.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 focus:outline-none cursor-pointer shadow-2xs"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Row 2: Export Buttons (Copy, CSV, Excel, PDF) & Columns Dropdown */}
          <div className="flex items-center justify-between gap-2 pt-1 flex-wrap sm:flex-nowrap">
            {/* Export Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={handleExportCopy}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 shadow-2xs transition-colors cursor-pointer"
              >
                {copiedId === 'table-all' ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 shadow-2xs transition-colors cursor-pointer"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 shadow-2xs transition-colors cursor-pointer"
              >
                Excel
              </button>
              <button
                type="button"
                onClick={handlePrintPdf}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 shadow-2xs transition-colors cursor-pointer"
              >
                PDF
              </button>
            </div>

            {/* Columns Toggle on the Right */}
            {!isGroupedMode && (
              <div className="relative shrink-0 ml-auto" ref={columnsMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowColumnsMenu(!showColumnsMenu)}
                  className={`px-3.5 py-1.5 rounded-xl border text-xs font-medium shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer ${
                    showColumnsMenu
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                  id="columns-menu-toggle-btn"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                  <span>Columns</span>
                </button>

                {showColumnsMenu && (
                  <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-slate-200 rounded-2xl shadow-xl p-2.5 z-50 space-y-1 text-xs animate-fadeIn">
                    <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-slate-100 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      <span>Visible Columns</span>
                      <button
                        type="button"
                        onClick={() => setShowColumnsMenu(false)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {(['date', 'range', 'number', 'cli', 'sms'] as const).map((col) => (
                      <label
                        key={col}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-slate-700 capitalize transition-colors select-none"
                      >
                        <span className="font-medium text-xs">
                          {col === 'cli' ? 'CLI' : col === 'sms' ? 'SMS Message' : col}
                        </span>
                        <input
                          type="checkbox"
                          checked={visibleColumns[col]}
                          onChange={() => setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }))}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-0 cursor-pointer ml-3"
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Clean Data Table: Client column removed as requested */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 mt-2">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase text-[11px] tracking-wider">
                  {isGroupedMode ? (
                    <>
                      {appliedGroupFields.map((field) => (
                        <th key={field} className="py-3 px-3.5 border-r border-slate-200 capitalize font-mono text-slate-700">
                          {field}
                        </th>
                      ))}
                      <th className="py-3 px-3.5 text-right w-32 font-mono text-emerald-700 font-bold">
                        Total
                      </th>
                    </>
                  ) : (
                    <>
                      {visibleColumns.date && (
                        <th className="py-3 px-3.5 border-r border-slate-200 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>Date</span>
                          </div>
                        </th>
                      )}
                      {visibleColumns.range && (
                        <th className="py-3 px-3.5 border-r border-slate-200 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <Layers className="w-3.5 h-3.5 text-slate-400" />
                            <span>Range</span>
                          </div>
                        </th>
                      )}
                      {visibleColumns.number && (
                        <th className="py-3 px-3.5 border-r border-slate-200 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            <span>Number</span>
                          </div>
                        </th>
                      )}
                      {visibleColumns.cli && (
                        <th className="py-3 px-3.5 border-r border-slate-200 whitespace-nowrap">
                          <span className="text-slate-600">CLI</span>
                        </th>
                      )}
                      {visibleColumns.sms && (
                        <th className="py-3 px-3.5 min-w-[280px]">
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                            <span>SMS</span>
                          </div>
                        </th>
                      )}
                    </>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 font-sans">
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="py-14 text-center text-slate-500">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                      <span>Loading report records...</span>
                    </td>
                  </tr>
                ) : paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-14 text-center text-slate-500">
                      <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="font-semibold text-slate-700">No records found matching filters</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Adjust your date range or filters and click "Show Report".
                      </p>
                    </td>
                  </tr>
                ) : isGroupedMode ? (
                  // Grouped Table Rows
                  (paginatedItems as SmsReportGroup[]).map((group, idx) => {
                    const activeKeys = appliedGroupFields;
                    return (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        {activeKeys.map((k) => (
                          <td key={k} className="py-3 px-3.5 font-mono border-r border-slate-100 text-slate-800">
                            {group[k] || 'N/A'}
                          </td>
                        ))}
                        <td className="py-3 px-3.5 text-right font-mono font-bold text-emerald-700">
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {group.count.toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  // Normal SMS Table Rows (Client column removed)
                  (paginatedItems as SmsMessage[]).map((msg) => {
                    const dateStr = formatDateTime(msg.timestamp);
                    const rangeName = msg.rangeName || resolveRangeName(msg.country, msg.phone, ranges);
                    const cliName = (msg.cli || msg.service || msg.sender || 'Direct').trim();

                    return (
                      <tr key={msg.id} className="hover:bg-slate-50 transition-colors">
                        {visibleColumns.date && (
                          <td className="py-3 px-3.5 font-mono text-[11px] text-slate-500 whitespace-nowrap border-r border-slate-100">
                            {dateStr}
                          </td>
                        )}
                        {visibleColumns.range && (
                          <td className="py-3 px-3.5 whitespace-nowrap border-r border-slate-100">
                            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold border border-slate-200 text-[11px]">
                              {rangeName}
                            </span>
                          </td>
                        )}
                        {visibleColumns.number && (
                          <td className="py-3 px-3.5 font-mono font-bold text-sky-700 select-all whitespace-nowrap border-r border-slate-100">
                            {msg.phone}
                          </td>
                        )}
                        {visibleColumns.cli && (
                          <td className="py-3 px-3.5 whitespace-nowrap border-r border-slate-100">
                            <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 text-[11px] font-mono">
                              {cliName}
                            </span>
                          </td>
                        )}
                        {visibleColumns.sms && (
                          <td className="py-3 px-3.5">
                            <div className="w-[40ch] max-w-[40ch] p-3 rounded-xl bg-slate-50/90 border border-slate-200 text-slate-800 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words select-text">
                              {formatSmsInto40CharLines(msg.message, 40)}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer & Pagination */}
          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 font-medium text-slate-700">
                Total SMS: <strong className="text-slate-900 font-bold">{totalEntries.toLocaleString()}</strong>
              </span>
              <span className="text-[11px] text-slate-500">
                Showing {totalEntries > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + recordsPerPage, totalEntries)} of {totalEntries.toLocaleString()} entries
              </span>
            </div>

            {/* Pagination Buttons */}
            <div className="flex items-center gap-1.5 font-sans">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage(safePage - 1)}
                className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 cursor-pointer transition-colors shadow-2xs"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) pageNum = i + 1;
                else if (safePage <= 3) pageNum = i + 1;
                else if (safePage >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = safePage - 2 + i;

                const isCurrent = safePage === pageNum;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-7 h-7 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
                      isCurrent
                        ? 'bg-[#0080c6] text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage(safePage + 1)}
                className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 cursor-pointer transition-colors shadow-2xs"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SMSReportsView;
