-- Perfis: entregador ou admin; cadastro novo entra como 'pending' até o admin aprovar.
create type public.user_role as enum ('admin', 'courier');
create type public.user_status as enum ('pending', 'active', 'blocked');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  full_name text not null default '',
  role public.user_role not null default 'courier',
  status public.user_status not null default 'pending',
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
          coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active');
$$;

alter table public.profiles enable row level security;

create policy "ver o próprio perfil ou admin vê todos" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "admin atualiza perfis" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());
