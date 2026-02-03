'use client';

import { useState, useEffect, useCallback } from 'react';
import { Employee, AttendanceRecord, Compensation, Note } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { getAllEmployees, getCompensation, updateCompensation, getUpcomingBirthdays, getAllDepartments, getEmployeesByDepartment, updateEmployee, createEmployee, deleteEmployee, getUpcomingAnniversaries, getTenureStatistics, WorkAnniversary } from '@/app/actions/employees';
import { sendWelcomeEmail, sendNotificationEmail } from '@/app/actions/email';
import { calculateTenure } from '@/lib/utils';
import { getAttendanceByDate, updateAttendance } from '@/app/actions/attendance-management';
import { getDepartmentAttendanceStats, getWorkforceInsights } from '@/app/actions/attendance';
import { getNotes, addNote, deleteNote } from '@/app/actions/notes';
import { useToast } from '@/components/ui/use-toast';
import { formatDate, formatTime } from '@/lib/utils';
import { Users, DollarSign, Calendar, FileText, Edit, Plus, Loader2, BarChart3, TrendingUp, PieChart, CheckCircle, Clock, Trash2, Pencil, Award, Cake, Star, Trophy, Gem, Medal, Send } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ExportDialog } from './export-dialog';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart as RechartsPieChart, Cell, Pie } from 'recharts';

interface ManagementDashboardProps {
  employee: Employee;
}

