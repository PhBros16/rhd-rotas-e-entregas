create function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;

create function public.set_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null,
  phone text,
  cep text,
  street text,
  number text,
  complement text,
  neighborhood text,
  city text not null default 'Recife',
  pin_url text,
  lat double precision,
  lng double precision,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_owner_idx on public.clients (owner_id, city, neighborhood);
create trigger clients_updated before update on public.clients for each row execute function public.set_updated_at();

create table public.client_receivers (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null,
  phone text,
  relation text,
  address text,
  created_at timestamptz not null default now()
);
create index client_receivers_client_idx on public.client_receivers (client_id);

alter table public.clients enable row level security;
alter table public.client_receivers enable row level security;

create policy "dono ativo ou admin" on public.clients for all
  using ((owner_id = auth.uid() and public.is_active()) or public.is_admin())
  with check ((owner_id = auth.uid() and public.is_active()) or public.is_admin());
create policy "dono ativo ou admin" on public.client_receivers for all
  using ((owner_id = auth.uid() and public.is_active()) or public.is_admin())
  with check ((owner_id = auth.uid() and public.is_active()) or public.is_admin());

revoke execute on function public.is_admin(), public.is_active(), public.handle_new_user() from public, anon;
grant execute on function public.is_admin(), public.is_active() to authenticated;
