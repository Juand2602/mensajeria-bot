# Serveloz — Bot de WhatsApp para domicilios y mototaxi (Etapa 1)

Fecha: 2026-07-10
Basado en: `docs/propuesta.md`, proyecto de referencia `barberia-bot`.

## 1. Contexto y alcance

Serveloz es un emprendimiento de domicilios y mototaxi en etapa inicial. El dueño es
actualmente el mensajero principal, y cuenta con un pequeño grupo de amigos mensajeros
informales (no empleados) que ayudan de forma ocasional cuando hace falta un conductor
adicional. No hay relación laboral formal ni horarios fijos con ellos.

Este documento diseña la **Etapa 1** de `docs/propuesta.md`: el sistema funcional completo
(cálculo de precio real, base de datos de conductores/carreras/clientes, notificaciones
por WhatsApp, panel de control, agendamiento anticipado, referidos). La Etapa 0 (demo)
y la Etapa 2 (tracking en vivo) no están cubiertas aquí — la Etapa 2 se deja explícitamente
fuera de alcance (sección 8).

## 2. Arquitectura y stack

Mismo stack que `barberia-bot` (referencia directa, patrón ya probado):

- **Express + TypeScript + Prisma (PostgreSQL)**
- **WhatsApp Cloud API** (oficial, Meta) — para conversación con clientes y notificaciones
  a conductores/dueño. Se descarta cualquier librería no oficial (ej. Baileys) por el riesgo
  real de bloqueo de número en un canal del que el negocio depende.
- **Radar API** (radar.com) para geocoding (dirección → coordenadas) y distancia real
  (recogida → destino, para el cálculo del precio). Se eligió sobre Google Maps Platform,
  Mapbox y LocationIQ porque además de geocoding/distancia ofrece una API de **Trip
  Tracking** hecha para delivery/rideshare — si en el futuro se construye la Etapa 2
  (tracking en vivo), se puede reusar el mismo proveedor en vez de integrar uno nuevo.
- Conversación con estado persistido en base de datos (`Conversacion`), igual que
  barberia-bot — no en memoria, sobrevive a reinicios.
- `node-cron` para: expirar conversaciones inactivas, y disparar el aviso de una carrera
  **programada** cuando se acerca su hora.
- Panel de administración estático (HTML/JS) en `/admin`, protegido con JWT
  (`ADMIN_USERNAME`/`ADMIN_PASSWORD`), consumiendo una API REST propia (`/api/admin/*`).
- **Railway** para hosting (Node.js + PostgreSQL administrado), mismo proveedor que
  barberia-bot.

## 3. Modelo de datos (Prisma)

```
Cliente
  id, nombre, telefono (unique), email?, notas, activo
  referidoPorId → Cliente?        // quién lo refirió, si aplica
  descuentosDisponibles Int @default(0)  // créditos de 20% ganados por referir

Conductor
  id, nombre, telefono, activo, notas
  // sin horarios ni campo de disponibilidad — registro liviano, el dueño
  // decide a quién asignar según lo que ya sabe informalmente

Carrera
  id, radicado (unique)
  clienteId → Cliente
  conductorId → Conductor?        // null hasta que el dueño asigna
  tipoServicio: DOMICILIO | MOTOTAXI
  direccionRecogida, recogidaLat, recogidaLng
  direccionDestino, destinoLat, destinoLng
  distanciaKm, precio
  estado: PENDIENTE_ASIGNACION | ASIGNADA | COMPLETADA | CANCELADA
  estadoPago: PENDIENTE | PAGADO
  fechaHoraProgramada?            // null = inmediata; con valor = agendada
  descuentoAplicado Boolean @default(false)
  origen: WHATSAPP | PANEL        // para diferenciar carreras creadas manualmente
  createdAt, updatedAt

Conversacion
  id, clienteId, telefono, estado, contexto (JSON string), lastActivity, activa
  modoManual Boolean @default(false)   // true = el dueño está respondiendo manualmente,
                                        // el bot no procesa mensajes de este cliente

Mensaje
  id, telefono, clienteId?, direccion: ENTRANTE | SALIENTE
  contenido, enviadoPor: BOT | DUEÑO
  timestamp
  // historial completo de mensajes por conversación, para la vista de chat manual
```

## 4. Flujo conversacional del cliente (bot)

```
INICIAL
  → [si el teléfono no está registrado] ESPERANDO_NOMBRE
       (se crea el Cliente con nombre + teléfono)
       → ESPERANDO_REFERIDO   ("¿alguien te recomendó Serveloz?" — solo aquí,
                                como parte del registro del cliente nuevo)
  → [si ya es cliente conocido] saluda por nombre y continúa directo
  → ESPERANDO_TIPO_SERVICIO         (domicilio / mototaxi, botones)
  → ESPERANDO_RECOGIDA              (texto o ubicación nativa)
       → ESPERANDO_CONFIRMACION_RECOGIDA   (solo si vino de texto geocodificado)
  → ESPERANDO_DESTINO
       → ESPERANDO_CONFIRMACION_DESTINO
  → ESPERANDO_MOMENTO               ("¿Para ahora o programado?")
       → [si programado] ESPERANDO_FECHA_HORA_PROGRAMADA
  → cálculo de precio (Radar: distancia real × tarifa, menos descuento si aplica)
  → CONFIRMACION_PRECIO
  → (crea Carrera en PENDIENTE_ASIGNACION, notifica al dueño) → ESPERANDO_ASIGNACION
  → [cuando el dueño asigna desde el panel] notifica al cliente con
     nombre/teléfono del conductor
  → [cuando el dueño marca COMPLETADA desde el panel] mensaje de cierre automático
     + acredita descuento al referidor si aplica
```

