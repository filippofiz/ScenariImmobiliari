-- Projects: group conversations into folders (like Claude app)
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Nuovo Progetto',
  emoji text default '📁',
  color text default '#4E8EA7',
  description text default '',
  is_archived boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Add project_id to conversations (nullable for backward compat)
alter table conversations add column project_id uuid references projects(id) on delete set null;

-- Index for fast lookup
create index idx_conversations_project_id on conversations(project_id);
create index idx_projects_archived on projects(is_archived);
