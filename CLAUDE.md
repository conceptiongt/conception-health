# Conception Health (repo dr-reyna)

Plataforma de expedientes, citas, cobros e inventario para clínicas. React 19 + Vite, Supabase (proyecto `kezokphwwnedpcpcqzyk`), Vercel (health.conception-gt.com). Todo mensaje a la dueña va en español y en lenguaje sencillo.

## Modelos y flujo de trabajo

Nivel de este producto: **A** (se va a vender; datos de salud). Aquí planifica **Fable** y revisa **Fable**; escribe Sonnet y explora Haiku.

Fuente de la regla: `oficina/protocolo/modelos-codigo.md` de la Oficina de Conception (decidida con la dueña el 2026-11-23). Si ese documento cambia, se actualiza esta sección.

### 1. Roles
- **Planificador/arquitecto: el chat principal.** Fable si el producto es NIVEL A; Opus si es NIVEL B, y Fable en decisiones grandes de arquitectura, seguridad o base de datos. Entiende el objetivo, decide la solución y escribe el plan. No escribe código de más de ~15 líneas.
- **Código: agente `implementador`** (Sonnet). Implementa solo el código de un plan aprobado.
- **Leer, ubicar archivos o datos: agente Explore con `model: "haiku"`.**

### 2. Redundancia
Lo que escribe el implementador lo revisa el agente `revisor` (modelo más capaz y distinto). Se le da el diff, el plan y el objetivo, no la conclusión del planificador.

La revisión con **Fable es obligatoria** si el cambio toca:
- migraciones, RLS, RPC o permisos de base de datos;
- autenticación, roles o acceso a datos de pacientes, clientes o cuentas;
- pagos o facturación;
- prompts de IA (IA Mensajes) y sus criterios de evaluación;
- un despliegue a producción de Conception Health.

### 3. Escalamiento
- Si el implementador falla dos veces en lo mismo, se replantea el plan; no se reintenta igual.
- Si el planificador se atasca, sube a Fable.
- Antes de usar Fable en un producto de nivel B, decir en una línea por qué.

### 4. Nunca sin aprobación explícita de la dueña
- Migraciones, cambios de RPC/RLS, tareas programadas y escrituras en la base de producción. Se proponen como SQL en `supabase/migraciones-propuestas/`, **sin aplicar**.
- Secretos solo como variables de entorno; nunca en el código ni en el repo.
- Cada cambio va en una rama con PR. No se fusiona sin su orden.

### 5. Antes de cerrar cualquier cambio
- Lint y build en verde. (Hoy el repo solo tiene `npm run build`; no hay script de lint: decirlo como "no comprobado" hasta que se configure.)
- Si es de interfaz: verificar a 375, 768, 1024, 1440 y 1920 px, y en iPad vertical y horizontal, que se adapta sin desbordes ni espacio muerto.
- Decir al final qué cambió y qué no se pudo comprobar.

### 6. Pedido al implementador
Cada pedido lleva, en este orden:
1. Objetivo y producto.
2. Archivos a leer (rutas exactas).
3. Plan aprobado.
4. Reglas anteriores que aplican.
5. Qué verificar.
6. Qué NO tocar.
7. Cierre con rama, commit y push.

## Datos prácticos
- Build en esta máquina: `"/Users/alejandravillatoro/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin/node" node_modules/vite/bin/vite.js build`
- Producción se despliega sola cuando `main` cambia (Vercel). Por eso fusionar a `main` es un despliegue a producción.
- Demo sin tocar datos reales: `VITE_MODO_DEMO=true`.
