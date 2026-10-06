# Funciones del servidor (Supabase, proyecto `patienttrack`)

El código de cada función se ve y edita en Supabase → Edge Functions.

- **recurrente-webhook** (sin JWT; valida la firma Svix de Recurrente)
  URL: https://kezokphwwnedpcpcqzyk.supabase.co/functions/v1/recurrente-webhook
  Activa o renueva el plan al pagar, marca cancelaciones y guarda cada aviso en `recurrente_eventos`.
- **lia-responder** (requiere sesión) — Lía, la recepcionista virtual: contesta con la API de Claude usando los datos,
  tarifas y agenda del consultorio. Hoy atiende “Probar a Lía” (acciones `probar` y `reiniciar`); el webhook de WhatsApp
  reutilizará `responder()` para las conversaciones reales. Límite: 80 respuestas de prueba por consultorio al día (`lia_uso`).
- **cancelar-suscripcion** (requiere sesión; solo el dueño de la cuenta)
  Cancela la suscripción en Recurrente; el acceso sigue hasta `plan_hasta`.

Secretos necesarios (Supabase → Edge Functions → Secrets):
- `RECURRENTE_SECRET_KEY` — Recurrente → Configuración → Llaves API (llave secreta LIVE)
- `RECURRENTE_WEBHOOK_SECRET` — el `whsec_...` del webhook creado en Recurrente
- Opcionales: `RECURRENTE_PRODUCTO_BASICO`, `RECURRENTE_PRODUCTO_MAX`, `RECURRENTE_PRODUCTO_LIA` (ids de producto)
- `ANTHROPIC_API_KEY` — llave de la API de Claude (console.anthropic.com → API keys), para Lía
- Opcional: `LIA_MODELO` — modelo que usa Lía (por defecto `claude-opus-5-5`)

Planes (`clinicas.plan`): `basico` = Health, `max` = Health + Lía, `lia` = solo Lía (recepcionista + agenda de citas).
El navegador ya no puede cambiar el plan ni mover un usuario a otra clínica (permisos por columna); solo el webhook lo hace.

El código de las funciones también está en `supabase/functions/` de este repositorio.
