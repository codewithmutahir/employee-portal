'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { exportEmployeeData, exportAllEmployeesData } from '@/app/actions/export';
import { formatEmployeeDataForPrint, formatEmployeeDataAsCSV, formatAllEmployeesDataAsCSV, formatEmployeeDataAsTimecardCSV, formatAllEmployeesDataAsTimecardCSV } from '@/lib/export-utils';
import { useToast } from '@/components/ui/use-toast';
import { Download, Printer, FileText, FileSpreadsheet } from 'lucide-react';

interface ExportDialogProps {
  employeeId?: string;
  employeeName?: string;
}

export function ExportDialog({ employeeId, employeeName }: ExportDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleExportSingle(format: 'txt' | 'csv' = 'txt') {
    if (!employeeId) {
      toast({
        title: 'Error',
        description: 'No employee ID provided',
        variant: 'destructive',
      });
      return;
    }
    
    setLoading(true);
    try {
      const data = await exportEmployeeData(employeeId);
      
      if (!data) {
        throw new Error('No data returned from server');
      }


      let formatted: string;
      let filename: string;
      let mimeType: string;

      if (format === 'csv') {
        formatted = formatEmployeeDataAsTimecardCSV(data);
        filename = `${employeeName?.replace(/\s+/g, '_') || 'employee'}_timecard_${new Date().toISOString().split('T')[0]}.csv`;
        mimeType = 'text/csv';
      } else {
        formatted = formatEmployeeDataForPrint(data);
        filename = `${employeeName?.replace(/\s+/g, '_') || 'employee'}_report_${new Date().toISOString().split('T')[0]}.txt`;
        mimeType = 'text/plain';
      }


      const blob = new Blob([formatted], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ 
        title: 'Export successful',
        description: `${filename} has been downloaded`
      });
    } catch (error: any) {
      toast({
        title: 'Export failed',
        description: error.message || 'Failed to export employee data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleExportAll(format: 'txt' | 'csv' = 'txt') {
    setLoading(true);
    try {
      const data = await exportAllEmployeesData();
      
      if (!data || data.length === 0) {
        throw new Error('No data available or no employees found');
      }

      
      let formatted: string;
      let filename: string;
      let mimeType: string;

      if (format === 'csv') {
        formatted = formatAllEmployeesDataAsTimecardCSV(data);
        filename = `all_employees_timecard_${new Date().toISOString().split('T')[0]}.csv`;
        mimeType = 'text/csv';
      } else {
        formatted = '';
        data.forEach((empData) => {
          formatted += formatEmployeeDataForPrint(empData);
          formatted += '\n\n========================================\n\n';
        });
        filename = `all_employees_report_${new Date().toISOString().split('T')[0]}.txt`;
        mimeType = 'text/plain';
      }


      const blob = new Blob([formatted], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ 
        title: 'Export successful',
        description: `Exported data for ${data.length} employees`
      });
    } catch (error: any) {
      toast({
        title: 'Export failed',
        description: error.message || 'Failed to export employee data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handlePrintSingle() {
    if (!employeeId) {
      toast({
        title: 'Error',
        description: 'No employee ID provided',
        variant: 'destructive',
      });
      return;
    }
    
    setLoading(true);
    try {
      const data = await exportEmployeeData(employeeId);
      
      if (!data) {
        throw new Error('Failed to load data');
      }

      const formatted = formatEmployeeDataForPrint(data);
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
        
        // Give browser time to render before printing
        setTimeout(() => {
          printWindow.print();
        }, 250);
      } else {
        throw new Error('Failed to open print window. Check if popups are blocked.');
      }

      toast({ title: 'Print dialog opened' });
    } catch (error: any) {
      toast({
        title: 'Print failed',
        description: error.message || 'Failed to load data for printing',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  if (employeeId) {
    return (
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleExportSingle('txt')}
          disabled={loading}
        >
          {loading ? <LoadingSpinner label="Exporting" /> : (<><FileText className="mr-2 h-4 w-4" />Export TXT</>)}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleExportSingle('csv')}
          disabled={loading}
        >
          {loading ? <LoadingSpinner label="Exporting" /> : (<><FileSpreadsheet className="mr-2 h-4 w-4" />Export CSV</>)}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrintSingle}
          disabled={loading}
        >
          {loading ? <LoadingSpinner label="Preparing" /> : (<><Printer className="mr-2 h-4 w-4" />Print</>)}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleExportAll('txt')}
        disabled={loading}
      >
        {loading ? <LoadingSpinner label="Exporting" /> : (<><FileText className="mr-2 h-4 w-4" />Export All TXT</>)}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleExportAll('csv')}
        disabled={loading}
      >
        {loading ? <LoadingSpinner label="Exporting" /> : (<><FileSpreadsheet className="mr-2 h-4 w-4" />Export All CSV</>)}
      </Button>
    </div>
  );
}