-- PROPUESTA (NO APLICADA) · 2026-11-26
-- Qué hace: prepara la base para conectar el Google Calendar de cada clínica (las citas se copian en un solo sentido,
--   de la plataforma a Google, y Google envía los recordatorios):
--   1. google_conexiones: la cuenta de Google de la clínica y su token de renovación CIFRADO (AES-256-GCM, la llave vive
--      solo en los secretos de la función). Una fila por clínica.
--   2. google_eventos: qué evento de Google corresponde a cada cita (para actualizarlo o borrarlo).
--   3. google_oauth_estados: códigos de un solo uso (15 min) que protegen el regreso desde Google contra falsificaciones.
--   4. RPC google_estado(): le dice a la app si la clínica ya conectó Google (sin devolver nunca el token).
-- Seguridad: las 3 tablas tienen RLS activado y NINGUNA política, y se revoca todo a public/anon/authenticated: solo la
--   función de borde `google-calendar` (con service role) las toca. El navegador jamás ve el token. google_estado() es
--   security definer, usa mi_clinica() (solo ve su propia clínica), solo devuelve datos no sensibles y solo se ejecuta
--   con sesión iniciada.
-- Riesgo: bajo. Solo tablas y función nuevas; no toca tablas existentes. Mientras no se aplique, la app muestra
--   «Disponible pronto» en la tarjeta de Google Calendar y todo lo demás funciona igual.
-- Antes de aplicar (no es SQL): crear los secretos de la función (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_TOKEN_KEY
--   = base64 de 32 bytes aleatorios) y desplegar `google-calendar` con verify_jwt desactivado (/callback lo llama Google).
-- Cómo probar dentro de una transacción (sin dejar nada):
--   begin;
--     \i supabase/migraciones-propuestas/2026-11-26_google_calendar.sql
--     select has_table_privilege('authenticated', 'public.google_conexiones', 'select');        -- debe dar false
--     select has_table_privilege('anon', 'public.google_eventos', 'select');                     -- debe dar false
--     select has_function_privilege('anon', 'public.google_estado()', 'execute');                -- debe dar false
--     select has_function_privilege('authenticated', 'public.google_estado()', 'execute');       -- debe dar true
--     -- como usuario de una clínica (set local role authenticated; set local request.jwt.claims = '{"sub":"<user_id>"}'):
--     select public.google_estado();                                                              -- {"conectada": false, ...}
--   rollback;
-- Cómo deshacer:
--   drop function if exists public.google_estado();
--   drop table if exists public.google_oauth_estados;
--   drop table if exists public.google_eventos;
--   drop table if exists public.google_conexiones;

create table if not exists public.google_conexiones (
  clinica_id uuid primary key references public.clinicas(id) on delete cascade,
  google_email text,
  calendar_id text not null default 'primary',
  refresh_token_cifrado text not null,          -- base64(iv || ciphertext), AES-256-GCM
  conectado_por uuid,
  conectado_at timestamptz not null default now(),
  ocultar_nombre boolean not null default false,
  estado text not null default 'activa' check (estado in ('activa', 'error')),
  ultimo_error text,
  ultimo_sync_at timestamptz
);

-- no FK to citas on purpose: a deleted cita must still be found to delete its Google event
create table if not exists public.google_eventos (
  cita_id uuid primary key,
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  event_id text not null,
  actualizado_at timestamptz not null default now()
);
create index if not exists google_eventos_clinica_idx on public.google_eventos (clinica_id);

create table if not exists public.google_oauth_estados (
  state text primary key,
  clinica_id uuid not null,
  user_id uuid not null,
  creado_at timestamptz not null default now()    -- valid for 15 minutes, single use
);
create index if not exists google_oauth_estados_creado_idx on public.google_oauth_estados (creado_at);

alter table public.google_conexiones enable row level security;
alter table public.google_eventos enable row level security;
alter table public.google_oauth_estados enable row level security;
-- no policies on purpose: only the service role (edge function) can read or write them
revoke all on public.google_conexiones, public.google_eventos, public.google_oauth_estados from public, anon, authenticated;

create or replace function public.google_estado()
returns json
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select json_build_object(
        'conectada', true,
        'google_email', g.google_email,
        'ocultar_nombre', g.ocultar_nombre,
        'estado', g.estado,
        'ultimo_error', g.ultimo_error,
        'ultimo_sync_at', g.ultimo_sync_at)
       from public.google_conexiones g
      where g.clinica_id = public.mi_clinica()),
    json_build_object('conectada', false, 'google_email', null, 'ocultar_nombre', false,
                      'estado', null, 'ultimo_error', null, 'ultimo_sync_at', null)
  );
$$;
revoke all on function public.google_estado() from public, anon;
grant execute on function public.google_estado() to authenticated;
