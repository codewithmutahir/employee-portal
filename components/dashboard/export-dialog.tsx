'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { exportEmployeeData, exportAllEmployeesData } from '@/app/actions/export';
import {
  formatEmployeeDataForPrint,
  formatEmployeeDataAsTimecardCSV,
  formatAllEmployeesDataAsTimecardCSV,
  formatLateReportCSV,
} from '@/lib/export-utils';
import { useToast } from '@/components/ui/use-toast';
import { Printer, FileText, FileSpreadsheet, Calendar, ChevronDown, AlertTriangle } from 'lucide-react';
import type { Employee, Compensation, AttendanceRecord } from '@/types';
import type { ScheduleHistoryEntry } from '@/lib/schedule-history';

interface ExportDialogProps {
  employeeId?: string;
  employeeName?: string;
  requestedByEmployeeId?: string;
}

interface ExportData {
  employee: Employee;
  compensation: Compensation | null;
  attendance: AttendanceRecord[];
  scheduleHistory?: ScheduleHistoryEntry[];
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function recordMonthKey(record: { date?: string }): string | null {
  const dateStr = String(record?.date || '');
  const m = /^(\d{4})-(\d{2})/.exec(dateStr);
  if (m) return `${m[1]}-${String(Number(m[2]) - 1).padStart(2, '0')}`;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
}

function monthKeyToLabel(key: string): string {
  const [yStr, mStr] = key.split('-');
  const y = Number(yStr);
  const mi = Number(mStr);
  if (isNaN(y) || isNaN(mi)) return key;
  return `${MONTH_NAMES[mi]} ${y}`;
}

function uniqueMonthsFromAttendance(records: AttendanceRecord[]): string[] {
  const set = new Set<string>();
  records.forEach((r) => {
    const k = recordMonthKey(r);
    if (k) set.add(k);
  });
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

export function ExportDialog({ employeeId, employeeName, requestedByEmployeeId }: ExportDialogProps) {
  const [loading, setLoading] = useState(false);
  const [loadingMonths, setLoadingMonths] = useState(false);
  const [monthsOpen, setMonthsOpen] = useState(false);
  const [singleData, setSingleData] = useState<ExportData | null>(null);
  const [allData, setAllData] = useState<ExportData[] | null>(null);
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
  const monthsPanelRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const isSingleMode = Boolean(employeeId);

  // Available months derived from cached data (empty until first load).
  const availableMonths = useMemo(() => {
    if (isSingleMode) {
      if (!singleData) return [] as string[];
      return uniqueMonthsFromAttendance(singleData.attendance);
    }
    if (!allData) return [] as string[];
    const set = new Set<string>();
    allData.forEach((emp) => {
      uniqueMonthsFromAttendance(emp.attendance).forEach((k) => set.add(k));
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [isSingleMode, singleData, allData]);

  // Reset month selection whenever the active employee changes.
  useEffect(() => {
    setSelectedMonths(new Set());
    setSingleData(null);
    setAllData(null);
  }, [employeeId, requestedByEmployeeId]);

  // Close the months dropdown on outside click.
  useEffect(() => {
    if (!monthsOpen) return;
    function onMouseDown(event: MouseEvent) {
      if (monthsPanelRef.current && !monthsPanelRef.current.contains(event.target as Node)) {
        setMonthsOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [monthsOpen]);

  /** Fetch (and cache) the export data so we can derive available months and reuse for actual exports. */
  async function ensureDataLoaded(): Promise<ExportData | ExportData[] | null> {
    if (isSingleMode) {
      if (singleData) return singleData;
      if (!employeeId || !requestedByEmployeeId) return null;
      const data = await exportEmployeeData(employeeId, requestedByEmployeeId);
      if (data) setSingleData(data as ExportData);
      return (data as ExportData) || null;
    }
    if (allData) return allData;
    if (!requestedByEmployeeId) return null;
    const data = await exportAllEmployeesData(requestedByEmployeeId);
    if (data) setAllData(data as ExportData[]);
    return (data as ExportData[]) || null;
  }

  async function handleOpenMonths() {
    setMonthsOpen((open) => !open);
    if (!monthsOpen && availableMonths.length === 0) {
      setLoadingMonths(true);
      try {
        await ensureDataLoaded();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load months';
        toast({ title: 'Could not load months', description: message, variant: 'destructive' });
      } finally {
        setLoadingMonths(false);
      }
    }
  }

  function toggleMonth(key: string) {
    setSelectedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllMonths() {
    setSelectedMonths(new Set(availableMonths));
  }

  function clearMonths() {
    setSelectedMonths(new Set());
  }

  function applyMonthFilter(data: ExportData): ExportData {
    if (selectedMonths.size === 0) return data;
    return {
      ...data,
      attendance: data.attendance.filter((r) => {
        const k = recordMonthKey(r);
        return k !== null && selectedMonths.has(k);
      }),
    };
  }

  function applyMonthFilterAll(list: ExportData[]): ExportData[] {
    if (selectedMonths.size === 0) return list;
    return list.map(applyMonthFilter);
  }

  function selectionLabel(): string {
    if (selectedMonths.size === 0) return 'All months';
    if (selectedMonths.size === 1) {
      const [only] = Array.from(selectedMonths);
      return monthKeyToLabel(only);
    }
    return `${selectedMonths.size} months selected`;
  }

  function filenameSuffix(): string {
    if (selectedMonths.size === 0) return new Date().toISOString().split('T')[0]!;
    if (selectedMonths.size === 1) {
      const [only] = Array.from(selectedMonths);
      return only.replace('-', '_');
    }
    const sorted = Array.from(selectedMonths).sort();
    return `${sorted[0]!.replace('-', '_')}_to_${sorted[sorted.length - 1]!.replace('-', '_')}`;
  }

  function downloadBlob(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleExportSingle(format: 'txt' | 'csv') {
    if (!employeeId || !requestedByEmployeeId) {
      toast({ title: 'Error', description: 'Missing employee or session', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const data = (await ensureDataLoaded()) as ExportData | null;
      if (!data) throw new Error('No data returned from server');

      const filtered = applyMonthFilter(data);
      if (filtered.attendance.length === 0 && selectedMonths.size > 0) {
        toast({
          title: 'No data for selected months',
          description: 'Pick at least one month with attendance, or clear the filter.',
          variant: 'destructive',
        });
        return;
      }

      const safeName = employeeName?.replace(/\s+/g, '_') || 'employee';
      const suffix = filenameSuffix();
      let formatted: string;
      let filename: string;
      let mimeType: string;

      if (format === 'csv') {
        formatted = formatEmployeeDataAsTimecardCSV(filtered);
        filename = `${safeName}_timecard_${suffix}.csv`;
        mimeType = 'text/csv';
      } else {
        formatted = formatEmployeeDataForPrint(filtered);
        filename = `${safeName}_report_${suffix}.txt`;
        mimeType = 'text/plain';
      }

      downloadBlob(formatted, filename, mimeType);
      toast({ title: 'Export successful', description: `${filename} has been downloaded` });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to export employee data';
      toast({ title: 'Export failed', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function handleLateReportSingle() {
    if (!employeeId || !requestedByEmployeeId) {
      toast({ title: 'Error', description: 'Missing employee or session', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const data = (await ensureDataLoaded()) as ExportData | null;
      if (!data) throw new Error('No data returned from server');

      const filtered = applyMonthFilter(data);
      if (filtered.attendance.length === 0 && selectedMonths.size > 0) {
        toast({
          title: 'No data for selected months',
          description: 'Pick at least one month with attendance, or clear the filter.',
          variant: 'destructive',
        });
        return;
      }

      const formatted = formatLateReportCSV([filtered]);
      const safeName = employeeName?.replace(/\s+/g, '_') || 'employee';
      const suffix = filenameSuffix();
      downloadBlob(formatted, `${safeName}_late_report_${suffix}.csv`, 'text/csv');
      toast({
        title: 'Late report ready',
        description: `${safeName}_late_report_${suffix}.csv has been downloaded`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to export late report';
      toast({ title: 'Export failed', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function handleLateReportAll() {
    if (!requestedByEmployeeId) {
      toast({ title: 'Error', description: 'Missing session', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const data = (await ensureDataLoaded()) as ExportData[] | null;
      if (!data || data.length === 0) throw new Error('No data available or no employees found');

      const filtered = applyMonthFilterAll(data);
      const totalRecords = filtered.reduce((sum, e) => sum + e.attendance.length, 0);
      if (totalRecords === 0 && selectedMonths.size > 0) {
        toast({
          title: 'No data for selected months',
          description: 'No employees have attendance in the chosen months.',
          variant: 'destructive',
        });
        return;
      }

      const formatted = formatLateReportCSV(filtered);
      const suffix = filenameSuffix();
      downloadBlob(formatted, `all_employees_late_report_${suffix}.csv`, 'text/csv');
      toast({
        title: 'Late report ready',
        description: `Downloaded all-employees late report (${filtered.length} profiles)`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to export late report';
      toast({ title: 'Export failed', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function handleExportAll(format: 'txt' | 'csv') {
    if (!requestedByEmployeeId) {
      toast({ title: 'Error', description: 'Missing session', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const data = (await ensureDataLoaded()) as ExportData[] | null;
      if (!data || data.length === 0) throw new Error('No data available or no employees found');

      const filtered = applyMonthFilterAll(data);
      const totalRecords = filtered.reduce((sum, e) => sum + e.attendance.length, 0);
      if (totalRecords === 0 && selectedMonths.size > 0) {
        toast({
          title: 'No data for selected months',
          description: 'No employees have attendance in the chosen months.',
          variant: 'destructive',
        });
        return;
      }

      const suffix = filenameSuffix();
      let formatted: string;
      let filename: string;
      let mimeType: string;

      if (format === 'csv') {
        formatted = formatAllEmployeesDataAsTimecardCSV(filtered);
        filename = `all_employees_timecard_${suffix}.csv`;
        mimeType = 'text/csv';
      } else {
        formatted = '';
        filtered.forEach((empData) => {
          formatted += formatEmployeeDataForPrint(empData);
          formatted += '\n\n========================================\n\n';
        });
        filename = `all_employees_report_${suffix}.txt`;
        mimeType = 'text/plain';
      }

      downloadBlob(formatted, filename, mimeType);
      toast({
        title: 'Export successful',
        description: `Exported data for ${filtered.length} employees`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to export employee data';
      toast({ title: 'Export failed', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function handlePrintSingle() {
    if (!employeeId || !requestedByEmployeeId) {
      toast({ title: 'Error', description: 'Missing employee or session', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const data = (await ensureDataLoaded()) as ExportData | null;
      if (!data) throw new Error('Failed to load data');

      const filtered = applyMonthFilter(data);
      if (filtered.attendance.length === 0 && selectedMonths.size > 0) {
        toast({
          title: 'No data for selected months',
          description: 'Pick at least one month with attendance, or clear the filter.',
          variant: 'destructive',
        });
        return;
      }

      const formatted = formatEmployeeDataForPrint(filtered);
      const printWindow = window.open('', '_blank');

      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Employee Report - ${employeeName || 'Employee'}</title>
              <style>
                body {
                  font-family: 'Courier New', monospace;
                  padding: 20px;
                  white-space: pre-wrap;
                  font-size: 12px;
                  line-height: 1.4;
                }
                @media print {
                  body { padding: 10px; }
                }
              </style>
            </head>
            <body>${formatted}</body>
          </html>
        `);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 250);
      } else {
        throw new Error('Failed to open print window. Check if popups are blocked.');
      }

      toast({ title: 'Print dialog opened' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load data for printing';
      toast({ title: 'Print failed', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function MonthsFilter() {
    return (
      <div className="relative" ref={monthsPanelRef}>
        <Button
          variant="outline"
          size="sm"
          onClick={handleOpenMonths}
          disabled={loading}
          type="button"
        >
          <Calendar className="mr-2 h-4 w-4" />
          {selectionLabel()}
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
        {monthsOpen && (
          <div className="absolute left-0 z-50 mt-2 w-72 rounded-md border bg-popover p-3 text-popover-foreground shadow-md">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium">Filter by months</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllMonths}
                  disabled={availableMonths.length === 0}
                  className="text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={clearMonths}
                  className="text-muted-foreground hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            {loadingMonths ? (
              <div className="flex justify-center py-6">
                <LoadingSpinner label="Loading months" size="sm" />
              </div>
            ) : availableMonths.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">
                No attendance recorded yet.
              </p>
            ) : (
              <ul className="max-h-64 overflow-y-auto space-y-1">
                {availableMonths.map((key) => {
                  const checked = selectedMonths.has(key);
                  return (
                    <li key={key}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMonth(key)}
                          className="h-4 w-4 cursor-pointer accent-primary"
                        />
                        <span>{monthKeyToLabel(key)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">
              Only months with recorded attendance appear here. Leave empty to export every month.
            </p>
          </div>
        )}
      </div>
    );
  }

  if (isSingleMode) {
    return (
      <div className="flex flex-wrap gap-2">
        <MonthsFilter />
        <Button variant="outline" size="sm" onClick={() => handleExportSingle('txt')} disabled={loading}>
          {loading ? (
            <LoadingSpinner label="Exporting" />
          ) : (
            <>
              <FileText className="mr-2 h-4 w-4" />
              Export TXT
            </>
          )}
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleExportSingle('csv')} disabled={loading}>
          {loading ? (
            <LoadingSpinner label="Exporting" />
          ) : (
            <>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Export CSV
            </>
          )}
        </Button>
        <Button variant="outline" size="sm" onClick={handleLateReportSingle} disabled={loading}>
          {loading ? (
            <LoadingSpinner label="Exporting" />
          ) : (
            <>
              <AlertTriangle className="mr-2 h-4 w-4" />
              Late Report
            </>
          )}
        </Button>
        <Button variant="outline" size="sm" onClick={handlePrintSingle} disabled={loading}>
          {loading ? (
            <LoadingSpinner label="Preparing" />
          ) : (
            <>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <MonthsFilter />
      <Button variant="outline" size="sm" onClick={() => handleExportAll('txt')} disabled={loading}>
        {loading ? (
          <LoadingSpinner label="Exporting" />
        ) : (
          <>
            <FileText className="mr-2 h-4 w-4" />
            Export All TXT
          </>
        )}
      </Button>
      <Button variant="outline" size="sm" onClick={() => handleExportAll('csv')} disabled={loading}>
        {loading ? (
          <LoadingSpinner label="Exporting" />
        ) : (
          <>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Export All CSV
          </>
        )}
      </Button>
      <Button variant="outline" size="sm" onClick={handleLateReportAll} disabled={loading}>
        {loading ? (
          <LoadingSpinner label="Exporting" />
        ) : (
          <>
            <AlertTriangle className="mr-2 h-4 w-4" />
            Late Report (All)
          </>
        )}
      </Button>
    </div>
  );
}
