import React, { useState, useEffect, useRef } from 'react';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  Plus, 
  Layers, 
  Trash2, 
  Search, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  X, 
  Phone, 
  Hash, 
  Globe, 
  Filter, 
  Copy, 
  Check,
  FileText,
  ChevronRight,
  Database,
  Lock,
  ShieldAlert,
  KeyRound,
  Eye,
  EyeOff,
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
  Info,
  Shield
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { NumberRange } from '../../types';

interface BulkNumbersViewProps {
  token: string;
}

interface SecurityModalState {
  isOpen: boolean;
  type: 'delete_range' | 'clear_all_numbers';
  range: NumberRange | null;
  securityPin: string;
  error: string | null;
  isProcessing: boolean;
  showPin: boolean;
}

export const BulkNumbersView: React.FC<BulkNumbersViewProps> = ({ token }) => {
  // State for Ranges
  const [ranges, setRanges] = useState<NumberRange[]>([]);
  const [isLoadingRanges, setIsLoadingRanges] = useState(true);
  const [rangesSearch, setRangesSearch] = useState('');

  // Mode: 'create' | 'existing'
  const [rangeMode, setRangeMode] = useState<'create' | 'existing'>('create');

  // Create Range Form Fields
  const [newRangeName, setNewRangeName] = useState('');
  const [newRangePrefix, setNewRangePrefix] = useState('');
  const [newRangeNote, setNewRangeNote] = useState('');

  // Add to Existing Range Form Fields
  const [selectedRangeId, setSelectedRangeId] = useState('');

  // Numbers Buffer
  const [numbersText, setNumbersText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ 
    type: 'success' | 'error' | 'info'; 
    text: string;
    conflictSample?: { number: string; reason: string }[];
  } | null>(null);

  // File Upload Drag & Drop State
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Security PIN Confirmation Modal State
  const [securityModal, setSecurityModal] = useState<SecurityModalState>({
    isOpen: false,
    type: 'delete_range',
    range: null,
    securityPin: '',
    error: null,
    isProcessing: false,
    showPin: false,
  });

  // Duplicate Inspection Preview State
  const [duplicateCheckResult, setDuplicateCheckResult] = useState<{
    totalChecked: number;
    newCount: number;
    duplicateCount: number;
    duplicates: { number: string; reason: string; isCurrentRange: boolean }[];
  } | null>(null);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

  // Manage Range Modal
  const [managingRange, setManagingRange] = useState<NumberRange | null>(null);
  const [rangeNumbers, setRangeNumbers] = useState<string[]>([]);
  const [isLoadingNumbers, setIsLoadingNumbers] = useState(false);
  const [numbersSearchQuery, setNumbersSearchQuery] = useState('');
  const [numbersPage, setNumbersPage] = useState(1);
  const [totalNumbersInModal, setTotalNumbersInModal] = useState(0);
  const [selectedNumbersForRemoval, setSelectedNumbersForRemoval] = useState<Set<string>>(new Set());
  const [isRemovingNumbers, setIsRemovingNumbers] = useState(false);

  // Quick add & bulk upload inside modal
  const [quickAddText, setQuickAddText] = useState('');
  const [isQuickAdding, setIsQuickAdding] = useState(false);
  const [isModalBulkOpen, setIsModalBulkOpen] = useState(false);
  const [modalBulkText, setModalBulkText] = useState('');
  const [modalBulkFileName, setModalBulkFileName] = useState<string | null>(null);
  const [isModalBulkSubmitting, setIsModalBulkSubmitting] = useState(false);
  const modalFileInputRef = useRef<HTMLInputElement>(null);
  const [copiedNumber, setCopiedNumber] = useState<string | null>(null);

  // Fetch all ranges
  const fetchRanges = async () => {
    setIsLoadingRanges(true);
    try {
      const res = await fetch('/api/ranges', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const loadedRanges: NumberRange[] = data.ranges || [];
        setRanges(loadedRanges);
        if (loadedRanges.length > 0 && !selectedRangeId) {
          setSelectedRangeId(loadedRanges[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load number ranges', err);
    } finally {
      setIsLoadingRanges(false);
    }
  };

  useEffect(() => {
    fetchRanges();
  }, [token]);

  // Parse raw text into valid clean phone numbers
  const extractNumbersFromText = (raw: string): string[] => {
    if (!raw) return [];
    // Split by newlines, commas, semicolons, tabs, spaces
    const tokens = raw.split(/[\r\n,;\t]+/);
    const cleaned: string[] = [];
    for (const tok of tokens) {
      const digits = tok.replace(/[^\d]/g, '');
      if (digits.length >= 5) {
        cleaned.push(digits);
      }
    }
    return cleaned;
  };

  const parsedNumbers = extractNumbersFromText(numbersText);

  // Handle Drag & Drop / File Upload
  const processUploadedFile = async (file: File) => {
    setUploadedFileName(file.name);
    setStatusMessage({ type: 'info', text: `Reading file: ${file.name}...` });

    try {
      const extension = file.name.split('.').pop()?.toLowerCase();

      if (extension === 'xlsx' || extension === 'xls') {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        const extracted: string[] = [];
        for (const row of jsonData) {
          if (Array.isArray(row)) {
            for (const cell of row) {
              if (cell !== undefined && cell !== null) {
                const digits = String(cell).replace(/[^\d]/g, '');
                if (digits.length >= 5) {
                  extracted.push(digits);
                }
              }
            }
          }
        }

        if (extracted.length > 0) {
          const newText = extracted.join('\n');
          setNumbersText(prev => prev ? prev.trim() + '\n' + newText : newText);
          setStatusMessage({
            type: 'success',
            text: `Successfully extracted ${extracted.length.toLocaleString()} numbers from ${file.name}`,
          });
        } else {
          setStatusMessage({
            type: 'error',
            text: `No valid mobile numbers found in ${file.name}. Ensure cells contain numeric MSISDNs.`,
          });
        }
      } else {
        // Text, CSV, CXV, TSV
        const text = await file.text();
        const extracted = extractNumbersFromText(text);
        if (extracted.length > 0) {
          const newText = extracted.join('\n');
          setNumbersText(prev => prev ? prev.trim() + '\n' + newText : newText);
          setStatusMessage({
            type: 'success',
            text: `Successfully extracted ${extracted.length.toLocaleString()} numbers from ${file.name}`,
          });
        } else {
          setStatusMessage({
            type: 'error',
            text: `No numbers with 5+ digits could be identified in ${file.name}`,
          });
        }
      }
    } catch (err: any) {
      console.error('File parsing error', err);
      setStatusMessage({
        type: 'error',
        text: `Failed to parse file ${file.name}: ${err?.message || 'Invalid format'}`,
      });
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUploadedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processUploadedFile(e.target.files[0]);
    }
  };

  // Sample CSV generator for telecoms
  const handleDownloadSampleCsv = () => {
    const csvContent = 'data:text/csv;charset=utf-8,' + 
      'msisdn,country,carrier\n' +
      '224610351009,Guinea,Orange\n' +
      '224622114455,Guinea,Orange\n' +
      '224628990011,Guinea,Orange\n' +
      '224611223344,Guinea,Orange\n' +
      '255744123456,Tanzania,Vodacom\n' +
      '255744123457,Tanzania,Vodacom\n';
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'telecom_bulk_numbers_sample.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Quick Tools: Deduplicate
  const handleDeduplicateBuffer = () => {
    const currentList = extractNumbersFromText(numbersText);
    if (currentList.length === 0) return;

    const uniqueSet = new Set<string>();
    const uniqueList: string[] = [];
    let dupsCount = 0;

    for (const num of currentList) {
      if (uniqueSet.has(num)) {
        dupsCount++;
      } else {
        uniqueSet.add(num);
        uniqueList.push(num);
      }
    }

    setNumbersText(uniqueList.join('\n'));
    setStatusMessage({
      type: 'info',
      text: dupsCount > 0 
        ? `Cleaned buffer: Removed ${dupsCount} duplicate numbers. ${uniqueList.length} unique numbers remaining.`
        : `No duplicate numbers found in buffer. All ${uniqueList.length} numbers are unique.`,
    });
  };

  // Clean non-digits
  const handleCleanNonDigits = () => {
    const currentList = extractNumbersFromText(numbersText);
    setNumbersText(currentList.join('\n'));
    setStatusMessage({
      type: 'info',
      text: `Cleaned formatting on ${currentList.length} numbers.`,
    });
  };

  // Clear buffer
  const handleClearBuffer = () => {
    setNumbersText('');
    setUploadedFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setStatusMessage(null);
  };

  // Submit numbers to backend
  const handleSubmit = async () => {
    if (parsedNumbers.length === 0) {
      setStatusMessage({ type: 'error', text: 'Please enter or upload at least one valid phone number.' });
      return;
    }

    if (rangeMode === 'create') {
      if (!newRangeName.trim()) {
        setStatusMessage({ type: 'error', text: 'Please provide a Range Name (e.g. Tanzania LX 26Aug, Guinea Orange).' });
        return;
      }
      if (!newRangePrefix.trim()) {
        setStatusMessage({ type: 'error', text: 'Please provide a Country Prefix (e.g. 255, 224, 380).' });
        return;
      }
    } else {
      if (!selectedRangeId) {
        setStatusMessage({ type: 'error', text: 'Please select an existing range from the list.' });
        return;
      }
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const payload = rangeMode === 'create' ? {
        mode: 'create',
        name: newRangeName.trim(),
        prefix: newRangePrefix.trim().replace(/[^\d]/g, ''),
        countryNote: newRangeNote.trim() || undefined,
        numbers: parsedNumbers,
      } : {
        mode: 'existing',
        rangeId: selectedRangeId,
        numbers: parsedNumbers,
      };

      const res = await fetch('/api/ranges', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to assign numbers');
      }

      setStatusMessage({
        type: 'success',
        text: data.message || `Successfully processed numbers! Added ${data.addedCount} new numbers (${data.duplicateCount} duplicates skipped).`,
      });

      // Clear buffer & reset form on success
      setNumbersText('');
      setUploadedFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (rangeMode === 'create') {
        setNewRangeName('');
        setNewRangePrefix('');
        setNewRangeNote('');
      }

      // Refresh ranges list
      await fetchRanges();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Error communicating with server',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Numbers Management Modal for a Range
  const handleOpenManageRange = async (range: NumberRange) => {
    setManagingRange(range);
    setNumbersPage(1);
    setNumbersSearchQuery('');
    setSelectedNumbersForRemoval(new Set());
    await fetchRangeNumbers(range.id, '', 1);
  };

  const fetchRangeNumbers = async (rangeId: string, search: string, page: number) => {
    setIsLoadingNumbers(true);
    try {
      const q = new URLSearchParams({
        search,
        page: String(page),
        limit: '50',
      });
      const res = await fetch(`/api/ranges/${rangeId}/numbers?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRangeNumbers(data.numbers || []);
        setTotalNumbersInModal(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to load range numbers', err);
    } finally {
      setIsLoadingNumbers(false);
    }
  };

  // Remove individual or bulk numbers from range
  const handleRemoveNumbers = async (numbersToRemove: string[]) => {
    if (!managingRange || numbersToRemove.length === 0) return;
    if (!confirm(`Are you sure you want to remove ${numbersToRemove.length} number(s) from "${managingRange.name}"?`)) {
      return;
    }

    setIsRemovingNumbers(true);
    try {
      const res = await fetch(`/api/ranges/${managingRange.id}/numbers`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ numbers: numbersToRemove }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Refresh list
        setSelectedNumbersForRemoval(new Set());
        await fetchRangeNumbers(managingRange.id, numbersSearchQuery, numbersPage);
        await fetchRanges();
      } else {
        alert(data.error || 'Failed to remove numbers');
      }
    } catch (err) {
      console.error(err);
      alert('Network error removing numbers');
    } finally {
      setIsRemovingNumbers(false);
    }
  };

  // Quick add numbers inside modal
  const handleQuickAddInsideModal = async () => {
    if (!managingRange) return;
    const nums = extractNumbersFromText(quickAddText);
    if (nums.length === 0) {
      alert('Please enter at least one valid phone number');
      return;
    }

    setIsQuickAdding(true);
    try {
      const res = await fetch(`/api/ranges/${managingRange.id}/numbers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ numbers: nums }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setQuickAddText('');
        if (data.duplicateCount > 0) {
          alert(`Added ${data.addedCount} new numbers. Skipped ${data.duplicateCount} duplicate numbers (Rule: 1 Number = 1 Range Only).`);
        }
        await fetchRangeNumbers(managingRange.id, numbersSearchQuery, numbersPage);
        await fetchRanges();
      } else {
        alert(data.error || 'Failed to add numbers');
      }
    } catch (err) {
      console.error(err);
      alert('Network error adding numbers');
    } finally {
      setIsQuickAdding(false);
    }
  };

  // Bulk File Upload inside modal
  const handleModalBulkFileUpload = async (file: File) => {
    setModalBulkFileName(file.name);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      let textContent = '';

      if (['xlsx', 'xls'].includes(ext)) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const allTokens: string[] = [];
        for (const row of rows) {
          if (Array.isArray(row)) {
            for (const cell of row) {
              if (cell !== null && cell !== undefined) {
                allTokens.push(String(cell));
              }
            }
          }
        }
        textContent = allTokens.join('\n');
      } else {
        textContent = await file.text();
      }

      const extracted = extractNumbersFromText(textContent);
      if (extracted.length === 0) {
        alert('No valid numbers found in the uploaded file.');
        return;
      }

      setModalBulkText(extracted.join('\n'));
    } catch (err: any) {
      console.error(err);
      alert(`Error reading file: ${err.message}`);
    }
  };

  // Bulk submit inside modal
  const handleModalBulkSubmit = async () => {
    if (!managingRange) return;
    const nums = extractNumbersFromText(modalBulkText);
    if (nums.length === 0) {
      alert('Please enter or upload at least one valid phone number.');
      return;
    }

    setIsModalBulkSubmitting(true);
    try {
      const res = await fetch(`/api/ranges/${managingRange.id}/numbers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ numbers: nums }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setModalBulkText('');
        setModalBulkFileName(null);
        if (modalFileInputRef.current) modalFileInputRef.current.value = '';
        setIsModalBulkOpen(false);

        alert(data.duplicateCount > 0 
          ? `Added ${data.addedCount} new numbers. Skipped ${data.duplicateCount} duplicate numbers (Rule: 1 Number = 1 Range Only).`
          : `Successfully added all ${data.addedCount} numbers to range "${managingRange.name}".`
        );

        await fetchRangeNumbers(managingRange.id, numbersSearchQuery, numbersPage);
        await fetchRanges();
      } else {
        alert(data.error || 'Failed to add numbers to range');
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
    } finally {
      setIsModalBulkSubmitting(false);
    }
  };

  // Trigger Security PIN Modal for Range Delete
  const requestDeleteRange = (range: NumberRange) => {
    setSecurityModal({
      isOpen: true,
      type: 'delete_range',
      range,
      securityPin: '',
      error: null,
      isProcessing: false,
      showPin: false,
    });
  };

  // Trigger Security PIN Modal for Remove All Numbers
  const requestClearAllNumbers = (range: NumberRange) => {
    setSecurityModal({
      isOpen: true,
      type: 'clear_all_numbers',
      range,
      securityPin: '',
      error: null,
      isProcessing: false,
      showPin: false,
    });
  };

  // Execute Security PIN Action
  const handleExecuteSecurityAction = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!securityModal.range) return;
    const pin = securityModal.securityPin.trim();
    if (!pin) {
      setSecurityModal(prev => ({ ...prev, error: 'Security Master PIN is required.' }));
      return;
    }

    setSecurityModal(prev => ({ ...prev, isProcessing: true, error: null }));

    try {
      const rangeId = encodeURIComponent(securityModal.range.id);

      if (securityModal.type === 'delete_range') {
        // Use POST /api/ranges/:id/delete to avoid proxy issues with DELETE bodies
        const res = await fetch(`/api/ranges/${rangeId}/delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Security-PIN': pin,
          },
          body: JSON.stringify({ securityPin: pin }),
        });

        let data: any = {};
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          data = await res.json().catch(() => ({}));
        } else {
          const text = await res.text().catch(() => '');
          const cleanText = text.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
          data = { error: cleanText || `Server responded with status ${res.status}` };
        }

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to delete range. Please verify Security PIN.');
        }

        // Successfully deleted
        if (managingRange?.id === securityModal.range.id) {
          setManagingRange(null);
        }
        setSecurityModal(prev => ({ ...prev, isOpen: false }));
        setStatusMessage({
          type: 'success',
          text: data.message || `Range "${securityModal.range.name}" and all associated numbers deleted successfully.`,
        });
        await fetchRanges();

      } else if (securityModal.type === 'clear_all_numbers') {
        const res = await fetch(`/api/ranges/${rangeId}/clear-numbers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Security-PIN': pin,
          },
          body: JSON.stringify({ securityPin: pin }),
        });

        let data: any = {};
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          data = await res.json().catch(() => ({}));
        } else {
          const text = await res.text().catch(() => '');
          const cleanText = text.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
          data = { error: cleanText || `Server responded with status ${res.status}` };
        }

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to remove numbers. Please verify Security PIN.');
        }

        // Successfully cleared numbers
        setSecurityModal(prev => ({ ...prev, isOpen: false }));
        setStatusMessage({
          type: 'success',
          text: data.message || `Removed all numbers from range "${securityModal.range.name}". Range configuration is preserved.`,
        });

        if (managingRange?.id === securityModal.range.id) {
          setManagingRange(data.range || { ...securityModal.range, numbers: [], totalNumbers: 0 });
          setRangeNumbers([]);
          setTotalNumbersInModal(0);
          setSelectedNumbersForRemoval(new Set());
        }
        await fetchRanges();
      }
    } catch (err: any) {
      setSecurityModal(prev => ({
        ...prev,
        error: err.message || 'Operation failed. Incorrect Security PIN.',
        isProcessing: false,
      }));
    }
  };

  // Inspect duplicate conflicts against global database
  const handleCheckDuplicates = async () => {
    if (parsedNumbers.length === 0) return;
    setIsCheckingDuplicates(true);
    try {
      const res = await fetch('/api/ranges/check-duplicates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          numbers: parsedNumbers,
          targetRangeId: rangeMode === 'existing' ? selectedRangeId : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDuplicateCheckResult(data);
      }
    } catch (err) {
      console.error('Failed to check duplicates', err);
    } finally {
      setIsCheckingDuplicates(false);
    }
  };

  // Export Range Numbers to CSV
  const handleExportRangeCsv = (range: NumberRange) => {
    if (!range.numbers || range.numbers.length === 0) {
      alert('This range has no numbers to export.');
      return;
    }
    const headers = ['Phone Number (MSISDN)', 'Range Name', 'Country Prefix', 'Carrier / Note'];
    const rows = range.numbers.map(num => [
      `"${num}"`,
      `"${range.name}"`,
      `"+${range.prefix}"`,
      `"${range.countryNote || ''}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `${range.name.replace(/\s+/g, '_')}_numbers.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter ranges
  const filteredRanges = ranges.filter(r => {
    if (!rangesSearch.trim()) return true;
    const q = rangesSearch.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      r.prefix.includes(q) ||
      (r.countryNote && r.countryNote.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 pb-12" id="bulk-numbers-container">
      {/* Top Banner & Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Add Bulk Numbers</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">
                  Batch Manager
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
                Upload number batch files (CSV, CXV, TXT, TSV) from telecom providers to create a new range or append to an existing range.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleDownloadSampleCsv}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-semibold shadow-sm transition-all"
              id="download-sample-csv-btn"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>Download Sample CSV</span>
            </button>

            <button
              type="button"
              onClick={fetchRanges}
              disabled={isLoadingRanges}
              className="inline-flex items-center justify-center p-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition-all disabled:opacity-50"
              title="Refresh ranges list"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingRanges ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Status Toast Banner */}
        {statusMessage && (
          <div 
            className={`mt-4 p-3 rounded-xl border flex items-center justify-between gap-3 text-xs font-medium animate-fadeIn ${
              statusMessage.type === 'success' 
                ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300' 
                : statusMessage.type === 'error'
                ? 'bg-rose-950/80 border-rose-500/40 text-rose-300'
                : 'bg-blue-950/80 border-blue-500/40 text-blue-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : statusMessage.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <RefreshCw className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-white text-sm"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Main Grid: Left is Form (Range Selection & Batch Upload), Right is Range Stats & Existing Ranges */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Input & Upload Form */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* SECTION 1: RANGE SELECTION */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center text-xs font-bold font-mono">
                  1
                </span>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Range Selection
                </h2>
              </div>
              <span className="text-[11px] text-slate-400">
                {ranges.length} Configured Range{ranges.length === 1 ? '' : 's'}
              </span>
            </div>

            {/* Radio / Tab Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Card A: Create New Range */}
              <button
                type="button"
                onClick={() => setRangeMode('create')}
                className={`p-3.5 rounded-xl border text-left transition-all relative ${
                  rangeMode === 'create'
                    ? 'bg-blue-950/40 border-blue-500/60 ring-1 ring-blue-500/30 text-white'
                    : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:border-slate-700'
                }`}
                id="mode-create-range-btn"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    rangeMode === 'create' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    <Plus className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      Create New Range
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Define a new range name and prefix
                    </div>
                  </div>
                </div>
              </button>

              {/* Card B: Add to Existing Range */}
              <button
                type="button"
                onClick={() => setRangeMode('existing')}
                className={`p-3.5 rounded-xl border text-left transition-all relative ${
                  rangeMode === 'existing'
                    ? 'bg-blue-950/40 border-blue-500/60 ring-1 ring-blue-500/30 text-white'
                    : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:border-slate-700'
                }`}
                id="mode-existing-range-btn"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    rangeMode === 'existing' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      Add to Existing Range ({ranges.length})
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Append numbers to an already configured range
                    </div>
                  </div>
                </div>
              </button>
            </div>

            {/* Mode: Create New Range Form */}
            {rangeMode === 'create' ? (
              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Range Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={newRangeName}
                    onChange={(e) => setNewRangeName(e.target.value)}
                    placeholder="e.g. Tanzania LX 26Aug, Ukraine Kyivstar, etc."
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-blue-500 font-sans"
                    id="new-range-name-input"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Country Prefix <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-xs">+</span>
                      <input
                        type="text"
                        value={newRangePrefix}
                        onChange={(e) => setNewRangePrefix(e.target.value.replace(/[^\d]/g, ''))}
                        placeholder="e.g. 255, 380, 224"
                        className="w-full pl-7 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-blue-500 font-mono"
                        id="new-range-prefix-input"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Country / Carrier Note <span className="text-slate-500 text-[10px]">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={newRangeNote}
                      onChange={(e) => setNewRangeNote(e.target.value)}
                      placeholder="e.g. Tanzania, Ukraine, Guinea"
                      className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-blue-500 font-sans"
                      id="new-range-note-input"
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* Mode: Add to Existing Range Form */
              <div className="pt-2">
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Select Existing Range <span className="text-rose-400">*</span>
                </label>
                {ranges.length === 0 ? (
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-amber-400 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    <span>No ranges configured yet. Please switch to "Create New Range" above.</span>
                  </div>
                ) : (
                  <select
                    value={selectedRangeId}
                    onChange={(e) => setSelectedRangeId(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500 cursor-pointer font-sans"
                    id="existing-range-select"
                  >
                    {ranges.map(r => (
                      <option key={r.id} value={r.id} className="bg-slate-900 text-white">
                        {r.name} (+{r.prefix}) — {r.totalNumbers || 0} numbers {r.countryNote ? `[${r.countryNote}]` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* SECTION 2: UPLOAD BATCH FILE & NUMBERS BUFFER */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center text-xs font-bold font-mono">
                  2
                </span>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Upload Batch File (CSV, CXV, TXT, TSV)
                </h2>
              </div>
              <span className="text-[10px] font-mono text-slate-400 hidden sm:inline-block">
                Supported formats: .csv, .cxv, .txt, .tsv, .xlsx
              </span>
            </div>

            {/* Dropzone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2.5 ${
                isDragging
                  ? 'border-blue-500 bg-blue-950/30 scale-[1.01]'
                  : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-950'
              }`}
              id="file-dropzone"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.cxv,.txt,.tsv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
                id="bulk-file-hidden-input"
              />

              <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center">
                <UploadCloud className="w-5 h-5" />
              </div>

              <div>
                <p className="text-xs font-semibold text-white">
                  {uploadedFileName ? (
                    <span className="text-blue-400 font-mono">Active File: {uploadedFileName}</span>
                  ) : (
                    <span>Click to browse or drag & drop your number file here</span>
                  )}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Supports CSV, CXV, TXT, TSV file formats with thousands of MSISDNs.
                </p>
              </div>
            </div>

            {/* Numbers Buffer Textarea */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-blue-400" />
                  <span>Numbers Buffer (Paste directly or verify file numbers)</span>
                </label>
                <div className="flex items-center gap-2 font-mono">
                  <span className="px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-blue-400 font-bold">
                    {parsedNumbers.length.toLocaleString()} numbers
                  </span>
                </div>
              </div>

              <textarea
                value={numbersText}
                onChange={(e) => setNumbersText(e.target.value)}
                rows={6}
                placeholder={"Paste MSISDNs here (one per line, comma or semicolon separated):\n380961234567\n380961234568\n380961234569..."}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs placeholder-slate-600 focus:outline-none focus:border-blue-500 leading-relaxed resize-y"
                id="numbers-buffer-textarea"
              />

              {/* Buffer Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleCheckDuplicates}
                    disabled={isCheckingDuplicates || parsedNumbers.length === 0}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/50 border border-emerald-500/30 hover:bg-emerald-900/40 text-emerald-300 text-[11px] font-medium transition-colors disabled:opacity-40 cursor-pointer"
                    title="Inspect if any numbers in this buffer already exist in any range across the system"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{isCheckingDuplicates ? 'Checking...' : 'Check Conflicts'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDeduplicateBuffer}
                    disabled={parsedNumbers.length === 0}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-[11px] font-medium transition-colors disabled:opacity-40 cursor-pointer"
                    title="Remove duplicate numbers within this buffer"
                  >
                    <span>Remove Duplicates</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCleanNonDigits}
                    disabled={parsedNumbers.length === 0}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-[11px] font-medium transition-colors disabled:opacity-40 cursor-pointer"
                    title="Clean spaces, dashes, + signs"
                  >
                    <span>Clean Non-Digits</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClearBuffer}
                    disabled={!numbersText}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-rose-900/50 text-slate-400 hover:text-rose-400 text-[11px] font-medium transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear Buffer</span>
                  </button>
                </div>

                {/* Primary Save Action */}
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting || parsedNumbers.length === 0}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-900/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  id="save-assign-numbers-btn"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving & Indexing...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        Save & Assign {parsedNumbers.length > 0 ? `(${parsedNumbers.length.toLocaleString()})` : ''} Numbers to Range
                      </span>
                    </>
                  )}
                </button>
              </div>

              {/* Duplicate Inspector Preview Card */}
              {duplicateCheckResult && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span className="font-bold text-white">Duplicate Conflict Report</span>
                      <span className="text-[10px] text-slate-400">(Rule: 1 Number = 1 Range Only)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDuplicateCheckResult(null)}
                      className="text-slate-400 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center pt-1 font-mono">
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-[10px] text-slate-400">Total Checked</div>
                      <div className="text-sm font-bold text-white">{duplicateCheckResult.totalChecked}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-[10px] text-emerald-400">Valid New</div>
                      <div className="text-sm font-bold text-emerald-400">{duplicateCheckResult.newCount}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-[10px] text-amber-400">Conflicts / Dups</div>
                      <div className="text-sm font-bold text-amber-400">{duplicateCheckResult.duplicateCount}</div>
                    </div>
                  </div>

                  {duplicateCheckResult.duplicates.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <div className="text-[11px] font-semibold text-amber-300">
                        The following numbers will automatically be skipped during save:
                      </div>
                      <div className="max-h-24 overflow-y-auto space-y-1 font-mono text-[11px] text-slate-400">
                        {duplicateCheckResult.duplicates.slice(0, 10).map((d, i) => (
                          <div key={i} className="flex items-center justify-between px-2 py-0.5 rounded bg-slate-900">
                            <span className="text-slate-300">{d.number}</span>
                            <span className="text-[10px] text-amber-400">{d.reason}</span>
                          </div>
                        ))}
                        {duplicateCheckResult.duplicates.length > 10 && (
                          <div className="text-[10px] text-slate-500 italic text-center">
                            +{duplicateCheckResult.duplicates.length - 10} more conflicts
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Configured Ranges Directory & Management */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Configured Ranges
                </h3>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                {ranges.reduce((acc, r) => acc + (r.totalNumbers || 0), 0).toLocaleString()} Total Numbers
              </span>
            </div>

            {/* Search Ranges */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={rangesSearch}
                onChange={(e) => setRangesSearch(e.target.value)}
                placeholder="Search ranges by name, prefix, country..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-blue-500 font-sans"
                id="search-ranges-input"
              />
            </div>

            {/* Ranges List */}
            <div className="space-y-2.5 max-h-[620px] overflow-y-auto pr-1">
              {isLoadingRanges ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-400" />
                  <span>Loading ranges...</span>
                </div>
              ) : filteredRanges.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs bg-slate-950/60 rounded-xl border border-slate-800/60">
                  <Layers className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                  <p className="font-semibold text-slate-400">No ranges found</p>
                  <p className="text-[11px] text-slate-500 mt-1">Create a range using the form on the left.</p>
                </div>
              ) : (
                filteredRanges.map((range) => (
                  <div
                    key={range.id}
                    className="p-3.5 bg-slate-950 border border-slate-800/90 rounded-xl hover:border-slate-700 transition-all space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-white text-xs tracking-tight">
                            {range.name}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-950/80 text-blue-300 border border-blue-500/30">
                            +{range.prefix}
                          </span>
                          {range.countryNote && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-900 text-slate-300 border border-slate-800">
                              {range.countryNote}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 mt-1">
                          Created {new Date(range.createdAt).toLocaleDateString()}
                        </div>
                      </div>

                      <span className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono font-bold text-emerald-400 shrink-0">
                        {(range.totalNumbers || 0).toLocaleString()} MSISDNs
                      </span>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleOpenManageRange(range)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-[11px] font-semibold transition-colors cursor-pointer"
                        id={`manage-range-${range.id}`}
                      >
                        <Phone className="w-3 h-3 text-blue-400" />
                        <span>Manage Numbers</span>
                        <ChevronRight className="w-3 h-3 opacity-60" />
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleExportRangeCsv(range)}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                          title="Export all numbers to CSV"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => requestClearAllNumbers(range)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-medium transition-colors cursor-pointer"
                          title="Remove All Numbers (PIN Required - Keeps Range Active)"
                        >
                          <RotateCcw className="w-3 h-3 text-amber-400" />
                          <span>Clear Numbers</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDeleteRange(range)}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/70 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                          title="Delete Range (PIN Required)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* NUMBERS MANAGEMENT MODAL */}
      {managingRange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div 
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
            id="manage-numbers-modal"
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-950/80">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                    <span>{managingRange.name}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-blue-300 border border-blue-500/30">
                      +{managingRange.prefix}
                    </span>
                    {managingRange.countryNote && (
                      <span className="text-xs text-slate-400">({managingRange.countryNote})</span>
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Total: <strong className="text-emerald-400 font-mono">{totalNumbersInModal.toLocaleString()}</strong> assigned MSISDNs in this range
                  </p>
                </div>
              </div>

              {/* Action Toolbar in Modal Header */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleExportRangeCsv(managingRange)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-blue-400" />
                  <span>Export CSV</span>
                </button>

                <button
                  type="button"
                  onClick={() => requestClearAllNumbers(managingRange)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-colors cursor-pointer"
                  title="Remove all numbers from range while keeping range configuration active"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Remove All Numbers</span>
                </button>

                <button
                  type="button"
                  onClick={() => requestDeleteRange(managingRange)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-colors cursor-pointer"
                  title="Permanently delete range and numbers"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Delete Range</span>
                </button>

                <button
                  type="button"
                  onClick={() => setManagingRange(null)}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer ml-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Add Numbers directly into Range */}
            <div className="p-4 bg-slate-950/50 border-b border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Add Numbers to this Range:</span>
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Global Protection: 1 Number = 1 Range Only</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsModalBulkOpen(!isModalBulkOpen)}
                    className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold underline underline-offset-2 cursor-pointer"
                  >
                    {isModalBulkOpen ? 'Switch to Quick Add' : 'Bulk File Upload / Paste'}
                  </button>
                </div>
              </div>

              {!isModalBulkOpen ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={quickAddText}
                    onChange={(e) => setQuickAddText(e.target.value)}
                    placeholder="Paste numbers (e.g. 224610351009, 224622114455) - comma, space or newline"
                    className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleQuickAddInsideModal}
                    disabled={isQuickAdding || !quickAddText.trim()}
                    className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shrink-0 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isQuickAdding ? 'Adding...' : 'Add Numbers'}
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-3 animate-fadeIn">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-300">
                      Bulk Upload (CSV, TXT, XLSX) or Paste Multi-line Numbers:
                    </span>
                    <input
                      ref={modalFileInputRef}
                      type="file"
                      accept=".csv,.txt,.tsv,.xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleModalBulkFileUpload(f);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => modalFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
                    >
                      <UploadCloud className="w-3.5 h-3.5 text-blue-400" />
                      <span>{modalBulkFileName ? modalBulkFileName : 'Choose File...'}</span>
                    </button>
                  </div>

                  <textarea
                    rows={4}
                    value={modalBulkText}
                    onChange={(e) => setModalBulkText(e.target.value)}
                    placeholder="Or paste hundreds or thousands of phone numbers here..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-y"
                  />

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      Extracted: <strong className="text-white font-mono">{extractNumbersFromText(modalBulkText).length.toLocaleString()}</strong> numbers
                    </span>

                    <button
                      type="button"
                      onClick={handleModalBulkSubmit}
                      disabled={isModalBulkSubmitting || extractNumbersFromText(modalBulkText).length === 0}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {isModalBulkSubmitting ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Importing...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Add All Valid Numbers to Range</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Search & Bulk Delete Toolbar */}
            <div className="p-4 bg-slate-950/30 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={numbersSearchQuery}
                  onChange={(e) => {
                    setNumbersSearchQuery(e.target.value);
                    setNumbersPage(1);
                    fetchRangeNumbers(managingRange.id, e.target.value, 1);
                  }}
                  placeholder="Search numbers within range..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              {selectedNumbersForRemoval.size > 0 && (
                <button
                  type="button"
                  onClick={() => handleRemoveNumbers(Array.from(selectedNumbersForRemoval))}
                  disabled={isRemovingNumbers}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-sm transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Selected ({selectedNumbersForRemoval.size})</span>
                </button>
              )}
            </div>

            {/* Modal Numbers Table / List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[260px]">
              {isLoadingNumbers ? (
                <div className="p-12 text-center text-slate-500 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-400" />
                  <span>Loading numbers...</span>
                </div>
              ) : rangeNumbers.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-xs">
                  <Phone className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                  <p className="font-semibold text-slate-400">No numbers found</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {numbersSearchQuery ? 'Try a different search query.' : 'Add numbers using the form above.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {rangeNumbers.map((num) => {
                    const isSelected = selectedNumbersForRemoval.has(num);
                    return (
                      <div
                        key={num}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-colors ${
                          isSelected 
                            ? 'bg-rose-950/30 border-rose-500/40 text-white'
                            : 'bg-slate-950 border-slate-800/80 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              const next = new Set(selectedNumbersForRemoval);
                              if (next.has(num)) next.delete(num);
                              else next.add(num);
                              setSelectedNumbersForRemoval(next);
                            }}
                            className="w-3.5 h-3.5 rounded border-slate-700 text-blue-600 focus:ring-0 cursor-pointer"
                          />
                          <span className="font-mono text-xs font-semibold select-all">
                            {num}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(num);
                              setCopiedNumber(num);
                              setTimeout(() => setCopiedNumber(null), 1500);
                            }}
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                            title="Copy number"
                          >
                            {copiedNumber === num ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveNumbers([num])}
                            className="p-1 rounded hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 transition-colors"
                            title="Remove number from range"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Pagination Footer */}
            <div className="p-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
              <span>
                Showing page {numbersPage} of {Math.max(1, Math.ceil(totalNumbersInModal / 50))} ({totalNumbersInModal} numbers)
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={numbersPage <= 1}
                  onClick={() => {
                    const next = numbersPage - 1;
                    setNumbersPage(next);
                    fetchRangeNumbers(managingRange.id, numbersSearchQuery, next);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-40 text-xs font-semibold"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={numbersPage >= Math.ceil(totalNumbersInModal / 50)}
                  onClick={() => {
                    const next = numbersPage + 1;
                    setNumbersPage(next);
                    fetchRangeNumbers(managingRange.id, numbersSearchQuery, next);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-40 text-xs font-semibold"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECURITY PIN CONFIRMATION MODAL */}
      {securityModal.isOpen && securityModal.range && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn"
          id="security-action-modal"
        >
          <div 
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden p-5 sm:p-6 space-y-4"
          >
            {/* Modal Icon & Header */}
            <div className="flex items-start gap-3.5">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                securityModal.type === 'delete_range'
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              }`}>
                {securityModal.type === 'delete_range' ? (
                  <Trash2 className="w-5 h-5" />
                ) : (
                  <RotateCcw className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>
                    {securityModal.type === 'delete_range' ? 'Delete Range' : 'Remove All Numbers'}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                    +{securityModal.range.prefix}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  Range: <strong className="text-white">{securityModal.range.name}</strong> ({securityModal.range.totalNumbers || 0} MSISDNs)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSecurityModal(prev => ({ ...prev, isOpen: false }))}
                className="text-slate-400 hover:text-white text-sm p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Warning Box */}
            <div className={`p-3.5 rounded-xl border text-xs leading-relaxed space-y-1 ${
              securityModal.type === 'delete_range'
                ? 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                : 'bg-amber-950/30 border-amber-500/30 text-amber-200'
            }`}>
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  {securityModal.type === 'delete_range' 
                    ? 'Permanent Deletion Warning' 
                    : 'Clear All Numbers Warning'}
                </span>
              </div>
              <p className="text-[11px] opacity-90">
                {securityModal.type === 'delete_range' ? (
                  <>
                    This action will permanently delete range <strong>"{securityModal.range.name}"</strong> and unbind all {securityModal.range.totalNumbers || 0} MSISDNs from the system. This cannot be undone.
                  </>
                ) : (
                  <>
                    All {securityModal.range.totalNumbers || 0} numbers will be deleted from <strong>"{securityModal.range.name}"</strong>. 
                    The range configuration (+{securityModal.range.prefix}) will remain active and preserved for future batch numbers.
                  </>
                )}
              </p>
            </div>

            {/* PIN Input Form */}
            <form onSubmit={handleExecuteSecurityAction} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-blue-400" />
                    <span>Enter Security Master PIN:</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">PIN Required</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={securityModal.showPin ? 'text' : 'password'}
                    value={securityModal.securityPin}
                    onChange={(e) => setSecurityModal(prev => ({ ...prev, securityPin: e.target.value, error: null }))}
                    placeholder="Enter Master PIN"
                    autoFocus
                    className="w-full pl-9 pr-10 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500 tracking-wider"
                    id="security-pin-input"
                  />
                  <button
                    type="button"
                    onClick={() => setSecurityModal(prev => ({ ...prev, showPin: !prev.showPin }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                    tabIndex={-1}
                  >
                    {securityModal.showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error Box */}
              {securityModal.error && (
                <div className="p-2.5 bg-rose-950/80 border border-rose-500/50 rounded-xl flex items-center gap-2 text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{securityModal.error}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setSecurityModal(prev => ({ ...prev, isOpen: false }))}
                  disabled={securityModal.isProcessing}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={securityModal.isProcessing || !securityModal.securityPin.trim()}
                  className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-white text-xs font-bold shadow-lg transition-all disabled:opacity-50 cursor-pointer ${
                    securityModal.type === 'delete_range'
                      ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/30'
                      : 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/30'
                  }`}
                  id="confirm-security-pin-btn"
                >
                  {securityModal.isProcessing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying PIN...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>
                        {securityModal.type === 'delete_range' ? 'Verify PIN & Delete Range' : 'Verify PIN & Clear Numbers'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
