-- 9. NOTIFICATION REQUESTS (Decoupled event-triggered notification queue)
CREATE TABLE IF NOT EXISTS notification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_run_id uuid REFERENCES step_runs(id) ON DELETE SET NULL,
  workflow_run_id uuid REFERENCES workflow_runs(id) ON DELETE SET NULL,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'slack',
  recipient text NOT NULL,
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_requests_step_run_id ON notification_requests (step_run_id);
CREATE INDEX IF NOT EXISTS idx_notification_requests_workflow_run_id ON notification_requests (workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_notification_requests_org_id ON notification_requests (org_id);
CREATE INDEX IF NOT EXISTS idx_notification_requests_status ON notification_requests (status);
