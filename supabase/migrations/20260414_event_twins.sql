-- Migration: 20260414_event_twins.sql

create table if not exists event_twins (
  id text primary key, -- Use custom ID format like TWIN-XXXX
  trigger_id text not null,
  type text not null,
  status text not null default 'active',
  footprint text[] not null default '{}', -- H3 cells
  exposure integer not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  signals jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for faster lookups by type and status
create index if not exists idx_event_twins_type_status on event_twins(type, status);

-- Enable RLS (though simulation usually runs as service role)
alter table event_twins enable row level security;

-- Policy for public read (auditable by anyone with ID)
create policy "Public read access for event_twins"
  on event_twins for select
  using (true);
