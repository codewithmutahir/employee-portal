"use client";

import { AttendanceRecord } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, LogOut, AlertTriangle, CheckCircle, Clock4 } from "lucide-react";
import { formatDate, formatTime, formatScheduleHm } from "@/lib/utils";
import { resolveAttendanceStatusLabel } from "@/lib/attendance-status";
import type { AttendanceStatus } from "@/types";

/**
 * Friendly minutes-late text:
 *  - `lateMinutesAfterGrace` is what the employee actually sees (e.g. clock-in
 *    7:18 with 15-min grace and 7:00 schedule = "3 min late", not "18 min").
 *  - Returns null when we lack enough data to compute it.
 */
function formatLateBy(record: AttendanceRecord): string | null {
  const after = record.lateMinutesAfterGrace;
  if (after === null || after === undefined) return null;
  if (after <= 0) return null;
  return `${after} min`;
}

interface AttendanceHistoryProps {
  records: AttendanceRecord[];
  limit?: number;
  showViewAll?: boolean;
  onViewAll?: () => void;
}

export default function AttendanceHistory({
  records,
  limit = 10,
  showViewAll = true,
  onViewAll,
}: AttendanceHistoryProps) {
  const displayRecords = records.slice(0, limit);
  const hasMore = records.length > limit;

  const getStatusBadge = (record: AttendanceRecord) => {
    const label = resolveAttendanceStatusLabel(record);

    if (label === "Absent") {
      return (
        <Badge variant="outline" className="text-rose-600 border-rose-200 bg-rose-50">
          <Clock4 className="w-3 h-3 mr-1" />
          Absent
        </Badge>
      );
    }

    if (label === "Partial") {
      return (
        <Badge variant="secondary" className="text-amber-800 bg-amber-50 border-amber-200">
          <Clock className="w-3 h-3 mr-1" />
          In progress
        </Badge>
      );
    }

    const s = label as AttendanceStatus;
    if (s === "Late In") {
      const lateBy = formatLateBy(record);
      return (
        <Badge variant="secondary" className="text-red-900 bg-red-100 border-red-300">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Late In{lateBy ? ` · ${lateBy}` : ""}
        </Badge>
      );
    }
    if (s === "Half Day") {
      return (
        <Badge variant="outline" className="text-slate-600 bg-slate-50 border-slate-200">
          <Clock4 className="w-3 h-3 mr-1" />
          Half Day
        </Badge>
      );
    }

    return (
      <Badge variant="default" className="text-green-700 bg-green-50 border-green-200">
        <CheckCircle className="w-3 h-3 mr-1" />
        On Time
      </Badge>
    );
  };

  // Record.date is YYYY-MM-DD (calendar day). Parse as local date so "Today"/"Yesterday"/weekday are correct in all timezones.
  const formatAttendanceDate = (dateString: string) => {
    if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString.trim())) return dateString || 'N/A';
    try {
      const date = new Date(dateString.trim() + 'T12:00:00');
      if (isNaN(date.getTime())) return dateString;
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      if (date.toDateString() === today.toDateString()) return "Today";
      if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString || 'N/A';
    }
  };

  const calculateDuration = (clockIn?: string, clockOut?: string, breaks: any[] = []) => {
    if (!clockIn || !clockOut) return null;

    const start = new Date(clockIn);
    const end = new Date(clockOut);
    const totalMs = end.getTime() - start.getTime();

    let breakMs = 0;
    breaks.forEach((breakRecord: any) => {
      if (breakRecord.endTime) {
        breakMs += new Date(breakRecord.endTime).getTime() - new Date(breakRecord.startTime).getTime();
      }
    });

    const workMs = totalMs - breakMs;
    const hours = Math.floor(workMs / (1000 * 60 * 60));
    const minutes = Math.floor((workMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div className="space-y-4">
      {displayRecords.length > 0 ? (
        <div className="space-y-3">
          {displayRecords.map((record) => {
            const statusLabel = resolveAttendanceStatusLabel(record);
            const isLate = statusLabel === 'Late In';
            return (
            <Card key={record.id} className={`hover:shadow-md transition-shadow ${isLate ? 'border-red-300 bg-red-50/50' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    {/* Date and Status */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium text-base sm:text-lg">
                            {formatAttendanceDate(record.date)}
                          </span>
                        </div>
                        {getStatusBadge(record)}
                      </div>

                      {record.isEditedByManagement && (
                        <Badge variant="outline" className="text-xs text-orange-600 border-orange-200 bg-orange-50 w-fit">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Edited
                        </Badge>
                      )}
                    </div>

                    {/* Time Details */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 text-sm">
                      {record.clockIn && (
                        <div className="flex items-center gap-2">
                          <Clock className={`w-4 h-4 ${isLate ? 'text-red-600' : 'text-green-600'}`} />
                          <div>
                            <p className="text-muted-foreground text-xs">Clock In</p>
                            <p className={`font-medium ${isLate ? 'text-red-600' : ''}`}>{formatTime(record.clockIn)}</p>
                          </div>
                        </div>
                      )}

                      {record.clockOut && (
                        <div className="flex items-center gap-2">
                          <LogOut className="w-4 h-4 text-blue-600" />
                          <div>
                            <p className="text-muted-foreground text-xs">Clock Out</p>
                            <p className="font-medium">{formatTime(record.clockOut)}</p>
                          </div>
                        </div>
                      )}

                      {record.totalHours && (
                        <div className="flex items-center gap-2">
                          <Clock4 className="w-4 h-4 text-purple-600" />
                          <div>
                            <p className="text-muted-foreground text-xs">Total Hours</p>
                            <p className="font-medium">{record.totalHours}h</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {isLate && (() => {
                      const lateBy = formatLateBy(record);
                      const sched = record.resolvedScheduledStart
                        ? formatScheduleHm(record.resolvedScheduledStart)
                        : null;
                      const grace = record.graceMinutes ?? 15;
                      const actual = record.clockIn ? formatTime(record.clockIn) : null;
                      const mismatch = record.scheduleMismatchSuspected;
                      if (mismatch) {
                        return (
                          <div className="text-sm border border-amber-300 bg-amber-50 rounded-md px-3 py-2 space-y-1">
                            <p className="font-medium text-amber-900">
                              Possible schedule mismatch
                            </p>
                            <p className="text-amber-800">
                              Clocked in at <strong>{actual ?? "—"}</strong> but the saved
                              schedule starts at <strong>{sched ?? "—"}</strong>. The system
                              marked this Late In, but the gap is more than 4 hours so
                              it&apos;s usually a wrong AM/PM or wrong-shift configuration.
                              Update the employee&apos;s schedule (or this day&apos;s shift) so
                              real lateness can be measured against the correct start time.
                            </p>
                          </div>
                        );
                      }
                      return (
                        <p className="text-sm text-red-600 font-medium border border-red-200 bg-red-50/80 rounded-md px-3 py-2">
                          Late by {lateBy ?? `more than ${grace} min`}
                          {sched ? ` — scheduled ${sched}` : ""}
                          {actual ? `, clocked in at ${actual}` : ""}
                          {` (${grace}-min grace).`}
                        </p>
                      );
                    })()}

                    {/* Breaks */}
                    {record.breaks && record.breaks.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        <p className="mb-1">Breaks: {record.breaks.length}</p>
                        <div className="flex flex-wrap gap-1">
                          {record.breaks.map((breakRecord, idx) => (
                            <span key={idx} className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-gray-700">
                              {formatTime(breakRecord.startTime)}
                              {breakRecord.endTime && ` - ${formatTime(breakRecord.endTime)}`}
                              {breakRecord.duration && ` (${breakRecord.duration}m)`}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })}

          {hasMore && showViewAll && (
            <div className="text-center pt-2">
              <Button variant="outline" onClick={onViewAll} className="text-sm">
                View Full History ({records.length - limit} more records)
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No attendance records found</p>
        </div>
      )}
    </div>
  );
}
