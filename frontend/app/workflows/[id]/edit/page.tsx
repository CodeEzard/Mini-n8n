'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@apollo/client';
import {
  GET_WORKFLOW_BY_ID,
  CREATE_WORKFLOW_MUTATION,
  UPDATE_WORKFLOW_MUTATION,
  ORG_WORKFLOWS_QUERY,
} from '../../../lib/graphql-queries';
import { useAuth } from '../../../lib/auth-context';
import {
  Workflow,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
  Bot,
  Globe,
  Bell,
  GitBranch,
  PauseCircle,
  Database,
  ArrowLeft,
  Webhook,
  Key,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';

interface StepDraft {
  id?: string;
  step_order: number;
  type: 'llm_call' | 'http_request' | 'db_write' | 'notify' | 'conditional_branch' | 'approval_gate';
  config: Record<string, any>;
  required_role?: string | null;
}

export default function EditWorkflowPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const isNew = id === 'new';

  const { activeOrgId, canEdit, activeRole, userId } = useAuth();

  const [name, setName] = useState('New AI Workflow');
  const [description, setDescription] = useState('');
  const [hasManualTrigger, setHasManualTrigger] = useState(true);
  const [hasWebhookTrigger, setHasWebhookTrigger] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState('whsec_demo_secret_123');

  const [steps, setSteps] = useState<StepDraft[]>([
    {
      step_order: 1,
      type: 'llm_call',
      config: {
        prompt: 'Analyze sentiment for customer input: {{input.message}}',
        model: 'gpt-4o-mini',
        system_prompt: 'You are an AI sentiment analyzer.',
      },
    },
    {
      step_order: 2,
      type: 'conditional_branch',
      config: { condition: 'true' },
    },
    {
      step_order: 3,
      type: 'approval_gate',
      config: { title: 'Manager Approval Required Before External Webhook' },
    },
    {
      step_order: 4,
      type: 'http_request',
      config: {
        url: 'https://httpbin.org/post',
        method: 'POST',
        body: { approved: true, analysis: '{{step1.output.text}}' },
      },
    },
  ]);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch existing workflow if editing
  const { data: existingData, loading: isLoadingExisting } = useQuery(GET_WORKFLOW_BY_ID, {
    variables: { id },
    skip: isNew,
    onCompleted: (data) => {
      if (data?.workflows_by_pk) {
        const wf = data.workflows_by_pk;
        setName(wf.name);
        setDescription(wf.description || '');
        const triggers = wf.workflow_triggers || [];
        setHasManualTrigger(triggers.some((t: any) => t.type === 'manual'));
        const wh = triggers.find((t: any) => t.type === 'webhook');
        if (wh) {
          setHasWebhookTrigger(true);
          setWebhookSecret(wh.webhook_secret || 'whsec_demo_secret_123');
        }
        if (wf.workflow_steps?.length > 0) {
          setSteps(
            wf.workflow_steps.map((s: any) => ({
              id: s.id,
              step_order: s.step_order,
              type: s.type,
              config: s.config || {},
              required_role: s.required_role,
            }))
          );
        }
      }
    },
  });

  const [createWorkflow] = useMutation(CREATE_WORKFLOW_MUTATION, {
    refetchQueries: [{ query: ORG_WORKFLOWS_QUERY, variables: { orgId: activeOrgId } }],
  });

  const [updateWorkflow] = useMutation(UPDATE_WORKFLOW_MUTATION, {
    refetchQueries: [{ query: ORG_WORKFLOWS_QUERY, variables: { orgId: activeOrgId } }],
  });

  const addStep = (type: StepDraft['type']) => {
    let defaultConfig: Record<string, any> = {};
    switch (type) {
      case 'llm_call':
        defaultConfig = {
          prompt: 'Process and analyze input: {{input.data}}',
          model: 'gpt-4o-mini',
          system_prompt: 'You are an AI assistant.',
        };
        break;
      case 'http_request':
        defaultConfig = {
          url: 'https://httpbin.org/post',
          method: 'POST',
          body: { processed: true },
        };
        break;
      case 'conditional_branch':
        defaultConfig = { condition: 'true' };
        break;
      case 'approval_gate':
        defaultConfig = { title: 'Human in the Loop Approval' };
        break;
      case 'notify':
        defaultConfig = {
          channel: 'slack',
          recipient: '#general',
          message: 'Workflow alert: {{step1.output.text}}',
        };
        break;
      case 'db_write':
        defaultConfig = { table: 'audit_logs', data: { status: 'recorded' } };
        break;
    }

    const newStep: StepDraft = {
      step_order: steps.length + 1,
      type,
      config: defaultConfig,
    };
    setSteps([...steps, newStep]);
  };

  const removeStep = (index: number) => {
    const updated = steps
      .filter((_, i) => i !== index)
      .map((s, idx) => ({ ...s, step_order: idx + 1 }));
    setSteps(updated);
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === steps.length - 1)
    ) {
      return;
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const reordered = [...steps];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    const updated = reordered.map((s, idx) => ({ ...s, step_order: idx + 1 }));
    setSteps(updated);
  };

  const updateStepConfig = (index: number, key: string, value: any) => {
    const updated = [...steps];
    updated[index] = {
      ...updated[index],
      config: {
        ...updated[index].config,
        [key]: value,
      },
    };
    setSteps(updated);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      setSaveError('Permission Denied: Viewer role cannot create or edit workflows.');
      return;
    }
    if (steps.length === 0) {
      setSaveError('A workflow must contain at least 1 step.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    const triggersData = [];
    if (hasManualTrigger) {
      triggersData.push({ type: 'manual', config: {} });
    }
    if (hasWebhookTrigger) {
      triggersData.push({
        type: 'webhook',
        config: { path: `/webhook/${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}` },
        webhook_secret: webhookSecret,
      });
    }

    const stepsData = steps.map((s, idx) => ({
      step_order: idx + 1,
      type: s.type,
      config: s.config,
      required_role: s.required_role || null,
    }));

    try {
      if (isNew) {
        const res = await createWorkflow({
          variables: {
            object: {
              name,
              description,
              org_id: activeOrgId,
              created_by: userId,
              workflow_steps: {
                data: stepsData,
              },
              workflow_triggers: {
                data: triggersData,
              },
            },
          },
        });

        const newId = res.data?.insert_workflows_one?.id;
        router.push(newId ? `/workflows/${newId}/run` : '/workflows');
      } else {
        await updateWorkflow({
          variables: {
            id,
            name,
            description,
            steps: stepsData.map((s) => ({ ...s, workflow_id: id })),
          },
        });
        router.push(`/workflows/${id}/run`);
      }
    } catch (err: any) {
      console.error('Save workflow error:', err);
      setSaveError(err.message || 'Failed to save workflow.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/workflows"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Workflows
        </Link>
        <span className="text-xs text-gray-500">
          Role: <span className="font-semibold uppercase text-orange-600">{activeRole}</span>
        </span>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          {isNew ? 'Construct AI Workflow' : `Edit Workflow: ${name}`}
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Assemble steps in order, configure AI models, external HTTP endpoints, notifications, and approval gates.
        </p>
      </div>

      {saveError && (
        <div className="mb-6 flex items-center gap-2 rounded-xl bg-red-50 p-4 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {/* Basic Info */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Workflow Details
          </h2>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Workflow Name
            </label>
            <input
              type="text"
              required
              disabled={!canEdit}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Customer Sentiment & Escalation"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-gray-700 dark:bg-gray-800"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              disabled={!canEdit}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the objective and behavior of this workflow..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-gray-700 dark:bg-gray-800"
            />
          </div>
        </div>

        {/* Triggers Section */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Execution Triggers
          </h2>

          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={hasManualTrigger}
                onChange={(e) => setHasManualTrigger(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                Manual Trigger (Click 'Run' from UI or triggerWorkflowRun Action)
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={hasWebhookTrigger}
                onChange={(e) => setHasWebhookTrigger(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                Webhook Trigger (External HTTP POST with secret verification)
              </span>
            </label>

            {hasWebhookTrigger && (
              <div className="mt-3 ml-7 rounded-lg border border-gray-200 bg-gray-50 p-3.5 space-y-2 dark:border-gray-800 dark:bg-gray-800/50">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Webhook Secret (Checked via Admin Secret before execution)
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Key className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={webhookSecret}
                      onChange={(e) => setWebhookSecret(e.target.value)}
                      placeholder="e.g. whsec_secret_123"
                      className="w-full rounded-md border border-gray-300 pl-8 pr-3 py-1.5 text-xs font-mono outline-none dark:border-gray-700 dark:bg-gray-900"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setWebhookSecret(
                        `whsec_${Math.random().toString(36).substring(2, 12)}`
                      )
                    }
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  >
                    Generate
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Steps Pipeline Builder */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Steps Pipeline ({steps.length} Steps)
            </h2>

            {canEdit && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => addStep('llm_call')}
                  className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-100 dark:border-purple-900 dark:bg-purple-950 dark:text-purple-300"
                >
                  <Bot className="h-3 w-3" /> + LLM Call
                </button>
                <button
                  type="button"
                  onClick={() => addStep('conditional_branch')}
                  className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
                >
                  <GitBranch className="h-3 w-3" /> + Branch
                </button>
                <button
                  type="button"
                  onClick={() => addStep('notify')}
                  className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 hover:bg-green-100 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
                >
                  <Bell className="h-3 w-3" /> + Notify
                </button>
                <button
                  type="button"
                  onClick={() => addStep('approval_gate')}
                  className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-100 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300"
                >
                  <PauseCircle className="h-3 w-3" /> + Approval Gate
                </button>
                <button
                  type="button"
                  onClick={() => addStep('http_request')}
                  className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300"
                >
                  <Globe className="h-3 w-3" /> + HTTP Request
                </button>
              </div>
            )}
          </div>

          {/* Steps List */}
          <div className="space-y-4">
            {steps.map((step, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 transition-all dark:border-gray-800 dark:bg-gray-800/40"
              >
                {/* Step Top Bar */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-sm text-gray-900 dark:text-white capitalize">
                      {step.type.replace('_', ' ')}
                    </span>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveStep(idx, 'up')}
                        disabled={idx === 0}
                        className="rounded p-1 text-gray-500 hover:bg-gray-200 disabled:opacity-30 dark:hover:bg-gray-700"
                        title="Move Up"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStep(idx, 'down')}
                        disabled={idx === steps.length - 1}
                        className="rounded p-1 text-gray-500 hover:bg-gray-200 disabled:opacity-30 dark:hover:bg-gray-700"
                        title="Move Down"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeStep(idx)}
                        className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50"
                        title="Delete Step"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Step Config Inputs */}
                <div className="space-y-2.5 pt-1">
                  {step.type === 'llm_call' && (
                    <>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          Prompt Template (use &#123;&#123;input.var&#125;&#125; or &#123;&#123;step1.output.text&#125;&#125;)
                        </label>
                        <textarea
                          rows={2}
                          disabled={!canEdit}
                          value={step.config.prompt || ''}
                          onChange={(e) => updateStepConfig(idx, 'prompt', e.target.value)}
                          className="w-full rounded-md border border-gray-300 p-2 text-xs font-mono outline-none dark:border-gray-700 dark:bg-gray-900"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                            Model
                          </label>
                          <input
                            type="text"
                            disabled={!canEdit}
                            value={step.config.model || 'gpt-4o-mini'}
                            onChange={(e) => updateStepConfig(idx, 'model', e.target.value)}
                            className="w-full rounded-md border border-gray-300 p-1.5 text-xs outline-none dark:border-gray-700 dark:bg-gray-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                            System Prompt
                          </label>
                          <input
                            type="text"
                            disabled={!canEdit}
                            value={step.config.system_prompt || ''}
                            onChange={(e) => updateStepConfig(idx, 'system_prompt', e.target.value)}
                            className="w-full rounded-md border border-gray-300 p-1.5 text-xs outline-none dark:border-gray-700 dark:bg-gray-900"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {step.type === 'http_request' && (
                    <>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="col-span-1">
                          <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                            Method
                          </label>
                          <select
                            disabled={!canEdit}
                            value={step.config.method || 'POST'}
                            onChange={(e) => updateStepConfig(idx, 'method', e.target.value)}
                            className="w-full rounded-md border border-gray-300 p-1.5 text-xs outline-none dark:border-gray-700 dark:bg-gray-900"
                          >
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                            <option value="PUT">PUT</option>
                            <option value="DELETE">DELETE</option>
                          </select>
                        </div>
                        <div className="col-span-3">
                          <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                            Endpoint URL
                          </label>
                          <input
                            type="text"
                            disabled={!canEdit}
                            value={step.config.url || ''}
                            onChange={(e) => updateStepConfig(idx, 'url', e.target.value)}
                            placeholder="https://httpbin.org/post"
                            className="w-full rounded-md border border-gray-300 p-1.5 text-xs font-mono outline-none dark:border-gray-700 dark:bg-gray-900"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          Request Body JSON
                        </label>
                        <textarea
                          rows={2}
                          disabled={!canEdit}
                          value={
                            typeof step.config.body === 'object'
                              ? JSON.stringify(step.config.body)
                              : step.config.body || ''
                          }
                          onChange={(e) => {
                            try {
                              updateStepConfig(idx, 'body', JSON.parse(e.target.value));
                            } catch {
                              updateStepConfig(idx, 'body', e.target.value);
                            }
                          }}
                          className="w-full rounded-md border border-gray-300 p-2 text-xs font-mono outline-none dark:border-gray-700 dark:bg-gray-900"
                        />
                      </div>
                    </>
                  )}

                  {step.type === 'approval_gate' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                        Approval Gate Instructions for Manager
                      </label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={step.config.title || ''}
                        onChange={(e) => updateStepConfig(idx, 'title', e.target.value)}
                        placeholder="e.g. Approve customer refund and CRM escalation"
                        className="w-full rounded-md border border-gray-300 p-2 text-xs outline-none dark:border-gray-700 dark:bg-gray-900"
                      />
                      <span className="text-[10px] text-orange-600 mt-1 block">
                        Execution will pause here with status 'paused_awaiting_approval' until an Owner/Editor clicks Approve.
                      </span>
                    </div>
                  )}

                  {step.type === 'notify' && (
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          Channel
                        </label>
                        <select
                          disabled={!canEdit}
                          value={step.config.channel || 'slack'}
                          onChange={(e) => updateStepConfig(idx, 'channel', e.target.value)}
                          className="w-full rounded-md border border-gray-300 p-1.5 text-xs outline-none dark:border-gray-700 dark:bg-gray-900"
                        >
                          <option value="slack">Slack</option>
                          <option value="email">Email</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          Notification Message Template
                        </label>
                        <input
                          type="text"
                          disabled={!canEdit}
                          value={step.config.message || ''}
                          onChange={(e) => updateStepConfig(idx, 'message', e.target.value)}
                          className="w-full rounded-md border border-gray-300 p-1.5 text-xs outline-none dark:border-gray-700 dark:bg-gray-900"
                        />
                      </div>
                    </div>
                  )}

                  {step.type === 'conditional_branch' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                        Branch Condition Expression
                      </label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={step.config.condition || 'true'}
                        onChange={(e) => updateStepConfig(idx, 'condition', e.target.value)}
                        placeholder="true or step1.output.score > 50"
                        className="w-full rounded-md border border-gray-300 p-1.5 text-xs font-mono outline-none dark:border-gray-700 dark:bg-gray-900"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Button */}
        {canEdit && (
          <div className="flex justify-end gap-3">
            <Link
              href="/workflows"
              className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Saving...' : isNew ? 'Create & Run' : 'Save Changes'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
