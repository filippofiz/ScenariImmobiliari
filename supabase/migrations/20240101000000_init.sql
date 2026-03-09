create extension if not exists vector;

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  created_at timestamp default now()
);

create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id),
  content text not null,
  page_number int,
  chunk_index int,
  embedding vector(1024),
  created_at timestamp default now()
);

create or replace function match_chunks(
  query_embedding vector(1024),
  match_count int default 8,
  doc_id uuid default null
)
returns table(id uuid, content text, page_number int, similarity float)
language sql stable as $$
  select id, content, page_number,
    1 - (embedding <=> query_embedding) as similarity
  from chunks
  where (doc_id is null or document_id = doc_id)
  order by embedding <=> query_embedding
  limit match_count;
$$;
