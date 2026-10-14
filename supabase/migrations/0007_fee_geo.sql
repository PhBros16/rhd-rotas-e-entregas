-- Configurações gerais do sistema (ex.: valor padronizado que o entregador recebe por entrega).
create table public.app_settings (
  key text primary key,
  value numeric not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
create policy "ler configurações" on public.app_settings for select using (public.is_active() or public.is_admin());
create policy "admin altera configurações" on public.app_settings for all using (public.is_admin()) with check (public.is_admin());
insert into public.app_settings (key, value) values ('courier_fee', 0);

-- Qualidade da localização do endereço: house, street, neighborhood, city ou none.
alter table public.clients add column geo_quality text, add column geo_at timestamptz;
alter table public.route_stops add column geo_quality text;
