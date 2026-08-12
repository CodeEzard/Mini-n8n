'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth, MOCK_USERS } from '../lib/auth-context';
import {
  Workflow,
  BarChart3,
  Building2,
  User,
  Shield,
  Play,
  CheckCircle2,
  ChevronDown,
  LogOut,
} from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();
  const {
    userName,
    userEmail,
    activeOrgName,
    activeRole,
    mockUser,
    setMockUser,
    logout,
  } = useAuth();

  const navItems = [
    { label: 'Workflows', href: '/workflows', icon: Workflow },
    { label: 'Dashboard & Quota', href: '/dashboard', icon: BarChart3 },
    { label: 'Organizations', href: '/orgs', icon: Building2 },
  ];

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-300';
      case 'editor':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300';
      case 'viewer':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/90 backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/90">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Left: Brand + Nav */}
        <div className="flex items-center gap-8">
          <Link href="/workflows" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-600 font-bold text-white shadow-sm shadow-orange-500/30">
              ⚡
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">
                Mini-n8n
              </span>
              <span className="ml-1.5 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                AI Engine
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: Active Org & User Switcher for Demo Scenarios */}
        <div className="flex items-center gap-3">
          {/* Active Org Pill */}
          <Link
            href="/orgs"
            className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            <Building2 className="h-3.5 w-3.5 text-gray-500" />
            <span>{activeOrgName}</span>
          </Link>

          {/* Mock User Role Selector */}
          <div className="relative flex items-center">
            <label htmlFor="mock-user-select" className="sr-only">
              Switch Mock User
            </label>
            <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <Shield className="h-3.5 w-3.5 text-gray-400" />
              <select
                id="mock-user-select"
                aria-label="Switch Mock User Role"
                className="bg-transparent text-xs font-medium text-gray-700 outline-none dark:text-gray-200 cursor-pointer"
                value={mockUser?.id || ''}
                onChange={(e) => {
                  const target = MOCK_USERS.find((u) => u.id === e.target.value);
                  if (target) setMockUser(target);
                }}
              >
                {MOCK_USERS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName} ({u.role.toUpperCase()})
                  </option>
                ))}
              </select>
              <span
                className={`rounded border px-1.5 py-0.2 text-[10px] font-semibold uppercase ${getRoleBadge(
                  activeRole
                )}`}
              >
                {activeRole}
              </span>
            </div>
          </div>

          <Link
            href="/login"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
            title="Auth / Profile"
          >
            <User className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
