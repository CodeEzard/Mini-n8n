import { adminGraphQLRequest, parseResponseSafely } from './_utils/graphql';
import { executeRunAsync, markRunFailed } from './_utils/engine';
import { Workflow, WorkflowStep } from './_utils/types';

export default async function receiveWebhook(req: any, res: any) {
  if (!res || typeof res.status !== 'function') {
    console.error('Invalid response object in receiveWebhook');
    return;
  }

  // Handle CORS preflight if called directly
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ status: 'ok' });
  }

  if (req.method !== 'POST') {
    return res.status(400).json({
      message: 'Method Not Allowed: Webhook triggers must use POST',
      code: 'METHOD_NOT_ALLOWED',
      extensions: { code: 'METHOD_NOT_ALLOWED' },
    });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const input = body?.input || body || {};
    const workflowId = input.workflow_id || input.workflowId || body?.workflow_id || body?.workflowId;
    const secret = input.secret || body?.secret;
    const payload = input.payload || body?.payload || {};

    if (!workflowId || !secret) {
      return res.status(400).json({
        message: 'Missing required arguments: workflow_id and secret must be provided',
        code: 'MISSING_ARGUMENTS',
        extensions: { code: 'MISSING_ARGUMENTS' },
      });
    }

    // 1. Look up workflow, webhook triggers, org quota, and steps via Admin Secret
    const workflowQuery = `
      query GetWorkflowForWebhook($workflowId: uuid!) {
        workflows_by_pk(id: $workflowId) {
          id
          name
          org_id
          org {
            id
            name
            quota_calls_allowed
            quota_calls_used
          }
          workflow_triggers(where: { type: { _eq: "webhook" } }) {
            id
            type
            webhook_secret
            config
          }
          workflow_steps(order_by: { step_order: asc }) {
            id
            step_order
            type
            config
            required_role
          }
        }
      }
    `;

    let data;
    try {
      data = await adminGraphQLRequest<{
        workflows_by_pk: (Workflow & {
          org: {
            id: string;
            name: string;
            quota_calls_allowed: number;
            quota_calls_used: number;
          };
          workflow_triggers: Array<{
            id: string;
            type: string;
            webhook_secret?: string | null;
            config: Record<string, any>;
          }>;
          workflow_steps: WorkflowStep[];
        }) | null;
      }>(workflowQuery, { workflowId });
    } catch (gqlErr: any) {
      console.error('Failed to query workflow in receiveWebhook:', gqlErr);
      return res.status(400).json({
        message: `Database query failed: ${gqlErr?.message || String(gqlErr)}`,
        code: 'DATABASE_QUERY_ERROR',
        extensions: { code: 'DATABASE_QUERY_ERROR', details: String(gqlErr?.message || gqlErr) },
      });
    }

    const workflow = data?.workflows_by_pk;
    if (!workflow) {
      return res.status(400).json({
        message: `Workflow with id ${workflowId} not found`,
        code: 'WORKFLOW_NOT_FOUND',
        extensions: { code: 'WORKFLOW_NOT_FOUND' },
      });
    }

    // 2. Verify webhook trigger and secret
    const webhookTrigger = (workflow.workflow_triggers || []).find((t) => t.type === 'webhook');

    if (!webhookTrigger) {
      return res.status(400).json({
        message: 'No webhook trigger configured for this workflow',
        code: 'NO_WEBHOOK_TRIGGER',
        extensions: { code: 'NO_WEBHOOK_TRIGGER' },
      });
    }

    if (!webhookTrigger.webhook_secret || webhookTrigger.webhook_secret !== secret) {
      return res.status(400).json({
        message: 'Unauthorized: invalid or mismatched webhook secret',
        code: 'INVALID_WEBHOOK_SECRET',
        extensions: { code: 'INVALID_WEBHOOK_SECRET' },
      });
    }

    // 3. Check Organization Quota
    const org = workflow.org;
    if (org.quota_calls_used >= org.quota_calls_allowed) {
      return res.status(400).json({
        message: `Quota exhausted: organization has used ${org.quota_calls_used} of ${org.quota_calls_allowed} allowed runs`,
        code: 'QUOTA_EXHAUSTED',
        extensions: { code: 'QUOTA_EXHAUSTED' },
      });
    }

    // 4. Create workflow_run (trigger_type='webhook') and initial step_runs via Admin GraphQL
    const stepRunsData = (workflow.workflow_steps || []).map((step) => ({
      workflow_step_id: step.id,
      step_order: step.step_order,
      type: step.type,
      status: 'pending',
      attempt_count: 0,
      input: step.step_order === 1 ? payload : null,
    }));

    const createRunMutation = `
      mutation CreateWebhookWorkflowRun(
        $workflowId: uuid!
        $orgId: uuid!
        $stepRuns: [step_runs_insert_input!]!
      ) {
        insert_workflow_runs_one(
          object: {
            workflow_id: $workflowId
            org_id: $orgId
            triggered_by: null
            trigger_type: "webhook"
            status: "running"
            current_step_order: 0
            step_runs: {
              data: $stepRuns
            }
          }
        ) {
          id
          status
          workflow_id
          org_id
        }
      }
    `;

    let runResult;
    try {
      runResult = await adminGraphQLRequest<{
        insert_workflow_runs_one: {
          id: string;
          status: string;
          workflow_id: string;
          org_id: string;
        } | null;
      }>(createRunMutation, {
        workflowId: workflow.id,
        orgId: org.id,
        stepRuns: stepRunsData,
      });
    } catch (createErr: any) {
      console.error('Failed to create webhook workflow run:', createErr);
      return res.status(400).json({
        message: `Failed to create workflow run: ${createErr?.message || String(createErr)}`,
        code: 'RUN_CREATION_FAILED',
        extensions: { code: 'RUN_CREATION_FAILED', details: String(createErr?.message || createErr) },
      });
    }

    const run = runResult?.insert_workflow_runs_one;
    if (!run || !run.id) {
      return res.status(400).json({
        message: 'Database did not return created workflow run record',
        code: 'RUN_RECORD_EMPTY',
        extensions: { code: 'RUN_RECORD_EMPTY' },
      });
    }

    // 5. Kick off async execution with incoming webhook payload as initial context
    executeRunAsync(run.id, payload).catch((err) => {
      console.error(`Async execution error for webhook run ${run.id}:`, err);
      markRunFailed(run.id, err?.message || 'Webhook execution failed');
    });

    // 6. Return structured response
    return res.status(200).json({
      run_id: run.id,
      status: 'running',
    });
  } catch (error: any) {
    console.error('receiveWebhook error:', error);
    const errorMessage = error?.message || (typeof error === 'string' ? error : 'Internal server error while processing webhook trigger');
    return res.status(400).json({
      message: errorMessage,
      code: 'RECEIVE_WEBHOOK_ERROR',
      extensions: {
        code: 'RECEIVE_WEBHOOK_ERROR',
        details: String(errorMessage),
      },
    });
  }
}
