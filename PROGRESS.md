# Serveloz — Progreso de la Etapa 1

Última actualización: 2026-07-15

## Qué se hizo en esta sesión

Se pasó de una propuesta comercial (`docs/propuesta.md`) a un sistema funcional completo
de Etapa 1, siguiendo el proceso: **brainstorming → spec de diseño → plan de
implementación de 20 tareas → ejecución con subagentes (implementador + revisor por
tarea) → revisión final de toda la rama → merge a `main`**.

Resultado: bot de WhatsApp completo (registro de cliente, referidos, tipo de servicio,
captura de direcciones con geocoding, cálculo de precio, confirmación, cancelación),
servicio de notificaciones (dueño, conductor, cliente, referidos), y panel de
administración completo (login, dashboard, carreras, conductores, clientes,
configuración de tarifas, chat manual con polling).

Documentos de referencia:
- `docs/superpowers/specs/2026-07-10-mensajeria-bot-etapa1-design.md` — spec de diseño
- `docs/superpowers/plans/2026-07-10-serveloz-etapa1-implementation.md` — plan de
  implementación con el código exacto de cada una de las 20 tareas (ya actualizado para
  reflejar todos los fixes aplicados durante la ejecución)
- `README.md` — cómo correr el proyecto, variables de entorno, configuración del
  webhook de Meta, despliegue en Railway
- `.superpowers/sdd/progress.md` (dentro del worktree, no committeado) — bitácora
  técnica detallada de cada tarea y cada fix, con los SHA de commit exactos

## Archivos modificados/creados (39 archivos, ~5200 líneas)

**Proyecto y configuración:** `package.json`, `tsconfig.json`, `nodemon.json`,
`.env.example`, `.gitignore`, `railway.json`, `README.md`

**Base de datos:** `prisma/schema.prisma` (modelos `Cliente`, `Conductor`, `Carrera`,
`Conversacion`, `Mensaje`, `Configuracion`), `prisma/migrations/`

**Config y tipos:** `src/config/database.ts`, `src/config/whatsapp.ts`,
`src/types/index.ts`

**Servicios de dominio:** `src/services/clientes.service.ts`,
`src/services/conductores.service.ts`, `src/services/configuracion.service.ts`,
`src/services/carreras.service.ts`, `src/services/notificaciones.service.ts`,
`src/services/mensajeria.service.ts`, `src/services/radar.service.ts`

**Bot de WhatsApp:** `src/services/whatsapp/bot.service.ts` (máquina de estados
completa), `src/services/whatsapp/messages.service.ts`,
`src/services/whatsapp/parser.service.ts`, `src/services/whatsapp/templates.ts`

**Servidor:** `src/app.ts`, `src/middleware/auth.ts`,
`src/controllers/webhook.controller.ts`, `src/routes/webhook.routes.ts`,
`src/routes/admin.routes.ts` (API REST completa de administración)

**Panel de administración:** `src/admin/index.html` (login), `src/admin/dashboard.html`,
`src/admin/carreras.html`, `src/admin/conductores.html`, `src/admin/clientes.html`,
`src/admin/config.html`, `src/admin/conversaciones.html`, `src/admin/js/auth.js`

## Decisiones tomadas

**Durante el diseño (brainstorming):**
- Captura de direcciones híbrida: texto geocodificado con Radar + confirmación, o
  ubicación nativa de WhatsApp (con opción "Buscar un lugar" para pedir desde otro
  sitio).
- **Radar** (no Google Maps ni Mapbox) para geocoding/distancia — tiene API de Trip
  Tracking ya pensada para delivery/rideshare, reutilizable en la futura Etapa 2.
- Sin campo de "disponibilidad" de conductor — el dueño asigna manualmente según lo
  que ya sabe (son amigos informales, no empleados formales).
- Conductor recibe notificación pasiva (sin aceptar/rechazar).
- Pago contraentrega, el sistema solo registra `estadoPago`.
- WhatsApp Cloud API oficial (no librerías no oficiales tipo Baileys).
- Referido: el descuento del 20% lo gana **quien refiere**, no el referido.
- Sin tests automatizados ni lint — mismo criterio que el proyecto de referencia
  `barberia-bot`, acorde al tamaño del proyecto.
