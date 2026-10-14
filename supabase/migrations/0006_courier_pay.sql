-- Quanto o entregador recebe por esta entrega (o valor da entrega, price, é o que o cliente paga).
alter table public.route_stops
  add column courier_pay numeric(10,2) not null default 0;
