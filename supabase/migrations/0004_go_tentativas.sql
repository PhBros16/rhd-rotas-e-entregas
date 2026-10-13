alter table public.route_stops
  add column deferred boolean not null default false,
  add column retry_at timestamptz,
  add column attempt_count integer not null default 0;

-- Histórico de tentativas: cada vez que o entregador marca entregue, voltar depois, não entregue ou desfaz.
create table public.stop_attempts (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid not null references public.route_stops(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  outcome text not null check (outcome in ('delivered', 'retry', 'failed', 'undo')),
  reason text,
  retry_at timestamptz,
  at timestamptz not null default now()
);
create index stop_attempts_stop_idx on public.stop_attempts (stop_id, at);
create index stop_attempts_route_idx on public.stop_attempts (route_id);

alter table public.stop_attempts enable row level security;
create policy "dono ativo ou admin" on public.stop_attempts for all
  using ((owner_id = auth.uid() and public.is_active()) or public.is_admin())
  with check ((owner_id = auth.uid() and public.is_active()) or public.is_admin());
