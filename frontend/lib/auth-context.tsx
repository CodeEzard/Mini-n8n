'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useUserData, useAuthenticated } from '@nhost/react';
import { nhost } from './nhost';

export interface MockUser {
  id: string;
  email: string;
  displayName: string;
  orgId: string;
  orgName: string;
  role: 'owner' | 'editor' | 'viewer';
}

export const MOCK_USERS: MockUser[] = [
  {
    id: 'a0000000-0000-0000-0000-000000000001',
    email: 'owner_a@acme.com',
    displayName: 'Alice (Org A Owner)',
    orgId: '11111111-1111-1111-1111-111111111111',
    orgName: 'Acme Corp (Org A)',
    role: 'owner',
  },
  {
    id: 'a0000000-0000-0000-0000-000000000002',
    email: 'editor_a@acme.com',
    displayName: 'Eddie (Org A Editor)',
    orgId: '11111111-1111-1111-1111-111111111111',
    orgName: 'Acme Corp (Org A)',
    role: 'editor',
  },
  {
    id: 'a0000000-0000-0000-0000-000000000003',
    email: 'viewer_a@acme.com',
    displayName: 'Victor (Org A Viewer)',
    orgId: '11111111-1111-1111-1111-111111111111',
    orgName: 'Acme Corp (Org A)',
    role: 'viewer',
  },
  {
    id: 'b0000000-0000-0000-0000-000000000001',
    email: 'owner_b@globex.com',
    displayName: 'Bob (Org B Owner)',
    orgId: '22222222-2222-2222-2222-222222222222',
    orgName: 'Globex Corp (Org B)',
    role: 'owner',
  },
];

export interface Organization {
  id: string;
  name: string;
  role: 'owner' | 'editor' | 'viewer';
}

interface AuthContextType {
  user: any | null;
  userId: string;
  userEmail: string;
  userName: string;
  isAuthenticated: boolean;
  activeOrgId: string;
  activeOrgName: string;
  activeRole: 'owner' | 'editor' | 'viewer';
  mockUser: MockUser | null;
  setMockUser: (user: MockUser | null) => void;
  setActiveOrgId: (orgId: string) => void;
  canEdit: boolean;
  canRun: boolean;
  isOwner: boolean;
  isViewer: boolean;
  getAuthHeaders: () => Record<string, string>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const nhostUser = useUserData();
  const isNhostAuth = useAuthenticated();

  // Default to Alice (Org A Owner) for seamless testing out-of-the-box
  const [mockUser, setMockUserState] = useState<MockUser | null>(MOCK_USERS[0]);
  const [activeOrgId, setActiveOrgIdState] = useState<string>(
    MOCK_USERS[0].orgId
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedMockId = localStorage.getItem('mini_n8n_mock_user_id');
      if (savedMockId) {
        const found = MOCK_USERS.find((u) => u.id === savedMockId);
        if (found) {
          setMockUserState(found);
          setActiveOrgIdState(found.orgId);
        }
      }
    }
  }, []);

  const setMockUser = (u: MockUser | null) => {
    setMockUserState(u);
    if (u) {
      setActiveOrgIdState(u.orgId);
      if (typeof window !== 'undefined') {
        localStorage.setItem('mini_n8n_mock_user_id', u.id);
        localStorage.setItem('mini_n8n_active_org_id', u.orgId);
      }
    } else if (typeof window !== 'undefined') {
      localStorage.removeItem('mini_n8n_mock_user_id');
    }
  };

  const setActiveOrgId = (orgId: string) => {
    setActiveOrgIdState(orgId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mini_n8n_active_org_id', orgId);
    }
  };

  const userId = mockUser
    ? mockUser.id
    : nhostUser?.id || 'a0000000-0000-0000-0000-000000000001';
  const userEmail = mockUser
    ? mockUser.email
    : nhostUser?.email || 'owner_a@acme.com';
  const userName = mockUser
    ? mockUser.displayName
    : nhostUser?.displayName || 'Alice Owner';
  const activeRole: 'owner' | 'editor' | 'viewer' = mockUser
    ? mockUser.role
    : 'owner';
  const activeOrgName = mockUser
    ? mockUser.orgName
    : activeOrgId === '22222222-2222-2222-2222-222222222222'
    ? 'Globex Corp (Org B)'
    : 'Acme Corp (Org A)';

  const canEdit = activeRole === 'owner' || activeRole === 'editor';
  const canRun = activeRole === 'owner' || activeRole === 'editor';
  const isOwner = activeRole === 'owner';
  const isViewer = activeRole === 'viewer';

  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      'x-hasura-user-id': userId,
      'x-hasura-role': 'user',
      'x-hasura-org-id': activeOrgId,
    };

    // When running locally in demo mode without Nhost cloud tokens, include admin secret for queries
    headers['x-hasura-admin-secret'] = 'nhost-admin-secret';

    return headers;
  };

  const logout = () => {
    nhost.auth.signOut();
    setMockUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user: mockUser || nhostUser,
        userId,
        userEmail,
        userName,
        isAuthenticated: Boolean(mockUser || isNhostAuth),
        activeOrgId,
        activeOrgName,
        activeRole,
        mockUser,
        setMockUser,
        setActiveOrgId,
        canEdit,
        canRun,
        isOwner,
        isViewer,
        getAuthHeaders,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
