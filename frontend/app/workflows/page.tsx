'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { ORG_WORKFLOWS_QUERY } from '../../lib/graphql-queries';
import { useAuth } from '../../lib/auth-context';
import {
  Workflow,
  Plus,
  Play,
  Edit3,
  Clock,
  CheckCircle2,
  AlertCircle,
  PauseCircle,
  Webhook,
  Bot,
  Globe,
  Bell,
  GitBranch,
  ShieldAlert,
} from 'lucide-react';

export default function WorkflowsPage() {
  const { activeOrgId, activeOrgName, canEdit, canRun, activeRole } = useAuth();
  const { data, loading, error, refetch } = useQuery(ORG_WORKFLOWS_QUERY, {
    variables: { orgId: activeOrgId },
    fetchPolicy: 'cache-and-network',
  });

  const workflows = data?.workflows || [];

  const getStepIcon = (type: string) => {
    switch (type) {
      case 'llm_call':
        return <Bot className="h-3 w-3 text-purple-600" />;
      case 'http_request':
        return <Globe className="h-3 w-3 text-blue-600" />;
      case 'notify':
        return <Bell className="h-3 w-3 text-green-600" />;
      case 'conditional_branch':
        return <GitBranch className="h-3 w-3 text-amber-600" />;
      case 'approval_gate':
        return <PauseCircle className="h-3 w-3 text-orange-600" />;
      default:
        return <Workflow className="h-3 w-3 text-gray-600" />;
    }
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" />
            Completed
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300 animate-pulse">
            <Play className="h-3 w-3" />
            Running
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800 dark:bg-orange-950 dark:text-orange-300">
            <PauseCircle className="h-3 w-3" />
            Paused (Awaiting Approval)
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800 dark:bg-red-950 dark:text-red-300">
            <AlertCircle className="h-3 w-3" />
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-800 dark:bg-gray-800 dark:text-gray-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              Workflows
            </h1>
            <span className="rounded-full bg-gray-200 dark:bg-gray-800 px-2.5 py-0.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
              {workflows.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            AI Agent workflows scoped to <span className="font-semibold text-gray-900 dark:text-white">{activeOrgName}</span>.
          </p>
        </div>

        {canEdit && (
          <Link
            href="/workflows/new/edit"
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Workflow
          </Link>
        )}
      </div>

      {/* Role Notice for Viewers */}
      {!canEdit && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <div>
            <span className="font-bold">Viewer Mode ({activeRole.toUpperCase()}):</span> You have read-only access to view workflows and execution timelines. Editing, creating, triggering runs, and approvals are disabled by Layer 1 & 2 security.
          </div>
        </div>
      )}

      {/* Workflows List */}
      {loading && workflows.length === 0 ? (
        <div className="flex justify-center py-20">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-orange-600 border-t-transparent" />
            Loading workflows from Hasura...
          </div>
        </div>
      ) : workflows.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center dark:border-gray-800">
          <Workflow className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-base font-bold text-gray-900 dark:text-white">
            No workflows found for {activeOrgName}
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Cross-tenant isolation is active. Workflows from other organizations cannot be accessed.
          </p>
          {canEdit && (
            <div className="mt-6">
              <Link
                href="/workflows/new/edit"
                className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-orange-700"
              >
                <Plus className="h-4 w-4" />
                Build First Workflow
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {workflows.map((wf: any) => {
            const steps = wf.workflow_steps || [];
            const triggers = wf.workflow_triggers || [];
            const latestRun = wf.workflow_runs?.[0];
            const webhookTrigger = triggers.find((t: any) => t.type === 'webhook');

            return (
              <div
                key={wf.id}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  {/* Left: Info */}
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/workflows/${wf.id}/run`}
                        className="text-lg font-bold text-gray-900 hover:text-orange-600 dark:text-white dark:hover:text-orange-400 transition-colors"
                      >
                        {wf.name}
                      </Link>
                      {latestRun && getStatusBadge(latestRun.status)}
                    </div>

                    <p className="text-xs text-gray-600 dark:text-gray-400 max-w-3xl">
                      {wf.description || 'No description provided.'}
                    </p>

                    {/* Step chain visual flow */}
                    <div className="pt-3">
                      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                        Execution Pipeline ({steps.length} Steps)
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {steps.map((s: any, idx: number) => (
                          <React.Fragment key={s.id || idx}>
                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                              {getStepIcon(s.type)}
                              <span className="text-gray-400 text-[10px]">#{s.step_order}</span>
                              <span className="capitalize">{s.type.replace('_', ' ')}</span>
                            </span>
                            {idx < steps.length - 1 && (
                              <span className="text-gray-400 text-xs font-bold">→</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>

                    {/* Triggers Bar */}
                    <div className="flex items-center gap-3 pt-2 text-xs text-gray-500">
                      <span className="font-semibold text-gray-600 dark:text-gray-400">
                        Triggers:
                      </span>
                      {triggers.map((t: any) => (
                        <span
                          key={t.id}
                          className="inline-flex items-center gap-1 rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5 font-mono text-[11px] text-gray-700 dark:text-gray-300"
                        >
                          {t.type === 'webhook' ? (
                            <>
                              <Webhook className="h-3 w-3 text-orange-500" />
                              webhook (secret: {t.webhook_secret ? '••••' : 'none'})
                            </>
                          ) : (
                            <>
                              <Play className="h-3 w-3 text-emerald-500" />
                              manual
                            </>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2.5 lg:self-center">
                    {canEdit && (
                      <Link
                        href={`/workflows/${wf.id}/edit`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Edit
                      </Link>
                    )}

                    <Link
                      href={`/workflows/${wf.id}/run`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-orange-700 transition-colors"
                    >
                      <Play className="h-3.5 w-3.5" />
                      {latestRun?.status === 'paused' ? 'View / Approve' : 'Run / Timeline'}
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
