-- APLICADA el 2026-11-27 con orden de la dueña («Aplica el permiso de ajustes»).
-- Problema: `authenticated` solo tenía UPDATE por columna en nombre, color, logo_path, anios y studio_*.
-- Las columnas de ajustes agregadas después nunca recibieron permiso, así que la base rechazaba guardar
-- especialidad, ficha clínica, campos del paciente, enlace de pago, anticipo, enlace de registro y colores
-- del calendario. Las columnas del plan (plan, plan_activo, plan_hasta, recurrente_*, usuarios_extra) siguen
-- sin permiso de escritura para el cliente, a propósito.
-- La política RLS clinica_editar sigue exigiendo tiene_permiso('configuracion') y la clínica propia.
-- Deshacer: revoke update (…) on public.clinicas from authenticated; alter table public.clinicas drop constraint clinicas_link_pago_https;
grant update (especialidad, sugeridos_cargados, plantilla_ficha, campos_paciente, link_pago, anticipo_pct, registro_token, calendario) on public.clinicas to authenticated;
-- el enlace de pago se muestra a pacientes: solo https
alter table public.clinicas add constraint clinicas_link_pago_https check (link_pago is null or link_pago ~ '^https://[^\s]{1,500}$');
