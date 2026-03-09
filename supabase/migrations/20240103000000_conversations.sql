create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id),
  title text default 'Nuova conversazione',
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb default '[]',
  tool_calls jsonb default '[]',
  created_at timestamp default now()
);
