'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@apollo/client';
import { GET_ORGANIZATIONS } from '../../lib/graphql-queries';
import { useAuth, MOCK_USERS } from '../../lib/auth-context';
import { Building2, CheckCircle2, ArrowRight, ShieldCheck, Layers } from 'lucide-react';

export default function OrgsPage() {
  const router = useRouter();
  const { activeOrgId, setActiveOrgId, mockUser, setMockUser, activeRole } = useAuth();
  const { data, loading, error } = useQuery(GET_ORGANIZATIONS);

  // Fallback demo orgs if GraphQL query is loading/offline
  const orgs = data?.organizations || [
    {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Acme Corp (Org A)',
      quota_calls_allowed: 1000,
      quota_calls_used: 0,
      org_members: [
        { role: 'owner' },
        { role: 'editor' },
        { role: 'viewer' },
      ],
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Globex Corp (Org B)',
      quota_calls_allowed: 500,
      quota_calls_used: 0,
      org_members: [{ role: 'owner' }],
    },
  ];

  const handleSelectOrg = (orgId: string) => {
    setActiveOrgId(orgId);
    // Also auto-switch mock user persona if matching to ensure role consistency
    const matchingMock = MOCK_USERS.find((u) => u.orgId === orgId);
    if (matchingMock && mockUser?.orgId !== orgId) {
      setMockUser(matchingMock);
    }
    router.push('/workflows');
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          Organizations Switcher
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Switch active organization context to enforce multi-tenant row-level permissions (Layer 1) and mid-execution checks.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {orgs.map((org: any) => {
          const isActive = activeOrgId === org.id;
          return (
            <div
              key={org.id}
              className={`rounded-2xl border p-6 transition-all relative ${
                isActive
                  ? 'border-orange-500 bg-orange-50/30 dark:bg-orange-950/20 ring-2 ring-orange-500/20 shadow-md'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm dark:border-gray-800 dark:bg-gray-900'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200 font-bold">
                    <Building2 className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                      {org.name}
                    </h2>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                      ID: {org.id.slice(0, 8)}...
                    </span>
                  </div>
                </div>

                {isActive && (
                  <span className="flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Active
                  </span>
                )}
              </div>

              <div className="mt-6 space-y-2 border-t border-gray-100 pt-4 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-400">
                <div className="flex justify-between">
                  <span>Monthly Execution Quota:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {org.quota_calls_allowed} calls
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Quota Used:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {org.quota_calls_used || 0} calls
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Total Members:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {org.org_members?.length || 1} members
                  </span>
                </div>
              </div>

              <div className="mt-6">
                <button
                  onClick={() => handleSelectOrg(org.id)}
                  disabled={isActive}
                  className={`w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                    isActive
                      ? 'bg-orange-600 text-white cursor-default opacity-90'
                      : 'bg-gray-900 text-white hover:bg-black dark:bg-gray-800 dark:hover:bg-gray-700'
                  }`}
                >
                  {isActive ? 'Currently Active' : 'Switch to this Organization'}
                  {!isActive && <ArrowRight className="h-4 w-4" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">
            Hasura Layer 1 Permission Scoping
          </h3>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
          Selecting an organization sends the active <code className="font-mono text-orange-600 dark:text-orange-400">x-hasura-org-id</code> header.
          Hasura enforces row-level filters joins across <code className="font-mono">org_members</code> to guarantee complete data isolation between tenants.
        </p>
      </div>
    </div>
  );
}
