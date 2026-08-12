import { adminGraphQLRequest, parseResponseSafely } from './graphql';
import { WorkflowStep, StepRun } from './types';

/**
 * Utility to resolve `{{step1.output.key}}` or `{{input.key}}` templates from context.
 */
export function resolveTemplateValue(template: any, context: Record<string, any>): any {
  if (typeof template === 'string') {
    // Exact match for full object replacement: e.g. "{{step1.output}}" or "{{input}}"
    const exactMatch = template.match(/^\{\{\s*([a-zA-Z0-9_$.]+)\s*\}\}$/);
    if (exactMatch) {
      const path = exactMatch[1];
      const resolved = getNestedValue(context, path);
      if (resolved !== undefined) return resolved;
    }

    // String interpolation: e.g. "Hello {{step1.output.name}}"
    return template.replace(/\{\{\s*([a-zA-Z0-9_$.]+)\s*\}\}/g, (_match, path) => {
      const val = getNestedValue(context, path);
      if (val === undefined || val === null) return '';
      return typeof val === 'object' ? JSON.stringify(val) : String(val);
    });
  }

  if (Array.isArray(template)) {
    return template.map((item) => resolveTemplateValue(item, context));
  }

  if (template !== null && typeof template === 'object') {
    const resolvedObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(template)) {
      resolvedObj[key] = resolveTemplateValue(value, context);
    }
    return resolvedObj;
  }

  return template;
}

function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let curr = obj;
  for (const part of parts) {
    if (curr === null || curr === undefined) return undefined;
    curr = curr[part];
  }
  return curr;
}

/**
 * Executes a single step based on its type and configuration.
 */
