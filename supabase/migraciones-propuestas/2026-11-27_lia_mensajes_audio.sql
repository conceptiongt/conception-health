-- Lía entiende notas de voz: estado de la transcripción y duración del audio (para medir el consumo).
-- Solo agrega dos columnas opcionales; no cambia RLS ni permisos.
alter table public.lia_mensajes
  add column if not exists audio text check (audio in ('pendiente', 'ok', 'fallo')),
  add column if not exists audio_seg integer check (audio_seg is null or audio_seg >= 0);
comment on column public.lia_mensajes.audio is 'null = no es nota de voz; pendiente = transcribiendo; ok = texto tiene la transcripción; fallo = no se pudo';
comment on column public.lia_mensajes.audio_seg is 'Duración de la nota de voz en segundos (si se supo)';
