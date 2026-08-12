'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSignInEmailPassword, useSignUpEmailPassword } from '@nhost/react';
import { useAuth, MOCK_USERS, MockUser } from '../../lib/auth-context';
import { Shield, UserCheck, ArrowRight, Lock, Mail, CheckCircle2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { mockUser, setMockUser, activeRole } = useAuth();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const {
    signInEmailPassword,
    isLoading: isSignInLoading,
    error: signInError,
  } = useSignInEmailPassword();

  const {
    signUpEmailPassword,
    isLoading: isSignUpLoading,
    error: signUpError,
  } = useSignUpEmailPassword();

  const handleNhostAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSignUp) {
      const res = await signUpEmailPassword(email, password, {
        displayName: displayName || email.split('@')[0],
      });
      if (!res.error) {
        setMockUser(null);
        router.push('/workflows');
      }
    } else {
      const res = await signInEmailPassword(email, password);
      if (!res.error) {
        setMockUser(null);
        router.push('/workflows');
      }
    }
  };

  const handleSelectMockUser = (u: MockUser) => {
    setMockUser(u);
    router.push('/workflows');
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
          Authentication & Role Switching
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Select a demo persona to test multi-tenant organization isolation and Layer 2 role permissions.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Left Card: Quick Demo Personas */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-5 w-5 text-orange-600" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Instant Demo Personas (One-Click)
            </h2>
          </div>
          <p className="text-xs text-gray-500 mb-6 dark:text-gray-400">
            Click any user to immediately assume their session and test cross-org boundaries or approval restrictions:
          </p>

          <div className="space-y-3">
            {MOCK_USERS.map((u) => {
              const isSelected = mockUser?.id === u.id;
              return (
                <button
                  key={u.id}
                  onClick={() => handleSelectMockUser(u)}
                  className={`w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between ${
                    isSelected
                      ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/20 ring-2 ring-orange-500/20'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg font-bold text-sm ${
                        u.role === 'owner'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                          : u.role === 'editor'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {u.displayName.slice(0, 1)}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-white text-sm">
                        {u.displayName}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {u.email} • <span className="font-medium text-gray-700 dark:text-gray-300">{u.orgName}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                        u.role === 'owner'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                          : u.role === 'editor'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {u.role}
                    </span>
                    {isSelected && <CheckCircle2 className="h-5 w-5 text-orange-600" />}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-6 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            <span className="font-semibold text-gray-800 dark:text-gray-200">Isolation note:</span> Org B Owner (Bob)
            cannot view or approve Org A workflows, and Org A Viewer (Victor) cannot trigger or approve steps.
          </div>
        </div>

        {/* Right Card: Nhost Email Auth */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Lock className="h-5 w-5 text-gray-700 dark:text-gray-300" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {isSignUp ? 'Create Nhost Account' : 'Sign in with Nhost Auth'}
              </h2>
            </div>
            <p className="text-xs text-gray-500 mb-6 dark:text-gray-400">
              Connect to the live Nhost Auth backend with JWT claims:
            </p>

            {(signInError || signUpError) && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
                <AlertCircle className="h-4 w-4" />
                <span>{signInError?.message || signUpError?.message}</span>
              </div>
            )}

            <form onSubmit={handleNhostAuth} className="space-y-4">
              {isSignUp && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your Name"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="•••••••••"
                    className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSignInLoading || isSignUpLoading}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-orange-700 disabled:opacity-50"
              >
                {isSignInLoading || isSignUpLoading
                  ? 'Authenticating...'
                  : isSignUp
                  ? 'Sign Up & Continue'
                  : 'Sign In & Continue'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 text-center">
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-xs font-medium text-orange-600 hover:underline dark:text-orange-400"
            >
              {isSignUp
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