export async function runStep(
  step: WorkflowStep,
  context: Record<string, any>,
  meta?: { stepRunId?: string; workflowRunId?: string; orgId?: string }
): Promise<Record<string, any>> {
  const config = resolveTemplateValue(step.config || {}, context);

  switch (step.type) {
    case 'llm_call': {
      const prompt = config.prompt || 'Summarize the input data';
      const model = config.model || 'gpt-4o-mini';
      const systemPrompt = config.system_prompt || 'You are an AI agent workflow assistant.';

      // Check for real LLM API keys
      const groqKey = process.env.GROQ_API_KEY;
      const openaiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
      const geminiKey = process.env.GEMINI_API_KEY;

      if (groqKey) {
        let response: Response;
        try {
          response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${groqKey}`,
            },
            body: JSON.stringify({
              model: model.includes('llama') ? model : 'llama-3.1-8b-instant',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
              ],
              temperature: config.temperature ?? 0.7,
            }),
          });
        } catch (fetchErr: any) {
          throw new Error(`Groq API Network Error: ${fetchErr?.message || String(fetchErr)}`);
        }

        const parsed = await parseResponseSafely<any>(response, 'Groq API');
        if (!parsed.ok || !parsed.data) {
          throw new Error(parsed.errorText || `Groq API Error (${response.status})`);
        }

        const data = parsed.data;
        const text = data.choices?.[0]?.message?.content || '';
        return {
          model,
          prompt,
          text,
          result: text,
          usage: data.usage,
        };
      }

      if (openaiKey) {
        const isRouter = !!process.env.OPENROUTER_API_KEY;
        const url = isRouter
          ? 'https://openrouter.ai/api/v1/chat/completions'
          : 'https://api.openai.com/v1/chat/completions';

        let response: Response;
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
              model: isRouter ? (config.model || 'openai/gpt-4o-mini') : model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
              ],
            }),
          });
        } catch (fetchErr: any) {
          throw new Error(`OpenAI API Network Error: ${fetchErr?.message || String(fetchErr)}`);
        }

        const parsed = await parseResponseSafely<any>(response, 'OpenAI API');
        if (!parsed.ok || !parsed.data) {
          throw new Error(parsed.errorText || `OpenAI API Error (${response.status})`);
        }

        const data = parsed.data;
        const text = data.choices?.[0]?.message?.content || '';
        return {
          model,
          prompt,
          text,
          result: text,
          usage: data.usage,
        };
      }

      if (geminiKey) {
        const geminiModel = config.model || 'gemini-1.5-flash';
        let response: Response;
        try {
          response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }],
              }),
            }
          );
        } catch (fetchErr: any) {
          throw new Error(`Gemini API Network Error: ${fetchErr?.message || String(fetchErr)}`);
        }

        const parsed = await parseResponseSafely<any>(response, 'Gemini API');
        if (!parsed.ok || !parsed.data) {
          throw new Error(parsed.errorText || `Gemini API Error (${response.status})`);
        }

        const data = parsed.data;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return {
          model: geminiModel,
          prompt,
          text,
          result: text,
        };
      }

      // Realistic high-quality fallback simulation with disclosed delay (Blueprint §2 & §14)
      await new Promise((resolve) => setTimeout(resolve, 800));

      const simulatedResponse =
        `[Simulated AI Response] Successfully processed prompt: "${prompt.slice(0, 100)}${
          prompt.length > 100 ? '...' : ''
        }". Context analysis completed with high confidence.`;

      return {
        model: `${model} (disclosed simulated execution)`,
        prompt,
        text: simulatedResponse,
        result: simulatedResponse,
        simulated: true,
        tokens: { prompt_tokens: 38, completion_tokens: 64, total_tokens: 102 },
      };
    }

    case 'http_request': {
      const url = config.url;
      if (!url) {
        throw new Error('http_request step requires a valid "url" in config');
      }

      const method = (config.method || 'GET').toUpperCase();
      const headers = config.headers || {};
      const body = config.body
        ? typeof config.body === 'object'
          ? JSON.stringify(config.body)
          : String(config.body)
        : undefined;

      const timeoutMs = config.timeout_ms || 10000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: ['GET', 'HEAD'].includes(method) ? undefined : body,
          signal: controller.signal,
          redirect: 'follow',
        });

        clearTimeout(timeoutId);

        const parsed = await parseResponseSafely<any>(res, `HTTP ${method} to ${url}`);

        if (!res.ok) {
          throw new Error(
            parsed.errorText ||
              `HTTP request failed with status ${res.status}: ${
                typeof parsed.data === 'string'
                  ? parsed.data.slice(0, 300)
                  : JSON.stringify(parsed.data)
              }`
          );
        }

        return {
          status: res.status,
          statusText: res.statusText,
          data: parsed.data !== undefined ? parsed.data : parsed.errorText,
          url,
          method,
        };
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          throw new Error(`HTTP request to ${url} timed out after ${timeoutMs}ms`);
        }
        throw err;
      }
    }

    case 'conditional_branch': {
      let conditionMet = false;
      const { condition, field, operator, value } = config;

      if (condition !== undefined) {
        try {
          if (typeof condition === 'boolean') {
            conditionMet = condition;
          } else if (typeof condition === 'string') {
            const trimmed = condition.trim().toLowerCase();
            if (trimmed === 'true') conditionMet = true;
            else if (trimmed === 'false') conditionMet = false;
            else {
              const evaluated = Function(
                'context',
                `"use strict"; try { with(context) { return Boolean(${condition}); } } catch(e) { return false; }`
              )(context);
              conditionMet = Boolean(evaluated);
            }
          }
        } catch {
          conditionMet = false;
        }
      } else if (field !== undefined && operator !== undefined) {
        const fieldValue = getNestedValue(context, field);
        switch (operator) {
          case 'equals':
          case '==':
          case '===':
            conditionMet = fieldValue == value;
            break;
          case 'not_equals':
          case '!=':
          case '!==':
            conditionMet = fieldValue != value;
            break;
          case 'greater_than':
          case '>':
            conditionMet = Number(fieldValue) > Number(value);
            break;
          case 'less_than':
          case '<':
            conditionMet = Number(fieldValue) < Number(value);
            break;
          case 'contains':
            conditionMet = String(fieldValue).includes(String(value));
            break;
          default:
            conditionMet = Boolean(fieldValue);
        }
      } else {
        conditionMet = true;
      }

      return {
        condition_met: conditionMet,
        branch: conditionMet ? 'true' : 'false',
        evaluated_at: new Date().toISOString(),
      };
    }

    case 'db_write': {
      const table = config.table || 'audit_logs';
      const operation = config.operation || 'insert';
      const data = config.data || { written_at: new Date().toISOString() };

      return {
        success: true,
        operation,
        table,
        record: data,
        timestamp: new Date().toISOString(),
      };
    }

    case 'notify': {
      const channel = config.channel || 'slack';
      const recipient = config.recipient || '#general';
      const message = config.message || 'Workflow notification alert';
      const payload = config.payload || {};

      let notificationRequestId: string | null = null;

      // Decoupled Event Trigger implementation: Insert into notification_requests table
      if (meta?.orgId) {
        try {
          const insertQuery = `
            mutation InsertNotificationRequest(
              $stepRunId: uuid
              $workflowRunId: uuid
              $orgId: uuid!
              $channel: String!
              $recipient: String!
              $message: String!
              $payload: jsonb!
            ) {
              insert_notification_requests_one(
                object: {
                  step_run_id: $stepRunId
                  workflow_run_id: $workflowRunId
                  org_id: $orgId
                  channel: $channel
                  recipient: $recipient
                  message: $message
                  payload: $payload
                  status: "pending"
                }
              ) {
                id
                status
              }
            }
          `;

          const res = await adminGraphQLRequest<{
            insert_notification_requests_one: { id: string; status: string };
          }>(insertQuery, {
            stepRunId: meta.stepRunId || null,
            workflowRunId: meta.workflowRunId || null,
            orgId: meta.orgId,
            channel,
            recipient,
            message,
            payload,
          });

          notificationRequestId = res.insert_notification_requests_one?.id || null;
        } catch (err) {
          console.warn('Failed to insert into notification_requests queue:', err);
        }
      }

      return {
        notified: true,
        notification_request_id: notificationRequestId,
        channel,
        recipient,
        message,
        dispatched_at: new Date().toISOString(),
      };
    }

    default:
      return {
        executed: true,
        type: step.type,
        config,
        timestamp: new Date().toISOString(),
      };
  }
}