Cancelación: mismo patrón que barberia-bot (`INICIAL` → selección de carrera activa
→ confirmación).

### Captura de direcciones (recogida y destino)

Enfoque híbrido, adaptado a las limitaciones de WhatsApp (no hay mapa interactivo
en el chat):

- Si el cliente **envía ubicación nativa de WhatsApp** (incluye la opción "Buscar un
  lugar", no solo "mi ubicación actual"): se usan las coordenadas directamente.
- Si el cliente **escribe la dirección en texto**: se geocodifica con Radar. El bot
  confirma antes de continuar ("Confirmamos: [dirección encontrada], ¿es correcta?"
  con botones Sí/No + link de mapa).
- Si el geocoding falla o es ambiguo, el bot pide que en su lugar comparta ubicación.

## 5. Asignación y notificaciones (dueño / conductor)

No hay flujo de bot para el dueño ni para los conductores — la asignación es manual
y pasa por WhatsApp de una vía + el panel:

1. **Nueva solicitud** → WhatsApp al dueño (`ADMINISTRADOR_TELEFONO`) con los datos
   + link al panel para asignar.
2. **Dueño asigna** desde el panel, eligiendo de la lista de conductores activos
   (o a sí mismo).
3. Al confirmar la asignación:
   - WhatsApp **pasivo** (sin botones de aceptar/rechazar) al conductor elegido:
     recogida, destino, precio, link de mapa recogida→destino.
   - WhatsApp al cliente confirmando nombre/teléfono del conductor asignado.
4. **Carrera programada**: un cron revisa `fechaHoraProgramada` y dispara el aviso
   al dueño un poco antes de la hora acordada, en vez de inmediatamente al pedir.
5. Dueño marca la carrera **COMPLETADA** y el **estado de pago** desde el panel →
   dispara mensaje de cierre al cliente + acredita descuento de 20% al referidor
   si corresponde.
6. Si un cliente tiene `descuentosDisponibles > 0` al iniciar un pedido nuevo, el
   bot lo informa y lo aplica automáticamente al precio final.

No se registra disponibilidad de conductores como dato del sistema — el dueño
decide a quién asignar según lo que ya sabe de forma informal.

Pago: contraentrega (efectivo/Nequi al conductor); el sistema solo registra el
estado (`PENDIENTE`/`PAGADO`), no procesa el pago.

## 6. Panel de administración

- **Dashboard**: carreras en `PENDIENTE_ASIGNACION` (para asignar conductor) y
  `ASIGNADA` (en curso), con acceso rápido a marcar completada + estado de pago.
- **Crear carrera manual**: formulario para que el dueño registre una carrera
  pedida por fuera de WhatsApp (ej. llamada telefónica), reusando la misma lógica
  de geocoding/precio que el bot.
- **Historial**: carreras pasadas, filtrable por fecha/estado/cliente/conductor.
- **Conductores**: CRUD simple (nombre, teléfono, activo/inactivo).
- **Clientes**: ver clientes registrados, teléfono, créditos de referido disponibles.
- **Conversaciones** (chat manual): lista de clientes con actividad reciente; al
  entrar a uno, historial de mensajes tipo chat con caja de texto para responder
  manualmente. Solo aplica a conversaciones que el cliente ya inició (por la
  ventana de 24h de WhatsApp, el dueño no puede originar una conversación nueva
  con texto libre).
  - Al responder manualmente, se activa `Conversacion.modoManual = true` — el bot
    deja de procesar mensajes de ese cliente hasta que el dueño reanude el bot
    con un botón.
  - Si pasaron +24h desde el último mensaje del cliente, el panel avisa que no
    se puede enviar texto libre (se necesitaría una plantilla pre-aprobada).
  - Actualización por **polling simple** (cada 10-15s), solo mientras esa pantalla
    de chat está abierta — suficiente para un solo administrador revisando de
    forma ocasional; no se justifica la complejidad de WebSockets a esta escala.
- **Configuración**: tarifa base y tarifa por km editables desde el panel (no en
  variables de entorno), para que el dueño ajuste precios sin depender de un
  redeploy.

## 7. Sistema de referidos

- Al pedir, si es la primera carrera del cliente, el bot pregunta si alguien lo
  refirió (nombre o teléfono) y guarda `Cliente.referidoPorId`.
- Cuando esa primera carrera del referido se marca **COMPLETADA**, se incrementa
  `descuentosDisponibles` del referidor (no del referido).
- El descuento (20%) lo recibe **quien refiere**, aplicado automáticamente en su
  siguiente pedido.

## 8. Fuera de alcance en Etapa 1 (diferido a Etapa 2)

- Página web de rastreo en tiempo real del recorrido del conductor.
- Conductores compartiendo ubicación en vivo desde una web propia.
- Asignación automática por cercanía (sin intervención manual del dueño).
- Notificación automática cuando el conductor llega al punto de encuentro.
- Aceptar/rechazar carrera por parte del conductor vía WhatsApp (se mantiene pasivo).
- Disponibilidad de conductores como dato del sistema.
- Pasarela de pago digital (se mantiene contraentrega).

## 9. Despliegue y configuración

- **Railway**: Node.js + PostgreSQL administrado, mismo proveedor que barberia-bot.
- Variables de entorno clave: `DATABASE_URL`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`,
  `WHATSAPP_VERIFY_TOKEN`, `RADAR_API_KEY`, `ADMINISTRADOR_TELEFONO` (dueño, recibe
  avisos de nuevas solicitudes), `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `JWT_SECRET`,
  `TZ=America/Bogota`.
- Sin tests automatizados ni lint por ahora, consistente con el tamaño del proyecto
  y con barberia-bot.
