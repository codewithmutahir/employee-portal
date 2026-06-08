"use client";

import { useState, useEffect, type ReactNode } from "react";
import {
  Employee,
  AttendanceRecord,
  Note,
  Compensation,
  CompensationHistoryEvent,
  LeaveRequest,
  LeaveRequestKind,
} from "@/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  clockIn,
  clockOut,
  startBreak,
  endBreak,
  getTodayAttendance,
  getAttendanceHistory,
  getEmployeeAttendanceStats,
  getEmployeeMonthlyStats,
} from "@/app/actions/attendance";
import { getCompensation, getCompensationHistory } from "@/app/actions/employees";
import { calculateTenure } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { formatDate, formatTime, formatScheduleHm, isToday } from "@/lib/utils";
import { salaryPerDayForMonth, workingDaysInMonth } from "@/lib/payroll-helpers";
import { resolveAttendanceStatusLabel } from "@/lib/attendance-status";
import { useAuth } from "@/components/auth-provider";
import {
  Clock,
  Coffee,
  LogOut,
  Calendar,
  FileText,
  BarChart3,
  TrendingUp,
  ScanFace,
  Award,
  Star,
  Medal,
  Trophy,
  Gem,
  Megaphone,
  Settings,
  LayoutDashboard,
  AlertCircle,
  DollarSign,
  ClipboardList,
} from "lucide-react";
import { getNotes } from "@/app/actions/notes";
import { getEmployeeFaceDescriptor } from "@/app/actions/face";
import { preloadFaceModels } from "@/lib/face-models";
import { createMyLeaveRequest, getMyLeaveRequests } from "@/app/actions/leaves";
import { createIssue, getMyIssues } from "@/app/actions/issues";
import type { IssueCategory, Issue } from "@/types";
import AttendanceHistory from "./attendance-history";
import { FaceVerificationDialog } from "./face-verification-dialog";
import { FaceEnrollment } from "./face-enrollment";
import NotesSection from "./notes-section";
import { ProfileSettings } from "./profile-settings";
import { Announcements } from "./announcements";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

interface EmployeeDashboardProps {
  employee: Employee;
}