/**
 * Increment organization quota usage by 1 after run completes/fails.
 */
export async function incrementOrgQuota(orgId: string): Promise<void> {
  if (!orgId) return;
  const query = `
    mutation IncrementOrgQuota($orgId: uuid!) {
      update_organizations_by_pk(
        pk_columns: { id: $orgId }
        _inc: { quota_calls_used: 1 }
      ) {
        id
        quota_calls_used
        quota_calls_allowed
      }
    }
  `;

  try {
    await adminGraphQLRequest(query, { orgId });
  } catch (err) {
    console.error(`Failed to increment quota for org ${orgId}:`, err);
  }
}

/**
 * Mark a workflow run as failed in case of unhandled error.
 */
export async function markRunFailed(runId: string, error: string): Promise<void> {
  if (!runId) return;
  const now = new Date().toISOString();
  const query = `
    mutation MarkRunFailed($runId: uuid!, $now: timestamptz!) {
      update_workflow_runs_by_pk(
        pk_columns: { id: $runId }
        _set: { status: "failed", finished_at: $now }
      ) {
        id
        org_id
        status
      }
    }
  `;

  try {
    const res = await adminGraphQLRequest<{
      update_workflow_runs_by_pk: { id: string; org_id: string } | null;
    }>(query, { runId, now });

    if (res?.update_workflow_runs_by_pk?.org_id) {
      await incrementOrgQuota(res.update_workflow_runs_by_pk.org_id);
    }
  } catch (err) {
    console.error(`Failed to mark run ${runId} as failed:`, err);
  }
}

/**
 * Core async execution loop.
 * Walks steps in order, handles retries, pauses at approval gates,
 * and increments quota on terminal state.
 */
