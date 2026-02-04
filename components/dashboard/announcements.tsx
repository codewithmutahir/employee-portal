'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { Announcement, AnnouncementPriority, AnnouncementTarget, Employee } from '@/types';
import {
  getAnnouncementsForUser,
  getAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  markAnnouncementAsRead,
  getUnreadAnnouncementCount,
} from '@/app/actions/announcements';
import {
  Megaphone,
  Plus,
  Bell,
  BellRing,
  Pin,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  Check,
  AlertTriangle,
  AlertCircle,
  Info,
  Loader2,
  Calendar,
  Users,
  Building,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface AnnouncementsProps {
  employee: Employee;
  isManagement: boolean;
}

const priorityConfig: Record<AnnouncementPriority, { label: string; color: string; icon: any }> = {
  low: { label: 'Low', color: 'bg-gray-100 text-gray-700', icon: Info },
  normal: { label: 'Normal', color: 'bg-blue-100 text-blue-700', icon: Info },
  high: { label: 'High', color: 'bg-yellow-100 text-yellow-700', icon: AlertTriangle },
  urgent: { label: 'Urgent', color: 'bg-red-100 text-red-700', icon: AlertCircle },
};

const targetConfig: Record<AnnouncementTarget, { label: string; icon: any }> = {
  all: { label: 'Everyone', icon: Users },
  employees: { label: 'Employees Only', icon: Users },
  management: { label: 'Management Only', icon: Building },
  department: { label: 'Department', icon: Building },
};

export function Announcements({ employee, isManagement }: AnnouncementsProps) {
  const { toast } = useToast();
  
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Create announcement dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    content: '',
    priority: 'normal' as AnnouncementPriority,
    target: 'all' as AnnouncementTarget,
    targetDepartment: '',
    expiresAt: '',
    isPinned: false,
    sendEmail: true,
  });

  // Edit announcement
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [editing, setEditing] = useState(false);

  // Load announcements
  useEffect(() => {
    loadAnnouncements();
  }, [employee.id, isManagement]);

  async function loadAnnouncements() {
    setLoading(true);
    try {
      let data: Announcement[];
      
      if (isManagement) {
        data = await getAllAnnouncements();
      } else {
        data = await getAnnouncementsForUser(
          employee.id,
          employee.role,
          employee.department
        );
      }
      
      setAnnouncements(data);
      
      // Get unread count
      const unread = data.filter(a => !a.readBy.includes(employee.id)).length;
      setUnreadCount(unread);
    } catch (error) {
      console.error('Failed to load announcements:', error);
      toast({
        title: 'Error',
        description: 'Failed to load announcements',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAnnouncement() {
    if (!announcementForm.title || !announcementForm.content) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in title and content',
        variant: 'destructive',
      });
      return;
    }

    setCreating(true);
    try {
      const result = await createAnnouncement(
        {
          title: announcementForm.title,
          content: announcementForm.content,
          priority: announcementForm.priority,
          target: announcementForm.target,
          targetDepartment: announcementForm.target === 'department' ? announcementForm.targetDepartment : undefined,
          expiresAt: announcementForm.expiresAt || undefined,
          isPinned: announcementForm.isPinned,
        },
        employee.id,
        employee.displayName,
        announcementForm.sendEmail
      );

      if (result.success) {
        toast({
          title: 'Announcement Created',
          description: announcementForm.sendEmail 
            ? 'Announcement posted and emails sent to recipients'
            : 'Announcement posted successfully',
        });
        setAnnouncementForm({
          title: '',
          content: '',
          priority: 'normal',
          target: 'all',
          targetDepartment: '',
          expiresAt: '',
          isPinned: false,
          sendEmail: true,
        });
        setCreateDialogOpen(false);
        await loadAnnouncements();
      } else {
        toast({
          title: 'Failed',
          description: result.error || 'Failed to create announcement',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateAnnouncement() {
    if (!selectedAnnouncement) return;

    setEditing(true);
    try {
      const result = await updateAnnouncement(
        selectedAnnouncement.id,
        {
          title: announcementForm.title,
          content: announcementForm.content,
          priority: announcementForm.priority,
          target: announcementForm.target,
          targetDepartment: announcementForm.target === 'department' ? announcementForm.targetDepartment : undefined,
          expiresAt: announcementForm.expiresAt || undefined,
          isPinned: announcementForm.isPinned,
          isActive: selectedAnnouncement.isActive,
        },
        employee.id
      );

      if (result.success) {
        toast({
          title: 'Announcement Updated',
          description: 'Changes saved successfully',
        });
        setEditDialogOpen(false);
        setSelectedAnnouncement(null);
        await loadAnnouncements();
      } else {
        toast({
          title: 'Update Failed',
          description: result.error || 'Failed to update announcement',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setEditing(false);
    }
  }

  async function handleToggleActive(announcement: Announcement) {
    try {
      const result = await updateAnnouncement(
        announcement.id,
        { isActive: !announcement.isActive },
        employee.id
      );

      if (result.success) {
        toast({
          title: announcement.isActive ? 'Announcement Hidden' : 'Announcement Activated',
        });
        await loadAnnouncements();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update announcement',
        variant: 'destructive',
      });
    }
  }

  async function handleDeleteAnnouncement(announcementId: string) {
    try {
      const result = await deleteAnnouncement(announcementId);

      if (result.success) {
        toast({
          title: 'Announcement Deleted',
        });
        await loadAnnouncements();
      } else {
        toast({
          title: 'Delete Failed',
          description: result.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete announcement',
        variant: 'destructive',
      });
    }
  }

  async function handleMarkAsRead(announcementId: string) {
    try {
      await markAnnouncementAsRead(announcementId, employee.id);
      
      // Update local state
      setAnnouncements(announcements.map(a => 
        a.id === announcementId 
          ? { ...a, readBy: [...a.readBy, employee.id] }
          : a
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }

  function openEditDialog(announcement: Announcement) {
    setSelectedAnnouncement(announcement);
    setAnnouncementForm({
      title: announcement.title,
      content: announcement.content,
      priority: announcement.priority,
      target: announcement.target,
      targetDepartment: announcement.targetDepartment || '',
      expiresAt: announcement.expiresAt ? announcement.expiresAt.split('T')[0] : '',
      isPinned: announcement.isPinned,
      sendEmail: false,
    });
    setEditDialogOpen(true);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              Announcements
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {unreadCount} new
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Company news and updates</CardDescription>
          </div>
          {isManagement && (
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Announcement
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create Announcement</DialogTitle>
                  <DialogDescription>
                    Post a new announcement to employees
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                  <div>
                    <Label htmlFor="title">Title *</Label>
                    <Input
                      id="title"
                      value={announcementForm.title}
                      onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                      placeholder="Announcement title"
                    />
                  </div>
                  <div>
                    <Label htmlFor="content">Content *</Label>
                    <Textarea
                      id="content"
                      value={announcementForm.content}
                      onChange={(e) => setAnnouncementForm({ ...announcementForm, content: e.target.value })}
                      placeholder="Write your announcement here..."
                      rows={5}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Priority</Label>
                      <Select
                        value={announcementForm.priority}
                        onValueChange={(value: AnnouncementPriority) => 
                          setAnnouncementForm({ ...announcementForm, priority: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Target Audience</Label>
                      <Select
                        value={announcementForm.target}
                        onValueChange={(value: AnnouncementTarget) => 
                          setAnnouncementForm({ ...announcementForm, target: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Everyone</SelectItem>
                          <SelectItem value="employees">Employees Only</SelectItem>
                          <SelectItem value="management">Management Only</SelectItem>
                          <SelectItem value="department">Specific Department</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {announcementForm.target === 'department' && (
                    <div>
                      <Label>Department Name</Label>
                      <Input
                        value={announcementForm.targetDepartment}
                        onChange={(e) => setAnnouncementForm({ ...announcementForm, targetDepartment: e.target.value })}
                        placeholder="e.g., Engineering, Sales"
                      />
                    </div>
                  )}
                  <div>
                    <Label>Expires On (optional)</Label>
                    <Input
                      type="date"
                      value={announcementForm.expiresAt}
                      onChange={(e) => setAnnouncementForm({ ...announcementForm, expiresAt: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Announcement will be hidden after this date
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={announcementForm.isPinned}
                        onCheckedChange={(checked) => setAnnouncementForm({ ...announcementForm, isPinned: checked })}
                      />
                      <Label>Pin to top</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={announcementForm.sendEmail}
                        onCheckedChange={(checked) => setAnnouncementForm({ ...announcementForm, sendEmail: checked })}
                      />
                      <Label>Send email notification</Label>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateAnnouncement} disabled={creating}>
                    {creating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Posting...
                      </>
                    ) : (
                      'Post Announcement'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-12">
            <Megaphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No announcements yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {announcements.map((announcement) => {
              const isRead = announcement.readBy.includes(employee.id);
              const PriorityIcon = priorityConfig[announcement.priority].icon;
              const TargetIcon = targetConfig[announcement.target].icon;

              return (
                <div
                  key={announcement.id}
                  className={`p-4 rounded-lg border transition-colors ${
                    !isRead ? 'bg-primary/5 border-primary/20' : 'bg-background'
                  } ${!announcement.isActive && isManagement ? 'opacity-60' : ''}`}
                  onClick={() => !isRead && handleMarkAsRead(announcement.id)}
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        {announcement.isPinned && (
                          <Pin className="h-4 w-4 text-primary" />
                        )}
                        {!isRead && (
                          <BellRing className="h-4 w-4 text-primary" />
                        )}
                        <Badge className={priorityConfig[announcement.priority].color}>
                          <PriorityIcon className="h-3 w-3 mr-1" />
                          {priorityConfig[announcement.priority].label}
                        </Badge>
                        {isManagement && (
                          <Badge variant="outline" className="text-xs">
                            <TargetIcon className="h-3 w-3 mr-1" />
                            {announcement.target === 'department' 
                              ? announcement.targetDepartment 
                              : targetConfig[announcement.target].label}
                          </Badge>
                        )}
                        {!announcement.isActive && isManagement && (
                          <Badge variant="secondary">Hidden</Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-lg">{announcement.title}</h3>
                      <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                        {announcement.content}
                      </p>
                      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                        <span>By {announcement.createdByName}</span>
                        <span>{formatDate(announcement.createdAt)}</span>
                        {isManagement && (
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {announcement.readBy.length} read
                          </span>
                        )}
                      </div>
                    </div>
                    {isManagement && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(announcement);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleActive(announcement);
                          }}
                        >
                          {announcement.isActive ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Announcement</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this announcement? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteAnnouncement(announcement.id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                  {!isRead && (
                    <div className="mt-3 pt-3 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkAsRead(announcement.id);
                        }}
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Mark as Read
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Announcement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div>
              <Label>Title *</Label>
              <Input
                value={announcementForm.title}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
              />
            </div>
            <div>
              <Label>Content *</Label>
              <Textarea
                value={announcementForm.content}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, content: e.target.value })}
                rows={5}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Priority</Label>
                <Select
                  value={announcementForm.priority}
                  onValueChange={(value: AnnouncementPriority) => 
                    setAnnouncementForm({ ...announcementForm, priority: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target Audience</Label>
                <Select
                  value={announcementForm.target}
                  onValueChange={(value: AnnouncementTarget) => 
                    setAnnouncementForm({ ...announcementForm, target: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Everyone</SelectItem>
                    <SelectItem value="employees">Employees Only</SelectItem>
                    <SelectItem value="management">Management Only</SelectItem>
                    <SelectItem value="department">Specific Department</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {announcementForm.target === 'department' && (
              <div>
                <Label>Department Name</Label>
                <Input
                  value={announcementForm.targetDepartment}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, targetDepartment: e.target.value })}
                />
              </div>
            )}
            <div>
              <Label>Expires On</Label>
              <Input
                type="date"
                value={announcementForm.expiresAt}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, expiresAt: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={announcementForm.isPinned}
                onCheckedChange={(checked) => setAnnouncementForm({ ...announcementForm, isPinned: checked })}
              />
              <Label>Pin to top</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateAnnouncement} disabled={editing}>
              {editing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
