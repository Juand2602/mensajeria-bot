# Serveloz — Bot WhatsApp de Domicilios y Mototaxi

Bot de WhatsApp con panel de administración para gestionar domicilios y mototaxi:
cálculo de precio real por distancia, asignación manual de conductores, notificaciones
automáticas, agendamiento anticipado y sistema de referidos.

## Requisitos

- Node.js 18+
- PostgreSQL
- Cuenta de WhatsApp Cloud API (Meta) con número verificado
- Cuenta de Mapbox (`MAPBOX_ACCESS_TOKEN`) para geocoding y distancia
  (`src/services/mapbox.service.ts`).

## Configuración local

```bash
npm install
cp .env.example .env   # completar con credenciales reales
npx prisma migrate dev
npm run dev
```

El servidor queda disponible en `http://localhost:3000`, el panel en `/admin`, el webhook
en `/webhook`.

## Variables de entorno

Ver `.env.example` para la lista completa. Las más importantes:

- `DATABASE_URL`: conexión a PostgreSQL.
- `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` / `WHATSAPP_VERIFY_TOKEN`: credenciales de Meta.
- `MAPBOX_ACCESS_TOKEN`: access token de Mapbox (geocoding y distancia de ruta).
- `ADMINISTRADOR_TELEFONO`: número del dueño (formato `573001234567`) que recibe los
  avisos de nuevas solicitudes.
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `JWT_SECRET`: acceso al panel.

## Configuración del webhook en Meta

1. En el panel de Meta for Developers, ir a la app de WhatsApp Business y configurar el
   webhook con la URL `https://<tu-dominio>/webhook` y el `Verify Token` igual al valor
   de `WHATSAPP_VERIFY_TOKEN`.
