-- Invited users get rol 'asistente' (trigger crear_clinica_para_usuario); the old check only allowed 'dueno'/'miembro'
-- and made every invitation fail with "Database error saving new user".
alter table public.perfiles drop constraint perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check check (rol in ('dueno', 'asistente', 'miembro'));
