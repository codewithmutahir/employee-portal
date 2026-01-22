"use client";

import { useState, useEffect } from "react";
import { Note } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  FileText,
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  User,
  AlertCircle
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { acknowledgeNote, addEmployeeResponse } from "@/app/actions/notes";
import { useToast } from "@/components/ui/use-toast";

interface NotesSectionProps {
  notes: Note[];
  employeeId: string;
  limit?: number;
  showLoadMore?: boolean;
  onLoadMore?: () => void;
}

export default function NotesSection({
  notes: initialNotes,
  employeeId,
  limit: initialLimit = 5,
  showLoadMore = true,
  onLoadMore,
}: NotesSectionProps) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [limit, setLimit] = useState<number>(initialLimit);
  const [acknowledgingNotes, setAcknowledgingNotes] = useState<Set<string>>(new Set());
  const [respondingNotes, setRespondingNotes] = useState<Set<string>>(new Set());
  const [responseTexts, setResponseTexts] = useState<Record<string, string>>({});
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Update local state when props change
  useEffect(() => {
    setNotes(initialNotes.map(note => ({ ...note }))); // Create fresh copies to avoid read-only issues
  }, [initialNotes]);

  const displayNotes = notes.slice(0, limit);
  const hasMore = notes.length > limit;

  const unacknowledgedCount = notes.filter(note => !note.acknowledgedAt).length;

  const handleAcknowledge = async (noteId: string) => {
    setAcknowledgingNotes(prev => new Set([...prev, noteId]));

    const result = await acknowledgeNote(noteId, employeeId);

    if (result.success) {
      toast({
        title: "Note acknowledged",
        description: "Thank you for acknowledging this note.",
      });
      // Update local state instead of reloading
      setNotes(prevNotes => {
        const newNotes = prevNotes.map(note => ({ ...note })); // Create fresh copies
        const noteIndex = newNotes.findIndex(note => note.id === noteId);
        if (noteIndex !== -1) {
          newNotes[noteIndex] = {
            ...newNotes[noteIndex],
            acknowledgedAt: new Date().toISOString(),
            acknowledgedBy: employeeId
          };
        }
        return newNotes;
      });
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to acknowledge note",
        variant: "destructive",
      });
    }

    setAcknowledgingNotes(prev => {
      const newSet = new Set(prev);
      newSet.delete(noteId);
      return newSet;
    });
  };

  const handleAddResponse = async (noteId: string) => {
    const response = responseTexts[noteId]?.trim();
    if (!response) return;

    setRespondingNotes(prev => new Set([...prev, noteId]));

    const result = await addEmployeeResponse(noteId, employeeId, response);

    if (result.success) {
      toast({
        title: "Response added",
        description: "Your response has been recorded.",
      });
      setResponseTexts(prev => ({ ...prev, [noteId]: "" }));
      // Update local state instead of reloading
      setNotes(prevNotes => {
        const newNotes = prevNotes.map(note => ({ ...note })); // Create fresh copies
        const noteIndex = newNotes.findIndex(note => note.id === noteId);
        if (noteIndex !== -1) {
          newNotes[noteIndex] = {
            ...newNotes[noteIndex],
            employeeResponse: response
          };
        }
        return newNotes;
      });
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to add response",
        variant: "destructive",
      });
    }

    setRespondingNotes(prev => {
      const newSet = new Set(prev);
      newSet.delete(noteId);
      return newSet;
    });
  };

  const toggleExpanded = (noteId: string) => {
    setExpandedNotes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(noteId)) {
        newSet.delete(noteId);
      } else {
        newSet.add(noteId);
      }
      return newSet;
    });
  };

  const handleLoadMore = () => {
    if (onLoadMore) {
      onLoadMore();
    } else {
      // Default behavior: increase limit to show more notes
      setLimit(prev => prev + 5);
    }
  };

  const formatNoteDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      return "Today";
    } else if (diffDays === 2) {
      return "Yesterday";
    } else if (diffDays <= 7) {
      return `${diffDays - 1} days ago`;
    } else {
      return formatDate(dateString);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Notes from Management</h3>
          {unacknowledgedCount > 0 && (
            <Badge variant="secondary" className="bg-orange-100 text-orange-800">
              {unacknowledgedCount} unread
            </Badge>
          )}
        </div>
      </div>

      {displayNotes.length > 0 ? (
        <div className="space-y-3">
          {displayNotes.map((note) => {
            const isAcknowledged = !!note.acknowledgedAt;
            const isExpanded = expandedNotes.has(note.id);
            const hasResponse = !!note.employeeResponse;

            return (
              <Card
                key={note.id}
                className={`transition-all ${isAcknowledged ? 'opacity-75 bg-gray-50' : 'border-orange-200 bg-orange-50/30'}`}
              >
                <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(note.id)}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium text-sm">Management</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">
                                {formatNoteDate(note.createdAt)}
                              </span>
                            </div>
                            {isAcknowledged ? (
                              <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Acknowledged
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-orange-200 text-orange-700 bg-orange-50">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                Unread
                              </Badge>
                            )}
                          </div>

                          <div className="text-left">
                            <p className="text-sm text-gray-700 line-clamp-2">
                              {note.content}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {!isAcknowledged && (
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAcknowledge(note.id);
                              }}
                              disabled={acknowledgingNotes.has(note.id)}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              {acknowledgingNotes.has(note.id) ? "Marking..." : "Acknowledge"}
                            </Button>
                          )}
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        <div className="space-y-4">
                          <div className="border-t pt-4">
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">
                              {note.content}
                            </p>
                          </div>

                          {hasResponse && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <MessageSquare className="w-4 h-4 text-blue-600" />
                                <span className="font-medium text-sm text-blue-800">Your Response</span>
                              </div>
                              <p className="text-sm text-blue-700 whitespace-pre-wrap">
                                {note.employeeResponse}
                              </p>
                            </div>
                          )}

                          {!hasResponse && isAcknowledged && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm font-medium">Add a response (optional)</span>
                              </div>
                              <div className="space-y-2">
                                <Textarea
                                  placeholder="Share your thoughts or follow-up..."
                                  value={responseTexts[note.id] || ""}
                                  onChange={(e) => setResponseTexts(prev => ({
                                    ...prev,
                                    [note.id]: e.target.value
                                  }))}
                                  className="min-h-[80px]"
                                />
                                <Button
                                  size="sm"
                                  onClick={() => handleAddResponse(note.id)}
                                  disabled={respondingNotes.has(note.id) || !responseTexts[note.id]?.trim()}
                                  className="bg-blue-600 hover:bg-blue-700"
                                >
                                  {respondingNotes.has(note.id) ? "Sending..." : "Send Response"}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })}

            {hasMore && showLoadMore && (
              <div className="text-center pt-2">
                <Button variant="outline" onClick={handleLoadMore} className="text-sm">
                  Load More Notes ({notes.length - limit} remaining)
                </Button>
              </div>
            )}
          </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No notes from management</p>
        </div>
      )}
    </div>
  );
}