2. Suscribirse al campo `messages`.
3. Crear y enviar a aprobación en Meta las siguientes plantillas (idioma `es`) —
   Meta exige plantillas pre-aprobadas para el primer contacto con un número que
   nunca le ha escrito al bot (el dueño y los conductores nunca le escriben primero):

   - **`nueva_solicitud_admin`** — nueva solicitud (inmediata o programada), al dueño.
     > Nueva solicitud {{1}}. Cliente: {{2}} ({{3}}). Servicio: {{4}}. Recogida:
     > {{5}}. Destino: {{6}}. Distancia: {{7}} km. Precio: {{8}}. Para: {{9}}.
   - **`nueva_carrera_mensajero`** — carrera asignada a un conductor (mototaxi).
     > Hola {{1}}, tienes una nueva carrera de Serveloz. Cliente: {{2}} ({{3}}).
     > Servicio: {{4}}. Recogida: {{5}}. Destino: {{6}}. Precio: {{7}}. Radicado: {{8}}.
   - **`nueva_carrera_mensajero_domicilio`** — igual que la anterior, pero para
     domicilios, sin el parámetro de tipo de servicio (ya lo dice el cuerpo) y
     con el recordatorio de evidencia fotográfica fijo al final.
     > Hola {{1}}, tienes un nuevo domicilio de Serveloz.
     > Cliente: {{2}}
     > Telefono: {{3}}
     > Recogida: {{4}}
     > Destino: {{5}}
     > Precio: {{6}}
     > Radicado: {{7}}
     > Recuerda tomar foto de recogida y de entrega del paquete.
   - **`recordatorio_carrera_programada_admin`** — recordatorio al dueño: una
     carrera programada sigue sin conductor asignado, X min antes de la hora
     (`AVISO_PROGRAMADA_MINUTOS_ANTES`). {{2}} usa fecha y hora completas
     (`toLocaleString('es-CO')`), no solo la hora — evita ambigüedad en el caso
     borde de una carrera programada cruzando la medianoche.
     > Recordatorio: la carrera {{1}} programada para las {{2}} aún no tiene
     > conductor asignado.
     > Cliente: {{3}}
     > Telefono: {{4}}
     > Servicio: {{5}}
     > Recogida: {{6}}
     > Destino: {{7}}
     > Distancia: {{8}} km
     > Precio: {{9}}
     > Asígnale un conductor desde el panel.
   - **`recordatorio_servicio_conductor`** — recordatorio al conductor ya
     asignado, X min antes de la hora (`AVISO_EJECUCION_MINUTOS_ANTES`); se
     omite si al momento de asignar ya faltaban menos de esos mismos X minutos
     (la notificación de asignación ya cumplió ese rol — usa el mismo umbral a
     propósito, ver comentario en `config/whatsapp.ts`).
     > Hola {{1}}, recuerda que tienes un servicio programado para las {{2}}.
     > Cliente: {{3}}
     > Telefono: {{4}}
     > Servicio: {{5}}
     > Recogida: {{6}}
     > Destino: {{7}}
     > Precio: {{8}}
     > Radicado: {{9}}
     > Ante cualquier duda comunícate con administración.
   - **`carrera_cancelada_admin`** — el dueño se entera cuando un cliente cancela
     una carrera vía WhatsApp (antes no se le notificaba en absoluto). {{5}}
     resuelve a "Sin asignar" y {{6}} a "No especificado" cuando aplica — Meta
     no permite variables de plantilla vacías.
     > Se ha cancelado una carrera en Serveloz.
     > Cliente: {{1}}
     > Telefono: {{2}}
     > Radicado: {{3}}
     > Estado al momento de cancelar: {{4}}
     > Conductor asignado: {{5}}
     > Motivo: {{6}}
     > Revisa el panel para más detalles si es necesario.
   - **`intento_cancelacion_asignada_admin`** — el dueño se entera cuando un
     cliente intenta cancelar una carrera **ya asignada** (el bot se lo impide
     y deriva la conversación a modo manual, ver nota abajo).
     > Un cliente intentó cancelar una carrera ya asignada en Serveloz.
     > Cliente: {{1}}
     > Telefono: {{2}}
     > Radicado: {{3}}
     > Conductor asignado: {{4}}
     > La conversación quedó en modo manual, revisa el panel (Conversaciones)
     > para responderle.
   - **`solicitud_ayuda_humana_admin`** — el dueño se entera cuando un cliente
     pide hablar con una persona (la conversación también queda en modo manual).
     > Un cliente pidió hablar con una persona en Serveloz.
     > Cliente: {{1}}
     > Telefono: {{2}}
     > La conversación quedó en modo manual, respóndele desde el panel
     > (Conversaciones).

   Nota: si un cliente intenta cancelar una carrera que **ya tiene conductor
   asignado**, el bot no la cancela — se lo informa al cliente y deriva la
   conversación a atención manual en el panel (`notificarIntentoCancelacionAsignada`
   en `notificaciones.service.ts`).

   Nota sobre modo manual: mientras una conversación está en modo manual, el
   bot ignora los mensajes del cliente. Si pasan `TIMEOUT_MODO_MANUAL_MINUTOS`
   (30 por defecto) sin actividad (ni del cliente ni de una respuesta del
   admin desde el panel), el cliente recibe un aviso único ofreciéndole
   escribir *cancelar* para volver al menú, y si sigue sin haber actividad el
   bot se reanuda solo — cubre tanto al asesor que nunca respondió como al
   admin que olvidó pulsar "Reanudar bot".

## Despliegue en Railway

```bash
railway login
railway init
railway up
```

Configurar todas las variables de entorno de `.env.example` en el dashboard de Railway
(Settings → Variables). `railway.json` ya define el build (`prisma generate` + `tsc`) y
el arranque (`prisma migrate deploy` + `npm start`).

## Comandos

```bash
npm run dev            # desarrollo con recarga automática
npm run build           # compilar a dist/
npm start                # correr la versión compilada
npm run prisma:studio    # explorador visual de la base de datos
```

No hay tests automatizados ni lint configurados en este proyecto (verificación manual
en cada tarea de implementación).
