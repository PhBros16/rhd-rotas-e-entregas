-- Registro de repasses pagos aos entregadores. Cada repasse quita um conjunto de rotas finalizadas.
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  courier_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null check (amount >= 0),
  expected numeric(10,2) not null default 0,
  method text not null check (method in ('pix', 'cash')),
  note text,
  deliveries integer not null default 0,
  paid_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create index payouts_courier_idx on public.payouts (courier_id, paid_at desc);
alter table public.payouts enable row level security;
create policy "admin gerencia repasses" on public.payouts for all using (public.is_admin()) with check (public.is_admin());
create policy "entregador vê os próprios repasses" on public.payouts for select using (courier_id = auth.uid() and public.is_active());

-- Rota quitada por um repasse (se o repasse for desfeito, a rota volta a ficar pendente).
alter table public.routes add column payout_id uuid references public.payouts(id) on delete set null;