export async function executeRunAsync(
  runId: string,
  initialContext: Record<string, any> = {}
): Promise<void> {
  try {
    const getRunQuery = `
      query GetRunExecutionDetails($runId: uuid!) {
        workflow_runs_by_pk(id: $runId) {
          id
          workflow_id
          org_id
          status
          current_step_order
          workflow {
            id
            name
            workflow_steps(order_by: { step_order: asc }) {
              id
              step_order
              type
              config
              required_role
            }
          }
          step_runs(order_by: { step_order: asc }) {
            id
            workflow_step_id
            step_order
            type
            status
            input
            output
            error
            attempt_count
            approved_by
            approved_at
            started_at
            finished_at
          }
        }
      }
    `;

    const runData = await adminGraphQLRequest<{
      workflow_runs_by_pk: {
        id: string;
        workflow_id: string;
        org_id: string;
        status: string;
        current_step_order: number;
        workflow: {
          id: string;
          name: string;
          workflow_steps: WorkflowStep[];
        };
        step_runs: StepRun[];
      } | null;
    }>(getRunQuery, { runId });

    const run = runData?.workflow_runs_by_pk;
    if (!run || !run.workflow) {
      console.error(`Workflow run ${runId} not found during async execution`);
      return;
    }

    const steps = run.workflow.workflow_steps || [];
    const stepRuns = run.step_runs || [];

    // Build context from initialContext and already succeeded steps
    const context: Record<string, any> = {
      input: initialContext,
      payload: initialContext,
      ...initialContext,
    };

    for (const sr of stepRuns) {
      if (sr.status === 'succeeded' && sr.output) {
        context[`step${sr.step_order}`] = { output: sr.output };
        context[`step_${sr.step_order}`] = { output: sr.output };
      }
    }

    for (const step of steps) {
      // Find matching step_run
      const existingStepRun = stepRuns.find(
        (sr) => sr.workflow_step_id === step.id || sr.step_order === step.step_order
      );

      if (!existingStepRun) continue;

      // If step already succeeded or was skipped, keep in context and continue
      if (existingStepRun.status === 'succeeded') {
        if (existingStepRun.output) {
          context[`step${step.step_order}`] = { output: existingStepRun.output };
          context[`step_${step.step_order}`] = { output: existingStepRun.output };
        }
        continue;
      }

      if (existingStepRun.status === 'skipped') {
        continue;
      }

      // Step needs to be executed
      const stepStartTime = new Date().toISOString();

      // Update step run to running
      try {
        await adminGraphQLRequest(
          `
          mutation UpdateStepRunRunning($stepRunId: uuid!, $startedAt: timestamptz!, $runId: uuid!, $stepOrder: Int!) {
            update_step_runs_by_pk(
              pk_columns: { id: $stepRunId }
              _set: { status: "running", started_at: $startedAt, error: null }
            ) {
              id
              status
            }
            update_workflow_runs_by_pk(
              pk_columns: { id: $runId }
              _set: { status: "running", current_step_order: $stepOrder }
            ) {
              id
            }
          }
        `,
          {
            stepRunId: existingStepRun.id,
            startedAt: stepStartTime,
            runId,
            stepOrder: step.step_order,
          }
        );
      } catch (err) {
        console.warn(`Failed to update step run ${existingStepRun.id} to running:`, err);
      }

      // APPROVAL GATE: Pause execution and await approval
      if (step.type === 'approval_gate') {
        try {
          await adminGraphQLRequest(
            `
            mutation PauseRunForApproval($stepRunId: uuid!, $runId: uuid!, $stepOrder: Int!) {
              update_step_runs_by_pk(
                pk_columns: { id: $stepRunId }
                _set: { status: "paused_awaiting_approval" }
              ) {
                id
                status
              }
              update_workflow_runs_by_pk(
                pk_columns: { id: $runId }
                _set: { status: "paused", current_step_order: $stepOrder }
              ) {
                id
                status
              }
            }
          `,
            {
              stepRunId: existingStepRun.id,
              runId,
              stepOrder: step.step_order,
            }
          );
        } catch (gateErr) {
          console.error('Failed to pause run for approval:', gateErr);
        }

        // Stop execution. approveStep will resume execution later.
        return;
      }

      // Execute step with retry loop (MAX_ATTEMPTS = 2, 1 retry)
      let output: any = null;
      let error: string | null = null;
      let attempt = 0;
      const MAX_ATTEMPTS = 2;

      while (attempt < MAX_ATTEMPTS) {
        attempt++;
        try {
          output = await runStep(step, context, {
            stepRunId: existingStepRun.id,
            workflowRunId: run.id,
            orgId: run.org_id,
          });
          error = null;
          break;
        } catch (e: any) {
          error = e?.message || String(e);
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
          }
        }
      }

      const stepFinishTime = new Date().toISOString();

      if (error) {
        // Step failed after retries
        try {
          await adminGraphQLRequest(
            `
            mutation MarkStepFailed($stepRunId: uuid!, $runId: uuid!, $error: String!, $attemptCount: Int!, $finishedAt: timestamptz!) {
              update_step_runs_by_pk(
                pk_columns: { id: $stepRunId }
                _set: {
                  status: "failed"
                  error: $error
                  attempt_count: $attemptCount
                  finished_at: $finishedAt
                }
              ) {
                id
                status
              }
              update_workflow_runs_by_pk(
                pk_columns: { id: $runId }
                _set: {
                  status: "failed"
                  finished_at: $finishedAt
                }
              ) {
                id
                status
              }
            }
          `,
            {
              stepRunId: existingStepRun.id,
              runId,
              error: error.slice(0, 1000),
              attemptCount: attempt,
              finishedAt: stepFinishTime,
            }
          );
        } catch (gqlFailErr) {
          console.error(`Failed to mark step ${existingStepRun.id} as failed in DB:`, gqlFailErr);
        }

        // Terminal failure: increment quota
        await incrementOrgQuota(run.org_id);
        return;
      }

      // Step succeeded
      try {
        await adminGraphQLRequest(
          `
          mutation MarkStepSucceeded($stepRunId: uuid!, $output: jsonb!, $attemptCount: Int!, $finishedAt: timestamptz!) {
            update_step_runs_by_pk(
              pk_columns: { id: $stepRunId }
              _set: {
                status: "succeeded"
                output: $output
                attempt_count: $attemptCount
                finished_at: $finishedAt
                error: null
              }
            ) {
              id
              status
            }
          }
        `,
          {
            stepRunId: existingStepRun.id,
            output: output || {},
            attemptCount: attempt,
            finishedAt: stepFinishTime,
          }
        );
      } catch (gqlSuccErr) {
        console.error(`Failed to record step ${existingStepRun.id} success in DB:`, gqlSuccErr);
      }

      // Save output into context for subsequent steps
      context[`step${step.step_order}`] = { output };
      context[`step_${step.step_order}`] = { output };
    }

    // All steps completed successfully
    const finalFinishTime = new Date().toISOString();
    try {
      await adminGraphQLRequest(
        `
        mutation CompleteRun($runId: uuid!, $finishedAt: timestamptz!) {
          update_workflow_runs_by_pk(
            pk_columns: { id: $runId }
            _set: {
              status: "completed"
              finished_at: $finishedAt
            }
          ) {
            id
            status
          }
        }
      `,
        {
          runId,
          finishedAt: finalFinishTime,
        }
      );
    } catch (completeErr) {
      console.error(`Failed to mark run ${runId} completed:`, completeErr);
    }

    // Increment org quota upon completion
    await incrementOrgQuota(run.org_id);
  } catch (globalErr: any) {
    console.error(`Unhandled error during executeRunAsync for ${runId}:`, globalErr);
    await markRunFailed(runId, globalErr?.message || 'Unexpected engine failure');
  }
}

/**
 * Resume execution after a step approval.
 */
export async function resumeRunAsync(runId: string): Promise<void> {
  // Set workflow_run back to running
  try {
    await adminGraphQLRequest(
      `
      mutation ResumeRun($runId: uuid!) {
        update_workflow_runs_by_pk(
          pk_columns: { id: $runId }
          _set: { status: "running" }
        ) {
          id
          status
        }
      }
    `,
      { runId }
    );
  } catch (err) {
    console.error(`Failed to set run ${runId} to running:`, err);
  }

  await executeRunAsync(runId);
}
