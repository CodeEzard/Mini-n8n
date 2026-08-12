import { adminGraphQLRequest, extractUserId } from './_utils/graphql';
import { resumeRunAsync, markRunFailed } from './_utils/engine';

export default async function approveStep(req: any, res: any) {
  if (!res || typeof res.status !== 'function') {
    console.error('Invalid response object in approveStep');
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
    const stepRunId = input.step_run_id || input.stepRunId || body?.step_run_id || body?.stepRunId;

    if (!stepRunId) {
      return res.status(400).json({
        message: 'Missing required argument: step_run_id',
        code: 'MISSING_STEP_RUN_ID',
        extensions: { code: 'MISSING_STEP_RUN_ID' },
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

    // 2. Look up step_run, workflow_run, org, and verify caller membership + role using Admin Secret
    const stepRunQuery = `
      query GetStepRunWithOrgAndCallerRole($stepRunId: uuid!, $userId: uuid!) {
        step_runs_by_pk(id: $stepRunId) {
          id
          step_order
          type
          status
          workflow_step_id
          workflow_run_id
          workflow_run {
            id
            org_id
            workflow_id
            status
            org {
              id
              name
              org_members(where: { user_id: { _eq: $userId } }) {
                id
                role
                user_id
              }
            }
          }
        }
      }
    `;

    let data;
    try {
      data = await adminGraphQLRequest<{
        step_runs_by_pk: {
          id: string;
          step_order: number;
          type: string;
          status: string;
          workflow_step_id: string;
          workflow_run_id: string;
          workflow_run: {
            id: string;
            org_id: string;
            workflow_id: string;
            status: string;
            org: {
              id: string;
              name: string;
              org_members: Array<{ id: string; role: string; user_id: string }>;
            };
          };
        } | null;
      }>(stepRunQuery, { stepRunId, userId });
    } catch (gqlErr: any) {
      console.error('Failed to query step run in approveStep:', gqlErr);
      return res.status(400).json({
        message: `Database query failed: ${gqlErr?.message || String(gqlErr)}`,
        code: 'DATABASE_QUERY_ERROR',
        extensions: { code: 'DATABASE_QUERY_ERROR', details: String(gqlErr?.message || gqlErr) },
      });
    }

    const stepRun = data?.step_runs_by_pk;
    if (!stepRun) {
      return res.status(400).json({
        message: `Step run with id ${stepRunId} not found`,
        code: 'STEP_RUN_NOT_FOUND',
        extensions: { code: 'STEP_RUN_NOT_FOUND' },
      });
    }

    // Check that step is actually awaiting approval
    if (stepRun.status !== 'paused_awaiting_approval') {
      return res.status(400).json({
        message: `Step is not awaiting approval (current status: ${stepRun.status})`,
        code: 'STEP_NOT_AWAITING_APPROVAL',
        extensions: { code: 'STEP_NOT_AWAITING_APPROVAL' },
      });
    }

    const org = stepRun.workflow_run?.org;
    const membership = org?.org_members?.[0];

    // Verify caller is owner or editor in this organization (mid-execution authorization)
    if (!membership || !['owner', 'editor'].includes(membership.role)) {
      return res.status(400).json({
        message: 'Not authorized to approve step (must be owner or editor of the organization)',
        code: 'FORBIDDEN',
        extensions: { code: 'FORBIDDEN' },
      });
    }

    const now = new Date().toISOString();

    // 3. Mark step_run as succeeded and workflow_run as running using Admin GraphQL client
    const approveMutation = `
      mutation ApproveStepRun(
        $stepRunId: uuid!
        $workflowRunId: uuid!
        $approvedBy: uuid!
        $output: jsonb!
        $now: timestamptz!
      ) {
        update_step_runs_by_pk(
          pk_columns: { id: $stepRunId }
          _set: {
            status: "succeeded"
            approved_by: $approvedBy
            approved_at: $now
            finished_at: $now
            output: $output
            error: null
          }
        ) {
          id
          status
          approved_by
          approved_at
        }
        update_workflow_runs_by_pk(
          pk_columns: { id: $workflowRunId }
          _set: {
            status: "running"
          }
        ) {
          id
          status
        }
      }
    `;

    try {
      await adminGraphQLRequest(approveMutation, {
        stepRunId: stepRun.id,
        workflowRunId: stepRun.workflow_run_id,
        approvedBy: userId,
        output: {
          approved: true,
          approved_by: userId,
          approved_at: now,
        },
        now,
      });
    } catch (approveErr: any) {
      console.error('Failed to record step approval in DB:', approveErr);
      return res.status(400).json({
        message: `Failed to record step approval: ${approveErr?.message || String(approveErr)}`,
        code: 'APPROVE_MUTATION_FAILED',
        extensions: { code: 'APPROVE_MUTATION_FAILED', details: String(approveErr?.message || approveErr) },
      });
    }

    // 4. Resume execution from next step asynchronously
    resumeRunAsync(stepRun.workflow_run_id).catch((err) => {
      console.error(`Error resuming run ${stepRun.workflow_run_id}:`, err);
      markRunFailed(stepRun.workflow_run_id, err?.message || 'Error resuming run');
    });

    // 5. Return success response to Hasura Action / Frontend
    return res.status(200).json({
      success: true,
      step_run_id: stepRun.id,
      new_status: 'succeeded',
    });
  } catch (error: any) {
    console.error('approveStep error:', error);
    const errorMessage = error?.message || (typeof error === 'string' ? error : 'Internal server error while approving step');
    return res.status(400).json({
      message: errorMessage,
      code: 'APPROVE_STEP_ERROR',
      extensions: {
        code: 'APPROVE_STEP_ERROR',
        details: String(errorMessage),
      },
    });
  }
}