- Chat manual desde el panel con polling simple (no WebSockets) — un solo
  administrador, no se justifica la complejidad.
- Railway como hosting, mismo proveedor que `barberia-bot`.

**Durante la implementación (hallazgos y fixes aplicados):**
- Migración de Prisma rehecha con `migrate dev` real (el primer intento usó `db push`
  por falta de permiso `CREATEDB`, lo que hubiera roto `prisma migrate deploy` en
  producción).
- Eliminados 3 valores de respaldo hardcodeados para secretos (`WHATSAPP_VERIFY_TOKEN`,
  `JWT_SECRET`, `ADMIN_USERNAME`/`ADMIN_PASSWORD`) — el servidor ahora falla rápido si
  no están configurados, en vez de correr con un valor adivinable.
- Dos condiciones de carrera corregidas en `carreras.service.ts` (aplicación del
  descuento de referido, doble procesamiento de una carrera al completarla) usando
  `updateMany` con guarda atómica.
- Bug real corregido en el parser de fecha/hora programada (el propio ejemplo del bot,
  "25/12 10:00am", no se parseaba bien).
- XSS almacenado corregido: nombres/direcciones/mensajes de clientes se insertaban sin
  escapar en el HTML del panel — se agregó un helper `esc()` compartido en `auth.js`.
- La captura de referidos no funcionaba en la práctica (el bot pide "nombre o número"
  pero solo buscaba por teléfono exacto) — corregido con normalización de teléfono +
  búsqueda por nombre inequívoca, encontrado en la revisión final de toda la rama.
- Guardas de estado y errores de dominio limpios agregados a `asignar`/`pago` de
  carreras (antes podían reabrir una carrera cancelada/completada y filtraban errores
  crudos de Prisma).

## Qué falta por hacer

