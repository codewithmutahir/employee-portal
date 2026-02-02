'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { getCurrentUser, getEmployeeData } from '@/lib/auth';
import { Employee } from '@/types';

interface AuthContextType {
  user: User | null;
  employee: Employee | null;
  loading: boolean;
  refreshEmployee: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshEmployee() {
    if (user) {
      const emp = await getEmployeeData(user.uid);
      setEmployee(emp);
    }
  }

  useEffect(() => {
    async function initAuth() {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
        if (currentUser) {
          const emp = await getEmployeeData(currentUser.uid);
          setEmployee(emp);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        // Don't set loading to false if there's an error, let it retry
      } finally {
        setLoading(false);
      }
    }
    initAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, employee, loading, refreshEmployee }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

