'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/components/auth-provider';
import { getAllEmployees, createBulkColaAdjustment, getCompensation } from '@/app/actions/employees';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { DEFAULT_CURRENCY } from '@/lib/constants';

type PreviewRow = {
  employeeId: string;
  name: string;
  department: string;
  currentSalary: number;
  newSalary: number;
};

function ColaPageContent() {
  const { employee, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [department, setDepartment] = useState<string>('all');
  const [percentage, setPercentage] = useState<string>('');
  const [effectiveDate, setEffectiveDate] = useState<string>(new Date().toISOString().split('T')[0] || '');
  const [reason, setReason] = useState<string>('Annual COLA adjustment');
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && (!employee || (employee.role !== 'admin' && employee.role !== 'management'))) {
      router.push('/dashboard');
    }
  }, [employee, loading, router]);

  useEffect(() => {
    async function load() {
      const list = await getAllEmployees(true);
      setEmployees(list);
    }
    void load();
  }, []);

  const departments = useMemo(
    () => Array.from(new Set(employees.map((e) => e.department).filter(Boolean))).sort(),
    [employees]
  );

  const filtered = useMemo(
    () => (department === 'all' ? employees : employees.filter((e) => e.department === department)),
    [employees, department]
  );

  async function buildPreview() {
    const pct = parseFloat(percentage);
    if (!Number.isFinite(pct)) {
      toast({ title: 'Invalid % value', variant: 'destructive' });
      return;
    }
    const rows: PreviewRow[] = [];
    for (const empId of selectedIds) {
      const emp = employees.find((e) => e.id === empId);
      if (!emp) continue;
      const comp = await getCompensation(emp.id);
      const currentSalary = comp?.salary ?? 0;
      rows.push({
        employeeId: emp.id,
        name: emp.displayName,
        department: emp.department || 'No Department',
        currentSalary,
        newSalary: Number((currentSalary * (1 + pct / 100)).toFixed(2)),
      });
    }
    setPreview(rows);
  }

  async function handleConfirm() {
    if (!employee) return;
    const pct = parseFloat(percentage);
    if (!Number.isFinite(pct)) {
      toast({ title: 'Invalid % value', variant: 'destructive' });
      return;
    }
    if (selectedIds.size === 0) {
      toast({ title: 'Select at least one employee', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const result = await createBulkColaAdjustment(
        Array.from(selectedIds),
        pct,
        `${effectiveDate}T00:00:00.000Z`,
        reason,
        employee.id
      );
      if (!result.success) {
        toast({ title: 'Bulk COLA failed', description: result.error, variant: 'destructive' });
        return;
      }
      toast({ title: 'Bulk COLA completed', description: `${result.created} event(s) created.` });
      setSelectedIds(new Set());
      setPreview([]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Bulk COLA Adjustment</CardTitle>
          <CardDescription>Create one compensation event per selected employee.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Department</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger><SelectValue placeholder="All departments" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>% Increase</Label>
              <Input value={percentage} onChange={(e) => setPercentage(e.target.value)} type="number" />
            </div>
            <div>
              <Label>Effective date</Label>
              <Input value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} type="date" />
            </div>
          </div>
          <div>
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="rounded-md border p-3 max-h-56 overflow-auto">
            {filtered.map((emp) => (
              <label key={emp.id} className="flex items-center gap-2 text-sm py-1">
                <input
                  type="checkbox"
                  checked={selectedIds.has(emp.id)}
                  onChange={(e) =>
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(emp.id);
                      else next.delete(emp.id);
                      return next;
                    })
                  }
                />
                <span>{emp.displayName} ({emp.department || 'No Department'})</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={buildPreview}>Preview</Button>
            <Button onClick={handleConfirm} disabled={saving}>
              {saving ? 'Applying...' : 'Confirm COLA'}
            </Button>
            <Button variant="outline" onClick={() => router.push('/dashboard')}>Back</Button>
          </div>
        </CardContent>
      </Card>

      {preview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {preview.map((row) => (
              <div key={row.employeeId} className="grid grid-cols-4 gap-2 border rounded p-2">
                <span>{row.name}</span>
                <span>{row.department}</span>
                <span>{DEFAULT_CURRENCY} {row.currentSalary.toLocaleString()}</span>
                <span>{DEFAULT_CURRENCY} {row.newSalary.toLocaleString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ColaPage() {
  return (
    <AuthProvider>
      <ColaPageContent />
    </AuthProvider>
  );
}