**Antes de poner en producción (ver `README.md`, sección de checklist):**
1. Configurar credenciales reales: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`,
   `RADAR_API_KEY` (el usuario ya tiene número en la API de Meta y cuenta de ngrok).
2. Crear y esperar aprobación de Meta para la plantilla `nueva_carrera_conductor`
   (necesaria para notificar al conductor asignado).
3. Probar el flujo completo de punta a punta desde un teléfono real: registro, pedido
   inmediato, notificación al dueño, asignación desde el panel, cierre + referido,
   pago, carrera programada, cancelación, ubicación nativa, chat manual, carrera
   manual.
4. Configurar variables de entorno reales en Railway y desplegar.

**Limpieza pendiente (opcional, bajo riesgo):**
- Eliminar el worktree `.claude/worktrees/serveloz-etapa1` y la rama
  `worktree-serveloz-etapa1` (ya mezclada a `main`, quedó redundante).
- Dependencias sin usar: `date-fns`, `date-fns-tz` (el código usa `Date` nativo).
- Algunas exportaciones sin usar (`formatearFecha`/`formatearHora` en `templates.ts`,
  `enviarUbicacion`/`marcarComoLeido` en `messages.service.ts`, un par de entradas de
  `MENSAJES`).
- `esAfirmativo`/`esNegativo` usan coincidencia de substring (heredado de
  `barberia-bot`) — un nombre de referido que contenga "no" (ej. "Bruno", "Nora") se
  interpreta como respuesta negativa a la pregunta de referido. Bajo riesgo, no
  corregido.
- `configuracionService.obtener()` tiene una condición de carrera de una sola vez (solo
  la primerísima llamada concurrente podría chocar al crear la fila de configuración
  por defecto) — irrelevante en la práctica.

**Etapa 2 (a futuro, fuera del alcance de este documento):** tracking en vivo,
asignación automática por cercanía, notificación de llegada — ver
`docs/propuesta.md` y la sección "Fuera de alcance" del spec de diseño.

## Actualización 2026-07-15: modelo de tarifas por municipio

Se reemplazó la fórmula de precio original (`tarifaBase + tarifaPorKm × distanciaKm`,
con ambos valores fijos en `Configuracion` sin importar la zona del viaje) por un modelo
de **tarifa mínima + tarifa por km según el municipio de destino**:

`precio = round(max(tarifaMinima, tarifaPorKm(municipio_destino) × distanciaKm) / 100) × 100`

Siguiendo el mismo proceso que la Etapa 1 (spec de diseño → plan de implementación de 4
tareas → ejecución con subagentes → revisión), ver
`docs/superpowers/plans/2026-07-15-modelo-tarifas-por-municipio-implementation.md`.

**Cambios de modelo:**
- Nueva tabla `TarifaMunicipio` (`municipio`, `tarifaPorKm`), una fila por cada uno de
  los 4 municipios del área metropolitana de Bucaramanga (`BUCARAMANGA`,
  `FLORIDABLANCA`, `GIRON`, `PIEDECUESTA`), sembrada con valores por defecto y editable
  desde el panel.
- `Configuracion.tarifaMinima` reemplaza a los antiguos `tarifaBase`/`tarifaPorKm` de esa
  tabla.
- Nuevo helper `src/services/municipios.ts`: dado el lat/lng del destino, determina a
  cuál de los 4 municipios pertenece por distancia (haversine) al centro urbano más
  cercano, con Bucaramanga como respaldo si algo falla.
- Nuevos endpoints `GET`/`PUT /api/admin/tarifas-municipio` y edición de las 5 tarifas
  (mínima + 4 municipios) en `config.html` del panel admin.

**Por qué:** el dueño reportó quejas reales de precio con la fórmula vieja — viajes
cortos dentro de un mismo barrio salían sobrecobrados porque no había un piso adecuado
para trayectos muy cortos, mientras que viajes largos entre municipios (ej. Megamall →
Cacique) resultaban más caros de lo que el mercado local paga. Además el mercado real de
domicilio/mototaxi varía por municipio (Girón y Piedecuesta cobran menos por km que
Bucaramanga/Floridablanca en la práctica), algo que la fórmula vieja no podía reflejar al
tener una sola tarifa por km fija para todo el área metropolitana.

**Validación con casos reales (Task 4):** con el servidor corriendo localmente y
direcciones reales (no inventadas) geocodificadas contra Nominatim/OSRM, se creó una
carrera manual desde el panel (`POST /api/admin/carreras/manual`) para dos casos:
- Centro Comercial Cacique → Centro Comercial Megamall (ambos en Bucaramanga): distancia
  real de ruta 4.2 km → precio `$5.000` (`max(3300, 1200 × 4.2048) = 5045.76`, redondeado
  a $100 = `5000`).
- Museo Casa de Simón Bolívar → Parque García Rovira (mismo barrio, centro de
  Bucaramanga): distancia real 0.66 km → precio `$3.300`, piso de `tarifaMinima` aplicado
  porque `1200 × 0.6557 = 786.84 < 3300`.

Ambos precios coinciden exactamente con la fórmula, usando los valores en vivo de
`tarifaMinima` y `tarifaPorKm(BUCARAMANGA)` leídos de `GET /api/admin/config` y
`GET /api/admin/tarifas-municipio` en el momento de la prueba. También se confirmó por
grep que no quedan referencias a `tarifaBase`/`TARIFA_BASE`/`TARIFA_POR_KM` en `src` ni
en `.env.example`.

**Qué queda pendiente:**
- Repetir esta misma prueba desde un pedido real por WhatsApp (no verificable en este
  entorno por falta de acceso a un número de prueba de Meta). El cálculo de precio pasa
  por el mismo `carrerasService.create` que usa tanto el panel como el bot, así que el
  resultado debería ser idéntico, pero queda como verificación manual pendiente para el
  dueño.
- Se encontró, sin tocar por estar fuera del alcance de esta tarea, un cambio ya hecho
  pero sin commitear en `src/services/radar.service.ts` y `README.md` que reemplaza
  Radar por Nominatim/OSRM como proveedor de geocoding/distancia (Radar pasó a ser
  100% sales-gated) — pendiente de revisión y commit aparte por quien lo hizo.
