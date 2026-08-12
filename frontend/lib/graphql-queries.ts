import { gql } from '@apollo/client';

export const GET_ORGANIZATIONS = gql`
  query GetOrganizations {
    organizations {
      id
      name
      quota_calls_allowed
      quota_calls_used
      quota_period_start
      org_members {
        id
        user_id
        role
      }
    }
  }
`;

export const GET_ORG_USAGE_SUMMARY = gql`
  query GetOrgUsageSummary($orgId: uuid!) {
    org_usage_summary(where: { org_id: { _eq: $orgId } }) {
      org_id
      quota_calls_allowed
      quota_calls_used
      pct_used
      runs_this_month
      avg_run_duration_seconds
    }
  }
`;

export const ORG_WORKFLOWS_QUERY = gql`
  query OrgWorkflows($orgId: uuid!) {
    workflows(
      where: { org_id: { _eq: $orgId } }
      order_by: { created_at: desc }
    ) {
      id
      name
      description
      org_id
      created_by
      created_at
      updated_at
      workflow_steps(order_by: { step_order: asc }) {
        id
        step_order
        type
        config
        required_role
      }
      workflow_triggers {
        id
        type
        config
        webhook_secret
      }
      workflow_runs(order_by: { started_at: desc }, limit: 1) {
        id
        status
        started_at
        finished_at
        current_step_order
      }
    }
  }
`;

export const GET_WORKFLOW_BY_ID = gql`
  query GetWorkflowById($id: uuid!) {
    workflows_by_pk(id: $id) {
      id
      name
      description
      org_id
      created_by
      created_at
      updated_at
      org {
        id
        name
        quota_calls_allowed
        quota_calls_used
      }
      workflow_steps(order_by: { step_order: asc }) {
        id
        step_order
        type
        config
        required_role
      }
      workflow_triggers {
        id
        type
        config
        webhook_secret
      }
      workflow_runs(order_by: { started_at: desc }, limit: 5) {
        id
        status
        trigger_type
        started_at
        finished_at
        current_step_order
      }
    }
  }
`;

export const CREATE_WORKFLOW_MUTATION = gql`
  mutation CreateWorkflow($object: workflows_insert_input!) {
    insert_workflows_one(object: $object) {
      id
      name
      description
      org_id
      workflow_steps(order_by: { step_order: asc }) {
        id
        step_order
        type
      }
      workflow_triggers {
        id
        type
        webhook_secret
      }
    }
  }
`;

export const UPDATE_WORKFLOW_MUTATION = gql`
  mutation UpdateWorkflow(
    $id: uuid!
    $name: String!
    $description: String
    $steps: [workflow_steps_insert_input!]!
  ) {
    update_workflows_by_pk(
      pk_columns: { id: $id }
      _set: { name: $name, description: $description, updated_at: "now()" }
    ) {
      id
      name
      description
    }
    delete_workflow_steps(where: { workflow_id: { _eq: $id } }) {
      affected_rows
    }
    insert_workflow_steps(objects: $steps) {
      returning {
        id
        step_order
        type
      }
    }
  }
`;

export const TRIGGER_WORKFLOW_RUN_MUTATION = gql`
  mutation TriggerWorkflowRun($workflowId: uuid!) {
    triggerWorkflowRun(workflow_id: $workflowId) {
      run_id
      status
    }
  }
`;

export const APPROVE_STEP_MUTATION = gql`
  mutation ApproveStep($stepRunId: uuid!) {
    approveStep(step_run_id: $stepRunId) {
      success
      step_run_id
      new_status
    }
  }
`;

export const RECEIVE_WEBHOOK_MUTATION = gql`
  mutation ReceiveWebhook($workflowId: uuid!, $secret: String!, $payload: jsonb) {
    receiveWebhook(workflow_id: $workflowId, secret: $secret, payload: $payload) {
      run_id
      status
    }
  }
`;

export const STEP_PROGRESS_SUBSCRIPTION = gql`
  subscription StepProgress($workflowRunId: uuid!) {
    step_runs(
      where: { workflow_run_id: { _eq: $workflowRunId } }
      order_by: { step_order: asc }
    ) {
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
`;

export const WORKFLOW_RUN_SUBSCRIPTION = gql`
  subscription WorkflowRunProgress($runId: uuid!) {
    workflow_runs_by_pk(id: $runId) {
      id
      workflow_id
      org_id
      triggered_by
      trigger_type
      status
      started_at
      finished_at
      current_step_order
    }
  }
`;

export const GET_LATEST_RUN_BY_WORKFLOW = gql`
  query GetLatestRunByWorkflow($workflowId: uuid!) {
    workflow_runs(
      where: { workflow_id: { _eq: $workflowId } }
      order_by: { started_at: desc }
      limit: 1
    ) {
      id
      status
      trigger_type
      started_at
      finished_at
      current_step_order
      step_runs(order_by: { step_order: asc }) {
        id
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
