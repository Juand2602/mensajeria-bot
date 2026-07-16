# Serveloz — Bot WhatsApp de Domicilios y Mototaxi

Bot de WhatsApp con panel de administración para gestionar domicilios y mototaxi:
cálculo de precio real por distancia, asignación manual de conductores, notificaciones
automáticas, agendamiento anticipado y sistema de referidos.

## Requisitos

- Node.js 18+
- PostgreSQL
- Cuenta de WhatsApp Cloud API (Meta) con número verificado
- Geocoding y distancia: usa Nominatim/OSRM (públicos, sin API key) por defecto en
  `src/services/radar.service.ts` — solo para pruebas, ver nota en el archivo. Para
  producción, reemplazar por un proveedor con key propia (Radar, Mapbox, Google).

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
- `ADMINISTRADOR_TELEFONO`: número del dueño (formato `573001234567`) que recibe los
  avisos de nuevas solicitudes.
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `JWT_SECRET`: acceso al panel.

## Configuración del webhook en Meta

1. En el panel de Meta for Developers, ir a la app de WhatsApp Business y configurar el
   webhook con la URL `https://<tu-dominio>/webhook` y el `Verify Token` igual al valor
   de `WHATSAPP_VERIFY_TOKEN`.
2. Suscribirse al campo `messages`.
3. Crear y enviar a aprobación en Meta la plantilla `nueva_carrera_conductor` (idioma
   `es`), usada para notificar al conductor asignado — Meta exige plantillas
   pre-aprobadas para el primer contacto con un número que nunca le ha escrito al bot.
   Cuerpo sugerido:
   > Hola {{1}}, tienes una nueva carrera de Serveloz. Cliente: {{2}}. Recogida:
   > {{3}}. Destino: {{4}}. Precio: {{5}}. Radicado: {{6}}.

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
