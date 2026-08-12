import { adminGraphQLRequest, extractUserId } from './_utils/graphql';
import { executeRunAsync, markRunFailed } from './_utils/engine';
import { Workflow, WorkflowStep } from './_utils/types';

export default async function triggerWorkflowRun(req: any, res: any) {
  // Ensure res has json and status methods
  if (!res || typeof res.status !== 'function') {
    console.error('Invalid response object received in triggerWorkflowRun');
    return;
  }

  // Handle CORS preflight if called directly
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ status: 'ok' });
  }

  if (req.method !== 'POST') {
    return res.status(400).json({
      message: 'Method Not Allowed: Action webhook requires POST',
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

    if (!workflowId) {
      return res.status(400).json({
        message: 'Missing required argument: workflow_id',
        code: 'MISSING_WORKFLOW_ID',
        extensions: { code: 'MISSING_WORKFLOW_ID' },
      });
    }

    // 1. Layer 2 Role Verification: Extract caller user ID from headers / session variables
    const userId = extractUserId(req);
    if (!userId) {
      return res.status(400).json({
        message: 'Unauthorized: missing x-hasura-user-id header or session variable',
        code: 'UNAUTHORIZED',
        extensions: { code: 'UNAUTHORIZED' },
      });
    }

    // 2. Look up workflow + org and verify caller membership + role using Admin Secret
    const workflowQuery = `
      query GetWorkflowAndCallerRole($workflowId: uuid!, $userId: uuid!) {
        workflows_by_pk(id: $workflowId) {
          id
          name
          org_id
          created_by
          org {
            id
            name
            quota_calls_allowed
            quota_calls_used
            org_members(where: { user_id: { _eq: $userId } }) {
              id
              role
              user_id
            }
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
            org_members: Array<{ id: string; role: string; user_id: string }>;
          };
          workflow_steps: WorkflowStep[];
        }) | null;
      }>(workflowQuery, { workflowId, userId });
    } catch (gqlErr: any) {
      console.error('Failed to fetch workflow in triggerWorkflowRun:', gqlErr);
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

    const org = workflow.org;
    const membership = org?.org_members?.[0];

    // Verify caller is owner or editor in this workflow's organization
    if (!membership || !['owner', 'editor'].includes(membership.role)) {
      return res.status(400).json({
        message: 'Not authorized to trigger this workflow (must be owner or editor of the organization)',
        code: 'FORBIDDEN',
        extensions: { code: 'FORBIDDEN' },
      });
    }

    // 3. Check Quota
    if (org.quota_calls_used >= org.quota_calls_allowed) {
      return res.status(400).json({
        message: `Quota exhausted: organization has used ${org.quota_calls_used} of ${org.quota_calls_allowed} allowed runs this month`,
        code: 'QUOTA_EXHAUSTED',
        extensions: { code: 'QUOTA_EXHAUSTED' },
      });
    }

    // 4. Create workflow_run (status='running') + step_runs (status='pending') via Admin GraphQL client
    const stepRunsData = (workflow.workflow_steps || []).map((step) => ({
      workflow_step_id: step.id,
      step_order: step.step_order,
      type: step.type,
      status: 'pending',
      attempt_count: 0,
    }));

    const createRunMutation = `
      mutation CreateWorkflowRun(
        $workflowId: uuid!
        $orgId: uuid!
        $triggeredBy: uuid
        $triggerType: String!
        $stepRuns: [step_runs_insert_input!]!
      ) {
        insert_workflow_runs_one(
          object: {
            workflow_id: $workflowId
            org_id: $orgId
            triggered_by: $triggeredBy
            trigger_type: $triggerType
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
        triggeredBy: userId,
        triggerType: 'manual',
        stepRuns: stepRunsData,
      });
    } catch (createErr: any) {
      console.error('Failed to create workflow run in triggerWorkflowRun:', createErr);
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

    // 5. Kick off async execution — do NOT block HTTP response
    executeRunAsync(run.id).catch((err) => {
      console.error(`Async execution error for run ${run.id}:`, err);
      markRunFailed(run.id, err?.message || 'Execution failed');
    });

    // 6. Return structured response to Hasura Action / Frontend
    return res.status(200).json({
      run_id: run.id,
      status: 'running',
    });
  } catch (error: any) {
    console.error('triggerWorkflowRun error:', error);
    const errorMessage = error?.message || (typeof error === 'string' ? error : 'Internal server error while triggering workflow run');
    return res.status(400).json({
      message: errorMessage,
      code: 'TRIGGER_WORKFLOW_RUN_ERROR',
      extensions: {
        code: 'TRIGGER_WORKFLOW_RUN_ERROR',
        details: String(errorMessage),
      },
    });
  }
}
