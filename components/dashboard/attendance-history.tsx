"use client";

import { AttendanceRecord } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, LogOut, AlertTriangle, CheckCircle, Clock4 } from "lucide-react";
import { formatDate, formatTime } from "@/lib/utils";

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
    if (!record.clockIn) {
      return (
        <Badge variant="outline" className="text-gray-500">
          <Clock4 className="w-3 h-3 mr-1" />
          No Clock In
        </Badge>
      );
    }

    if (!record.clockOut) {
      return (
        <Badge variant="secondary" className="text-yellow-600 bg-yellow-50">
          <Clock className="w-3 h-3 mr-1" />
          Partial
        </Badge>
      );
    }

    return (
      <Badge variant="default" className="text-green-700 bg-green-50 border-green-200">
        <CheckCircle className="w-3 h-3 mr-1" />
        Present
      </Badge>
    );
  };

  const formatAttendanceDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);

      if (date.toDateString() === today.toDateString()) {
        return "Today";
      } else if (date.toDateString() === yesterday.toDateString()) {
        return "Yesterday";
      } else {
        return date.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
      }
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
          {displayRecords.map((record) => (
            <Card key={record.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    {/* Date and Status */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium text-lg">
                            {formatAttendanceDate(record.date)}
                          </span>
                        </div>
                        {getStatusBadge(record)}
                      </div>

                      {record.isEditedByManagement && (
                        <Badge variant="outline" className="text-xs text-orange-600 border-orange-200 bg-orange-50">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Edited by Management
                        </Badge>
                      )}
                    </div>

                    {/* Time Details */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      {record.clockIn && (
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-green-600" />
                          <div>
                            <p className="text-muted-foreground text-xs">Clock In</p>
                            <p className="font-medium">{formatTime(record.clockIn)}</p>
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
          ))}

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
