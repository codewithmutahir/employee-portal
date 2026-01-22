'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/components/auth-provider';
import { logout } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import EmployeeDashboard from '@/components/dashboard/employee-dashboard';
import ManagementDashboard from '@/components/dashboard/management-dashboard';
import ErrorBoundary from '@/components/error-boundary';

function DashboardContent() {
  const { user, employee, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null; // Auth provider will redirect to login
  }

  if (!employee) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Account Setup Incomplete</h2>
          <p className="text-muted-foreground mb-4">
            Your employee profile is not configured. Please contact your administrator.
          </p>
          <Button onClick={() => router.push('/login')}>
            Back to Login
          </Button>
        </div>
      </div>
    );
  }

  if (employee.status === 'terminated') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Account Terminated</h1>
          <p className="text-muted-foreground mb-4">Your account has been terminated.</p>
          <Button onClick={async () => { await logout(); router.push('/login'); }}>
            Sign Out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold">Employee Portal</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-muted-foreground">{employee.displayName}</span>
              <Button
                variant="destructive"
                onClick={async () => {
                  await logout();
                  router.push('/login');
                }}
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ErrorBoundary>
          {employee.role === 'management' ? (
            <ManagementDashboard employee={employee} />
          ) : (
            <EmployeeDashboard employee={employee} />
          )}
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthProvider>
      <DashboardContent />
    </AuthProvider>
  );
}

