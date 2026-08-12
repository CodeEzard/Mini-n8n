'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useSubscription } from '@apollo/client';
import {
  GET_WORKFLOW_BY_ID,
  GET_LATEST_RUN_BY_WORKFLOW,
  TRIGGER_WORKFLOW_RUN_MUTATION,
  APPROVE_STEP_MUTATION,
  RECEIVE_WEBHOOK_MUTATION,
  STEP_PROGRESS_SUBSCRIPTION,
  WORKFLOW_RUN_SUBSCRIPTION,
} from '../../../lib/graphql-queries';
import { useAuth } from '../../../lib/auth-context';
import {
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCw,
  PauseCircle,
  ThumbsUp,
  Bot,
  Globe,
  Bell,
  GitBranch,
  ArrowLeft,
  Webhook,
  Code,
  Shield,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  Terminal,
  Copy,
  Check,
} from 'lucide-react';

export default function RunWorkflowPage() {
  const params = useParams();
  const workflowId = params?.id as string;
  const { activeOrgId, canRun, activeRole, isViewer } = useAuth();

  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState<string | null>(null);

  // 1. Fetch Workflow details
  const { data: workflowData, loading: isWorkflowLoading } = useQuery(GET_WORKFLOW_BY_ID, {
    variables: { id: workflowId },
  });

  // 2. Fetch Latest Run if activeRunId is not set
  const { data: latestRunData, refetch: refetchLatestRun } = useQuery(
    GET_LATEST_RUN_BY_WORKFLOW,
    {
      variables: { workflowId },
      onCompleted: (data) => {
        if (!activeRunId && data?.workflow_runs?.[0]?.id) {
          setActiveRunId(data.workflow_runs[0].id);
        }
      },
    }
  );

  // 3. Live GraphQL Subscriptions for Step Progress & Run State
  const { data: subData } = useSubscription(STEP_PROGRESS_SUBSCRIPTION, {
    variables: { workflowRunId: activeRunId || '' },
    skip: !activeRunId,
  });

  const { data: runSubData } = useSubscription(WORKFLOW_RUN_SUBSCRIPTION, {
    variables: { runId: activeRunId || '' },
    skip: !activeRunId,
  });

  // 4. Mutations
  const [triggerRun, { loading: isTriggering }] = useMutation(TRIGGER_WORKFLOW_RUN_MUTATION);
  const [approveStep] = useMutation(APPROVE_STEP_MUTATION);
  const [receiveWebhook, { loading: isWebhookTriggering }] = useMutation(RECEIVE_WEBHOOK_MUTATION);

  const workflow = workflowData?.workflows_by_pk;
  const triggers = workflow?.workflow_triggers || [];
  const webhookTrigger = triggers.find((t: any) => t.type === 'webhook');

  const liveRun = runSubData?.workflow_runs_by_pk || latestRunData?.workflow_runs?.[0];
  const liveSteps = subData?.step_runs || liveRun?.step_runs || [];

  const handleTriggerRun = async () => {
    setTriggerError(null);
    try {
      const res = await triggerRun({
        variables: { workflowId },
      });
      const newRunId = res.data?.triggerWorkflowRun?.run_id;
      if (newRunId) {
        setActiveRunId(newRunId);
        refetchLatestRun();
      }
    } catch (err: any) {
      console.error('Trigger run error:', err);
      setTriggerError(err.message || 'Failed to trigger workflow run.');
    }
  };

  const handleApprove = async (stepRunId: string) => {
    setIsApproving(stepRunId);
    setTriggerError(null);
    try {
      await approveStep({
        variables: { stepRunId },
      });
    } catch (err: any) {
      console.error('Approve error:', err);
      setTriggerError(err.message || 'Failed to approve step.');
    } finally {
      setIsApproving(null);
    }
  };

  const handleTriggerWebhook = async () => {
    if (!webhookTrigger?.webhook_secret) return;
    setTriggerError(null);
    try {
      const res = await receiveWebhook({
        variables: {
          workflowId,
          secret: webhookTrigger.webhook_secret,
          payload: {
            feedback: 'The product packaging arrived ripped and customer care was slow to reply.',
            customer_email: 'customer@example.com',
            order_id: 'ORD-9821',
          },
        },
      });
      const newRunId = res.data?.receiveWebhook?.run_id;
      if (newRunId) {
        setActiveRunId(newRunId);
        refetchLatestRun();
      }
    } catch (err: any) {
      console.error('Webhook error:', err);
      setTriggerError(err.message || 'Failed to trigger webhook.');
    }
  };

  const toggleExpand = (stepId: string) => {
    setExpandedSteps((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  const getStepIcon = (type: string) => {
    switch (type) {
      case 'llm_call':
        return <Bot className="h-4 w-4 text-purple-600" />;
      case 'http_request':
        return <Globe className="h-4 w-4 text-blue-600" />;
      case 'notify':
        return <Bell className="h-4 w-4 text-green-600" />;
      case 'conditional_branch':
        return <GitBranch className="h-4 w-4 text-amber-600" />;
      case 'approval_gate':
        return <PauseCircle className="h-4 w-4 text-orange-600" />;
      default:
        return <Code className="h-4 w-4 text-gray-600" />;
    }
  };

  const webhookCurlSnippet = `curl -X POST http://localhost:1337/v1/functions/receiveWebhook \\
  -H "Content-Type: application/json" \\
  -d '{
    "input": {
      "workflow_id": "${workflowId}",
      "secret": "${webhookTrigger?.webhook_secret || 'whsec_...'}",
      "payload": { "message": "Inbound customer feedback alert" }
    }
  }'`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Back Link */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/workflows"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Workflows
        </Link>
        <span className="text-xs text-gray-500">
          User Role: <span className="font-semibold uppercase text-orange-600">{activeRole}</span>
        </span>
      </div>

      {/* Header Banner */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                {workflow?.name || 'Workflow Execution'}
              </h1>
              {liveRun && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-bold uppercase tracking-wider ${
                    liveRun.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : liveRun.status === 'running'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 animate-pulse'
                      : liveRun.status === 'paused'
                      ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
                      : liveRun.status === 'failed'
                      ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                  }`}
                >
                  {liveRun.status}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {workflow?.description || 'Trigger runs and monitor live step execution streaming via GraphQL subscriptions.'}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            {canRun ? (
              <button
                onClick={handleTriggerRun}
                disabled={isTriggering}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-orange-700 disabled:opacity-50 transition-colors"
              >
                <Play className="h-4 w-4" />
                {isTriggering ? 'Triggering...' : 'Run Workflow'}
              </button>
            ) : (
              <div className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-500 dark:bg-gray-800">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                Run disabled for Viewers
              </div>
            )}
          </div>
        </div>

        {/* Trigger Error Message */}
        {triggerError && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{triggerError}</span>
          </div>
        )}
      </div>

      {/* Webhook Quick-Test Card (if workflow has webhook trigger) */}
      {webhookTrigger && (
        <div className="mb-8 rounded-2xl border border-gray-200 bg-gray-50/70 p-5 dark:border-gray-800 dark:bg-gray-900/50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Webhook className="h-4 w-4 text-orange-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-800 dark:text-gray-200">
                Inbound Webhook Trigger (Action: receiveWebhook)
              </h2>
            </div>
            <button
              onClick={handleTriggerWebhook}
              disabled={isWebhookTriggering}
              className="inline-flex items-center gap-1.5 rounded-lg border border-orange-300 bg-white px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50 dark:border-orange-800 dark:bg-gray-800 dark:text-orange-300 shadow-sm"
            >
              <Play className="h-3.5 w-3.5" />
              {isWebhookTriggering ? 'Sending Webhook...' : 'Simulate Inbound Webhook Call'}
            </button>
          </div>

          <div className="relative rounded-lg bg-gray-900 p-3 text-xs font-mono text-gray-300 overflow-x-auto">
            <pre>{webhookCurlSnippet}</pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(webhookCurlSnippet);
                setCopiedCurl(true);
                setTimeout(() => setCopiedCurl(false), 2000);
              }}
              className="absolute right-2 top-2 rounded bg-gray-800 p-1.5 text-gray-400 hover:text-white"
              title="Copy cURL snippet"
            >
              {copiedCurl ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* Live Timeline Section */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Terminal className="h-4 w-4 text-orange-600" />
              Live Step Execution Timeline
            </h2>
            <span className="text-xs text-gray-500">
              Live status streamed in real-time via <code className="font-mono">StepProgress</code> subscription
            </span>
          </div>

          {activeRunId && (
            <span className="font-mono text-xs text-gray-400">
              Run ID: {activeRunId.slice(0, 8)}...
            </span>
          )}
        </div>

        {/* Steps Timeline */}
        {liveSteps.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-xs">
            No execution data yet. Click <span className="font-semibold text-orange-600">Run Workflow</span> to start.
          </div>
        ) : (
          <div className="space-y-4">
            {liveSteps.map((step: any) => {
              const isPaused = step.status === 'paused_awaiting_approval';
              const isRunning = step.status === 'running';
              const isSuccess = step.status === 'succeeded';
              const isFailed = step.status === 'failed';
              const isPending = step.status === 'pending';
              const isExpanded = expandedSteps[step.id];

              return (
                <div
                  key={step.id}
                  className={`rounded-xl border transition-all ${
                    isPaused
                      ? 'border-orange-400 bg-orange-50/40 dark:border-orange-800 dark:bg-orange-950/20 ring-2 ring-orange-400/20'
                      : isRunning
                      ? 'border-blue-300 bg-blue-50/30 dark:border-blue-900 dark:bg-blue-950/20'
                      : isFailed
                      ? 'border-red-300 bg-red-50/20 dark:border-red-900 dark:bg-red-950/10'
                      : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-800/40'
                  }`}
                >
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    {/* Left: Step Info */}
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 font-bold text-xs">
                        {step.step_order}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          {getStepIcon(step.type)}
                          <span className="font-bold text-sm text-gray-900 dark:text-white capitalize">
                            {step.type.replace('_', ' ')}
                          </span>

                          {/* Status Badge */}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              isSuccess
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : isRunning
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 animate-pulse'
                                : isPaused
                                ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
                                : isFailed
                                ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {step.status}
                          </span>
                        </div>

                        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-3">
                          <span>Attempt: {step.attempt_count || 1}</span>
                          {step.approved_by && (
                            <span className="text-orange-600 dark:text-orange-400 font-medium">
                              Approved by: {step.approved_by.slice(0, 8)}...
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Conditional Approve Button & Output Toggle */}
                    <div className="flex items-center gap-2">
                      {/* CONDITIONAL APPROVE BUTTON FOR PAUSED STEPS */}
                      {isPaused && (
                        <div>
                          {canRun ? (
                            <button
                              onClick={() => handleApprove(step.id)}
                              disabled={isApproving === step.id}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-orange-700 disabled:opacity-50 transition-colors animate-bounce"
                            >
                              <ThumbsUp className="h-3.5 w-3.5" />
                              {isApproving === step.id ? 'Approving...' : 'Approve Step Execution'}
                            </button>
                          ) : (
                            <span className="text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950 px-2.5 py-1 rounded-md">
                              Requires Owner/Editor role to approve
                            </span>
                          )}
                        </div>
                      )}

                      {/* Expand / Collapse Details Button */}
                      {(step.output || step.error || step.input) && (
                        <button
                          onClick={() => toggleExpand(step.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronDown className="h-3.5 w-3.5" />
                              Hide Output
                            </>
                          ) : (
                            <>
                              <ChevronRight className="h-3.5 w-3.5" />
                              View Output
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Step JSON Output Preview */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 p-4 bg-gray-900 text-gray-100 text-xs font-mono rounded-b-xl overflow-x-auto dark:border-gray-800">
                      {step.error && (
                        <div className="mb-2 text-red-400 font-bold">
                          Error: {step.error}
                        </div>
                      )}
                      {step.output && (
                        <div>
                          <div className="text-gray-400 text-[10px] uppercase font-bold mb-1">
                            Step Output JSON:
                          </div>
                          <pre className="text-emerald-400">
                            {JSON.stringify(step.output, null, 2)}
                          </pre>
                        </div>
                      )}
                      {step.input && (
                        <div className="mt-2 pt-2 border-t border-gray-800">
                          <div className="text-gray-400 text-[10px] uppercase font-bold mb-1">
                            Step Input Context:
                          </div>
                          <pre className="text-blue-300">
                            {JSON.stringify(step.input, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
