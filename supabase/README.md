# Funciones del servidor (Supabase, proyecto `patienttrack`)

El código de cada función se ve y edita en Supabase → Edge Functions.

- **recurrente-webhook** (sin JWT; valida la firma Svix de Recurrente)
  URL: https://kezokphwwnedpcpcqzyk.supabase.co/functions/v1/recurrente-webhook
  Activa o renueva el plan al pagar, marca cancelaciones y guarda cada aviso en `recurrente_eventos`.
- **lia-responder** (sin JWT de Supabase; cada ruta se autentica sola) — Lía, la recepcionista virtual: contesta con la
  API de Claude usando los datos, tarifas y agenda del consultorio.
  URL (también es el webhook de WhatsApp en Meta): https://kezokphwwnedpcpcqzyk.supabase.co/functions/v1/lia-responder
  - Desde la app (requiere sesión): `probar`, `reiniciar` y `enviar` (el médico escribe desde Conversaciones y sale por WhatsApp).
    Límite: 80 respuestas de prueba por consultorio al día (`lia_uso`).
  - Desde Meta: GET de verificación (`WHATSAPP_VERIFY_TOKEN`) y POST firmado (`X-Hub-Signature-256` con `WHATSAPP_APP_SECRET`).
    Cada número conectado está en `lia_whatsapp` (phone_number_id → clínica; solo el servidor lo escribe).
    En modo palabra clave, los chats que nunca dijeron la palabra no se guardan.
- **cancelar-suscripcion** (requiere sesión; solo el dueño de la cuenta)
  Cancela la suscripción en Recurrente; el acceso sigue hasta `plan_hasta`.

Secretos necesarios (Supabase → Edge Functions → Secrets):
- `RECURRENTE_SECRET_KEY` — Recurrente → Configuración → Llaves API (llave secreta LIVE)
- `RECURRENTE_WEBHOOK_SECRET` — el `whsec_...` del webhook creado en Recurrente
- Opcionales: `RECURRENTE_PRODUCTO_BASICO`, `RECURRENTE_PRODUCTO_MAX`, `RECURRENTE_PRODUCTO_LIA` (ids de producto)
- `ANTHROPIC_API_KEY` — llave de la API de Claude (console.anthropic.com → API keys), para Lía
- Opcional: `LIA_MODELO` — modelo que usa Lía (por defecto `claude-opus-5-5`)
- `WHATSAPP_TOKEN` — token de acceso de la app de Meta (el del número de prueba dura 24 h; después, uno permanente de usuario del sistema)
- `WHATSAPP_APP_SECRET` — Meta for Developers → la app → Configuración de la app → Básica → Clave secreta de la app
- `WHATSAPP_VERIFY_TOKEN` — una frase cualquiera; la misma se escribe en Meta al configurar el webhook

Planes (`clinicas.plan`): `basico` = Health, `max` = Health + Lía, `lia` = solo Lía (recepcionista + agenda de citas).
El navegador ya no puede cambiar el plan ni mover un usuario a otra clínica (permisos por columna); solo el webhook lo hace.

El código de las funciones también está en `supabase/functions/` de este repositorio.
