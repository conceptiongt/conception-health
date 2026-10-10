-- Reasons for account deletions (Configuración → Eliminar cuenta). Only the eliminar-cuenta function (service role) writes here.
create table if not exists public.cuentas_eliminadas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tipo text not null check (tipo in ('clinica','usuario')),
  clinica_nombre text, email text, plan text, motivo text, detalle text, pacientes int
);
alter table public.cuentas_eliminadas enable row level security;
