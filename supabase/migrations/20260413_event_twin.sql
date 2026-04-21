create table if not exists event_instances (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  status text not null default 'active',
  source_bundle jsonb not null default '{}'::jsonb,
  zone_ids text[] not null default '{}',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  severity numeric(5,2) not null default 0,
  confidence numeric(5,2) not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists event_exposure_snapshots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references event_instances(id) on delete cascade,
  covered_workers integer not null default 0,
  likely_affected_workers integer not null default 0,
  projected_claims integer not null default 0,
  projected_payout_min numeric(12,2) not null default 0,
  projected_payout_max numeric(12,2) not null default 0,
  reserve_impact numeric(12,2) not null default 0,
  expected_loss_ratio numeric(8,4) not null default 0,
  fraud_distribution jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists claim_verification_traces (
  id uuid primary key default gen_random_uuid(),
  claim_id text not null,
  event_id uuid references event_instances(id) on delete set null,
  gps_score numeric(5,2) not null default 0,
  device_trust_score numeric(5,2) not null default 0,
  weather_match_score numeric(5,2) not null default 0,
  activity_match_score numeric(5,2) not null default 0,
  consensus_score numeric(5,2) not null default 0,
  duplicate_score numeric(5,2) not null default 0,
  final_score numeric(5,2) not null default 0,
  final_decision text not null default 'hold',
  reason_codes text[] not null default '{}',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists audit_packs (
  id uuid primary key default gen_random_uuid(),
  claim_id text,
  event_id uuid references event_instances(id) on delete set null,
  signal_snapshot jsonb not null default '{}'::jsonb,
  decision_trace jsonb not null default '{}'::jsonb,
  payout_trace jsonb not null default '{}'::jsonb,
  admin_actions jsonb not null default '[]'::jsonb,
  exportable_summary text,
  created_at timestamptz not null default now()
);
