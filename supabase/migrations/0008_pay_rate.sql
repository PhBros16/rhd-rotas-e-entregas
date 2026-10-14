-- Valor que o entregador recebe por entrega (padronizado para todas as entregas). Nulo = usa o valor padrão do admin (app_settings.courier_fee).
alter table public.profiles add column pay_rate numeric(10,2);
