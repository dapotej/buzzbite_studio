-- Buzzbite schema. Every table hangs off a workspace so the app can become
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

-- Photos and video clips: uploaded, or generated with fal.ai.
create table if not exists media (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  kind text not null,                     -- image | video
  status text not null default 'ready',   -- ready | pending | failed
  source text not null default 'upload',  -- upload | ai
  url text,                               -- public Vercel Blob URL once ready
  description text not null default '',
  fal_endpoint text,
  fal_request_id text,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists media_brand_idx on media(brand_id, created_at desc);

-- Trend radar: Claude's web research, turned into post recommendations.
create table if not exists trend_reports (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  summary text not null,
  items jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists trend_reports_brand_idx on trend_reports(brand_id, created_at desc);

-- v2: posting plan per brand, media linked to the post it was made for, post titles.
alter table brands add column if not exists settings jsonb not null default '{"days":[0,2,4],"time":"10:00"}'::jsonb;
alter table media add column if not exists post_id uuid references posts(id) on delete set null;
alter table media add column if not exists role text;          -- image | video, when made for a post
create index if not exists media_post_idx on media(post_id);
alter table posts add column if not exists title text not null default '';
alter table posts add column if not exists pillar text not null default '';
-- post status: making (photos/video still generating) | review | approved | posted
alter table posts add column if not exists issue text;  -- why a photo or video could not be made
