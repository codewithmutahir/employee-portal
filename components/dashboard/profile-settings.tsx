'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Employee, EmergencyContact } from '@/types';
import {
  updateOwnProfile,
  changePassword,
  getEmergencyContacts,
  addEmergencyContact,
  updateEmergencyContact,
  deleteEmergencyContact,
  getNotificationPreferences,
  updateNotificationPreferences,
} from '@/app/actions/profile';
import {
  User,
  Lock,
  Phone,
  MapPin,
  UserPlus,
  Trash2,
  Edit,
  Bell,
  Shield,
  Save,
  X,
  Star,
} from 'lucide-react';
import { FaceEnrollment } from './face-enrollment';

interface ProfileSettingsProps {
  employee: Employee & { profilePhotoUrl?: string };
  onProfileUpdate?: () => void;
}

interface ExtendedEmployee extends Employee {
  profilePhotoUrl?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  personalEmail?: string;
  preferredName?: string;
  pronouns?: string;
  bio?: string;
}

export function ProfileSettings({ employee, onProfileUpdate }: ProfileSettingsProps) {
  const { toast } = useToast();
  const extEmployee = employee as ExtendedEmployee;
  
  // Profile form state - initialize from employee data
  const [profileForm, setProfileForm] = useState({
    displayName: extEmployee.displayName || '',
    phoneNumber: extEmployee.phoneNumber || '',
    address: extEmployee.address || '',
    city: extEmployee.city || '',
    state: extEmployee.state || '',
    zipCode: extEmployee.zipCode || '',
    country: extEmployee.country || '',
    personalEmail: extEmployee.personalEmail || '',
    preferredName: extEmployee.preferredName || '',
    pronouns: extEmployee.pronouns || '',
    bio: extEmployee.bio || '',
  });
  const [profileLoading, setProfileLoading] = useState(false);

  // Password change state
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  // Emergency contacts state
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [addContactDialogOpen, setAddContactDialogOpen] = useState(false);
  const [editContactDialogOpen, setEditContactDialogOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<EmergencyContact | null>(null);
  const [contactForm, setContactForm] = useState({
    name: '',
    relationship: '',
    phoneNumber: '',
    email: '',
    address: '',
    isPrimary: false,
  });
  const [contactSaving, setContactSaving] = useState(false);

  // Notification preferences
  const [notificationPrefs, setNotificationPrefs] = useState({
    emailNotifications: true,
    announcementEmails: true,
    reminderEmails: true,
  });
  const [prefsLoading, setPrefsLoading] = useState(false);

  // Sync form state when employee data changes
  useEffect(() => {
    const ext = employee as ExtendedEmployee;
    setProfileForm({
      displayName: ext.displayName || '',
      phoneNumber: ext.phoneNumber || '',
      address: ext.address || '',
      city: ext.city || '',
      state: ext.state || '',
      zipCode: ext.zipCode || '',
      country: ext.country || '',
      personalEmail: ext.personalEmail || '',
      preferredName: ext.preferredName || '',
      pronouns: ext.pronouns || '',
      bio: ext.bio || '',
    });
  }, [employee]);

  // Load emergency contacts and notification preferences on mount
  useEffect(() => {
    loadEmergencyContacts();
    loadNotificationPreferences();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when employee changes
  }, [employee.id]);

  async function loadEmergencyContacts() {
    setContactsLoading(true);
    try {
      const contacts = await getEmergencyContacts(employee.id);
      setEmergencyContacts(contacts);
    } catch (error) {
      console.error('❌ Failed to load emergency contacts:', error);
    } finally {
      setContactsLoading(false);
    }
  }

  async function loadNotificationPreferences() {
    try {
      const prefs = await getNotificationPreferences(employee.id);
      setNotificationPrefs(prefs);
    } catch (error) {
      console.error('Failed to load notification preferences:', error);
    }
  }

  async function handleUpdateProfile() {
    setProfileLoading(true);
    try {
      const result = await updateOwnProfile(employee.id, profileForm);
      
      if (result.success) {
        toast({
          title: 'Profile Updated',
          description: 'Your profile has been updated successfully',
        });
        onProfileUpdate?.();
      } else {
        toast({
          title: 'Update Failed',
          description: result.error || 'Failed to update profile',
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
      setProfileLoading(false);
    }
  }

  async function handleChangePassword() {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Please make sure both passwords are the same',
        variant: 'destructive',
      });
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast({
        title: 'Password too short',
        description: 'Password must be at least 6 characters',
        variant: 'destructive',
      });
      return;
    }

    setPasswordLoading(true);
    try {
      const result = await changePassword(employee.id, passwordForm.newPassword);
      
      if (result.success) {
        toast({
          title: 'Password Changed',
          description: 'Your password has been changed successfully. A confirmation email has been sent.',
        });
        setPasswordForm({ newPassword: '', confirmPassword: '' });
        setPasswordDialogOpen(false);
      } else {
        toast({
          title: 'Change Failed',
          description: result.error || 'Failed to change password',
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
      setPasswordLoading(false);
    }
  }

  async function handleAddContact() {
    if (!contactForm.name || !contactForm.relationship || !contactForm.phoneNumber) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in name, relationship, and phone number',
        variant: 'destructive',
      });
      return;
    }

    setContactSaving(true);
    try {
      const result = await addEmergencyContact(employee.id, contactForm);
      
      if (result.success) {
        toast({
          title: 'Contact Added',
          description: 'Emergency contact has been added successfully',
        });
        setContactForm({
          name: '',
          relationship: '',
          phoneNumber: '',
          email: '',
          address: '',
          isPrimary: false,
        });
        setAddContactDialogOpen(false);
        await loadEmergencyContacts();
      } else {
        toast({
          title: 'Failed to Add',
          description: result.error || 'Failed to add contact',
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
      setContactSaving(false);
    }
  }

  async function handleUpdateContact() {
    if (!selectedContact) return;

    setContactSaving(true);
    try {
      const result = await updateEmergencyContact(
        selectedContact.id,
        employee.id,
        contactForm
      );
      
      if (result.success) {
        toast({
          title: 'Contact Updated',
          description: 'Emergency contact has been updated successfully',
        });
        setEditContactDialogOpen(false);
        setSelectedContact(null);
        await loadEmergencyContacts();
      } else {
        toast({
          title: 'Update Failed',
          description: result.error || 'Failed to update contact',
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
      setContactSaving(false);
    }
  }

  async function handleDeleteContact(contactId: string) {
    try {
      const result = await deleteEmergencyContact(contactId, employee.id);
      
      if (result.success) {
        toast({
          title: 'Contact Deleted',
          description: 'Emergency contact has been removed',
        });
        await loadEmergencyContacts();
      } else {
        toast({
          title: 'Delete Failed',
          description: result.error || 'Failed to delete contact',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    }
  }

  async function handleUpdateNotificationPrefs(key: string, value: boolean) {
    setPrefsLoading(true);
    const newPrefs = { ...notificationPrefs, [key]: value };
    setNotificationPrefs(newPrefs);

    try {
      const result = await updateNotificationPreferences(employee.id, newPrefs);
      
      if (!result.success) {
        // Revert on failure
        setNotificationPrefs(notificationPrefs);
        toast({
          title: 'Update Failed',
          description: result.error || 'Failed to update preferences',
          variant: 'destructive',
        });
      }
    } catch (error) {
      setNotificationPrefs(notificationPrefs);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setPrefsLoading(false);
    }
  }

  function openEditContact(contact: EmergencyContact) {
    setSelectedContact(contact);
    setContactForm({
      name: contact.name,
      relationship: contact.relationship,
      phoneNumber: contact.phoneNumber,
      email: contact.email || '',
      address: contact.address || '',
      isPrimary: contact.isPrimary,
    });
    setEditContactDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Personal Information
          </CardTitle>
          <CardDescription>Update your personal details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={profileForm.displayName}
                onChange={(e) => setProfileForm({ ...profileForm, displayName: e.target.value })}
                placeholder="Your name"
              />
            </div>
            <div>
              <Label htmlFor="preferredName">Preferred Name / Nickname</Label>
              <Input
                id="preferredName"
                value={profileForm.preferredName}
                onChange={(e) => setProfileForm({ ...profileForm, preferredName: e.target.value })}
                placeholder="What should we call you?"
              />
            </div>
            <div>
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                value={profileForm.phoneNumber}
                onChange={(e) => setProfileForm({ ...profileForm, phoneNumber: e.target.value })}
                placeholder="+1 (555) 123-4567"
              />
            </div>
            <div>
              <Label htmlFor="personalEmail">Personal Email</Label>
              <Input
                id="personalEmail"
                type="email"
                value={profileForm.personalEmail}
                onChange={(e) => setProfileForm({ ...profileForm, personalEmail: e.target.value })}
                placeholder="your.personal@email.com"
              />
            </div>
            <div>
              <Label htmlFor="pronouns">Pronouns</Label>
              <Input
                id="pronouns"
                value={profileForm.pronouns}
                onChange={(e) => setProfileForm({ ...profileForm, pronouns: e.target.value })}
                placeholder="e.g., he/him, she/her, they/them"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={profileForm.bio}
              onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
              placeholder="Tell us a little about yourself..."
              rows={3}
            />
          </div>

          <div className="pt-4">
            <Button onClick={handleUpdateProfile} disabled={profileLoading}>
              {profileLoading ? (
                <LoadingSpinner label="Saving" />
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Address
          </CardTitle>
          <CardDescription>Your home address (optional)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="address">Street Address</Label>
            <Input
              id="address"
              value={profileForm.address}
              onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
              placeholder="123 Main Street"
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={profileForm.city}
                onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                placeholder="City"
              />
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={profileForm.state}
                onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value })}
                placeholder="State"
              />
            </div>
            <div>
              <Label htmlFor="zipCode">ZIP Code</Label>
              <Input
                id="zipCode"
                value={profileForm.zipCode}
                onChange={(e) => setProfileForm({ ...profileForm, zipCode: e.target.value })}
                placeholder="12345"
              />
            </div>
            <div>
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={profileForm.country}
                onChange={(e) => setProfileForm({ ...profileForm, country: e.target.value })}
                placeholder="USA"
              />
            </div>
          </div>
          <div className="pt-4">
            <Button onClick={handleUpdateProfile} disabled={profileLoading}>
              {profileLoading ? (
                <LoadingSpinner label="Saving" />
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Address
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Emergency Contacts */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Emergency Contacts
              </CardTitle>
              <CardDescription>People to contact in case of emergency</CardDescription>
            </div>
            <Dialog open={addContactDialogOpen} onOpenChange={setAddContactDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add Contact
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Emergency Contact</DialogTitle>
                  <DialogDescription>
                    Add a person to contact in case of emergency
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="contactName">Name *</Label>
                      <Input
                        id="contactName"
                        value={contactForm.name}
                        onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                        placeholder="John Doe"
                      />
                    </div>
                    <div>
                      <Label htmlFor="relationship">Relationship *</Label>
                      <Input
                        id="relationship"
                        value={contactForm.relationship}
                        onChange={(e) => setContactForm({ ...contactForm, relationship: e.target.value })}
                        placeholder="Spouse, Parent, etc."
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="contactPhone">Phone Number *</Label>
                    <Input
                      id="contactPhone"
                      value={contactForm.phoneNumber}
                      onChange={(e) => setContactForm({ ...contactForm, phoneNumber: e.target.value })}
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                  <div>
                    <Label htmlFor="contactEmail">Email (optional)</Label>
                    <Input
                      id="contactEmail"
                      type="email"
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      placeholder="contact@email.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="contactAddress">Address (optional)</Label>
                    <Input
                      id="contactAddress"
                      value={contactForm.address}
                      onChange={(e) => setContactForm({ ...contactForm, address: e.target.value })}
                      placeholder="123 Main St, City, State"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="isPrimary"
                      checked={contactForm.isPrimary}
                      onCheckedChange={(checked) => setContactForm({ ...contactForm, isPrimary: checked })}
                    />
                    <Label htmlFor="isPrimary">Primary contact</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddContactDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddContact} disabled={contactSaving}>
                    {contactSaving ? (
                      <LoadingSpinner label="Adding" />
                    ) : (
                      'Add Contact'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {contactsLoading ? (
            <LoadingSpinner block label="Loading contacts" />
          ) : emergencyContacts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No emergency contacts added yet
            </p>
          ) : (
            <div className="space-y-3">
              {emergencyContacts.map((contact) => (
                <div
                  key={contact.id}
                  className={`p-4 rounded-lg border ${
                    contact.isPrimary ? 'bg-primary/5 border-primary/20' : 'bg-background'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{contact.name}</p>
                        {contact.isPrimary && (
                          <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                            <Star className="h-3 w-3" />
                            Primary
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{contact.relationship}</p>
                      <p className="text-sm mt-1">{contact.phoneNumber}</p>
                      {contact.email && (
                        <p className="text-sm text-muted-foreground">{contact.email}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditContact(contact)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove {contact.name} from your emergency contacts?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteContact(contact.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Contact Dialog */}
      <Dialog open={editContactDialogOpen} onOpenChange={setEditContactDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Emergency Contact</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name *</Label>
                <Input
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Relationship *</Label>
                <Input
                  value={contactForm.relationship}
                  onChange={(e) => setContactForm({ ...contactForm, relationship: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Phone Number *</Label>
              <Input
                value={contactForm.phoneNumber}
                onChange={(e) => setContactForm({ ...contactForm, phoneNumber: e.target.value })}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={contactForm.email}
                onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Address</Label>
              <Input
                value={contactForm.address}
                onChange={(e) => setContactForm({ ...contactForm, address: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={contactForm.isPrimary}
                onCheckedChange={(checked) => setContactForm({ ...contactForm, isPrimary: checked })}
              />
              <Label>Primary contact</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditContactDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateContact} disabled={contactSaving}>
              {contactSaving ? (
                <LoadingSpinner label="Saving" />
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security
          </CardTitle>
          <CardDescription>Manage your account security</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Lock className="mr-2 h-4 w-4" />
                Change Password
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Change Password</DialogTitle>
                <DialogDescription>
                  Enter your new password below
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    placeholder="Enter new password"
                  />
                </div>
                <div>
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    placeholder="Confirm new password"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Password must be at least 6 characters long
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleChangePassword} disabled={passwordLoading}>
                  {passwordLoading ? (
                    <LoadingSpinner label="Changing" />
                  ) : (
                    'Change Password'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* Face recognition – register or re-register for clock in/out */}
      <FaceEnrollment
        employeeId={employee.id}
        onEnrolled={() => onProfileUpdate?.()}
        isReRegister="settings"
      />

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Preferences
          </CardTitle>
          <CardDescription>Manage how you receive notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Email Notifications</p>
              <p className="text-sm text-muted-foreground">Receive general email notifications</p>
            </div>
            <Switch
              checked={notificationPrefs.emailNotifications}
              onCheckedChange={(checked) => handleUpdateNotificationPrefs('emailNotifications', checked)}
              disabled={prefsLoading}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Announcement Emails</p>
              <p className="text-sm text-muted-foreground">Receive emails for company announcements</p>
            </div>
            <Switch
              checked={notificationPrefs.announcementEmails}
              onCheckedChange={(checked) => handleUpdateNotificationPrefs('announcementEmails', checked)}
              disabled={prefsLoading}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Reminder Emails</p>
              <p className="text-sm text-muted-foreground">Receive reminder emails (birthdays, anniversaries)</p>
            </div>
            <Switch
              checked={notificationPrefs.reminderEmails}
              onCheckedChange={(checked) => handleUpdateNotificationPrefs('reminderEmails', checked)}
              disabled={prefsLoading}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
