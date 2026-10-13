-- A parada guarda o link da localização e as observações do cliente (portaria, referência) para o backup e a tela de trabalho.
alter table public.route_stops
  add column pin_url text,
  add column client_notes text;
