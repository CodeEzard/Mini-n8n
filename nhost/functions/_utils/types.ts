export type OrgRole = 'owner' | 'editor' | 'viewer';

export type WorkflowStepType =
  | 'llm_call'
  | 'http_request'
  | 'db_write'
  | 'notify'
  | 'conditional_branch'
  | 'approval_gate';

export type WorkflowTriggerType = 'manual' | 'webhook' | 'scheduled' | 'db_event';

export type WorkflowRunStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type StepRunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'paused_awaiting_approval'
  | 'skipped';

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  step_order: number;
  type: WorkflowStepType;
  config: Record<string, any>;
  required_role?: string | null;
  created_at: string;
}

export interface OrgMember {
  id: string;
  user_id: string;
  org_id: string;
  role: OrgRole;
}

export interface Organization {
  id: string;
  name: string;
  quota_calls_allowed: number;
  quota_calls_used: number;
  quota_period_start: string;
  created_at: string;
  org_members?: OrgMember[];
}

export interface Workflow {
  id: string;
  org_id: string;
  name: string;
  description?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  org?: Organization;
  workflow_steps: WorkflowStep[];
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  org_id: string;
  triggered_by?: string | null;
  trigger_type: string;
  status: WorkflowRunStatus;
  started_at?: string | null;
  finished_at?: string | null;
  current_step_order: number;
  workflow?: Workflow;
  step_runs?: StepRun[];
}

export interface StepRun {
  id: string;
  workflow_run_id: string;
  workflow_step_id: string;
  step_order: number;
  type: string;
  status: StepRunStatus;
  input?: Record<string, any> | null;
  output?: Record<string, any> | null;
  error?: string | null;
  attempt_count: number;
  approved_by?: string | null;
  approved_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  workflow_step?: WorkflowStep;
  workflow_run?: WorkflowRun;
}

export interface HasuraActionPayload<T = any> {
  action: {
    name: string;
  };
  input: T;
  session_variables?: Record<string, string>;
  request_query?: string;
}