export default function EmployeeDashboard({
  employee,
}: EmployeeDashboardProps) {
  const { refreshEmployee } = useAuth();
  const [todayAttendance, setTodayAttendance] =
    useState<AttendanceRecord | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<
    AttendanceRecord[]
  >([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLimit, setNotesLimit] = useState<number>(5);
  const [attendanceStats, setAttendanceStats] = useState<any>(null);
  const [monthlyStats, setMonthlyStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [faceDescriptor, setFaceDescriptor] = useState<number[] | null>(null);
  const [faceDialogOpen, setFaceDialogOpen] = useState(false);
  const [faceDialogAction, setFaceDialogAction] = useState<"clockIn" | "clockOut">("clockIn");
  const [activeTab, setActiveTab] = useState<"dashboard" | "announcements" | "settings">("dashboard");
  const [issueForm, setIssueForm] = useState({ title: "", description: "", category: "other" as IssueCategory });
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [myIssues, setMyIssues] = useState<Issue[]>([]);
  const [compensation, setCompensation] = useState<Compensation | null>(null);
  const [compensationHistory, setCompensationHistory] = useState<CompensationHistoryEvent[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveForm, setLeaveForm] = useState(() => {
    const d = new Date();
    const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { startDate: s, endDate: s, kind: "monthly" as LeaveRequestKind, reason: "" };
  });
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const { toast } = useToast();

  /** Employee's local date (YYYY-MM-DD) — uses browser local time so clock in/out work in all timezones. */
  function getLocalDateString(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function getBrowserTimeZone(): string | undefined {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return undefined;
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when employee changes
  }, [employee.id]);

  // Kick off face-model download in the background as soon as the dashboard
  // is visible.  Uses requestIdleCallback when available so it doesn't
  // compete with the initial data fetch.
  useEffect(() => {
    const kick = () => preloadFaceModels();
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(kick, { timeout: 4000 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(kick, 1500);
    return () => clearTimeout(t);
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const leavePromise =
        employee.role === "employee"
          ? getMyLeaveRequests(employee.id, employee.id)
          : Promise.resolve([] as LeaveRequest[]);

      const issuesPromise =
        employee.role === "employee"
          ? getMyIssues(employee.id, employee.id)
          : Promise.resolve([] as Issue[]);

      const [today, history, notesData, stats, monthly, descriptor, comp, compHistory, leaves, issuesList] = await Promise.all([
        getTodayAttendance(employee.id, getLocalDateString(), employee.scheduleStart, getBrowserTimeZone()),
        getAttendanceHistory(employee.id, 50, employee.scheduleStart, getBrowserTimeZone()),
        getNotes(employee.id, employee.id, employee.role === "management" || employee.role === "admin"), // Updated signature
        getEmployeeAttendanceStats(employee.id, 30),
        getEmployeeMonthlyStats(employee.id, 6),
        getEmployeeFaceDescriptor(employee.id),
        getCompensation(employee.id),
        getCompensationHistory(employee.id, employee.id),
        leavePromise,
        issuesPromise,
      ]);

      setTodayAttendance(today ? { ...today } : null); // Create mutable copy
      setAttendanceHistory(history.map(record => ({ ...record }))); // Create mutable copies
      setNotes(notesData.map(note => ({ ...note }))); // Create mutable copies
      setAttendanceStats(stats);
      setMonthlyStats(monthly);
      setFaceDescriptor(descriptor);
      setCompensation(comp);
      setCompensationHistory(compHistory.map((evt) => ({ ...evt })));
      setLeaveRequests(leaves);
      setMyIssues(issuesList);
    } catch (error) {
      console.error("Error loading employee data:", error);
      toast({
        title: "Error",
        description: "Failed to load data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleClockIn() {
    if (actionLoading) return;
    setActionLoading("clockIn");
    try {
      const result = await clockIn(employee.id, getLocalDateString());
      if (result.success) {
        toast({ title: "Clocked in successfully" });
        await loadData();
      } else {
        toast({
          title: "Could not clock in",
          description: result.error || "Failed to clock in",
          variant: "destructive",
        });
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleClockOut() {
    if (actionLoading) return;
    // Use record's date so overnight shifts clock out on the correct day (e.g. yesterday's open shift).
    const dateKey = todayAttendance?.date ?? getLocalDateString();
    setActionLoading("clockOut");
    try {
      const result = await clockOut(employee.id, dateKey);
      if (result.success) {
        toast({ title: "Clocked out successfully" });
        await loadData();
      } else {
        toast({
          title: "Could not clock out",
          description: result.error || "Failed to clock out",
          variant: "destructive",
        });
      }
    } finally {
      setActionLoading(null);
    }
  }

  function openFaceClockIn() {
    setFaceDialogAction("clockIn");
    setFaceDialogOpen(true);
  }

  function openFaceClockOut() {
    setFaceDialogAction("clockOut");
    setFaceDialogOpen(true);
  }

  async function handleFaceVerified() {
    if (faceDialogAction === "clockIn") {
      await handleClockIn();
    } else {
      await handleClockOut();
    }
  }

  async function handleStartBreak() {
    if (actionLoading) return;
    const dateKey = todayAttendance?.date ?? getLocalDateString();
    setActionLoading("startBreak");
    try {
      const result = await startBreak(employee.id, dateKey);
      if (result.success) {
        toast({ title: "Break started" });
        await loadData();
      } else {
        toast({
          title: "Could not start break",
          description: result.error || "Failed to start break",
          variant: "destructive",
        });
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleEndBreak() {
    if (actionLoading) return;
    const dateKey = todayAttendance?.date ?? getLocalDateString();
    setActionLoading("endBreak");
    try {
      const result = await endBreak(employee.id, dateKey);
      if (result.success) {
        toast({ title: "Break ended" });
        await loadData();
      } else {
        toast({
          title: "Could not end break",
          description: result.error || "Failed to end break",
          variant: "destructive",
        });
      }
    } finally {
      setActionLoading(null);
    }
  }

  const hasActiveBreak = todayAttendance?.breaks?.some((b) => !b.endTime);
  const canClockIn = !todayAttendance?.clockIn;
  const isClockedInNotOut = todayAttendance?.clockIn && !todayAttendance?.clockOut;
  const canClockOut = isClockedInNotOut && !hasActiveBreak;

  async function handleReportIssue() {
    if (!issueForm.title.trim()) {
      toast({ title: "Title required", description: "Please enter a title for the issue", variant: "destructive" });
      return;
    }
    if (!issueForm.description.trim()) {
      toast({ title: "Description required", description: "Please describe the issue", variant: "destructive" });
      return;
    }
    setIssueSubmitting(true);
    try {
      const result = await createIssue(
        { title: issueForm.title.trim(), description: issueForm.description.trim(), category: issueForm.category },
        employee.id,
        employee.displayName,
        employee.email
      );
      if (result.success) {
        toast({ title: "Issue reported", description: "Management has been notified and will look into it." });
        setIssueForm({ title: "", description: "", category: "other" });
        try {
          const list = await getMyIssues(employee.id, employee.id);
          setMyIssues(list);
        } catch {
          /* ignore */
        }
      } else {
        toast({ title: "Failed to report issue", description: result.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to report issue", variant: "destructive" });
    } finally {
      setIssueSubmitting(false);
    }
  }

  async function handleSubmitLeaveRequest() {
    if (employee.role !== "employee") return;
    if (!leaveForm.startDate || !leaveForm.endDate) {
      toast({ title: "Dates required", variant: "destructive" });
      return;
    }
    setLeaveSubmitting(true);
    try {
      const result = await createMyLeaveRequest(
        employee.id,
        {
          startDate: leaveForm.startDate,
          endDate: leaveForm.endDate,
          kind: leaveForm.kind,
          reason: leaveForm.reason.trim() || undefined,
        },
        employee.id
      );
      if (result.success) {
        toast({ title: "Leave request submitted", description: "Management or admin will review it." });
        const d = new Date();
        const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        setLeaveForm({ startDate: s, endDate: s, kind: "monthly", reason: "" });
        const list = await getMyLeaveRequests(employee.id, employee.id);
        setLeaveRequests(list);
      } else {
        toast({ title: "Could not submit", description: result.error, variant: "destructive" });
      }
    } catch (e: unknown) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLeaveSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <Skeleton className="h-9 w-64 mb-2" />
            <Skeleton className="h-5 w-48" />
          </div>
        </div>

        {/* Profile Card Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-full sm:w-40" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-32" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-36" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-28" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today's Attendance Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40 mb-2" />
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-24" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-24" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-4">
              <Skeleton className="h-10 w-full sm:w-32" />
              <Skeleton className="h-10 w-full sm:w-32" />
            </div>
          </CardContent>
        </Card>

        {/* Recent Attendance Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="border rounded-lg p-4 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <div className="grid grid-cols-2 gap-4">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-24 mb-2" />
              <Skeleton className="h-4 w-40" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-36" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-24 mb-2" />
              <Skeleton className="h-4 w-40" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">Welcome, {employee.displayName}</h2>
          <p className="text-muted-foreground">Employee Dashboard</p>
        </div>
        
        {/* Tab Navigation */}
        <div className="flex gap-2 p-1 bg-muted rounded-lg">
          <Button
            variant={activeTab === "dashboard" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("dashboard")}
            className="flex items-center gap-2"
          >
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Button>
          <Button
            variant={activeTab === "announcements" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("announcements")}
            className="flex items-center gap-2"
          >
            <Megaphone className="h-4 w-4" />
            <span className="hidden sm:inline">Announcements</span>
          </Button>
          <Button
            variant={activeTab === "settings" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("settings")}
            className="flex items-center gap-2"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </Button>
        </div>
      </div>

      {/* Announcements Tab */}
      {activeTab === "announcements" && (
        <Announcements employee={employee} isManagement={false} />
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <ProfileSettings 
          employee={employee} 
          onProfileUpdate={async () => {
            await refreshEmployee();
            await loadData();
          }} 
        />
      )}

      {/* Dashboard Tab */}
      {activeTab === "dashboard" && (
        <>
          {/* Face registration - show when not yet enrolled */}
          {!faceDescriptor && (
        <FaceEnrollment
          employeeId={employee.id}
          onEnrolled={() => loadData()}
        />
      )}

      {/* Face verification dialog for clock in/out */}
      <FaceVerificationDialog
        open={faceDialogOpen}
        onOpenChange={setFaceDialogOpen}
        actionType={faceDialogAction}
        employeeId={employee.id}
        storedDescriptor={faceDescriptor}
        onVerified={handleFaceVerified}
      />

      {/* Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium break-all">{employee.email}</p>
            </div>
            {employee.department && (
              <div>
                <p className="text-sm text-muted-foreground">Department</p>
                <p className="font-medium">{employee.department}</p>
              </div>
            )}
            {employee.position && (
              <div>
                <p className="text-sm text-muted-foreground">Position</p>
                <p className="font-medium">{employee.position}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Hire Date</p>
              <p className="font-medium">{formatDate(employee.hireDate)}</p>
            </div>
            {employee.scheduleStart && employee.scheduleEnd && (
              <div>
                <p className="text-sm text-muted-foreground">Working Hours</p>
                <p className="font-medium">{formatScheduleHm(employee.scheduleStart)} – {formatScheduleHm(employee.scheduleEnd)}</p>
              </div>
            )}
            {employee.dayOff && (
              <div>
                <p className="text-sm text-muted-foreground">Day Off</p>
                <p className="font-medium">{employee.dayOff}</p>
              </div>
            )}
            {employee.hireDate && (() => {
              const tenure = calculateTenure(employee.hireDate);
              if (!tenure) return null;
              return (
                <div className="sm:col-span-2">
                  <p className="text-sm text-muted-foreground">Time with Company</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg">
                      <Award className="h-5 w-5 text-primary" />
                      <span className="font-bold text-primary">{tenure.label}</span>
                    </div>
                    {tenure.years >= 1 && (
                      <span className={`inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full ${
                        tenure.years >= 25 ? 'bg-purple-100 text-purple-700' :
                        tenure.years >= 20 ? 'bg-slate-200 text-slate-700' :
                        tenure.years >= 10 ? 'bg-yellow-100 text-yellow-700' :
                        tenure.years >= 5 ? 'bg-gray-200 text-gray-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {tenure.years >= 25 && <Gem className="h-3 w-3" />}
                        {tenure.years >= 20 && tenure.years < 25 && <Trophy className="h-3 w-3" />}
                        {tenure.years >= 10 && tenure.years < 20 && <Medal className="h-3 w-3" />}
                        {tenure.years >= 5 && tenure.years < 10 && <Star className="h-3 w-3" />}
                        {tenure.years >= 25 ? 'Diamond Member' : 
                         tenure.years >= 20 ? 'Platinum Member' : 
                         tenure.years >= 10 ? 'Gold Member' : 
                         tenure.years >= 5 ? 'Silver Member' : 
                         `${tenure.years} Year${tenure.years > 1 ? 's' : ''} of Service`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </CardContent>
      </Card>

      {/* Today's Attendance (or open overnight shift from yesterday) */}
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s Attendance</CardTitle>
          <CardDescription>
            {todayAttendance?.date && todayAttendance.date !== getLocalDateString() && todayAttendance.clockIn && !todayAttendance.clockOut
              ? `Overnight shift (started ${formatDate(todayAttendance.date)}) — clock out when finished`
              : formatDate(new Date())}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {todayAttendance ? (
            <>
              {todayAttendance.date && todayAttendance.date !== getLocalDateString() && todayAttendance.clockIn && !todayAttendance.clockOut && (
                <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                  You have an open shift from yesterday. Clock out below when your shift ends.
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {todayAttendance.clockIn && (
                  <div>
                    <p className="text-sm text-muted-foreground">Clock In</p>
                    <p className={`font-medium ${todayAttendance.status === "Late In" ? "text-red-600" : ""}`}>
                      {formatTime(todayAttendance.clockIn)}
                    </p>
                  </div>
                )}
                {todayAttendance.clockOut && (
                  <div>
                    <p className="text-sm text-muted-foreground">Clock Out</p>
                    <p className="font-medium">
                      {formatTime(todayAttendance.clockOut)}
                    </p>
                  </div>
                )}
                {todayAttendance.resolvedScheduledStart && (
                  <div>
                    <p className="text-sm text-muted-foreground">Scheduled</p>
                    <p className="font-medium">
                      {formatScheduleHm(todayAttendance.resolvedScheduledStart)}
                    </p>
                  </div>
                )}
                {todayAttendance.clockIn && todayAttendance.status && (
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <p className={`font-medium ${todayAttendance.status === "Late In" ? "text-red-600" : ""}`}>
                      {(() => {
                        const label = resolveAttendanceStatusLabel(todayAttendance);
                        if (label === "Partial") return "In progress";
                        if (label === "Late In") {
                          const after = todayAttendance.lateMinutesAfterGrace;
                          return after && after > 0 ? `Late In · ${after} min` : "Late In";
                        }
                        return todayAttendance.status;
                      })()}
                    </p>
                  </div>
                )}
                {todayAttendance.totalHours !== undefined && (
                  <div>
                    <p className="text-sm text-muted-foreground">Total Hours</p>
                    <p className="font-medium">
                      {todayAttendance.totalHours} hrs
                    </p>
                  </div>
                )}
              </div>

              {todayAttendance.status === "Late In" &&
                todayAttendance.scheduleMismatchSuspected && (
                  <div className="text-sm border border-amber-300 bg-amber-50 rounded-md px-3 py-2 space-y-1">
                    <p className="font-medium text-amber-900">
                      Possible schedule mismatch
                    </p>
                    <p className="text-amber-800">
                      Today&apos;s clock-in is more than 4 hours after the saved
                      scheduled start
                      {todayAttendance.resolvedScheduledStart
                        ? ` (${formatScheduleHm(todayAttendance.resolvedScheduledStart)})`
                        : ""}
                      , so the &quot;Late In&quot; status is most likely the schedule being
                      configured against the wrong shift / AM-PM. Ask your manager
                      to update your schedule so future late detection is accurate.
                    </p>
                  </div>
                )}

              {todayAttendance.breaks && todayAttendance.breaks.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Breaks</p>
                  <div className="space-y-2">
                    {todayAttendance.breaks.map((breakRecord, idx) => (
                      <div key={idx} className="text-sm">
                        {formatTime(breakRecord.startTime)} -{" "}
                        {breakRecord.endTime
                          ? formatTime(breakRecord.endTime)
                          : "Active"}
                        {breakRecord.duration &&
                          ` (${breakRecord.duration} min)`}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row flex-wrap gap-2 pt-4">
                {canClockIn && (
                  <>
                    {faceDescriptor ? (
                      <Button
                        onClick={openFaceClockIn}
                        disabled={actionLoading !== null}
                        className="w-full sm:w-auto"
                      >
                        <ScanFace className="mr-2 h-4 w-4" />
                        Clock In (Face)
                      </Button>
                    ) : (
                      <Button
                        onClick={handleClockIn}
                        disabled={actionLoading !== null}
                        variant="outline"
                        className="w-full sm:w-auto"
                      >
                        <Clock className="mr-2 h-4 w-4" />
                        Clock In (no face)
                      </Button>
                    )}
                  </>
                )}
                {isClockedInNotOut && (
                  <>
                    {canClockOut && (
                      <>
                        {faceDescriptor ? (
                          <Button
                            onClick={openFaceClockOut}
                            disabled={actionLoading !== null}
                            className="w-full sm:w-auto"
                          >
                            <ScanFace className="mr-2 h-4 w-4" />
                            Clock Out (Face)
                          </Button>
                        ) : (
                          <Button
                            onClick={handleClockOut}
                            disabled={actionLoading !== null}
                            variant="outline"
                            className="w-full sm:w-auto"
                          >
                            <LogOut className="mr-2 h-4 w-4" />
                            Clock Out (no face)
                          </Button>
                        )}
                      </>
                    )}
                    {!hasActiveBreak ? (
                      <Button
                        variant="outline"
                        onClick={handleStartBreak}
                        disabled={actionLoading !== null}
                        className="w-full sm:w-auto"
                      >
                        <Coffee className="mr-2 h-4 w-4" />
                        Start Break
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          onClick={handleEndBreak}
                          disabled={actionLoading !== null}
                          className="w-full sm:w-auto"
                        >
                          <Coffee className="mr-2 h-4 w-4" />
                          End Break
                        </Button>
                        <p className="text-xs text-muted-foreground w-full sm:w-auto">End your break to unlock Clock out.</p>
                      </>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <div>
              <p className="text-muted-foreground mb-4">
                No attendance record for today
              </p>
              {faceDescriptor ? (
                <Button onClick={openFaceClockIn} disabled={actionLoading !== null} className="w-full sm:w-auto">
                  <ScanFace className="mr-2 h-4 w-4" />
                  Clock In (Face)
                </Button>
              ) : (
                <Button onClick={handleClockIn} disabled={actionLoading !== null} className="w-full sm:w-auto">
                  <Clock className="mr-2 h-4 w-4" />
                  Clock In
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Salary Slip */}
      {compensation && (
        <Card className="overflow-hidden border-0 shadow-md ring-1 ring-border/60">
          <CardHeader className="space-y-1 border-b bg-gradient-to-r from-primary/[0.07] via-muted/30 to-transparent pb-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <DollarSign className="h-5 w-5" />
                  </span>
                  Salary slip
                </CardTitle>
                <CardDescription className="text-base font-medium text-foreground/80">
                  {(() => {
                    const now = new Date();
                    return now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
                  })()}
                </CardDescription>
              </div>
              <div className="rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                {compensation.currency} · {workingDaysInMonth(new Date().getFullYear(), new Date().getMonth(), employee.dayOff || "Sunday")} working days
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {(() => {
              const now = new Date();
              const year = now.getFullYear();
              const month = now.getMonth();
              const dayOff = employee.dayOff || "Sunday";
              const workingDays = workingDaysInMonth(year, month, dayOff);
              const salaryPerDay = salaryPerDayForMonth(compensation.salary, year, month, dayOff);
              const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
              const latesCount = attendanceHistory.filter(
                (r) => r.date.startsWith(monthPrefix) && r.status === "Late In"
              ).length;

              const leavesDeduction = 0;
              const lateDeduction = compensation.lateDeduction || 0;
              const loanDeduction = compensation.loanDeduction || 0;
              const allowances = compensation.allowance || 0;
              const bonus = compensation.bonus || 0;

              const netSalary = compensation.salary - leavesDeduction - lateDeduction - loanDeduction + allowances + bonus;

              const fmt = (n: number, frac = false) =>
                `${compensation.currency} ${n.toLocaleString(undefined, frac ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 })}`;

              const Row = ({
                label,
                value,
                muted,
                emphasize,
                danger,
              }: {
                label: string;
                value: ReactNode;
                muted?: boolean;
                emphasize?: boolean;
                danger?: boolean;
              }) => (
                <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <span className={muted ? "text-muted-foreground" : "font-medium text-foreground/90"}>{label}</span>
                  <span
                    className={`text-right tabular-nums ${emphasize ? "font-semibold" : ""} ${danger ? "font-semibold text-red-600" : ""}`}
                  >
                    {value}
                  </span>
                </div>
              );

              return (
                <div className="bg-gradient-to-b from-muted/20 to-background">
                  <div className="border-b border-border/60 bg-card px-5 py-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Employee</p>
                        <p className="text-lg font-semibold tracking-tight">{employee.displayName}</p>
                      </div>
                      <div className="sm:text-right">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Leave balance</p>
                        <p className="text-2xl font-semibold tabular-nums text-primary">{compensation.leaveBalance ?? "—"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-0 sm:grid-cols-2 sm:divide-x sm:divide-border/60">
                    <div className="p-5 space-y-0.5">
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Schedule & base pay</p>
                      <Row label="Day off" value={dayOff} muted />
                      <Row label="Working days (this month)" value={workingDays} muted />
                      <Row label="Base salary" value={fmt(compensation.salary, true)} emphasize />
                      <Row label="Salary per day" value={fmt(salaryPerDay)} emphasize />
                    </div>
                    <div className="p-5 space-y-0.5 border-t border-border/60 sm:border-t-0">
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Adjustments</p>
                      <Row
                        label="Leaves deduction"
                        value={leavesDeduction > 0 ? fmt(leavesDeduction) : "—"}
                        danger={leavesDeduction > 0}
                        muted
                      />
                      <Row
                        label="Lates"
                        value={latesCount > 0 ? latesCount : "—"}
                        danger={latesCount > 0}
                        muted
                      />
                      <Row
                        label="Late deduction"
                        value={lateDeduction > 0 ? fmt(lateDeduction) : "—"}
                        danger={lateDeduction > 0}
                        muted
                      />
                      <Row
                        label="Loan deduction"
                        value={loanDeduction > 0 ? fmt(loanDeduction) : "—"}
                        danger={loanDeduction > 0}
                        muted
                      />
                      <Row label="Allowances" value={allowances > 0 ? fmt(allowances) : "—"} muted />
                      <Row label="Bonus" value={bonus > 0 ? fmt(bonus) : "—"} muted />
                    </div>
                  </div>

                  <div className="mx-5 mb-5 rounded-xl border border-primary/20 bg-primary/[0.08] px-4 py-4 shadow-inner">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm font-semibold uppercase tracking-wide text-primary">Net salary</span>
                      <span className="text-2xl font-bold tabular-nums tracking-tight text-primary">
                        {compensation.currency} {Math.round(netSalary).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-border/60 bg-muted/25 px-5 py-4 text-xs leading-relaxed text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground/70">How per-day pay is calculated:</span>{" "}
                      {compensation.currency} {compensation.salary.toLocaleString()} ÷ {workingDays} working days ={" "}
                      {compensation.currency} {salaryPerDay.toLocaleString()} per day (after your weekly day off).
                    </p>
                    {(() => {
                      const latestActive = [...compensationHistory]
                        .filter((e) => e.status === "active" && e.newSalary !== null)
                        .sort(
                          (a, b) =>
                            new Date(b.effectiveDate).getTime() -
                            new Date(a.effectiveDate).getTime()
                        )[0];
                      if (!latestActive) return null;
                      return (
                        <p className="mt-2">
                          <span className="font-medium text-foreground/70">
                            Effective from:
                          </span>{" "}
                          {formatDate(latestActive.effectiveDate)} ({latestActive.eventType}
                          {latestActive.previousSalary !== null
                            ? `, previously ${compensation.currency} ${latestActive.previousSalary.toLocaleString()}`
                            : ""}
                          ).
                        </p>
                      );
                    })()}
                    <p className="mt-2">
                      <span className="font-medium text-foreground/70">Lateness:</span> clock-in more than 15 minutes after
                      scheduled start (
                      {employee.scheduleStart ? formatScheduleHm(employee.scheduleStart) : "your set start"}
                      ) counts as Late In.
                    </p>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Salary changes — visible to the employee so retroactive raises/changes
          made by admins (with an effective date) are transparent. Sorted
          newest first. */}
      {compensation && compensationHistory.length > 0 && (
        <Card className="overflow-hidden border-0 shadow-md ring-1 ring-border/60">
          <CardHeader className="space-y-1 border-b bg-gradient-to-r from-emerald-500/[0.08] via-muted/30 to-transparent pb-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                    <TrendingUp className="h-5 w-5" />
                  </span>
                  Salary changes
                </CardTitle>
                <CardDescription className="text-base font-medium text-foreground/80">
                  History of raises, promotions, and corrections
                </CardDescription>
              </div>
              <div className="rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                {compensationHistory.length} event{compensationHistory.length === 1 ? "" : "s"}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border/60">
              {[...compensationHistory]
                .sort(
                  (a, b) =>
                    new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime()
                )
                .map((evt) => {
                  const prev = evt.previousSalary;
                  const next = evt.newSalary;
                  const isIncrease =
                    prev !== null && next !== null && next > prev;
                  const isDecrease =
                    prev !== null && next !== null && next < prev;
                  const effectiveDateLabel = formatDate(evt.effectiveDate);
                  const fmt = (n: number) =>
                    `${compensation.currency} ${n.toLocaleString()}`;
                  return (
                    <li
                      key={evt.id}
                      className={`px-5 py-4 ${evt.isAmended ? "opacity-60" : ""}`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              {evt.eventType}
                            </span>
                            <Badge
                              variant="outline"
                              className={
                                evt.status === "scheduled"
                                  ? "border-blue-200 bg-blue-50 text-blue-800"
                                  : evt.status === "active"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                    : "border-slate-200 bg-slate-50 text-slate-600"
                              }
                            >
                              {evt.status === "scheduled"
                                ? "Scheduled"
                                : evt.status === "active"
                                  ? "Active"
                                  : "Superseded"}
                            </Badge>
                            {evt.isRetroactive && (
                              <Badge
                                variant="outline"
                                className="border-amber-300 bg-amber-50 text-amber-900"
                              >
                                Backdated
                              </Badge>
                            )}
                            {evt.isAmended && (
                              <Badge
                                variant="outline"
                                className="border-amber-300 bg-amber-50 text-amber-900"
                              >
                                Amended
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Effective {effectiveDateLabel}
                          </p>
                          {evt.reason && (
                            <p className="text-xs text-muted-foreground">
                              Reason: {evt.reason}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="flex items-center justify-end gap-2 text-sm tabular-nums">
                            <span className="text-muted-foreground">
                              {prev === null ? "—" : fmt(prev)}
                            </span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-semibold text-foreground">
                              {next === null ? "—" : fmt(next)}
                            </span>
                          </div>
                          {evt.percentChange !== null && evt.percentChange !== 0 && (
                            <p
                              className={`mt-0.5 text-xs font-medium ${
                                isIncrease
                                  ? "text-emerald-600"
                                  : isDecrease
                                    ? "text-red-600"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {evt.percentChange > 0 ? "+" : ""}
                              {evt.percentChange}%
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
            </ul>
            <div className="border-t border-border/60 bg-muted/25 px-5 py-3 text-xs leading-relaxed text-muted-foreground">
              Reports and CSV exports use the salary that was effective on each
              specific work day, so retroactive raises are reflected
              automatically.
            </div>
          </CardContent>
        </Card>
      )}

      {employee.role === "employee" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Request leave
            </CardTitle>
            <CardDescription>
              <strong>Monthly</strong> and <strong>paid</strong> leave usually draw from your accrued balance once approved. <strong>Emergency</strong> and <strong>unpaid</strong> are for urgent or unpaid time off; balance rules are applied when management approves. A manager or administrator must approve every request.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="leave-start">From</Label>
                <Input
                  id="leave-start"
                  type="date"
                  value={leaveForm.startDate}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="leave-end">To</Label>
                <Input
                  id="leave-end"
                  type="date"
                  value={leaveForm.endDate}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Leave type</Label>
              <Select
                value={leaveForm.kind}
                onValueChange={(v) => setLeaveForm((f) => ({ ...f, kind: v as LeaveRequestKind }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly accrued leave</SelectItem>
                  <SelectItem value="paid">Paid leave</SelectItem>
                  <SelectItem value="emergency">Emergency leave</SelectItem>
                  <SelectItem value="unpaid">Unpaid leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="leave-reason">Reason (optional)</Label>
              <Textarea
                id="leave-reason"
                rows={2}
                value={leaveForm.reason}
                onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Brief reason for your absence"
              />
            </div>
            <Button onClick={handleSubmitLeaveRequest} disabled={leaveSubmitting}>
              {leaveSubmitting ? <LoadingSpinner label="Submitting" /> : "Submit leave request"}
            </Button>

            {leaveRequests.length > 0 && (
              <div className="space-y-2 border-t pt-4">
                <p className="text-sm font-medium">Your requests</p>
                <ul className="space-y-2 text-sm">
                  {leaveRequests.map((r) => (
                    <li key={r.id} className="flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                      <span>
                        {r.startDate} → {r.endDate} · {r.kind}
                        {r.source === "absence_default_emergency" ? " · unplanned" : ""}
                      </span>
                      <Badge
                        variant={
                          r.status === "approved"
                            ? "default"
                            : r.status === "rejected"
                              ? "destructive"
                              : "secondary"
                        }
                        className="w-fit capitalize"
                      >
                        {r.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Report an issue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Report an issue
          </CardTitle>
          <CardDescription>
            Something wrong? Report it and management will be notified by email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="issue-title">Title</Label>
            <Input
              id="issue-title"
              placeholder="Brief summary of the issue"
              value={issueForm.title}
              onChange={(e) => setIssueForm((f) => ({ ...f, title: e.target.value }))}
              disabled={issueSubmitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="issue-category">Category</Label>
            <select
              id="issue-category"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={issueForm.category}
              onChange={(e) => setIssueForm((f) => ({ ...f, category: e.target.value as IssueCategory }))}
              disabled={issueSubmitting}
            >
              <option value="technical">Technical</option>
              <option value="access">Access / Login</option>
              <option value="policy">Policy</option>
              <option value="facility">Facility</option>
              <option value="payroll">Payroll</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="issue-description">Description</Label>
            <Textarea
              id="issue-description"
              placeholder="Describe the issue in detail..."
              value={issueForm.description}
              onChange={(e) => setIssueForm((f) => ({ ...f, description: e.target.value }))}
              rows={4}
              disabled={issueSubmitting}
            />
          </div>
          <Button onClick={handleReportIssue} disabled={issueSubmitting}>
            {issueSubmitting ? (
              <LoadingSpinner label="Submitting" />
            ) : (
              <>
                <AlertCircle className="mr-2 h-4 w-4" />
                Submit issue
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {employee.role === "employee" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Your reported issues
            </CardTitle>
            <CardDescription>
              Status updates and messages from management appear here. You also receive email when an issue is updated.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {myIssues.length === 0 ? (
              <p className="text-sm text-muted-foreground">You have not reported any issues yet.</p>
            ) : (
              <ul className="space-y-3">
                {myIssues.map((iss) => (
                  <li key={iss.id} className="rounded-lg border p-4 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium">{iss.title}</p>
                      <Badge
                        variant="secondary"
                        className={`capitalize shrink-0 ${
                          iss.status === "open"
                            ? "bg-amber-100 text-amber-900 border-amber-200"
                            : iss.status === "in_progress"
                              ? "bg-blue-100 text-blue-900 border-blue-200"
                              : iss.status === "resolved"
                                ? "bg-green-100 text-green-900 border-green-200"
                                : "bg-muted"
                        }`}
                      >
                        {iss.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Reported {formatDate(iss.createdAt)}
                      {iss.updatedAt && iss.updatedAt !== iss.createdAt ? ` · Updated ${formatDate(iss.updatedAt)}` : ""}
                    </p>
                    {iss.managementNote ? (
                      <div className="text-sm rounded-md bg-primary/5 border border-primary/10 p-3">
                        <span className="font-medium text-primary">Message from management: </span>
                        <span className="whitespace-pre-wrap">{iss.managementNote}</span>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No message from management yet.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Attendance */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Attendance</CardTitle>
          <CardDescription>Your attendance records</CardDescription>
        </CardHeader>
        <CardContent>
          <AttendanceHistory
            records={attendanceHistory}
            limit={10}
            showViewAll={attendanceHistory.length > 10}
            onViewAll={() => {
              // TODO: Implement full history view
              toast({
                title: "Feature Coming Soon",
                description: "Full attendance history view will be available soon.",
              });
            }}
          />
        </CardContent>
      </Card>

      {/* Notes from Management */}
      <Card>
        <CardContent className="pt-6">
          <NotesSection
            notes={notes}
            employeeId={employee.id}
            limit={notesLimit}
            showLoadMore={notes.length > notesLimit}
            onLoadMore={async () => {
              // Increase the limit to show more notes
              const newLimit = notesLimit + 5;
              setNotesLimit(newLimit);

              // If we need more notes from the server, fetch them
              if (newLimit > notes.length) {
                try {
                  const moreNotes = await getNotes(employee.id, employee.id, employee.role === "management" || employee.role === "admin");
                  setNotes(moreNotes);
                } catch (error) {
                  toast({
                    title: "Error",
                    description: "Failed to load more notes",
                    variant: "destructive",
                  });
                }
              }
            }}
          />
        </CardContent>
      </Card>

      {/* Reports & Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <BarChart3 className="mr-2 h-5 w-5" />
            Reports & Insights
          </CardTitle>
          <CardDescription>
            Your attendance summary and performance insights
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Attendance Statistics */}
          {attendanceStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 border rounded-lg">
                <p className="text-2xl font-bold text-primary">
                  {attendanceStats.presentDays}
                </p>
                <p className="text-sm text-muted-foreground">
                  Present Days (30 days)
                </p>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <p className="text-2xl font-bold text-primary">
                  {attendanceStats.totalHours.toFixed(1)}h
                </p>
                <p className="text-sm text-muted-foreground">Total Hours</p>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <p className="text-2xl font-bold text-primary">
                  {attendanceStats.averageHours.toFixed(1)}h
                </p>
                <p className="text-sm text-muted-foreground">
                  Average Hours/Day
                </p>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <p className="text-2xl font-bold text-primary">
                  {attendanceStats.attendanceRate.toFixed(1)}%
                </p>
                <p className="text-sm text-muted-foreground">Attendance Rate</p>
              </div>
            </div>
          )}

          {/* Monthly Hours Chart */}
          {monthlyStats && monthlyStats.monthlyStats.length > 0 && (
            <div>
              <h4 className="text-lg font-medium mb-4">
                Monthly Hours Overview
              </h4>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyStats.monthlyStats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="month"
                      tickFormatter={(value) => {
                        if (!value) return '';
                        try {
                          const date = new Date(value + "-01");
                          if (isNaN(date.getTime())) return String(value);
                          return date.toLocaleDateString("en-US", {
                            month: "short",
                            year: "2-digit",
                          });
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
                          const date = new Date(value + "-01");
                          if (isNaN(date.getTime())) return String(value);
                          return date.toLocaleDateString("en-US", {
                            month: "long",
                            year: "numeric",
                          });
                        } catch {
                          return String(value);
                        }
                      }}
                      formatter={(value: number | undefined) => [
                        `${(value || 0).toFixed(1)} hours`,
                        "Total Hours",
                      ]}
                    />
                    <Bar dataKey="totalHours" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Recent Attendance Trend */}
          {attendanceStats && attendanceStats.recentTrend.length > 0 && (
            <div>
              <h4 className="text-lg font-medium mb-4">
                Recent Attendance Trend
              </h4>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                <LineChart data={[...attendanceStats.recentTrend].reverse()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => {
                        if (!value) return '';
                        try {
                          const date = new Date(value);
                          if (isNaN(date.getTime())) return String(value);
                          return date.toLocaleDateString("en-US", {
                            weekday: "short",
                          });
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
                          return date.toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "short",
                            day: "numeric",
                          });
                        } catch {
                          return String(value);
                        }
                      }}
                      formatter={(value: number | undefined) => [
                        `${(value || 0).toFixed(1)} hours`,
                        "Hours Worked",
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="hours"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ fill: "#10b981", strokeWidth: 2, r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}
