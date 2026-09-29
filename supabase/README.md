# Funciones del servidor (Supabase, proyecto `patienttrack`)

El código de cada función se ve y edita en Supabase → Edge Functions.

- **recurrente-webhook** (sin JWT; valida la firma Svix de Recurrente)
  URL: https://kezokphwwnedpcpcqzyk.supabase.co/functions/v1/recurrente-webhook
  Activa o renueva el plan al pagar, marca cancelaciones y guarda cada aviso en `recurrente_eventos`.
- **cancelar-suscripcion** (requiere sesión; solo el dueño de la cuenta)
  Cancela la suscripción en Recurrente; el acceso sigue hasta `plan_hasta`.

Secretos necesarios (Supabase → Edge Functions → Secrets):
- `RECURRENTE_SECRET_KEY` — Recurrente → Configuración → Llaves API (llave secreta LIVE)
- `RECURRENTE_WEBHOOK_SECRET` — el `whsec_...` del webhook creado en Recurrente
- Opcionales: `RECURRENTE_PRODUCTO_BASICO`, `RECURRENTE_PRODUCTO_MAX` (ids de producto)
