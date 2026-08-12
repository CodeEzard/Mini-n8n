-- ==============================================================================
-- DATABASE SEED SCRIPT: Multi-Tenant Organizations, Users, Roles & Workflows
-- ==============================================================================

-- 1. Mock Users in auth.users (if auth schema exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, email, display_name, default_role, disabled, email_verified)
    VALUES
      ('a0000000-0000-0000-0000-000000000001', 'owner_a@acme.com', 'Alice Owner (Org A)', 'user', false, true),
      ('a0000000-0000-0000-0000-000000000002', 'editor_a@acme.com', 'Eddie Editor (Org A)', 'user', false, true),
      ('a0000000-0000-0000-0000-000000000003', 'viewer_a@acme.com', 'Victor Viewer (Org A)', 'user', false, true),
      ('b0000000-0000-0000-0000-000000000001', 'owner_b@globex.com', 'Bob Owner (Org B)', 'user', false, true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- 2. Organizations (Org A & Org B)
INSERT INTO organizations (id, name, quota_calls_allowed, quota_calls_used, quota_period_start, created_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Acme Corp (Org A)', 1000, 0, date_trunc('month', now()), now()),
  ('22222222-2222-2222-2222-222222222222', 'Globex Corp (Org B)', 500, 0, date_trunc('month', now()), now())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  quota_calls_allowed = EXCLUDED.quota_calls_allowed;

-- 3. Organization Memberships (Join user <-> org with distinct roles)
INSERT INTO org_members (id, user_id, org_id, role, created_at)
VALUES
  -- Org A Members
  ('m0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner', now()),
  ('m0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'editor', now()),
  ('m0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'viewer', now()),
  -- Org B Members
  ('m0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner', now())
ON CONFLICT (user_id, org_id) DO UPDATE SET
  role = EXCLUDED.role;

-- 4. Demo Workflows
-- Org A Workflow: Multi-Step AI Agent with LLM, Branch, Notify, Approval Gate, and HTTP Request
INSERT INTO workflows (id, org_id, name, description, created_by, created_at, updated_at)
VALUES
  ('33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111', 'Customer Sentiment & Escalation', 'Analyzes customer feedback sentiment, notifies Slack, pauses for manager approval, and escalates to CRM API.', 'a0000000-0000-0000-0000-000000000001', now(), now()),
  ('44444444-4444-4444-4444-444444444441', '22222222-2222-2222-2222-222222222222', 'Globex Lead Scoring Engine', 'Isolated workflow for Org B evaluating inbound B2B lead scores.', 'b0000000-0000-0000-0000-000000000001', now(), now())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- 5. Workflow Steps for Org A Workflow (ID: 33333333-3333-3333-3333-333333333331)
INSERT INTO workflow_steps (id, workflow_id, step_order, type, config, required_role, created_at)
VALUES
  ('s0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333331', 1, 'llm_call', '{"prompt": "Analyze customer sentiment for the feedback: The delivery was late and the item arrived damaged. Please provide sentiment classification and summary.", "model": "gpt-4o-mini", "system_prompt": "You are a customer feedback analysis agent."}', NULL, now()),
  ('s0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333331', 2, 'conditional_branch', '{"condition": "true"}', NULL, now()),
  ('s0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333331', 3, 'notify', '{"channel": "slack", "recipient": "#support-alerts", "message": "Feedback sentiment analysis alert: {{step1.output.text}}"}', 'owner', now()),
  ('s0000000-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333331', 4, 'approval_gate', '{"title": "Manager Approval Required for Customer Compensation"}', NULL, now()),
  ('s0000000-0000-0000-0000-000000000005', '33333333-3333-3333-3333-333333333331', 5, 'http_request', '{"url": "https://httpbin.org/post", "method": "POST", "body": {"escalated": true, "analysis": "{{step1.output.text}}"}}', NULL, now())
ON CONFLICT (workflow_id, step_order) DO UPDATE SET
  type = EXCLUDED.type,
  config = EXCLUDED.config;

-- 6. Workflow Steps for Org B Workflow (ID: 44444444-4444-4444-4444-444444444441)
INSERT INTO workflow_steps (id, workflow_id, step_order, type, config, required_role, created_at)
VALUES
  ('s0000000-0000-0000-0000-000000000006', '44444444-4444-4444-4444-444444444441', 1, 'llm_call', '{"prompt": "Calculate enterprise lead score for: 1,000 employee company requesting custom SLA.", "model": "gpt-4o-mini"}', NULL, now()),
  ('s0000000-0000-0000-0000-000000000007', '44444444-4444-4444-4444-444444444441', 2, 'http_request', '{"url": "https://httpbin.org/post", "method": "POST", "body": {"scored": true, "score": 95}}', NULL, now())
ON CONFLICT (workflow_id, step_order) DO UPDATE SET
  type = EXCLUDED.type,
  config = EXCLUDED.config;

-- 7. Workflow Triggers (Manual and Webhook triggers with secrets)
INSERT INTO workflow_triggers (id, workflow_id, type, config, webhook_secret, created_at)
VALUES
  ('t0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333331', 'manual', '{}', NULL, now()),
  ('t0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333331', 'webhook', '{"path": "/webhook/acme-feedback"}', 'acme-secret-key-123', now()),
  ('t0000000-0000-0000-0000-000000000003', '44444444-4444-4444-4444-444444444441', 'manual', '{}', NULL, now()),
  ('t0000000-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444441', 'webhook', '{"path": "/webhook/globex-leads"}', 'globex-secret-key-456', now())
ON CONFLICT (id) DO NOTHING;