export default function ManagementDashboard({ employee }: ManagementDashboardProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [compensation, setCompensation] = useState<Compensation | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [upcomingBirthdays, setUpcomingBirthdays] = useState<Employee[]>([]);
  const [upcomingAnniversaries, setUpcomingAnniversaries] = useState<WorkAnniversary[]>([]);
  const [tenureStats, setTenureStats] = useState<any>(null);
  const [departmentStats, setDepartmentStats] = useState<any>(null);
  const [workforceInsights, setWorkforceInsights] = useState<any>(null);
  const [sendingEmployeeEmail, setSendingEmployeeEmail] = useState(false);
  const [loading, setLoading] = useState(true);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [reportsLoading, setReportsLoading] = useState(true);
  const { toast } = useToast();

  // Get unique departments
  const departments = Array.from(new Set(employees.map(emp => emp.department).filter(Boolean))).sort();

  // Filter employees by department
  const filteredEmployees = selectedDepartment === 'all'
    ? employees
    : employees.filter(emp => emp.department === selectedDepartment);

  // Group employees by department (for display when showing all)
  const employeesByDepartment = employees.reduce((acc, emp) => {
    const dept = emp.department || 'No Department';
    if (!acc[dept]) {
      acc[dept] = [];
    }
    acc[dept].push(emp);
    return acc;
  }, {} as Record<string, Employee[]>);

  // Sort employees within each department
  Object.keys(employeesByDepartment).forEach(dept => {
    employeesByDepartment[dept].sort((a, b) => a.displayName.localeCompare(b.displayName));
  });

  // Compensation form state
  const [compForm, setCompForm] = useState({
    salary: '',
    allowance: '',
    bonus: '',
    currency: 'USD',
    hourlyRate: '',
  });

  // Attendance edit form state (kept intentionally lightweight)
  const [attForm, setAttForm] = useState({
    date: new Date().toISOString().split('T')[0],
    clockIn: '',
    clockOut: '',
    payrollId: '',
    noShowReason: '',
  });

  // Note form state
  const [noteContent, setNoteContent] = useState('');
  const [noteIsInternal, setNoteIsInternal] = useState(false);

  // Add Employee form state
  const [addEmployeeDialogOpen, setAddEmployeeDialogOpen] = useState(false);
  const [addEmployeeForm, setAddEmployeeForm] = useState({
    email: '',
    password: '',
    displayName: '',
    role: 'employee' as 'employee' | 'management',
    department: '',
    position: '',
    phoneNumber: '',
    dateOfBirth: '',
    hireDate: new Date().toISOString().split('T')[0],
  });
  const [addEmployeeLoading, setAddEmployeeLoading] = useState(false);

  // Edit Employee state
  const [editEmployeeDialogOpen, setEditEmployeeDialogOpen] = useState(false);
  const [editEmployeeForm, setEditEmployeeForm] = useState({
    displayName: '',
    email: '',
    department: '',
    position: '',
    phoneNumber: '',
    dateOfBirth: '',
    hireDate: '',
  });
  const [editEmployeeLoading, setEditEmployeeLoading] = useState(false);

  // Delete Employee state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function loadEmployees() {
    setEmployeesLoading(true);
    try {
      // Pass true to exclude management users
      const emps = await getAllEmployees(true);
      setEmployees(emps);
      
      if (emps.length === 0) {
        toast({
          title: 'No employees found',
          description: 'There are no employees in the system',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load employees',
        variant: 'destructive',
      });
    } finally {
      setEmployeesLoading(false);
    }
  }

  async function loadBirthdays() {
    try {
      // Only get birthdays for employees, not management
      const bdays = await getUpcomingBirthdays(30, 'employee');
      setUpcomingBirthdays(bdays);
    } catch (error) {
    }
  }

  async function loadAnniversaries() {
    try {
      console.log('Loading anniversaries...');
      const [anniversaries, stats] = await Promise.all([
        getUpcomingAnniversaries(60, 'employee'), // 60 days to catch more
        getTenureStatistics(),
      ]);
      console.log('Anniversaries loaded:', anniversaries.length, 'items');
      console.log('Tenure stats:', stats);
      setUpcomingAnniversaries(anniversaries);
      setTenureStats(stats);
    } catch (error) {
      console.error('Error loading anniversaries:', error);
    }
  }

  async function handleSendEmployeeEmail() {
    if (!selectedEmployee) return;
    
    setSendingEmployeeEmail(true);
    try {
      const result = await sendNotificationEmail(
        selectedEmployee.email,
        '📢 Message from Management - Employee Portal',
        `Hello ${selectedEmployee.displayName},\n\nThis is a notification from the Employee Portal management team.\n\nPlease log in to your Employee Portal account to check for any updates or important information.\n\nBest regards,\nManagement Team`,
        'management-notification'
      );

      if (result.success) {
        toast({
          title: 'Email Sent!',
          description: `Notification email sent to ${selectedEmployee.displayName}`,
        });
      } else {
        toast({
          title: 'Failed to Send Email',
          description: result.error || 'An error occurred while sending the email',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Email Error',
        description: error.message || 'Failed to send email',
        variant: 'destructive',
      });
    } finally {
      setSendingEmployeeEmail(false);
    }
  }

  const loadEmployeeDetails = useCallback(async () => {
    if (!selectedEmployee) return;
    setLoading(true);
    try {
      const [comp, notesData] = await Promise.all([
        getCompensation(selectedEmployee.id),
        getNotes(selectedEmployee.id, employee.id, true),
      ]);
      setCompensation(comp);
      setNotes(notesData);
      if (comp) {
        setCompForm({
          salary: comp.salary.toString(),
          allowance: comp.allowance?.toString() || '',
          bonus: comp.bonus?.toString() || '',
          currency: comp.currency,
          hourlyRate: comp.hourlyRate?.toString() || '',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to load employee details',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedEmployee, toast]);

  useEffect(() => {
    loadEmployees();
    loadBirthdays();
    loadAnniversaries();
    loadManagementReports();
  }, []);

  async function loadManagementReports() {
    setReportsLoading(true);
    try {
      const [deptStats, insights] = await Promise.all([
        getDepartmentAttendanceStats(),
        getWorkforceInsights(),
      ]);
      setDepartmentStats(deptStats);
      setWorkforceInsights(insights);
    } catch (error) {
      toast({
        title: 'Error loading reports',
        description: 'Failed to load management reports. Some data may be unavailable.',
        variant: 'destructive',
      });
    } finally {
      setReportsLoading(false);
    }
  }

  useEffect(() => {
    if (selectedEmployee) {
      loadEmployeeDetails();
    }
  }, [selectedEmployee, loadEmployeeDetails]);

  async function loadAttendance() {
    if (!selectedEmployee) return;
    try {
      const att = await getAttendanceByDate(selectedEmployee.id, attForm.date);
      setAttendance(att);
      if (att) {
        setAttForm({
          date: att.date,
          clockIn: att.clockIn ? new Date(att.clockIn).toISOString().slice(0, 16) : '',
          clockOut: att.clockOut ? new Date(att.clockOut).toISOString().slice(0, 16) : '',
          payrollId: att.payrollId || '',
          noShowReason: att.noShowReason || '',
        });
      } else {
        setAttForm({
          date: attForm.date,
          clockIn: '',
          clockOut: '',
          payrollId: '',
          noShowReason: '',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load attendance',
        variant: 'destructive',
      });
    }
  }

  async function handleSaveCompensation() {
    if (!selectedEmployee) return;
    try {
      const result = await updateCompensation(
        selectedEmployee.id,
        {
          salary: parseFloat(compForm.salary),
          allowance: compForm.allowance ? parseFloat(compForm.allowance) : undefined,
          bonus: compForm.bonus ? parseFloat(compForm.bonus) : undefined,
          currency: compForm.currency,
          hourlyRate: compForm.hourlyRate ? parseFloat(compForm.hourlyRate) : undefined,
        },
        employee.id
      );
      if (result.success) {
        toast({ title: 'Compensation updated successfully' });
        await loadEmployeeDetails();
      } else {
        toast({
          title: 'Error',
          description: result.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update compensation',
        variant: 'destructive',
      });
    }
  }

  async function handleSaveAttendance() {
    if (!selectedEmployee) return;
    try {
      const breaks = attendance?.breaks || [];
      const result = await updateAttendance(
        selectedEmployee.id,
        attForm.date,
        {
          clockIn: attForm.clockIn || undefined,
          clockOut: attForm.clockOut || undefined,
          breaks: breaks,
          payrollId: attForm.payrollId || undefined,
          noShowReason: attForm.noShowReason || undefined,
        },
        employee.id
      );
      if (result.success) {
        toast({ title: 'Attendance updated successfully' });
        await loadAttendance();
      } else {
        toast({
          title: 'Error',
          description: result.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update attendance',
        variant: 'destructive',
      });
    }
  }

  async function handleAddNote() {
    if (!selectedEmployee || !noteContent.trim()) return;
    try {
      const result = await addNote(
        selectedEmployee.id,
        noteContent,
        employee.id,
        noteIsInternal
      );
      if (result.success) {
        toast({ title: 'Note added successfully' });
        setNoteContent('');
        await loadEmployeeDetails();
      } else {
        toast({
          title: 'Error',
          description: result.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add note',
        variant: 'destructive',
      });
    }
  }

  async function handleDeleteNote(noteId: string) {
    try {
      const result = await deleteNote(noteId);
      if (result.success) {
        toast({ title: 'Note deleted successfully' });
        await loadEmployeeDetails();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete note',
        variant: 'destructive',
      });
    }
  }

  async function handleStatusChange(newStatus: 'active' | 'terminated') {
    if (!selectedEmployee) return;

    try {
      const result = await updateEmployee(selectedEmployee.id, { status: newStatus }, employee.id);

      if (result.success) {
        toast({
          title: 'Status updated',
          description: `${selectedEmployee.displayName}'s status has been changed to ${newStatus}`,
        });

        // Update the selected employee in state
        setSelectedEmployee({ ...selectedEmployee, status: newStatus });

        // Update in the employees list
        setEmployees(employees.map(emp =>
          emp.id === selectedEmployee.id
            ? { ...emp, status: newStatus }
            : emp
        ));

        // Reload employee details to ensure consistency
        await loadEmployeeDetails();
      } else {
        toast({
          title: 'Update failed',
          description: result.error || 'Failed to update employee status',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Status change error:', error);
      toast({
        title: 'Update failed',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    }
  }

  async function handleAddEmployee() {
    setAddEmployeeLoading(true);
    try {
      // Validate required fields
      if (!addEmployeeForm.email || !addEmployeeForm.password || !addEmployeeForm.displayName || !addEmployeeForm.hireDate) {
        toast({
          title: 'Validation Error',
          description: 'Please fill in all required fields (Email, Password, Display Name, Hire Date)',
          variant: 'destructive',
        });
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(addEmployeeForm.email)) {
        toast({
          title: 'Validation Error',
          description: 'Please enter a valid email address',
          variant: 'destructive',
        });
        return;
      }

      // Validate password length
      if (addEmployeeForm.password.length < 6) {
        toast({
          title: 'Validation Error',
          description: 'Password must be at least 6 characters long',
          variant: 'destructive',
        });
        return;
      }

      const result = await createEmployee(addEmployeeForm, employee.id);

      if (result.success) {
        toast({
          title: 'Employee Created',
          description: `${addEmployeeForm.displayName} has been successfully added to the system`,
        });

        // Send welcome email to the new employee
        try {
          const emailResult = await sendWelcomeEmail(
            addEmployeeForm.email,
            addEmployeeForm.displayName,
            addEmployeeForm.password // Include temporary password in welcome email
          );
          if (emailResult.success) {
            toast({
              title: 'Welcome Email Sent',
              description: `Welcome email sent to ${addEmployeeForm.email}`,
            });
          }
        } catch (emailError) {
          console.error('Failed to send welcome email:', emailError);
          // Don't show error toast - employee was still created successfully
        }

        // Reset form
        setAddEmployeeForm({
          email: '',
          password: '',
          displayName: '',
          role: 'employee',
          department: '',
          position: '',
          phoneNumber: '',
          dateOfBirth: '',
          hireDate: new Date().toISOString().split('T')[0],
        });

        // Close dialog
        setAddEmployeeDialogOpen(false);

        // Reload employees list
        await loadEmployees();
      } else {
        toast({
          title: 'Failed to Create Employee',
          description: result.error || 'An error occurred while creating the employee',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Add employee error:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setAddEmployeeLoading(false);
    }
  }

  // Open edit dialog with current employee data
  function openEditDialog() {
    if (!selectedEmployee) return;
    
    setEditEmployeeForm({
      displayName: selectedEmployee.displayName || '',
      email: selectedEmployee.email || '',
      department: selectedEmployee.department || '',
      position: selectedEmployee.position || '',
      phoneNumber: selectedEmployee.phoneNumber || '',
      dateOfBirth: selectedEmployee.dateOfBirth ? new Date(selectedEmployee.dateOfBirth).toISOString().split('T')[0] : '',
      hireDate: selectedEmployee.hireDate ? new Date(selectedEmployee.hireDate).toISOString().split('T')[0] : '',
    });
    setEditEmployeeDialogOpen(true);
  }

  async function handleEditEmployee() {
    if (!selectedEmployee) return;
    
    setEditEmployeeLoading(true);
    try {
      // Build updates object with only changed fields
      const updates: any = {};
      
      if (editEmployeeForm.displayName !== selectedEmployee.displayName) {
        updates.displayName = editEmployeeForm.displayName;
      }
      if (editEmployeeForm.email !== selectedEmployee.email) {
        updates.email = editEmployeeForm.email;
      }
      if (editEmployeeForm.department !== (selectedEmployee.department || '')) {
        updates.department = editEmployeeForm.department || null;
      }
      if (editEmployeeForm.position !== (selectedEmployee.position || '')) {
        updates.position = editEmployeeForm.position || null;
      }
      if (editEmployeeForm.phoneNumber !== (selectedEmployee.phoneNumber || '')) {
        updates.phoneNumber = editEmployeeForm.phoneNumber || null;
      }
      
      // Handle date fields
      const currentDob = selectedEmployee.dateOfBirth ? new Date(selectedEmployee.dateOfBirth).toISOString().split('T')[0] : '';
      if (editEmployeeForm.dateOfBirth !== currentDob) {
        updates.dateOfBirth = editEmployeeForm.dateOfBirth || null;
      }
      
      const currentHireDate = selectedEmployee.hireDate ? new Date(selectedEmployee.hireDate).toISOString().split('T')[0] : '';
      if (editEmployeeForm.hireDate !== currentHireDate) {
        updates.hireDate = editEmployeeForm.hireDate;
      }

      if (Object.keys(updates).length === 0) {
        toast({
          title: 'No changes',
          description: 'No changes were made to the employee details',
        });
        setEditEmployeeDialogOpen(false);
        return;
      }

      const result = await updateEmployee(selectedEmployee.id, updates, employee.id);

      if (result.success) {
        toast({
          title: 'Employee Updated',
          description: `${editEmployeeForm.displayName}'s details have been updated`,
        });

        // Update local state
        const updatedEmployee = {
          ...selectedEmployee,
          ...updates,
        };
        setSelectedEmployee(updatedEmployee);
        setEmployees(employees.map(emp =>
          emp.id === selectedEmployee.id ? updatedEmployee : emp
        ));

        setEditEmployeeDialogOpen(false);
      } else {
        toast({
          title: 'Update Failed',
          description: result.error || 'Failed to update employee',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setEditEmployeeLoading(false);
    }
  }

  async function handleDeleteEmployee() {
    if (!selectedEmployee) return;
    
    setDeleteLoading(true);
    try {
      const result = await deleteEmployee(selectedEmployee.id, employee.id, true);

      if (result.success) {
        toast({
          title: 'Employee Deleted',
          description: `${selectedEmployee.displayName} has been permanently removed from the system`,
        });

        // Remove from local state
        setEmployees(employees.filter(emp => emp.id !== selectedEmployee.id));
        setSelectedEmployee(null);
        setDeleteDialogOpen(false);
      } else {
        toast({
          title: 'Delete Failed',
          description: result.error || 'Failed to delete employee',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold">Management Dashboard</h2>
          <p className="text-muted-foreground">Manage employees, attendance, and compensation</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAddEmployeeDialogOpen(true)} variant="default">
            <Plus className="mr-2 h-4 w-4" />
            Add Employee
          </Button>
          <ExportDialog />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Employee List */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="mr-2 h-5 w-5" />
                Employees ({filteredEmployees.length})
              </CardTitle>
              {/* Department Filter */}
              <div className="pt-2">
                <Label htmlFor="department-filter" className="text-sm">Filter by Department</Label>
                <select
                  id="department-filter"
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                >
                  <option value="all">All Departments ({employees.length})</option>
                  {departments.map((dept) => {
                    const count = employees.filter(emp => emp.department === dept).length;
                    return (
                      <option key={dept} value={dept}>
                        {dept} ({count})
                      </option>
                    );
                  })}
                  {employees.some(emp => !emp.department) && (
                    <option value="">
                      No Department ({employees.filter(emp => !emp.department).length})
                    </option>
                  )}
                </select>
              </div>
            </CardHeader>
            <CardContent>
              {employeesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-5 w-32" />
                          <Skeleton className="h-4 w-48" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                        <Skeleton className="h-6 w-16 rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredEmployees.length > 0 ? (
                <div className="space-y-4">
                  {/* Department-wise grouping when showing all */}
                  {selectedDepartment === 'all' ? (
                    Object.entries(employeesByDepartment)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([department, deptEmployees]) => (
                        <div key={department} className="space-y-2">
                          <h4 className="font-medium text-sm text-muted-foreground border-b pb-1">
                            {department} ({deptEmployees.length})
                          </h4>
                          {deptEmployees.map((emp) => (
                            <button
                              key={emp.id}
                              onClick={() => setSelectedEmployee(emp)}
                              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                                selectedEmployee?.id === emp.id
                                  ? 'bg-primary text-primary-foreground'
                                  : 'hover:bg-accent'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{emp.displayName}</p>
                                  <p className="text-sm opacity-80">{emp.email}</p>
                                  <p className="text-xs opacity-60">{emp.role}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs px-2 py-1 rounded-full ${
                                    emp.status === 'active'
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-red-100 text-red-800'
                                  }`}>
                                    {emp.status}
                                  </span>
                                  <div className={`w-2 h-2 rounded-full ${
                                    emp.status === 'active' ? 'bg-green-500' : 'bg-red-500'
                                  }`}></div>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      ))
                  ) : (
                    // Filtered view
                    <div className="space-y-2">
                      {filteredEmployees.map((emp) => (
                        <button
                          key={emp.id}
                          onClick={() => setSelectedEmployee(emp)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${
                            selectedEmployee?.id === emp.id
                              ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-accent'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{emp.displayName}</p>
                              <p className="text-sm opacity-80">{emp.email}</p>
                              <p className="text-xs opacity-60">{emp.role}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                emp.status === 'active'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {emp.status}
                              </span>
                              <div className={`w-2 h-2 rounded-full ${
                                emp.status === 'active' ? 'bg-green-500' : 'bg-red-500'
                              }`}></div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    {selectedDepartment === 'all'
                      ? 'No employees found'
                      : `No employees in ${selectedDepartment} department`}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={loadEmployees}
                  >
                    Retry
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Birthdays */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Cake className="mr-2 h-5 w-5" />
                Upcoming Birthdays
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingBirthdays.length > 0 ? (
                <div className="space-y-2">
                  {upcomingBirthdays.slice(0, 5).map((emp) => (
                    <div key={emp.id} className="text-sm">
                      <p className="font-medium">{emp.displayName}</p>
                      {emp.dateOfBirth && (
                        <p className="text-muted-foreground">
                          {formatDate(emp.dateOfBirth)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No upcoming birthdays</p>
              )}
            </CardContent>
          </Card>

          {/* Work Anniversaries */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Award className="mr-2 h-5 w-5" />
                Work Anniversaries
              </CardTitle>
              <CardDescription>Upcoming milestones (next 60 days)</CardDescription>
            </CardHeader>
            <CardContent>
              {upcomingAnniversaries.length > 0 ? (
                <div className="space-y-3">
                  {upcomingAnniversaries.slice(0, 8).map((anniversary) => (
                    <div 
                      key={anniversary.employee.id} 
                      className={`p-3 rounded-lg border ${
                        anniversary.isMilestone 
                          ? anniversary.milestoneType === 'diamond' ? 'bg-purple-50 border-purple-200' :
                            anniversary.milestoneType === 'platinum' ? 'bg-slate-50 border-slate-300' :
                            anniversary.milestoneType === 'gold' ? 'bg-yellow-50 border-yellow-200' :
                            anniversary.milestoneType === 'silver' ? 'bg-gray-50 border-gray-300' :
                            'bg-blue-50 border-blue-200'
                          : 'bg-background'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{anniversary.employee.displayName}</p>
                            {anniversary.isMilestone && (
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                                anniversary.milestoneType === 'diamond' ? 'bg-purple-100 text-purple-700' :
                                anniversary.milestoneType === 'platinum' ? 'bg-slate-200 text-slate-700' :
                                anniversary.milestoneType === 'gold' ? 'bg-yellow-100 text-yellow-700' :
                                anniversary.milestoneType === 'silver' ? 'bg-gray-200 text-gray-700' :
                                'bg-blue-100 text-blue-700'
                              }`}>
                                {anniversary.milestoneType === 'diamond' && <Gem className="h-3 w-3" />}
                                {anniversary.milestoneType === 'platinum' && <Trophy className="h-3 w-3" />}
                                {anniversary.milestoneType === 'gold' && <Medal className="h-3 w-3" />}
                                {anniversary.milestoneType === 'silver' && <Star className="h-3 w-3" />}
                                Milestone
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {anniversary.employee.department || 'No Department'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-primary">
                            {anniversary.yearsCompleting} {anniversary.yearsCompleting === 1 ? 'Year' : 'Years'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {anniversary.daysUntil === 0 
                              ? 'Today!' 
                              : anniversary.daysUntil === 1 
                                ? 'Tomorrow' 
                                : `In ${anniversary.daysUntil} days`}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No upcoming anniversaries</p>
              )}
            </CardContent>
          </Card>

          {/* Tenure Statistics */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center text-base">
                <TrendingUp className="mr-2 h-4 w-4" />
                Tenure Overview
              </CardTitle>
            </CardHeader>
            {tenureStats && tenureStats.totalEmployees > 0 ? (
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <p className="text-2xl font-bold text-primary">
                      {tenureStats.averageTenureYears}y {tenureStats.averageTenureMonths}m
                    </p>
                    <p className="text-xs text-muted-foreground">Average Tenure</p>
                  </div>
                  {tenureStats.longestTenure && (
                    <div className="p-3 bg-yellow-50 rounded-lg">
                      <p className="text-2xl font-bold text-yellow-700">
                        {tenureStats.longestTenure.tenure.shortLabel}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {tenureStats.longestTenure.employee.displayName}
                      </p>
                    </div>
                  )}
                </div>
                
                {tenureStats.milestonesThisYear.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Milestones This Year</p>
                    <div className="flex flex-wrap gap-2">
                      {tenureStats.milestonesThisYear.map((m: { milestone: number; count: number }) => (
                        <span 
                          key={m.milestone}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-green-100 text-green-700"
                        >
                          <Star className="h-3 w-3" />
                          {m.milestone}yr: {m.count} employee{m.count !== 1 ? 's' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-sm font-medium mb-2">Tenure Distribution</p>
                  <div className="space-y-2">
                    {tenureStats.tenureDistribution.filter((d: any) => d.count > 0).map((dist: any) => (
                      <div key={dist.range} className="flex items-center gap-2">
                        <span className="text-xs w-20 text-muted-foreground">{dist.range}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${dist.percentage}%` }}
                          />
                        </div>
                        <span className="text-xs w-12 text-right">{dist.count} ({dist.percentage}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            ) : (
              <CardContent>
                <p className="text-sm text-muted-foreground">Loading tenure statistics...</p>
              </CardContent>
            )}
          </Card>
        </div>

        {/* Employee Details */}
        <div className="lg:col-span-2">
          {selectedEmployee ? (
            <div className="space-y-6">
              {/* Employee Info */}
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{selectedEmployee.displayName}</CardTitle>
                      <CardDescription>{selectedEmployee.email}</CardDescription>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleSendEmployeeEmail}
                        disabled={sendingEmployeeEmail}
                      >
                        {sendingEmployeeEmail ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )}
                        Email
                      </Button>
                      <Button variant="outline" size="sm" onClick={openEditDialog}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Employee Permanently</AlertDialogTitle>
                            <AlertDialogDescription className="space-y-2">
                              <p>Are you sure you want to <strong>permanently delete</strong> {selectedEmployee.displayName}?</p>
                              <p className="text-red-600 font-medium">This action cannot be undone!</p>
                              <p>This will:</p>
                              <ul className="list-disc list-inside text-sm">
                                <li>Delete the employee account</li>
                                <li>Remove their compensation records</li>
                                <li>Delete their face registration data</li>
                                <li>Remove all notes about this employee</li>
                              </ul>
                              <p className="text-sm text-muted-foreground mt-2">
                                Note: Attendance records will be preserved for historical purposes.
                              </p>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
                            <Button
                              variant="destructive"
                              onClick={handleDeleteEmployee}
                              disabled={deleteLoading}
                            >
                              {deleteLoading ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Deleting...
                                </>
                              ) : (
                                <>
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete Permanently
                                </>
                              )}
                            </Button>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <ExportDialog employeeId={selectedEmployee.id} employeeName={selectedEmployee.displayName} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedEmployee.department && (
                      <div>
                        <p className="text-sm text-muted-foreground">Department</p>
                        <p className="font-medium">{selectedEmployee.department}</p>
                      </div>
                    )}
                    {selectedEmployee.position && (
                      <div>
                        <p className="text-sm text-muted-foreground">Position</p>
                        <p className="font-medium">{selectedEmployee.position}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <div className="flex items-center gap-2">
                        {selectedEmployee.status === 'active' ? (
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-green-700">Active</span>
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                                  Terminate
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Terminate Employee</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to terminate {selectedEmployee.displayName}?
                                    This action will change their status to &ldquo;terminated&rdquo; and they will no longer be able to access the system.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleStatusChange('terminated')}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Terminate Employee
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-red-700">Terminated</span>
                            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm" className="text-green-600 hover:text-green-700 hover:bg-green-50">
                                  Reactivate
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Reactivate Employee</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to reactivate {selectedEmployee.displayName}?
                                    This action will change their status back to &ldquo;active&rdquo; and restore their system access.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleStatusChange('active')}
                                    className="bg-green-600 hover:bg-green-700"
                                  >
                                    Reactivate Employee
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Hire Date</p>
                      <p className="font-medium">{formatDate(selectedEmployee.hireDate)}</p>
                    </div>
                    {selectedEmployee.hireDate && (() => {
                      const tenure = calculateTenure(selectedEmployee.hireDate);
                      if (!tenure) return null;
                      return (
                        <div>
                          <p className="text-sm text-muted-foreground">Tenure</p>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{tenure.label}</p>
                            {tenure.years >= 5 && (
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                                tenure.years >= 25 ? 'bg-purple-100 text-purple-700' :
                                tenure.years >= 20 ? 'bg-slate-200 text-slate-700' :
                                tenure.years >= 10 ? 'bg-yellow-100 text-yellow-700' :
                                'bg-gray-200 text-gray-700'
                              }`}>
                                {tenure.years >= 25 && <Gem className="h-3 w-3" />}
                                {tenure.years >= 20 && tenure.years < 25 && <Trophy className="h-3 w-3" />}
                                {tenure.years >= 10 && tenure.years < 20 && <Medal className="h-3 w-3" />}
                                {tenure.years >= 5 && tenure.years < 10 && <Star className="h-3 w-3" />}
                                {tenure.years >= 25 ? 'Diamond' : tenure.years >= 20 ? 'Platinum' : tenure.years >= 10 ? 'Gold' : 'Silver'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>

              {/* Compensation */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <DollarSign className="mr-2 h-5 w-5" />
                    Compensation
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="salary">Salary</Label>
                      <Input
                        id="salary"
                        type="number"
                        value={compForm.salary}
                        onChange={(e) => setCompForm({ ...compForm, salary: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="currency">Currency</Label>
                      <Input
                        id="currency"
                        value={compForm.currency}
                        onChange={(e) => setCompForm({ ...compForm, currency: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="allowance">Allowance</Label>
                      <Input
                        id="allowance"
                        type="number"
                        value={compForm.allowance}
                        onChange={(e) => setCompForm({ ...compForm, allowance: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="bonus">Bonus</Label>
                      <Input
                        id="bonus"
                        type="number"
                        value={compForm.bonus}
                        onChange={(e) => setCompForm({ ...compForm, bonus: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="hourlyRate">Hourly Rate</Label>
                      <Input
                        id="hourlyRate"
                        type="number"
                        step="0.01"
                        value={compForm.hourlyRate}
                        onChange={(e) => setCompForm({ ...compForm, hourlyRate: e.target.value })}
                        placeholder="e.g., 25.00"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Used for timecard wage calculations</p>
                    </div>
                  </div>
                  <Button onClick={handleSaveCompensation}>Save Compensation</Button>
                </CardContent>
              </Card>

              {/* Attendance Management */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Calendar className="mr-2 h-5 w-5" />
                    Attendance Management
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="attDate">Date</Label>
                    <Input
                      id="attDate"
                      type="date"
                      value={attForm.date}
                      onChange={(e) => {
                        setAttForm({ ...attForm, date: e.target.value });
                        setTimeout(loadAttendance, 100);
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="clockIn">Clock In</Label>
                      <Input
                        id="clockIn"
                        type="datetime-local"
                        value={attForm.clockIn}
                        onChange={(e) => setAttForm({ ...attForm, clockIn: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="clockOut">Clock Out</Label>
                      <Input
                        id="clockOut"
                        type="datetime-local"
                        value={attForm.clockOut}
                        onChange={(e) => setAttForm({ ...attForm, clockOut: e.target.value })}
                      />
                    </div>
                  </div>
                  {attendance && attendance.totalHours !== undefined && (
                    <div>
                      <p className="text-sm text-muted-foreground">Total Hours</p>
                      <p className="font-medium">{attendance.totalHours} hrs</p>
                    </div>
                  )}
                  <div>
                    <Label htmlFor="payrollId">Payroll ID</Label>
                    <Input
                      id="payrollId"
                      value={attForm.payrollId}
                      onChange={(e) => setAttForm({ ...attForm, payrollId: e.target.value })}
                      placeholder="Optional payroll identifier"
                    />
                  </div>
                  <div>
                    <Label htmlFor="noShowReason">No Show Reason</Label>
                    <Input
                      id="noShowReason"
                      value={attForm.noShowReason}
                      onChange={(e) => setAttForm({ ...attForm, noShowReason: e.target.value })}
                      placeholder="Reason if employee did not show up"
                    />
                  </div>
                  {/* Break Management */}
                  {attendance && (
                    <div className="border-t pt-4">
                      <Label className="text-base font-semibold mb-2 block">Breaks</Label>
                      {attendance.breaks && attendance.breaks.length > 0 ? (
                        <div className="space-y-2">
                          {attendance.breaks.map((breakRecord, index) => (
                            <div key={index} className="border rounded p-3 space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-xs">Start Time</Label>
                                  <Input
                                    type="datetime-local"
                                    value={breakRecord.startTime ? new Date(breakRecord.startTime).toISOString().slice(0, 16) : ''}
                                    onChange={(e) => {
                                      const updatedBreaks = [...(attendance.breaks || [])];
                                      updatedBreaks[index] = {
                                        ...breakRecord,
                                        startTime: new Date(e.target.value).toISOString(),
                                      };
                                      setAttendance({ ...attendance, breaks: updatedBreaks });
                                    }}
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">End Time</Label>
                                  <Input
                                    type="datetime-local"
                                    value={breakRecord.endTime ? new Date(breakRecord.endTime).toISOString().slice(0, 16) : ''}
                                    onChange={(e) => {
                                      const updatedBreaks = [...(attendance.breaks || [])];
                                      const endTime = e.target.value ? new Date(e.target.value).toISOString() : undefined;
                                      const startTime = new Date(breakRecord.startTime).getTime();
                                      const duration = endTime ? Math.round((new Date(endTime).getTime() - startTime) / (1000 * 60)) : undefined;
                                      updatedBreaks[index] = {
                                        ...breakRecord,
                                        endTime,
                                        duration,
                                      };
                                      setAttendance({ ...attendance, breaks: updatedBreaks });
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-xs">Break Type</Label>
                                  <Select
                                    value={breakRecord.type || ''}
                                    onValueChange={(value) => {
                                      const updatedBreaks = [...(attendance.breaks || [])];
                                      updatedBreaks[index] = {
                                        ...breakRecord,
                                        type: value,
                                      };
                                      setAttendance({ ...attendance, breaks: updatedBreaks });
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="10 min - Paid">10 min - Paid</SelectItem>
                                      <SelectItem value="15 min - Paid">15 min - Paid</SelectItem>
                                      <SelectItem value="30 min - Paid">30 min - Paid</SelectItem>
                                      <SelectItem value="Lunch - Paid">Lunch - Paid</SelectItem>
                                      <SelectItem value="10 min - Unpaid">10 min - Unpaid</SelectItem>
                                      <SelectItem value="15 min - Unpaid">15 min - Unpaid</SelectItem>
                                      <SelectItem value="30 min - Unpaid">30 min - Unpaid</SelectItem>
                                      <SelectItem value="Lunch - Unpaid">Lunch - Unpaid</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">Paid Status</Label>
                                  <Select
                                    value={breakRecord.isPaid === undefined ? '' : breakRecord.isPaid ? 'paid' : 'unpaid'}
                                    onValueChange={(value) => {
                                      const updatedBreaks = [...(attendance.breaks || [])];
                                      updatedBreaks[index] = {
                                        ...breakRecord,
                                        isPaid: value === 'paid',
                                      };
                                      setAttendance({ ...attendance, breaks: updatedBreaks });
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="paid">Paid</SelectItem>
                                      <SelectItem value="unpaid">Unpaid</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              {breakRecord.duration && (
                                <p className="text-xs text-muted-foreground">Duration: {breakRecord.duration} minutes</p>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const updatedBreaks = attendance.breaks.filter((_, i) => i !== index);
                                  setAttendance({ ...attendance, breaks: updatedBreaks });
                                }}
                              >
                                Remove Break
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No breaks recorded</p>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => {
                          const newBreak = {
                            startTime: new Date().toISOString(),
                            type: '',
                            isPaid: true,
                          };
                          setAttendance({
                            ...attendance!,
                            breaks: [...(attendance?.breaks || []), newBreak],
                          });
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Break
                      </Button>
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <Button onClick={loadAttendance} variant="outline">Load</Button>
                    <Button onClick={handleSaveAttendance}>Save Attendance</Button>
                  </div>
                </CardContent>
              </Card>

              {/* Universal Notes */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <FileText className="mr-2 h-5 w-5" />
                    Notes
                  </CardTitle>
                  <CardDescription>
                    Use this single notes area for everything (attendance, performance, HR, etc.).
                    Internal notes stay management-only; other notes are visible to the employee.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="note">Add Note</Label>
                    <Textarea
                      id="note"
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      placeholder="Enter note content..."
                    />
                    <div className="mt-2 flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="internal"
                        checked={noteIsInternal}
                        onChange={(e) => setNoteIsInternal(e.target.checked)}
                      />
                      <Label htmlFor="internal" className="text-sm">Internal note (visible only to management)</Label>
                    </div>
                    <Button onClick={handleAddNote} className="mt-2" size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Note
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {notes.map((note) => (
                      <div key={note.id} className="border rounded-lg p-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="text-sm">{note.content}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDate(note.createdAt)}
                              {note.isInternal && ' • Internal'}
                            </p>

                            {/* Acknowledgment Status */}
                            {note.acknowledgedAt && (
                              <div className="mt-2 flex items-center gap-2">
                                <div className="flex items-center gap-1 text-xs text-green-600">
                                  <CheckCircle className="h-3 w-3" />
                                  <span>Acknowledged {formatDate(note.acknowledgedAt)}</span>
                                </div>
                              </div>
                            )}

                            {/* Employee Response */}
                            {note.employeeResponse && (
                              <div className="mt-2 p-2 bg-blue-50 border-l-2 border-blue-200 rounded">
                                <p className="text-xs font-medium text-blue-800 mb-1">Employee Response:</p>
                                <p className="text-sm text-blue-700">{note.employeeResponse}</p>
                              </div>
                            )}

                            {/* Not Acknowledged Indicator */}
                            {!note.acknowledgedAt && (
                              <div className="mt-2 flex items-center gap-2">
                                <div className="flex items-center gap-1 text-xs text-amber-600">
                                  <Clock className="h-3 w-3" />
                                  <span>Not yet acknowledged</span>
                                </div>
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteNote(note.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Select an employee to view details</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Management Reports & Insights */}
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-bold">Reports & Insights</h2>
            <p className="text-muted-foreground">Workforce analytics and performance metrics</p>
          </div>
          <Button
            variant="outline"
            onClick={loadManagementReports}
            disabled={reportsLoading}
          >
            {reportsLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <BarChart3 className="mr-2 h-4 w-4" />
                Refresh Reports
              </>
            )}
          </Button>
        </div>

        {/* Department Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Department Overview</CardTitle>
            <CardDescription>Employee distribution across departments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(employeesByDepartment).map(([department, deptEmployees]) => (
                <div key={department} className="p-4 border rounded-lg">
                  <h4 className="font-semibold text-lg">{department}</h4>
                  <p className="text-2xl font-bold text-primary">{deptEmployees.length}</p>
                  <p className="text-sm text-muted-foreground">employee{deptEmployees.length !== 1 ? 's' : ''}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {reportsLoading ? (
          <>
            {/* Overall Statistics Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-32" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-16 mb-2" />
                    <Skeleton className="h-4 w-24" />
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Department Stats Skeleton */}
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-40" />
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-5 w-16" />
                      </div>
                      <Skeleton className="h-2 w-full" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Charts Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-48" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-64 w-full" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-40" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-64 w-full" />
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <>

          {/* Overall Statistics */}
        {departmentStats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="mr-2 h-5 w-5" />
                  Total Employees
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{departmentStats.overallStats.totalEmployees}</p>
                <p className="text-sm text-muted-foreground">Active employees</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="mr-2 h-5 w-5" />
                  Average Attendance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{departmentStats.overallStats.averageAttendanceRate}%</p>
                <p className="text-sm text-muted-foreground">Last 30 days</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Calendar className="mr-2 h-5 w-5" />
                  Total Hours Worked
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{departmentStats.overallStats.totalHoursWorked}h</p>
                <p className="text-sm text-muted-foreground">Last 30 days</p>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Department Performance */}
          {departmentStats && departmentStats.departmentStats.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="mr-2 h-5 w-5" />
                  Department Performance
                </CardTitle>
                <CardDescription>Attendance rates by department</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={departmentStats.departmentStats}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="department" angle={-45} textAnchor="end" height={80} />
                      <YAxis />
                      <Tooltip formatter={(value: number | undefined) => [`${value || 0}%`, 'Attendance Rate']} />
                      <Bar dataKey="averageAttendance" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Department Distribution */}
          {workforceInsights && workforceInsights.departmentDistribution.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <PieChart className="mr-2 h-5 w-5" />
                  Department Distribution
                </CardTitle>
                <CardDescription>Employee distribution across departments</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={workforceInsights.departmentDistribution}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="count"
                      >
                        {workforceInsights.departmentDistribution.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={`hsl(${index * 45}, 70%, 50%)`} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number | undefined) => [value || 0, 'Employees']} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Attendance Trends */}
        {workforceInsights && workforceInsights.attendanceTrends.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <TrendingUp className="mr-2 h-5 w-5" />
                Attendance Trends
              </CardTitle>
              <CardDescription>Daily attendance over the last 7 days</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={workforceInsights.attendanceTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => {
                        if (!value) return '';
                        try {
                          const date = new Date(value);
                          if (isNaN(date.getTime())) return String(value);
                          return date.toLocaleDateString('en-US', { weekday: 'short' });
                        } catch {
                          return String(value);
                        }
                      }}
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(value) => {
                        if (!value) return '';
                        try {
                          const date = new Date(value);
                          if (isNaN(date.getTime())) return String(value);
                          return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
                        } catch {
                          return String(value);
                        }
                      }}
                      formatter={(value: number | undefined, name: string | undefined) => [
                        (name === 'presentCount') ? `${value || 0}/${workforceInsights.attendanceTrends[0]?.totalEmployees || 0}` : (value || 0),
                        (name === 'presentCount') ? 'Present Employees' : (name || '')
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="presentCount"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top Performers */}
        {workforceInsights && workforceInsights.topPerformers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Top Performers</CardTitle>
              <CardDescription>Employees with highest attendance rates (last 30 days)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {workforceInsights.topPerformers.map((performer: any, index: number) => (
                  <div key={performer.employeeId} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium">{performer.displayName}</p>
                        <p className="text-sm text-muted-foreground">{performer.department}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{performer.attendanceRate}%</p>
                      <p className="text-sm text-muted-foreground">{performer.totalHours}h total</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        </>
        )}
      </div>

      {/* Add Employee Dialog */}
      <AlertDialog open={addEmployeeDialogOpen} onOpenChange={setAddEmployeeDialogOpen}>
        <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Add New Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Create a new employee account. The employee will receive login credentials via email.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Email */}
              <div>
                <Label htmlFor="newEmail">Email *</Label>
                <Input
                  id="newEmail"
                  type="email"
                  value={addEmployeeForm.email}
                  onChange={(e) => setAddEmployeeForm({ ...addEmployeeForm, email: e.target.value })}
                  placeholder="employee@company.com"
                  required
                />
              </div>

              {/* Display Name */}
              <div>
                <Label htmlFor="newDisplayName">Display Name *</Label>
                <Input
                  id="newDisplayName"
                  value={addEmployeeForm.displayName}
                  onChange={(e) => setAddEmployeeForm({ ...addEmployeeForm, displayName: e.target.value })}
                  placeholder="John Doe"
                  required
                />
              </div>

              {/* Password */}
              <div>
                <Label htmlFor="newPassword">Temporary Password *</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={addEmployeeForm.password}
                  onChange={(e) => setAddEmployeeForm({ ...addEmployeeForm, password: e.target.value })}
                  placeholder="Min. 6 characters"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">Employee should change this after first login</p>
              </div>

              {/* Role */}
              <div>
                <Label htmlFor="newRole">Role *</Label>
                <Select
                  value={addEmployeeForm.role}
                  onValueChange={(value: 'employee' | 'management') => 
                    setAddEmployeeForm({ ...addEmployeeForm, role: value })
                  }
                >
                  <SelectTrigger id="newRole">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="management">Management</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Department */}
              <div>
                <Label htmlFor="newDepartment">Department</Label>
                <Input
                  id="newDepartment"
                  value={addEmployeeForm.department}
                  onChange={(e) => setAddEmployeeForm({ ...addEmployeeForm, department: e.target.value })}
                  placeholder="e.g., Engineering, Sales"
                  list="departments-list"
                />
                <datalist id="departments-list">
                  {departments.map(dept => (
                    <option key={dept} value={dept} />
                  ))}
                </datalist>
              </div>

              {/* Position */}
              <div>
                <Label htmlFor="newPosition">Position</Label>
                <Input
                  id="newPosition"
                  value={addEmployeeForm.position}
                  onChange={(e) => setAddEmployeeForm({ ...addEmployeeForm, position: e.target.value })}
                  placeholder="e.g., Software Engineer"
                />
              </div>

              {/* Phone Number */}
              <div>
                <Label htmlFor="newPhoneNumber">Phone Number</Label>
                <Input
                  id="newPhoneNumber"
                  type="tel"
                  value={addEmployeeForm.phoneNumber}
                  onChange={(e) => setAddEmployeeForm({ ...addEmployeeForm, phoneNumber: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              {/* Hire Date */}
              <div>
                <Label htmlFor="newHireDate">Hire Date *</Label>
                <Input
                  id="newHireDate"
                  type="date"
                  value={addEmployeeForm.hireDate}
                  onChange={(e) => setAddEmployeeForm({ ...addEmployeeForm, hireDate: e.target.value })}
                  required
                />
              </div>

              {/* Date of Birth */}
              <div className="md:col-span-2">
                <Label htmlFor="newDateOfBirth">Date of Birth</Label>
                <Input
                  id="newDateOfBirth"
                  type="date"
                  value={addEmployeeForm.dateOfBirth}
                  onChange={(e) => setAddEmployeeForm({ ...addEmployeeForm, dateOfBirth: e.target.value })}
                />
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={addEmployeeLoading}>Cancel</AlertDialogCancel>
            <Button onClick={handleAddEmployee} disabled={addEmployeeLoading}>
              {addEmployeeLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Employee
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Employee Dialog */}
      <AlertDialog open={editEmployeeDialogOpen} onOpenChange={setEditEmployeeDialogOpen}>
        <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Edit Employee Details</AlertDialogTitle>
            <AlertDialogDescription>
              Update {selectedEmployee?.displayName}&apos;s information. Changes will be saved immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Display Name */}
              <div>
                <Label htmlFor="editDisplayName">Display Name *</Label>
                <Input
                  id="editDisplayName"
                  value={editEmployeeForm.displayName}
                  onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, displayName: e.target.value })}
                  placeholder="John Doe"
                  required
                />
              </div>

              {/* Email */}
              <div>
                <Label htmlFor="editEmail">Email *</Label>
                <Input
                  id="editEmail"
                  type="email"
                  value={editEmployeeForm.email}
                  onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, email: e.target.value })}
                  placeholder="employee@company.com"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">Changing email will update login credentials</p>
              </div>

              {/* Department */}
              <div>
                <Label htmlFor="editDepartment">Department</Label>
                <Input
                  id="editDepartment"
                  value={editEmployeeForm.department}
                  onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, department: e.target.value })}
                  placeholder="e.g., Engineering, Sales"
                  list="edit-departments-list"
                />
                <datalist id="edit-departments-list">
                  {departments.map(dept => (
                    <option key={dept} value={dept} />
                  ))}
                </datalist>
              </div>

              {/* Position */}
              <div>
                <Label htmlFor="editPosition">Position</Label>
                <Input
                  id="editPosition"
                  value={editEmployeeForm.position}
                  onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, position: e.target.value })}
                  placeholder="e.g., Software Engineer"
                />
              </div>

              {/* Phone Number */}
              <div>
                <Label htmlFor="editPhoneNumber">Phone Number</Label>
                <Input
                  id="editPhoneNumber"
                  type="tel"
                  value={editEmployeeForm.phoneNumber}
                  onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, phoneNumber: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              {/* Hire Date */}
              <div>
                <Label htmlFor="editHireDate">Hire Date</Label>
                <Input
                  id="editHireDate"
                  type="date"
                  value={editEmployeeForm.hireDate}
                  onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, hireDate: e.target.value })}
                />
              </div>

              {/* Date of Birth */}
              <div className="md:col-span-2">
                <Label htmlFor="editDateOfBirth">Date of Birth</Label>
                <Input
                  id="editDateOfBirth"
                  type="date"
                  value={editEmployeeForm.dateOfBirth}
                  onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, dateOfBirth: e.target.value })}
                />
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={editEmployeeLoading}>Cancel</AlertDialogCancel>
            <Button onClick={handleEditEmployee} disabled={editEmployeeLoading}>
              {editEmployeeLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Pencil className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}