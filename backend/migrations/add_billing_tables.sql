CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  razorpay_subscription_id TEXT UNIQUE NOT NULL,
  razorpay_plan_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  status TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  current_start TIMESTAMPTZ,
  current_end TIMESTAMPTZ,
  quantity INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  subscription_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_invoice_id TEXT,
  razorpay_event_id TEXT,
  event_type TEXT NOT NULL,
  amount INT,
  currency TEXT DEFAULT 'INR',
  status TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Webhook idempotency: Razorpay retries deliveries; same event_id must be a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_events_razorpay_event_id
  ON payment_events (razorpay_event_id)
  WHERE razorpay_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_payment_events_user_id ON payment_events (user_id);
CREATE INDEX IF NOT EXISTS ix_payment_events_subscription_id ON payment_events (subscription_id);
CREATE INDEX IF NOT EXISTS ix_payment_events_razorpay_payment_id ON payment_events (razorpay_payment_id);
CREATE INDEX IF NOT EXISTS ix_payment_events_created_at ON payment_events (created_at);

DROP TABLE IF EXISTS upgrade_requests;

ALTER TABLE users ADD COLUMN IF NOT EXISTS razorpay_customer_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id);
