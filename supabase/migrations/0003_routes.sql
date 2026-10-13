create type public.route_status as enum ('draft', 'active', 'finished', 'cancelled');
create type public.stop_status as enum ('pending', 'delivered', 'failed', 'skipped');
create type public.pay_method as enum ('pix', 'cash');

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text,
  status public.route_status not null default 'draft',
  go_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index routes_owner_idx on public.routes (owner_id, created_at desc);
create trigger routes_updated before update on public.routes for each row execute function public.set_updated_at();

-- Cada parada guarda uma cópia dos dados do cliente, para o histórico não mudar se o cliente for editado ou excluído.
create table public.route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  client_name text not null,
  phone text,
  address text,
  neighborhood text,
  city text,
  lat double precision,
  lng double precision,
  position integer not null default 0,
  packages integer not null default 1 check (packages > 0),
  price numeric(10,2) not null default 0,
  status public.stop_status not null default 'pending',
  pay_method public.pay_method,
  paid_amount numeric(10,2),
  pay_differs boolean not null default false,
  delivered_at timestamptz,
  received_by text,
  notes text,
  created_at timestamptz not null default now()
);
create index route_stops_route_idx on public.route_stops (route_id, position);

alter table public.routes enable row level security;
alter table public.route_stops enable row level security;
create policy "dono ativo ou admin" on public.routes for all
  using ((owner_id = auth.uid() and public.is_active()) or public.is_admin())
  with check ((owner_id = auth.uid() and public.is_active()) or public.is_admin());
create policy "dono ativo ou admin" on public.route_stops for all
  using ((owner_id = auth.uid() and public.is_active()) or public.is_admin())
  with check ((owner_id = auth.uid() and public.is_active()) or public.is_admin());
