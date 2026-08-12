-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ORGANIZATIONS
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  quota_calls_allowed int NOT NULL DEFAULT 1000,
  quota_calls_used int NOT NULL DEFAULT 0,
  quota_period_start date NOT NULL DEFAULT date_trunc('month', now()),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. ORG MEMBERS (join table: user <-> org, with role)
CREATE TABLE IF NOT EXISTS org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);

-- 3. WORKFLOWS
CREATE TABLE IF NOT EXISTS workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Helper trigger for updating updated_at on workflows
CREATE OR REPLACE FUNCTION set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
DECLARE
  _new record;
BEGIN
  _new := NEW;
  _new."updated_at" = NOW();
  RETURN _new;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_workflows_updated_at
BEFORE UPDATE ON workflows
FOR EACH ROW
EXECUTE FUNCTION set_current_timestamp_updated_at();

-- 4. WORKFLOW STEPS (ordered)
CREATE TABLE IF NOT EXISTS workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  type text NOT NULL CHECK (type IN
    ('llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate')),
  config jsonb NOT NULL DEFAULT '{}',
  required_role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, step_order)
);

-- 5. WORKFLOW TRIGGERS
CREATE TABLE IF NOT EXISTS workflow_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('manual', 'webhook', 'scheduled', 'db_event')),
  config jsonb NOT NULL DEFAULT '{}',
  webhook_secret text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. WORKFLOW RUNS (one per execution)
CREATE TABLE IF NOT EXISTS workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  triggered_by uuid,
  trigger_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  current_step_order int DEFAULT 0
);

-- 7. STEP RUNS (one per step per run)
CREATE TABLE IF NOT EXISTS step_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  workflow_step_id uuid NOT NULL REFERENCES workflow_steps(id),
  step_order int NOT NULL,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending', 'running', 'succeeded', 'failed', 'paused_awaiting_approval', 'skipped')),
  input jsonb,
  output jsonb,
  error text,
  attempt_count int NOT NULL DEFAULT 0,
  approved_by uuid,
  approved_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON org_members (user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON org_members (org_id);
CREATE INDEX IF NOT EXISTS idx_workflows_org_id ON workflows (org_id);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow_id_order ON workflow_steps (workflow_id, step_order);
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_workflow_id ON workflow_triggers (workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON workflow_runs (workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_org_id ON workflow_runs (org_id);
CREATE INDEX IF NOT EXISTS idx_step_runs_workflow_run_id_order ON step_runs (workflow_run_id, step_order);

-- 8. ORG USAGE SUMMARY VIEW
CREATE OR REPLACE VIEW org_usage_summary AS
SELECT
  o.id AS org_id,
  o.quota_calls_allowed,
  o.quota_calls_used,
  ROUND(o.quota_calls_used::numeric / NULLIF(o.quota_calls_allowed, 0) * 100, 1) AS pct_used,
  COUNT(DISTINCT wr.id) FILTER (WHERE wr.started_at >= date_trunc('month', now())) AS runs_this_month,
  AVG(EXTRACT(epoch FROM (wr.finished_at - wr.started_at)))
    FILTER (WHERE wr.finished_at IS NOT NULL) AS avg_run_duration_seconds
FROM organizations o
LEFT JOIN workflows w ON w.org_id = o.id
LEFT JOIN workflow_runs wr ON wr.workflow_id = w.id
GROUP BY o.id;
