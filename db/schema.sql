-- Brandloom schema. Every table hangs off a workspace so the app can become
-- multi-tenant (one workspace per customer) without a data migration.

create extension if not exists pgcrypto;

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  profile jsonb not null,
  logo_on_light text,   -- data URL of the logo used on light backgrounds
  logo_on_dark text,    -- data URL of the logo used on dark backgrounds
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists brands_workspace_idx on brands(workspace_id);

create table if not exists ideas (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  title text not null,
  angle text not null,
  pillar text not null default '',
  format text not null default 'image',  -- image | video
  status text not null default 'new',    -- new | used | dismissed
  created_at timestamptz not null default now()
);
create index if not exists ideas_brand_idx on ideas(brand_id, created_at desc);

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  idea_id uuid references ideas(id) on delete set null,
  publish_on date,
  status text not null default 'draft',  -- draft | approved | posted
  spec jsonb not null,                   -- template + visual fields
  linkedin text not null default '',
  instagram text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists posts_brand_idx on posts(brand_id, publish_on);
