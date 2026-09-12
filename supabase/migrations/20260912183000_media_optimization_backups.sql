create table if not exists public.media_optimization_backups (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('courses','ebooks','recipes','consultation_products')),
  record_id text not null,
  column_name text not null,
  original_url text not null,
  optimized_url text not null,
  original_bytes bigint not null,
  optimized_bytes bigint not null,
  original_mime text,
  optimized_mime text not null default 'image/webp',
  created_at timestamptz not null default now(),
  unique (entity, record_id, column_name, original_url)
);

alter table public.media_optimization_backups enable row level security;

create policy "Admins can insert media optimization backups"
on public.media_optimization_backups
for insert
to authenticated
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

create policy "Admins can read media optimization backups"
on public.media_optimization_backups
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

comment on table public.media_optimization_backups is
  'Rollback ledger for non-destructive media cover optimization. Original storage objects are intentionally retained.';
