"use client";

import { useState, useEffect } from "react";
import { Employee, AttendanceRecord, Note } from "@/types";
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
import { calculateTenure } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { formatDate, formatTime, isToday } from "@/lib/utils";
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
} from "lucide-react";
import { getNotes } from "@/app/actions/notes";
import { getEmployeeFaceDescriptor } from "@/app/actions/face";
import { createIssue } from "@/app/actions/issues";
import type { IssueCategory } from "@/types";
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
  const { toast } = useToast();

  /** Employee's local date (YYYY-MM-DD) — uses browser local time so clock in/out work in all timezones. */
  function getLocalDateString(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when employee changes
  }, [employee.id]);

  async function loadData() {
    setLoading(true);
    try {
      const [today, history, notesData, stats, monthly, descriptor] = await Promise.all([
        getTodayAttendance(employee.id, getLocalDateString()),
        getAttendanceHistory(employee.id, 10),
        getNotes(employee.id, employee.id, employee.role === "management"), // Updated signature
        getEmployeeAttendanceStats(employee.id, 30),
        getEmployeeMonthlyStats(employee.id, 6),
        getEmployeeFaceDescriptor(employee.id),
      ]);

      setTodayAttendance(today ? { ...today } : null); // Create mutable copy
      setAttendanceHistory(history.map(record => ({ ...record }))); // Create mutable copies
      setNotes(notesData.map(note => ({ ...note }))); // Create mutable copies
      setAttendanceStats(stats);
      setMonthlyStats(monthly);
      setFaceDescriptor(descriptor);
      
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
      } else {
        toast({ title: "Failed to report issue", description: result.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to report issue", variant: "destructive" });
    } finally {
      setIssueSubmitting(false);
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
                    <p className="font-medium">
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
                {todayAttendance.totalHours !== undefined && (
                  <div>
                    <p className="text-sm text-muted-foreground">Total Hours</p>
                    <p className="font-medium">
                      {todayAttendance.totalHours} hrs
                    </p>
                  </div>
                )}
              </div>

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
                  const moreNotes = await getNotes(employee.id, employee.id, employee.role === "management");
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
