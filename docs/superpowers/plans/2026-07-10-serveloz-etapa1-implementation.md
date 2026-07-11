# Serveloz — Bot WhatsApp Domicilios/Mototaxi (Etapa 1) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el sistema funcional completo de Serveloz (Etapa 1 de `docs/propuesta.md`): bot de WhatsApp que calcula precio real por distancia, panel de administración para asignar conductores y gestionar carreras, notificaciones automáticas, agendamiento anticipado, referidos y chat manual desde el panel.

**Architecture:** Express + TypeScript + Prisma (PostgreSQL), siguiendo el mismo patrón que el proyecto de referencia `barberia-bot`: conversación de bot con estado persistido en base de datos (máquina de estados por `Conversacion`), servicios de dominio como clases singleton, panel admin estático (HTML/JS + Tailwind CDN) protegido con JWT consumiendo una API REST propia. Integraciones externas: WhatsApp Cloud API (Meta) para mensajería, Radar API para geocoding y distancia real.

**Tech Stack:** Node.js, TypeScript (`strict: false`, igual que barberia-bot), Express, Prisma + PostgreSQL, axios, node-cron, jsonwebtoken, dotenv, cors. Sin librerías de testing — no hay tests automatizados en este proyecto (ver Global Constraints).

## Global Constraints

- **Sin tests automatizados ni lint** — mismo criterio que `barberia-bot` (confirmado con el usuario). Cada tarea se verifica ejecutando el servidor y probando el flujo real (curl al webhook simulando el payload de Meta, o el panel en el navegador), no con suites de test.
- **Idioma:** todo el código de dominio (modelos, servicios, estados, mensajes) en español, igual que barberia-bot (`Cliente`, `Carrera`, `estado`, `ESPERANDO_...`).
- **WhatsApp Cloud API oficial de Meta** — no usar librerías no oficiales (Baileys, etc.).
- **Radar API** para geocoding y distancia — no Google Maps ni Mapbox.
- **Sin campo de disponibilidad de conductores** — el dueño asigna manualmente según lo que ya sabe.
- **Conductores reciben notificación pasiva** — sin botones de aceptar/rechazar.
- **Pago contraentrega** — el sistema solo registra `estadoPago`, no procesa pagos.
- **TypeScript `strict: false`**, `target: ES2020`, `module: commonjs` — igual que barberia-bot.
- **Railway** como plataforma de hosting.
- **Sin valores de respaldo hardcodeados para secretos** (`WHATSAPP_VERIFY_TOKEN`, `JWT_SECRET`, `ADMIN_PASSWORD`): si la variable de entorno no está definida, el servidor debe fallar rápido con un error claro en vez de correr con un valor por defecto adivinable. Esto es una desviación deliberada del patrón de `barberia-bot` (que sí usa fallbacks hardcodeados), decidida tras una revisión de seguridad durante la implementación. Config no sensible (URLs, nombres, tarifas) sí puede tener defaults normales.
- Spec completo de referencia: `docs/superpowers/specs/2026-07-10-mensajeria-bot-etapa1-design.md`.

---

### Task 1: Scaffolding del proyecto

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `nodemon.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `railway.json`

**Interfaces:**
- Produces: scripts npm (`dev`, `build`, `start`, `prisma:*`) que usan todas las tareas siguientes.

- [ ] **Step 1: Crear `package.json`**

```json
{
  "name": "mensajeria-bot",
  "version": "1.0.0",
  "description": "Bot WhatsApp para domicilios y mototaxi (Serveloz) con panel de administración",
  "main": "dist/app.js",
  "scripts": {
    "dev": "nodemon src/app.ts",
    "build": "tsc && cp -r src/admin dist/admin",
    "start": "node dist/app.js",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy",
    "prisma:studio": "prisma studio"
  },
  "keywords": ["serveloz", "whatsapp", "railway", "chatbot", "domicilios"],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "@prisma/client": "^5.7.0",
    "axios": "^1.6.2",
    "cors": "^2.8.5",
    "date-fns": "^4.1.0",
    "date-fns-tz": "^3.2.0",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.2",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/node": "^20.10.5",
    "@types/node-cron": "^3.0.11",
    "nodemon": "^3.0.2",
    "prisma": "^5.7.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3"
  }
}
```

- [ ] **Step 2: Crear `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Crear `nodemon.json`**

```json
{
  "watch": ["src"],
  "ext": "ts",
  "exec": "ts-node src/app.ts"
}
```

- [ ] **Step 4: Crear `.gitignore`**

```
node_modules/
dist/
.env
*.log
```

- [ ] **Step 5: Crear `.env.example`**

```
# ==================== BASE DE DATOS ====================
DATABASE_URL="postgresql://usuario:contraseña@host:5432/nombre_db"

# ==================== WHATSAPP CLOUD API ====================
WHATSAPP_API_URL=https://graph.facebook.com/v18.0
WHATSAPP_TOKEN=tu_token_de_acceso_permanente
WHATSAPP_PHONE_ID=tu_phone_number_id
WHATSAPP_VERIFY_TOKEN=un_token_secreto_que_tu_eliges

# ==================== RADAR (geocoding + distancia) ====================
RADAR_API_KEY=tu_api_key_de_radar

# ==================== DATOS DE SERVELOZ ====================
SERVELOZ_NOMBRE=Serveloz
TARIFA_BASE=3000
TARIFA_POR_KM=800

# ==================== NOTIFICACIONES ====================
# Teléfono del dueño (formato internacional: 573001234567)
ADMINISTRADOR_TELEFONO=

# ==================== PANEL DE ADMINISTRACIÓN ====================
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin
JWT_SECRET=una_clave_secreta_muy_larga_y_segura
ADMIN_PANEL_ENABLED=true

# ==================== SERVIDOR ====================
PORT=3000
NODE_ENV=production
TZ=America/Bogota

# ==================== BOT ====================
TIMEOUT_CONVERSACION=300000
# Minutos antes de la hora programada para avisar al dueño de una carrera agendada
AVISO_PROGRAMADA_MINUTOS_ANTES=30
```

- [ ] **Step 6: Crear `railway.json`**

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npx prisma generate && npm run build"
  },
  "deploy": {
    "startCommand": "npx prisma migrate deploy && npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

- [ ] **Step 7: Instalar dependencias**

Run: `npm install`
Expected: se crea `node_modules/` y `package-lock.json` sin errores.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json nodemon.json .gitignore .env.example railway.json
git commit -m "chore: scaffolding inicial del proyecto"
```

---

### Task 2: Esquema de base de datos (Prisma)

**Files:**
- Create: `prisma/schema.prisma`

**Interfaces:**
- Produces: modelos Prisma `Cliente`, `Conductor`, `Carrera`, `Conversacion`, `Mensaje`, `Configuracion` — usados por todos los servicios de las tareas siguientes. Cliente de Prisma generado en `@prisma/client` con estos tipos.

- [ ] **Step 1: Crear `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ==================== CLIENTES ====================
model Cliente {
  id                    String   @id @default(uuid())
  nombre                String
  telefono              String   @unique
  email                 String?
  notas                 String?
  activo                Boolean  @default(true)

  referidoPorId         String?
  referidoPor           Cliente?  @relation("Referidos", fields: [referidoPorId], references: [id])
  referidos             Cliente[] @relation("Referidos")
  descuentosDisponibles Int      @default(0)

  carreras       Carrera[]
  conversaciones Conversacion[]
  mensajes       Mensaje[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([telefono])
  @@index([nombre])
}

// ==================== CONDUCTORES ====================
model Conductor {
  id        String   @id @default(uuid())
  nombre    String
  telefono  String
  activo    Boolean  @default(true)
  notas     String?

  carreras Carrera[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([activo])
}

// ==================== CARRERAS ====================
model Carrera {
  id       String  @id @default(uuid())
  radicado String  @unique

  clienteId   String
  cliente     Cliente    @relation(fields: [clienteId], references: [id])
  conductorId String?
  conductor   Conductor? @relation(fields: [conductorId], references: [id])

  tipoServicio String // DOMICILIO | MOTOTAXI

  direccionRecogida String
  recogidaLat       Float
  recogidaLng       Float

  direccionDestino String
  destinoLat       Float
  destinoLng       Float

  distanciaKm Float
  precio      Float

  estado     String @default("PENDIENTE_ASIGNACION") // PENDIENTE_ASIGNACION | ASIGNADA | COMPLETADA | CANCELADA
  estadoPago String @default("PENDIENTE") // PENDIENTE | PAGADO

  fechaHoraProgramada DateTime?
  avisoProgramadaEnviado Boolean @default(false)

  descuentoAplicado Boolean @default(false)
  origen            String  @default("WHATSAPP") // WHATSAPP | PANEL

  notas             String?
  motivoCancelacion String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([radicado])
  @@index([estado])
  @@index([conductorId])
  @@index([fechaHoraProgramada])
}

// ==================== CONVERSACIONES (CONTEXTO BOT) ====================
model Conversacion {
  id           String   @id @default(uuid())
  clienteId    String
  cliente      Cliente  @relation(fields: [clienteId], references: [id])
  telefono     String
  estado       String   @default("INICIAL")
  contexto     String
  lastActivity DateTime @default(now())
  activa       Boolean  @default(true)
  modoManual   Boolean  @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([telefono, activa])
  @@index([lastActivity])
}

// ==================== CONFIGURACIÓN (fila única, editable desde el panel) ====================
model Configuracion {
  id          String   @id @default("default")
  tarifaBase  Float    @default(3000)
  tarifaPorKm Float    @default(800)
  updatedAt   DateTime @updatedAt
}

// ==================== MENSAJES (HISTORIAL DE CHAT) ====================
model Mensaje {
  id         String   @id @default(uuid())
  telefono   String
  clienteId  String?
  cliente    Cliente? @relation(fields: [clienteId], references: [id])
  direccion  String // ENTRANTE | SALIENTE
  contenido  String
  enviadoPor String // CLIENTE | BOT | DUEÑO
  timestamp  DateTime @default(now())

  @@index([telefono, timestamp])
}
```

- [ ] **Step 2: Generar el cliente de Prisma**

Run: `npx prisma generate`
Expected: `Generated Prisma Client` sin errores.

- [ ] **Step 3: Crear la migración inicial (requiere `DATABASE_URL` válido en `.env`)**

Run: `npx prisma migrate dev --name init`
Expected: se crea `prisma/migrations/<timestamp>_init/` y las tablas quedan creadas en la base de datos.

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: esquema inicial de base de datos (Cliente, Conductor, Carrera, Conversacion, Mensaje, Configuracion)"
```

---

### Task 3: Configuración y tipos compartidos

**Files:**
- Create: `src/config/database.ts`
- Create: `src/config/whatsapp.ts`
- Create: `src/types/index.ts`

**Interfaces:**
- Produces: `prisma` (cliente Prisma default export), `whatsappConfig`, `servelozConfig`, `botConfig` (objetos de configuración), `ConversationState` (union type), `ConversationContext` (interface), `WhatsAppMessage`, `WhatsAppWebhookPayload`. Usados por todos los servicios y el bot.

- [ ] **Step 1: Crear `src/config/database.ts`**

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export default prisma;
```

- [ ] **Step 2: Crear `src/config/whatsapp.ts`**

```typescript
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta configurar la variable de entorno ${name}`);
  }
  return value;
}

export const whatsappConfig = {
  apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0',
  token: process.env.WHATSAPP_TOKEN || '',
  phoneId: process.env.WHATSAPP_PHONE_ID || '',
  verifyToken: requireEnv('WHATSAPP_VERIFY_TOKEN'),
};

export const servelozConfig = {
  nombre: process.env.SERVELOZ_NOMBRE || 'Serveloz',
  tarifaBase: parseFloat(process.env.TARIFA_BASE || '3000'),
  tarifaPorKm: parseFloat(process.env.TARIFA_POR_KM || '800'),
};

export const radarConfig = {
  apiKey: process.env.RADAR_API_KEY || '',
};

export const botConfig = {
  timeoutConversacion: parseInt(process.env.TIMEOUT_CONVERSACION || '300000'),
  avisoProgramadaMinutosAntes: parseInt(process.env.AVISO_PROGRAMADA_MINUTOS_ANTES || '30'),
};
```

- [ ] **Step 3: Crear `src/types/index.ts`**

```typescript
export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  text?: { body: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  type: string;
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: { display_phone_number: string; phone_number_id: string };
        messages?: WhatsAppMessage[];
        statuses?: any[];
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
      };
      field: string;
    }>;
  }>;
}

export type ConversationState =
  | 'INICIAL'
  | 'ESPERANDO_NOMBRE'
  | 'ESPERANDO_REFERIDO'
  | 'ESPERANDO_TIPO_SERVICIO'
  | 'ESPERANDO_RECOGIDA'
  | 'ESPERANDO_CONFIRMACION_RECOGIDA'
  | 'ESPERANDO_DESTINO'
  | 'ESPERANDO_CONFIRMACION_DESTINO'
  | 'ESPERANDO_MOMENTO'
  | 'ESPERANDO_FECHA_HORA_PROGRAMADA'
  | 'CONFIRMACION_PRECIO'
  | 'ESPERANDO_ASIGNACION'
  | 'ESPERANDO_SELECCION_CARRERA_CANCELAR'
  | 'ESPERANDO_CONFIRMACION_CANCELACION'
  | 'COMPLETADA';

export interface DireccionPendiente {
  direccionTexto?: string;
  direccionFormateada?: string;
  lat?: number;
  lng?: number;
}

export interface ConversationContext {
  nombre?: string;
  referidoTelefono?: string;
  tipoServicio?: 'DOMICILIO' | 'MOTOTAXI';
  recogida?: DireccionPendiente;
  destino?: DireccionPendiente;
  fechaHoraProgramada?: string;
  distanciaKm?: number;
  precio?: number;
  carreraId?: string;
  radicado?: string;
  carrerasDisponibles?: Array<{
    numero: number;
    radicado: string;
    tipoServicio: string;
    destino: string;
  }>;
}
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores (los servicios que importan estos módulos aún no existen, así que en este punto del proyecto no hay nada más que compilar; el comando debe correr sin errores de sintaxis en estos 3 archivos).

- [ ] **Step 5: Commit**

```bash
git add src/config src/types
git commit -m "feat: configuración base y tipos compartidos"
```

---

### Task 4: Servicio de mensajería de WhatsApp

**Files:**
- Create: `src/services/whatsapp/messages.service.ts`

**Interfaces:**
- Consumes: `whatsappConfig` de `src/config/whatsapp.ts` (Task 3).
- Produces: `whatsappMessagesService` (instancia singleton) con métodos `enviarMensaje(telefono, mensaje)`, `enviarMensajeConBotones(telefono, mensaje, botones: ReplyButton[])`, `enviarMensajeConLista(telefono, mensaje, buttonText, sections: ListSection[])`, `enviarUbicacion(telefono, lat, lng, nombre?, direccion?)`, `enviarPlantilla(telefono, nombrePlantilla, idioma, parametros: string[])`. Todos usados por `bot.service.ts` y `notificaciones.service.ts` en tareas siguientes.

- [ ] **Step 1: Crear `src/services/whatsapp/messages.service.ts`**

```typescript
import axios, { AxiosResponse } from 'axios';
import { whatsappConfig } from '../../config/whatsapp';

export interface ReplyButton {
  id: string;
  title: string;
}

export interface ListSection {
  title: string;
  rows: Array<{ id: string; title: string; description?: string }>;
}

export class WhatsAppMessagesService {
  private async sendRequest(endpoint: string, data: any, retries = 2): Promise<any> {
    try {
      const url = `${whatsappConfig.apiUrl}/${whatsappConfig.phoneId}/${endpoint}`;
      const response: AxiosResponse = await axios.post(url, data, {
        headers: {
          Authorization: `Bearer ${whatsappConfig.token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error enviando mensaje WhatsApp:', error.response?.data || error.message);
      if ((error.code === 'ECONNABORTED' || error.response?.status >= 500) && retries > 0) {
        return this.sendRequest(endpoint, data, retries - 1);
      }
      throw error;
    }
  }

  async enviarMensaje(telefono: string, mensaje: string): Promise<any> {
    return this.sendRequest('messages', {
      messaging_product: 'whatsapp',
      to: telefono,
      type: 'text',
      text: { body: mensaje },
    });
  }

  async enviarMensajeConBotones(telefono: string, mensaje: string, botones: ReplyButton[]): Promise<any> {
    if (botones.length > 3) throw new Error('WhatsApp solo permite máximo 3 botones por mensaje');
    botones.forEach(b => { if (b.title.length > 20) b.title = b.title.substring(0, 20); });

    return this.sendRequest('messages', {
      messaging_product: 'whatsapp',
      to: telefono,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: mensaje },
        action: { buttons: botones.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } })) },
      },
    });
  }

  async enviarMensajeConLista(telefono: string, mensaje: string, buttonText: string, sections: ListSection[]): Promise<any> {
    if (buttonText.length > 20) buttonText = buttonText.substring(0, 20);

    return this.sendRequest('messages', {
      messaging_product: 'whatsapp',
      to: telefono,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: mensaje },
        action: {
          button: buttonText,
          sections: sections.map(s => ({
            title: s.title,
            rows: s.rows.map(r => ({ id: r.id, title: r.title.substring(0, 24), description: r.description?.substring(0, 72) })),
          })),
        },
      },
    });
  }

  async enviarUbicacion(telefono: string, lat: number, lng: number, nombre?: string, direccion?: string): Promise<any> {
    return this.sendRequest('messages', {
      messaging_product: 'whatsapp',
      to: telefono,
      type: 'location',
      location: { latitude: lat, longitude: lng, name: nombre, address: direccion },
    });
  }

  async enviarPlantilla(telefono: string, nombrePlantilla: string, idioma: string, parametros: string[]): Promise<any> {
    return this.sendRequest('messages', {
      messaging_product: 'whatsapp',
      to: telefono,
      type: 'template',
      template: {
        name: nombrePlantilla,
        language: { code: idioma },
        components: [{ type: 'body', parameters: parametros.map(valor => ({ type: 'text', text: valor })) }],
      },
    });
  }

  async marcarComoLeido(messageId: string): Promise<any> {
    return this.sendRequest('messages', { messaging_product: 'whatsapp', status: 'read', message_id: messageId });
  }
}

export const whatsappMessagesService = new WhatsAppMessagesService();
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/services/whatsapp/messages.service.ts
git commit -m "feat: servicio de mensajería de WhatsApp Cloud API"
```

---

### Task 5: Servicio de Radar (geocoding + distancia)

**Files:**
- Create: `src/services/radar.service.ts`

**Interfaces:**
- Consumes: `radarConfig` de `src/config/whatsapp.ts` (Task 3).
- Produces: `radarService` (instancia singleton) con métodos:
  - `geocodificar(direccionTexto: string): Promise<{ lat: number; lng: number; direccionFormateada: string } | null>`
  - `calcularDistanciaKm(origen: { lat: number; lng: number }, destino: { lat: number; lng: number }): Promise<number>`
  Usados por `bot.service.ts` (Tasks 9 y 11) y por la creación manual de carreras (Task 13).

- [ ] **Step 1: Crear `src/services/radar.service.ts`**

```typescript
import axios from 'axios';
import { radarConfig } from '../config/whatsapp';

const RADAR_BASE_URL = 'https://api.radar.io/v1';

export interface CoordenadasGeocoded {
  lat: number;
  lng: number;
  direccionFormateada: string;
}

export class RadarService {
  private headers() {
    return { Authorization: radarConfig.apiKey };
  }

  async geocodificar(direccionTexto: string): Promise<CoordenadasGeocoded | null> {
    try {
      const response = await axios.get(`${RADAR_BASE_URL}/geocode/forward`, {
        headers: this.headers(),
        params: { query: direccionTexto, country: 'CO' },
        timeout: 10000,
      });
      const addresses = response.data?.addresses;
      if (!addresses || addresses.length === 0) return null;

      const mejor = addresses[0];
      return {
        lat: mejor.latitude,
        lng: mejor.longitude,
        direccionFormateada: mejor.formattedAddress || direccionTexto,
      };
    } catch (error: any) {
      console.error('Error geocodificando con Radar:', error.response?.data || error.message);
      return null;
    }
  }

  async calcularDistanciaKm(origen: { lat: number; lng: number }, destino: { lat: number; lng: number }): Promise<number> {
    try {
      const response = await axios.get(`${RADAR_BASE_URL}/route/distance`, {
        headers: this.headers(),
        params: {
          origin: `${origen.lat},${origen.lng}`,
          destination: `${destino.lat},${destino.lng}`,
          modes: 'car',
          units: 'metric',
        },
        timeout: 10000,
      });
      const distanciaMetros = response.data?.routes?.car?.distance?.value;
      if (typeof distanciaMetros !== 'number') throw new Error('Respuesta de Radar sin distancia válida');
      return distanciaMetros / 1000;
    } catch (error: any) {
      console.error('Error calculando distancia con Radar:', error.response?.data || error.message);
      throw new Error('No se pudo calcular la distancia de la ruta');
    }
  }
}

export const radarService = new RadarService();
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Probar geocoding manualmente contra la API real**

Run: `node -e "require('dotenv').config(); const {radarService}=require('./src/services/radar.service'); radarService.geocodificar('Cra 27 #45-12, Bucaramanga').then(r=>console.log(r))" -r ts-node/register`
Expected: imprime un objeto `{ lat, lng, direccionFormateada }` con coordenadas dentro de Bucaramanga (lat ~7.1, lng ~-73.1). Requiere `RADAR_API_KEY` real en `.env`.

- [ ] **Step 4: Commit**

```bash
git add src/services/radar.service.ts
git commit -m "feat: integración con Radar API para geocoding y distancia"
```

---

### Task 6: Servicios de dominio (clientes, conductores, carreras)

**Files:**
- Create: `src/services/clientes.service.ts`
- Create: `src/services/conductores.service.ts`
- Create: `src/services/configuracion.service.ts`
- Create: `src/services/carreras.service.ts`

**Interfaces:**
- Consumes: `prisma` (Task 3), `servelozConfig` (Task 3), `generarRadicado` de `src/services/whatsapp/templates.ts` (Task 7 — ver nota abajo).
- Produces: `clientesService`, `conductoresService`, `configuracionService`, `carrerasService` (instancias singleton). `configuracionService.obtener()` devuelve `{ tarifaBase, tarifaPorKm, ... }` desde la fila única `Configuracion` (creándola con los valores de `.env` si no existe todavía). Usados por `bot.service.ts` (Tasks 9-11) y por las rutas admin (Tasks 13-15).

> Nota de orden: `carreras.service.ts` importa `generarRadicado` de `templates.ts`, que se crea en la Task 7. Como Prisma/TS no falla en tiempo de escritura sino de compilación, se puede escribir esta tarea antes; la verificación de compilación de este archivo se hace al final de la Task 7, no aquí.

- [ ] **Step 1: Crear `src/services/clientes.service.ts`**

```typescript
import prisma from '../config/database';

export class ClientesService {
  async buscarPorTelefono(telefono: string) {
    return prisma.cliente.findUnique({ where: { telefono } });
  }

  async crear(data: { nombre: string; telefono: string; referidoPorTelefono?: string }) {
    let referidoPorId: string | undefined;
    if (data.referidoPorTelefono) {
      const referidor = await this.buscarPorTelefono(data.referidoPorTelefono);
      if (referidor) referidoPorId = referidor.id;
    }
    return prisma.cliente.create({
      data: { nombre: data.nombre.trim(), telefono: data.telefono.trim(), referidoPorId },
    });
  }

  async getAll(search?: string) {
    const where: any = {};
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { telefono: { contains: search } },
      ];
    }
    return prisma.cliente.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async getById(id: string) {
    const cliente = await prisma.cliente.findUnique({ where: { id } });
    if (!cliente) throw new Error('Cliente no encontrado');
    return cliente;
  }

  async update(id: string, data: { nombre?: string; activo?: boolean; notas?: string }) {
    return prisma.cliente.update({
      where: { id },
      data: {
        ...(data.nombre && { nombre: data.nombre.trim() }),
        ...(data.activo !== undefined && { activo: data.activo }),
        ...(data.notas !== undefined && { notas: data.notas }),
      },
    });
  }

  async obtenerOCrear(telefono: string, nombre: string) {
    let cliente = await this.buscarPorTelefono(telefono);
    if (!cliente) cliente = await this.crear({ nombre, telefono });
    return cliente;
  }
}

export const clientesService = new ClientesService();
```

- [ ] **Step 2: Crear `src/services/conductores.service.ts`**

```typescript
import prisma from '../config/database';

export class ConductoresService {
  async getAll(soloActivos = false) {
    return prisma.conductor.findMany({
      where: soloActivos ? { activo: true } : undefined,
      orderBy: { nombre: 'asc' },
    });
  }

  async getById(id: string) {
    const conductor = await prisma.conductor.findUnique({ where: { id } });
    if (!conductor) throw new Error('Conductor no encontrado');
    return conductor;
  }

  async create(data: { nombre: string; telefono: string; notas?: string }) {
    return prisma.conductor.create({
      data: { nombre: data.nombre.trim(), telefono: data.telefono.trim(), notas: data.notas },
    });
  }

  async update(id: string, data: { nombre?: string; telefono?: string; activo?: boolean; notas?: string }) {
    return prisma.conductor.update({
      where: { id },
      data: {
        ...(data.nombre && { nombre: data.nombre.trim() }),
        ...(data.telefono && { telefono: data.telefono.trim() }),
        ...(data.activo !== undefined && { activo: data.activo }),
        ...(data.notas !== undefined && { notas: data.notas }),
      },
    });
  }

  async delete(id: string) {
    return prisma.conductor.update({ where: { id }, data: { activo: false } });
  }
}

export const conductoresService = new ConductoresService();
```

- [ ] **Step 3: Crear `src/services/configuracion.service.ts`**

```typescript
import prisma from '../config/database';
import { servelozConfig } from '../config/whatsapp';

export class ConfiguracionService {
  async obtener() {
    const config = await prisma.configuracion.findUnique({ where: { id: 'default' } });
    if (config) return config;
    return prisma.configuracion.create({
      data: { id: 'default', tarifaBase: servelozConfig.tarifaBase, tarifaPorKm: servelozConfig.tarifaPorKm },
    });
  }

  async actualizar(data: { tarifaBase?: number; tarifaPorKm?: number }) {
    await this.obtener();
    return prisma.configuracion.update({
      where: { id: 'default' },
      data: {
        ...(data.tarifaBase !== undefined && { tarifaBase: data.tarifaBase }),
        ...(data.tarifaPorKm !== undefined && { tarifaPorKm: data.tarifaPorKm }),
      },
    });
  }
}

export const configuracionService = new ConfiguracionService();
```

- [ ] **Step 4: Crear `src/services/carreras.service.ts`**

```typescript
import prisma from '../config/database';
import { configuracionService } from './configuracion.service';
import { generarRadicado } from './whatsapp/templates';

export interface CrearCarreraInput {
  clienteId: string;
  tipoServicio: 'DOMICILIO' | 'MOTOTAXI';
  direccionRecogida: string;
  recogidaLat: number;
  recogidaLng: number;
  direccionDestino: string;
  destinoLat: number;
  destinoLng: number;
  distanciaKm: number;
  fechaHoraProgramada?: Date | null;
  origen?: 'WHATSAPP' | 'PANEL';
  conductorId?: string;
}

export class CarrerasService {
  async calcularPrecio(distanciaKm: number): Promise<number> {
    const config = await configuracionService.obtener();
    return Math.round(config.tarifaBase + config.tarifaPorKm * distanciaKm);
  }

  async create(data: CrearCarreraInput) {
    const cliente = await prisma.cliente.findUnique({ where: { id: data.clienteId } });
    if (!cliente) throw new Error('Cliente no encontrado');

    let precio = await this.calcularPrecio(data.distanciaKm);

    // Decremento condicionado atómicamente a nivel de base de datos: si dos
    // solicitudes concurrentes del mismo cliente intentaran usar el mismo
    // crédito de descuento, solo una de las dos actualizaciones afecta una
    // fila (la segunda encuentra `descuentosDisponibles` ya en 0 y no aplica).
    const descuento = await prisma.cliente.updateMany({
      where: { id: data.clienteId, descuentosDisponibles: { gt: 0 } },
      data: { descuentosDisponibles: { decrement: 1 } },
    });
    const descuentoAplicado = descuento.count > 0;
    if (descuentoAplicado) {
      precio = Math.round(precio * 0.8);
    }

    const carrera = await prisma.carrera.create({
      data: {
        radicado: generarRadicado(),
        clienteId: data.clienteId,
        conductorId: data.conductorId || null,
        tipoServicio: data.tipoServicio,
        direccionRecogida: data.direccionRecogida,
        recogidaLat: data.recogidaLat,
        recogidaLng: data.recogidaLng,
        direccionDestino: data.direccionDestino,
        destinoLat: data.destinoLat,
        destinoLng: data.destinoLng,
        distanciaKm: data.distanciaKm,
        precio,
        estado: data.conductorId ? 'ASIGNADA' : 'PENDIENTE_ASIGNACION',
        fechaHoraProgramada: data.fechaHoraProgramada || null,
        descuentoAplicado,
        origen: data.origen || 'WHATSAPP',
      },
      include: { cliente: true, conductor: true },
    });

    return carrera;
  }

  async getById(id: string) {
    const carrera = await prisma.carrera.findUnique({ where: { id }, include: { cliente: true, conductor: true } });
    if (!carrera) throw new Error('Carrera no encontrada');
    return carrera;
  }

  async buscarPorRadicado(radicado: string) {
    return prisma.carrera.findUnique({ where: { radicado }, include: { cliente: true, conductor: true } });
  }

  async getAll(filters?: { estado?: string; conductorId?: string; clienteId?: string }) {
    const where: any = {};
    if (filters?.estado) where.estado = filters.estado;
    if (filters?.conductorId) where.conductorId = filters.conductorId;
    if (filters?.clienteId) where.clienteId = filters.clienteId;
    return prisma.carrera.findMany({ where, include: { cliente: true, conductor: true }, orderBy: { createdAt: 'desc' } });
  }

  async getActivasPorTelefono(telefono: string) {
    return prisma.carrera.findMany({
      where: { cliente: { telefono }, estado: { in: ['PENDIENTE_ASIGNACION', 'ASIGNADA'] } },
      include: { cliente: true, conductor: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
  }

  async asignarConductor(id: string, conductorId: string) {
    return prisma.carrera.update({
      where: { id },
      data: { conductorId, estado: 'ASIGNADA' },
      include: { cliente: true, conductor: true },
    });
  }

  async cambiarEstado(id: string, estado: string, motivoCancelacion?: string) {
    return prisma.carrera.update({
      where: { id },
      data: { estado, motivoCancelacion: motivoCancelacion || null },
      include: { cliente: true, conductor: true },
    });
  }

  async marcarCompletada(id: string) {
    // Guarda atómica contra doble procesamiento (ej. doble clic en el panel):
    // solo la primera llamada que encuentra la carrera todavía no completada
    // hace la transición y acredita el descuento de referido.
    const resultado = await prisma.carrera.updateMany({
      where: { id, estado: { not: 'COMPLETADA' } },
      data: { estado: 'COMPLETADA' },
    });

    if (resultado.count === 0) {
      const carrera = await this.getById(id);
      return { carrera, referidorNotificar: null };
    }

    const carrera = await this.getById(id);

    let referidorNotificar: { telefono: string } | null = null;
    if (carrera.cliente.referidoPorId) {
      const yaTuvoCompletadaAntes = await prisma.carrera.count({
        where: { clienteId: carrera.clienteId, estado: 'COMPLETADA', id: { not: carrera.id } },
      });
      if (yaTuvoCompletadaAntes === 0) {
        const referidor = await prisma.cliente.update({
          where: { id: carrera.cliente.referidoPorId },
          data: { descuentosDisponibles: { increment: 1 } },
        });
        referidorNotificar = { telefono: referidor.telefono };
      }
    }

    return { carrera, referidorNotificar };
  }

  async actualizarEstadoPago(id: string, estadoPago: string) {
    return prisma.carrera.update({ where: { id }, data: { estadoPago }, include: { cliente: true, conductor: true } });
  }

  async getProgramadasPendientesDeAviso(antesDe: Date) {
    return prisma.carrera.findMany({
      where: {
        estado: 'PENDIENTE_ASIGNACION',
        fechaHoraProgramada: { lte: antesDe },
        avisoProgramadaEnviado: false,
        NOT: { fechaHoraProgramada: null },
      },
      include: { cliente: true },
    });
  }

  async marcarAvisoProgramadaEnviado(id: string) {
    return prisma.carrera.update({ where: { id }, data: { avisoProgramadaEnviado: true } });
  }
}

export const carrerasService = new CarrerasService();
```

- [ ] **Step 5: Commit**

```bash
git add src/services/clientes.service.ts src/services/conductores.service.ts src/services/configuracion.service.ts src/services/carreras.service.ts
git commit -m "feat: servicios de dominio para clientes, conductores, configuración y carreras"
```

---

### Task 7: Parser de mensajes y plantillas de texto

**Files:**
- Create: `src/services/whatsapp/parser.service.ts`
- Create: `src/services/whatsapp/templates.ts`

**Interfaces:**
- Produces:
  - `messageParser` (singleton) con `normalizarRespuesta`, `esAfirmativo`, `esNegativo`, `esComandoCancelacion`, `parsearFechaProgramada(texto): Date | null`, `parsearOpcionNumerica(texto, max): number | null`, `extraerRadicado(texto): string | null`.
  - `generarRadicado(): string`, `formatearFecha(fecha: Date): string`, `formatearHora(hora: string): string`, `validarNombreCompleto(texto): boolean` — exports sueltos (no dentro de una clase), usados por `carreras.service.ts` (Task 6) y `bot.service.ts` (Tasks 9 y 11).
  - `MENSAJES` — objeto con funciones que arman cada texto que el bot envía.

- [ ] **Step 1: Crear `src/services/whatsapp/parser.service.ts`**

```typescript
export class MessageParserService {
  normalizarRespuesta(texto: string): string {
    return texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  esAfirmativo(texto: string): boolean {
    const n = this.normalizarRespuesta(texto);
    return ['si', 'sí', 'yes', 'ok', '1', 'cierto', 'claro', 'de acuerdo', 'sip', 'sep'].some(a => n.includes(a));
  }

  esNegativo(texto: string): boolean {
    const n = this.normalizarRespuesta(texto);
    return ['no', '2', 'nop', 'nope', 'negativo', 'nó'].some(neg => n.includes(neg));
  }

  esComandoCancelacion(texto: string): boolean {
    const n = this.normalizarRespuesta(texto);
    return ['cancelar', 'salir', 'exit', 'atras', 'volver'].includes(n);
  }

  parsearOpcionNumerica(texto: string, max: number): number | null {
    const textoLimpio = texto.replace(/[^\d\s]/g, '').trim();
    const numero = parseInt(textoLimpio);
    if (isNaN(numero) || numero < 1 || numero > max) return null;
    return numero;
  }

  extraerRadicado(texto: string): string | null {
    const t = texto.trim().toUpperCase().replace(/\s+/g, '');
    const m1 = t.match(/SRV[-\s]?([A-Z0-9]{6})/i);
    if (m1) return `SRV-${m1[1]}`;
    const m2 = t.match(/^([A-Z0-9]{6})$/);
    if (m2) return `SRV-${m2[1]}`;
    return null;
  }

  private parsearDiaBase(textoLower: string): Date | null {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    if (textoLower.includes('hoy')) return hoy;
    if (textoLower.includes('mañana') || textoLower.includes('manana')) {
      const d = new Date(hoy);
      d.setDate(d.getDate() + 1);
      return d;
    }

    const diasSemana: Record<string, number> = {
      lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 0,
    };
    for (const [dia, numero] of Object.entries(diasSemana)) {
      if (textoLower.includes(dia)) {
        const fecha = new Date(hoy);
        const diaActual = fecha.getDay();
        let diff = numero - diaActual;
        if (diff <= 0) diff += 7;
        fecha.setDate(fecha.getDate() + diff);
        return fecha;
      }
    }

    const fechaRegex = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/;
    const match = textoLower.match(fechaRegex);
    if (match) {
      const [, dia, mes, anio] = match;
      const anioCompleto = anio ? (anio.length === 2 ? 2000 + parseInt(anio) : parseInt(anio)) : hoy.getFullYear();
      const fecha = new Date(anioCompleto, parseInt(mes) - 1, parseInt(dia));
      if (!isNaN(fecha.getTime())) return fecha;
    }

    return null;
  }

  private parsearHora(textoLower: string): { horas: number; minutos: number } | null {
    // Requiere am/pm o un separador ":" junto al número — evita que un número
    // suelto de una fecha como "25/12" se confunda con una hora.
    let match = textoLower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
    let periodo: string | undefined;
    if (match) {
      periodo = match[3];
    } else {
      match = textoLower.match(/(\d{1,2}):(\d{2})/);
    }
    if (!match) return null;

    let horas = parseInt(match[1]);
    const minutos = match[2] ? parseInt(match[2]) : 0;
    if (periodo === 'pm' && horas < 12) horas += 12;
    if (periodo === 'am' && horas === 12) horas = 0;
    if (horas > 23 || minutos > 59) return null;
    return { horas, minutos };
  }

  parsearFechaProgramada(texto: string): Date | null {
    const textoLower = this.normalizarRespuesta(texto);
    const dia = this.parsearDiaBase(textoLower);
    if (!dia) return null;
    const hora = this.parsearHora(textoLower);
    if (!hora) return null;
    const fecha = new Date(dia);
    fecha.setHours(hora.horas, hora.minutos, 0, 0);
    return fecha;
  }
}

export const messageParser = new MessageParserService();
```

- [ ] **Step 2: Crear `src/services/whatsapp/templates.ts`**

```typescript
export function generarRadicado(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo = '';
  for (let i = 0; i < 6; i++) codigo += chars[Math.floor(Math.random() * chars.length)];
  return `SRV-${codigo}`;
}

export function formatearFecha(fecha: Date): string {
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${dias[fecha.getDay()]} ${fecha.getDate()} de ${meses[fecha.getMonth()]}`;
}

export function formatearHora(fechaOHora: Date | string): string {
  let h: number, m: number;
  if (typeof fechaOHora === 'string') {
    [h, m] = fechaOHora.split(':').map(Number);
  } else {
    h = fechaOHora.getHours();
    m = fechaOHora.getMinutes();
  }
  const periodo = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${periodo}`;
}

export function validarNombreCompleto(texto: string): boolean {
  const partes = texto.trim().split(/\s+/).filter(p => p.length >= 2);
  return partes.length >= 2 && texto.trim().length <= 60;
}

export const MENSAJES = {
  BIENVENIDA: () => '🛵 *¡Hola! Soy el asistente de Serveloz.*\n\n¿Qué necesitas hoy?',
  SOLICITAR_NOMBRE: () => '🛵 Antes de continuar, ¿cuál es tu *nombre completo*?',
  NOMBRE_INVALIDO: () => '🛵 Por favor escribe tu nombre completo (nombre y apellido).',
  SOLICITAR_REFERIDO: () => '¿Alguien te recomendó Serveloz? Si es así, escribe su nombre o número. Si no, escribe *"no"*.',
  SOLICITAR_TIPO_SERVICIO: () => '¿Qué servicio necesitas?',
  SOLICITAR_RECOGIDA: () => '📍 Escribe la *dirección de recogida* o comparte tu ubicación.',
  CONFIRMAR_DIRECCION: (direccion: string) => `Encontramos esta dirección:\n\n📍 *${direccion}*\n\n¿Es correcta?`,
  DIRECCION_NO_ENCONTRADA: () => '🛵 No pude encontrar esa dirección. Intenta escribirla de nuevo (ej: "Cra 27 #45-12") o comparte tu ubicación 📍.',
  SOLICITAR_DESTINO: () => '📍 Ahora escribe la *dirección de destino* o comparte la ubicación.',
  SOLICITAR_MOMENTO: () => '¿Para cuándo necesitas el servicio?',
  SOLICITAR_FECHA_HORA_PROGRAMADA: () => '📅 Escribe la fecha y hora (ej: *"mañana 3:00pm"* o *"25/12 10:00am"*).',
  FECHA_PROGRAMADA_INVALIDA: () => 'No entendí la fecha/hora. Intenta de nuevo, por ejemplo: *"mañana 3:00pm"*.',
  PRECIO_CALCULADO: (info: { distanciaKm: number; precio: number; conDescuento: boolean }) =>
    `💰 *Resumen de tu carrera*\n\n📏 Distancia: ${info.distanciaKm.toFixed(1)} km\n💵 Precio: $${info.precio.toLocaleString('es-CO')}${info.conDescuento ? ' (con tu 20% de descuento por referido aplicado)' : ''}\n\n¿Confirmas el pedido?`,
  CARRERA_CONFIRMADA: (info: { radicado: string }) =>
    `✅ *¡Pedido confirmado!*\n\n📋 Radicado: ${info.radicado}\n\nEstamos buscando el conductor disponible. Te avisamos en cuanto se asigne.`,
  CARRERA_ASIGNADA: (info: { conductor: string; telefono: string }) =>
    `🛵 *¡Tu conductor está en camino!*\n\n👤 ${info.conductor}\n📱 ${info.telefono}\n\nPuedes contactarlo directamente si lo necesitas.`,
  CARRERA_CERRADA: () => '✅ *Carrera completada.* ¡Gracias por confiar en Serveloz! Escríbenos cuando necesites otro servicio.',
  DESCUENTO_GANADO: () => '🎉 Ganaste un 20% de descuento por referir a un nuevo cliente. Se aplicará automáticamente en tu próximo pedido.',
  SIN_CARRERAS_ACTIVAS: () => 'No tienes carreras activas en este momento.',
  CONFIRMAR_CANCELACION: (info: { radicado: string; destino: string }) =>
    `¿Deseas cancelar esta carrera?\n\n📋 ${info.radicado} — destino: ${info.destino}`,
  CARRERA_CANCELADA: () => '❌ Tu carrera fue cancelada.',
  RADICADO_NO_ENCONTRADO: () => 'No encontramos una carrera activa con ese radicado.',
  OPCION_INVALIDA: () => 'No entendí tu respuesta. Por favor intenta de nuevo.',
  ERROR_SERVIDOR: () => '🛵 Tuvimos un problema procesando tu solicitud. Por favor intenta de nuevo en un momento.',
  DESPEDIDA: () => '¡Gracias por escribirnos! Cuando necesites un domicilio o mototaxi, aquí estamos. 🛵',
};
```

- [ ] **Step 3: Verificar que Task 6 y Task 7 compilan juntas**

Run: `npx tsc --noEmit`
Expected: sin errores (esto valida el import de `generarRadicado` en `carreras.service.ts` de la Task 6).

- [ ] **Step 4: Commit**

```bash
git add src/services/whatsapp/parser.service.ts src/services/whatsapp/templates.ts
git commit -m "feat: parser de mensajes y plantillas de texto del bot"
```

---

### Task 8: Registro de mensajes (historial de chat)

**Files:**
- Create: `src/services/mensajeria.service.ts`

**Interfaces:**
- Consumes: `whatsappMessagesService`, `ReplyButton`, `ListSection` de `src/services/whatsapp/messages.service.ts` (Task 4); `prisma` (Task 3).
- Produces: `mensajeriaService` (singleton) con `registrarEntrante(telefono, contenido)`, `registrarSaliente(telefono, contenido, enviadoPor: 'BOT' | 'DUEÑO')`, y wrappers `enviarMensaje`, `enviarMensajeConBotones`, `enviarMensajeConLista`, `enviarUbicacion` que envían **y** registran en `Mensaje`. `bot.service.ts` (Tasks 9 y 11) debe usar estos wrappers (no `whatsappMessagesService` directamente) para que la conversación quede completa en el historial que ve el panel. `notificaciones.service.ts` (Task 11) sigue usando `whatsappMessagesService` directamente, porque esos mensajes van a conductor/dueño y no forman parte del chat con el cliente.

- [ ] **Step 1: Crear `src/services/mensajeria.service.ts`**

```typescript
import prisma from '../config/database';
import { whatsappMessagesService, ReplyButton, ListSection } from './whatsapp/messages.service';

export class MensajeriaService {
  async registrarEntrante(telefono: string, contenido: string) {
    const cliente = await prisma.cliente.findUnique({ where: { telefono } });
    await prisma.mensaje.create({
      data: { telefono, clienteId: cliente?.id, direccion: 'ENTRANTE', contenido, enviadoPor: 'CLIENTE' },
    });
  }

  async registrarSaliente(telefono: string, contenido: string, enviadoPor: 'BOT' | 'DUEÑO') {
    const cliente = await prisma.cliente.findUnique({ where: { telefono } });
    await prisma.mensaje.create({
      data: { telefono, clienteId: cliente?.id, direccion: 'SALIENTE', contenido, enviadoPor },
    });
  }

  async enviarMensaje(telefono: string, mensaje: string): Promise<any> {
    const resultado = await whatsappMessagesService.enviarMensaje(telefono, mensaje);
    await this.registrarSaliente(telefono, mensaje, 'BOT');
    return resultado;
  }

  async enviarMensajeConBotones(telefono: string, mensaje: string, botones: ReplyButton[]): Promise<any> {
    const resultado = await whatsappMessagesService.enviarMensajeConBotones(telefono, mensaje, botones);
    const opciones = botones.map(b => b.title).join(' / ');
    await this.registrarSaliente(telefono, `${mensaje}\n[Opciones: ${opciones}]`, 'BOT');
    return resultado;
  }

  async enviarMensajeConLista(telefono: string, mensaje: string, buttonText: string, sections: ListSection[]): Promise<any> {
    const resultado = await whatsappMessagesService.enviarMensajeConLista(telefono, mensaje, buttonText, sections);
    await this.registrarSaliente(telefono, mensaje, 'BOT');
    return resultado;
  }

  async enviarUbicacion(telefono: string, lat: number, lng: number, nombre?: string, direccion?: string): Promise<any> {
    const resultado = await whatsappMessagesService.enviarUbicacion(telefono, lat, lng, nombre, direccion);
    await this.registrarSaliente(telefono, `📍 Ubicación enviada: ${nombre || ''} ${direccion || ''}`.trim(), 'BOT');
    return resultado;
  }
}

export const mensajeriaService = new MensajeriaService();
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/services/mensajeria.service.ts
git commit -m "feat: registro de historial de mensajes para el chat manual del panel"
```

---

### Task 9: Bot — registro, referido, tipo de servicio y captura de direcciones

**Files:**
- Create: `src/services/whatsapp/bot.service.ts`

**Interfaces:**
- Consumes: `prisma` (Task 3); `radarService` (Task 5); `clientesService` (Task 6); `mensajeriaService` (Task 8); `messageParser`, `MENSAJES`, `validarNombreCompleto` (Task 7); `ConversationState`, `ConversationContext` (Task 3).
- Produces: `whatsappBotService` (singleton) con método público `procesarMensaje(telefono: string, mensaje: string, esBoton?: boolean, buttonId?: string, ubicacion?: { lat: number; lng: number }): Promise<void>` — es el punto de entrada que usará `webhook.controller.ts` (Task 12). En esta tarea se implementan los estados `ESPERANDO_NOMBRE`, `ESPERANDO_REFERIDO`, `ESPERANDO_TIPO_SERVICIO`, `ESPERANDO_RECOGIDA`, `ESPERANDO_CONFIRMACION_RECOGIDA`, `ESPERANDO_DESTINO`, `ESPERANDO_CONFIRMACION_DESTINO`. Los estados restantes (momento, precio, asignación, cancelación) se agregan en la Task 10 modificando este mismo archivo.

- [ ] **Step 1: Crear `src/services/whatsapp/bot.service.ts`**

```typescript
import prisma from '../../config/database';
import { radarService } from '../radar.service';
import { clientesService } from '../clientes.service';
import { mensajeriaService } from '../mensajeria.service';
import { messageParser } from './parser.service';
import { MENSAJES, validarNombreCompleto } from './templates';
import { ConversationState, ConversationContext } from '../../types';

const NOMBRE_PLACEHOLDER = 'Cliente Nuevo';

export class WhatsAppBotService {
  async procesarMensaje(
    telefono: string,
    mensaje: string,
    esBoton: boolean = false,
    buttonId?: string,
    ubicacion?: { lat: number; lng: number }
  ) {
    try {
      if (messageParser.esComandoCancelacion(mensaje)) {
        await this.manejarCancelacionGlobal(telefono);
        return;
      }

      let conversacion = await this.obtenerConversacionActiva(telefono);
      if (!conversacion) {
        conversacion = await this.crearConversacion(telefono);
        await this.enviarSaludoInicial(telefono, conversacion.cliente, conversacion.id);
        return;
      }

      if (conversacion.modoManual) return;

      await this.actualizarActividad(conversacion.id);
      const estado = conversacion.estado as ConversationState;
      const contexto: ConversationContext = JSON.parse(conversacion.contexto);
      const mensajeAProcesar = esBoton && buttonId ? buttonId : mensaje;
      await this.procesarEstado(telefono, mensajeAProcesar, estado, contexto, conversacion.id, ubicacion);
    } catch (error) {
      console.error('Error procesando mensaje:', error);
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.ERROR_SERVIDOR());
    }
  }

  private async enviarSaludoInicial(telefono: string, cliente: { nombre: string }, conversacionId: string) {
    if (cliente.nombre === NOMBRE_PLACEHOLDER) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.BIENVENIDA());
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.SOLICITAR_NOMBRE());
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_NOMBRE', {});
    } else {
      await mensajeriaService.enviarMensaje(telefono, `🛵 ¡Hola de nuevo, ${cliente.nombre}!`);
      await this.enviarMenuTipoServicio(telefono);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_TIPO_SERVICIO', {});
    }
  }

  private async enviarMenuTipoServicio(telefono: string) {
    await mensajeriaService.enviarMensajeConBotones(telefono, MENSAJES.SOLICITAR_TIPO_SERVICIO(), [
      { id: 'tipo_domicilio', title: '📦 Domicilio' },
      { id: 'tipo_mototaxi', title: '🛵 Mototaxi' },
    ]);
  }

  private async procesarEstado(
    telefono: string,
    mensaje: string,
    estado: ConversationState,
    contexto: ConversationContext,
    conversacionId: string,
    ubicacion?: { lat: number; lng: number }
  ) {
    switch (estado) {
      case 'ESPERANDO_NOMBRE':
        await this.manejarNombre(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_REFERIDO':
        await this.manejarReferido(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_TIPO_SERVICIO':
        await this.manejarTipoServicio(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_RECOGIDA':
        await this.manejarDireccion(telefono, mensaje, contexto, conversacionId, 'recogida', ubicacion); break;
      case 'ESPERANDO_CONFIRMACION_RECOGIDA':
        await this.manejarConfirmacionDireccion(telefono, mensaje, contexto, conversacionId, 'recogida'); break;
      case 'ESPERANDO_DESTINO':
        await this.manejarDireccion(telefono, mensaje, contexto, conversacionId, 'destino', ubicacion); break;
      case 'ESPERANDO_CONFIRMACION_DESTINO':
        await this.manejarConfirmacionDireccion(telefono, mensaje, contexto, conversacionId, 'destino'); break;
      default:
        // Estados de momento/precio/asignación/cancelación se agregan en la Task 10.
        await mensajeriaService.enviarMensaje(telefono, MENSAJES.OPCION_INVALIDA());
    }
  }

  private async manejarNombre(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (!validarNombreCompleto(mensaje)) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.NOMBRE_INVALIDO());
      return;
    }
    const cliente = await clientesService.buscarPorTelefono(telefono);
    if (cliente) await clientesService.update(cliente.id, { nombre: mensaje.trim() });
    contexto.nombre = mensaje.trim();
    await mensajeriaService.enviarMensaje(telefono, MENSAJES.SOLICITAR_REFERIDO());
    await this.actualizarConversacion(conversacionId, 'ESPERANDO_REFERIDO', contexto);
  }

  private async manejarReferido(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (!messageParser.esNegativo(mensaje)) {
      const cliente = await clientesService.buscarPorTelefono(telefono);
      const referidor = await clientesService.buscarPorTelefono(mensaje.trim());
      if (cliente && referidor && referidor.id !== cliente.id) {
        await prisma.cliente.update({ where: { id: cliente.id }, data: { referidoPorId: referidor.id } });
      }
    }
    await this.enviarMenuTipoServicio(telefono);
    await this.actualizarConversacion(conversacionId, 'ESPERANDO_TIPO_SERVICIO', contexto);
  }

  private async manejarTipoServicio(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (mensaje === 'tipo_domicilio') contexto.tipoServicio = 'DOMICILIO';
    else if (mensaje === 'tipo_mototaxi') contexto.tipoServicio = 'MOTOTAXI';
    else {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.OPCION_INVALIDA());
      await this.enviarMenuTipoServicio(telefono);
      return;
    }
    await mensajeriaService.enviarMensaje(telefono, MENSAJES.SOLICITAR_RECOGIDA());
    await this.actualizarConversacion(conversacionId, 'ESPERANDO_RECOGIDA', contexto);
  }

  private async manejarDireccion(
    telefono: string,
    mensaje: string,
    contexto: ConversationContext,
    conversacionId: string,
    campo: 'recogida' | 'destino',
    ubicacion?: { lat: number; lng: number }
  ) {
    if (ubicacion) {
      contexto[campo] = {
        lat: ubicacion.lat,
        lng: ubicacion.lng,
        direccionFormateada: `Ubicación compartida (${ubicacion.lat.toFixed(5)}, ${ubicacion.lng.toFixed(5)})`,
      };
      await this.avanzarDespuesDeDireccion(telefono, contexto, conversacionId, campo);
      return;
    }

    const resultado = await radarService.geocodificar(mensaje);
    if (!resultado) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.DIRECCION_NO_ENCONTRADA());
      return;
    }

    contexto[campo] = {
      direccionTexto: mensaje,
      direccionFormateada: resultado.direccionFormateada,
      lat: resultado.lat,
      lng: resultado.lng,
    };
    await mensajeriaService.enviarMensajeConBotones(telefono, MENSAJES.CONFIRMAR_DIRECCION(resultado.direccionFormateada), [
      { id: 'direccion_si', title: '✅ Sí' },
      { id: 'direccion_no', title: '❌ No' },
    ]);
    await this.actualizarConversacion(
      conversacionId,
      campo === 'recogida' ? 'ESPERANDO_CONFIRMACION_RECOGIDA' : 'ESPERANDO_CONFIRMACION_DESTINO',
      contexto
    );
  }

  private async manejarConfirmacionDireccion(
    telefono: string,
    mensaje: string,
    contexto: ConversationContext,
    conversacionId: string,
    campo: 'recogida' | 'destino'
  ) {
    if (mensaje === 'direccion_si' || messageParser.esAfirmativo(mensaje)) {
      await this.avanzarDespuesDeDireccion(telefono, contexto, conversacionId, campo);
    } else if (mensaje === 'direccion_no' || messageParser.esNegativo(mensaje)) {
      delete contexto[campo];
      await mensajeriaService.enviarMensaje(telefono, campo === 'recogida' ? MENSAJES.SOLICITAR_RECOGIDA() : MENSAJES.SOLICITAR_DESTINO());
      await this.actualizarConversacion(conversacionId, campo === 'recogida' ? 'ESPERANDO_RECOGIDA' : 'ESPERANDO_DESTINO', contexto);
    } else {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.OPCION_INVALIDA());
    }
  }

  private async avanzarDespuesDeDireccion(
    telefono: string,
    contexto: ConversationContext,
    conversacionId: string,
    campo: 'recogida' | 'destino'
  ) {
    if (campo === 'recogida') {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.SOLICITAR_DESTINO());
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_DESTINO', contexto);
    } else {
      await mensajeriaService.enviarMensajeConBotones(telefono, MENSAJES.SOLICITAR_MOMENTO(), [
        { id: 'momento_ahora', title: '🕐 Ahora' },
        { id: 'momento_programado', title: '📅 Programado' },
      ]);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_MOMENTO', contexto);
    }
  }

  private async manejarCancelacionGlobal(telefono: string) {
    const conv = await this.obtenerConversacionActiva(telefono);
    if (conv) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.DESPEDIDA());
      await this.finalizarConversacion(conv.id);
    }
  }

  private async obtenerConversacionActiva(telefono: string) {
    return prisma.conversacion.findFirst({ where: { telefono, activa: true }, include: { cliente: true } });
  }

  private async crearConversacion(telefono: string) {
    let cliente = await clientesService.buscarPorTelefono(telefono);
    if (!cliente) cliente = await clientesService.crear({ nombre: NOMBRE_PLACEHOLDER, telefono });
    return prisma.conversacion.create({
      data: { clienteId: cliente.id, telefono, estado: 'INICIAL', contexto: JSON.stringify({}), activa: true },
      include: { cliente: true },
    });
  }

  private async actualizarConversacion(id: string, estado: ConversationState, contexto: ConversationContext) {
    return prisma.conversacion.update({ where: { id }, data: { estado, contexto: JSON.stringify(contexto), lastActivity: new Date() } });
  }

  private async actualizarActividad(id: string) {
    return prisma.conversacion.update({ where: { id }, data: { lastActivity: new Date() } });
  }

  private async finalizarConversacion(id: string) {
    return prisma.conversacion.update({ where: { id }, data: { activa: false, estado: 'COMPLETADA' } });
  }
}

export const whatsappBotService = new WhatsAppBotService();
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Probar el flujo manualmente con un script ad-hoc**

Crear un archivo temporal `scratch-test.ts` en la raíz del proyecto (no se commitea):

```typescript
import 'dotenv/config';
import { whatsappBotService } from './src/services/whatsapp/bot.service';

async function main() {
  const telefono = '573001112233';
  await whatsappBotService.procesarMensaje(telefono, 'Hola');
  await whatsappBotService.procesarMensaje(telefono, 'Juan Pérez');
  await whatsappBotService.procesarMensaje(telefono, 'no');
  await whatsappBotService.procesarMensaje(telefono, 'tipo_domicilio', true, 'tipo_domicilio');
  await whatsappBotService.procesarMensaje(telefono, 'Cra 27 #45-12, Bucaramanga');
}
main();
```

Run: `npx ts-node scratch-test.ts`
Expected: en consola no hay errores; en la tabla `Conversacion` (verificar con `npx prisma studio`) el registro de ese teléfono queda en estado `ESPERANDO_CONFIRMACION_RECOGIDA` con `contexto` conteniendo `nombre`, `tipoServicio` y `recogida` con lat/lng. Requiere `WHATSAPP_TOKEN`/`WHATSAPP_PHONE_ID` reales o los envíos a `whatsappMessagesService` fallarán — si no se cuenta con credenciales de Meta todavía, revisar en los logs que el error es de la llamada HTTP (401/404 de Meta) y no de la lógica del bot; el estado igual debe haber avanzado correctamente en la base de datos porque `actualizarConversacion` no depende del envío exitoso del mensaje.

Borrar `scratch-test.ts` después de la prueba (`rm scratch-test.ts`) — es solo una herramienta de verificación manual, no forma parte del proyecto.

- [ ] **Step 4: Commit**

```bash
git add src/services/whatsapp/bot.service.ts
git commit -m "feat: bot - registro de cliente, referido, tipo de servicio y direcciones"
```

---

### Task 10: Servicio de notificaciones

**Files:**
- Create: `src/services/notificaciones.service.ts`

**Interfaces:**
- Consumes: `whatsappMessagesService` (Task 4), `mensajeriaService` (Task 8), `carrerasService` (Task 6), `MENSAJES` (Task 7), `botConfig` (Task 3).
- Produces: `notificacionesService` (singleton) con `notificarNuevaSolicitud(carreraId)`, `notificarAsignacion(carreraId)`, `notificarCierre(carreraId, referidorTelefono?)`, `avisarCarrerasProgramadas()`. Usados por `bot.service.ts` (Task 11), las rutas admin (Task 14) y el cron de `app.ts` (Task 12).

- [ ] **Step 1: Crear `src/services/notificaciones.service.ts`**

```typescript
import { whatsappMessagesService } from './whatsapp/messages.service';
import { mensajeriaService } from './mensajeria.service';
import { carrerasService } from './carreras.service';
import { MENSAJES } from './whatsapp/templates';
import { botConfig } from '../config/whatsapp';

export class NotificacionesService {
  async notificarNuevaSolicitud(carreraId: string) {
    const carrera = await carrerasService.getById(carreraId);
    const telefonoAdmin = process.env.ADMINISTRADOR_TELEFONO;
    if (!telefonoAdmin) return;

    const mensaje = `🆕 *NUEVA SOLICITUD*

📋 Radicado: ${carrera.radicado}
👤 Cliente: ${carrera.cliente.nombre} (${carrera.cliente.telefono})
🚦 Servicio: ${carrera.tipoServicio}
📍 Recogida: ${carrera.direccionRecogida}
🏁 Destino: ${carrera.direccionDestino}
📏 Distancia: ${carrera.distanciaKm.toFixed(1)} km
💰 Precio: $${carrera.precio.toLocaleString('es-CO')}
${carrera.fechaHoraProgramada ? `📅 Programada: ${carrera.fechaHoraProgramada.toLocaleString('es-CO')}` : '🕐 Para ahora mismo'}

Ingresa al panel para asignar conductor.`;

    try {
      await whatsappMessagesService.enviarMensaje(telefonoAdmin, mensaje);
    } catch (e) { console.error('Error notificando nueva solicitud al dueño:', e); }
  }

  async notificarAsignacion(carreraId: string) {
    const carrera = await carrerasService.getById(carreraId);
    if (!carrera.conductor) return;

    try {
      await whatsappMessagesService.enviarPlantilla(carrera.conductor.telefono, 'nueva_carrera_conductor', 'es', [
        carrera.conductor.nombre,
        carrera.cliente.nombre,
        carrera.direccionRecogida,
        carrera.direccionDestino,
        `$${carrera.precio.toLocaleString('es-CO')}`,
        carrera.radicado,
      ]);
    } catch (e) { console.error('Error notificando al conductor:', e); }

    try {
      await mensajeriaService.enviarMensaje(
        carrera.cliente.telefono,
        `🛵 Tu conductor es *${carrera.conductor.nombre}* (${carrera.conductor.telefono}). ¡Ya va en camino!`
      );
    } catch (e) { console.error('Error notificando asignación al cliente:', e); }
  }

  async notificarCierre(carreraId: string, referidorTelefono?: string | null) {
    const carrera = await carrerasService.getById(carreraId);
    try {
      await mensajeriaService.enviarMensaje(carrera.cliente.telefono, MENSAJES.CARRERA_CERRADA());
    } catch (e) { console.error('Error notificando cierre:', e); }

    if (referidorTelefono) {
      try {
        await mensajeriaService.enviarMensaje(referidorTelefono, MENSAJES.DESCUENTO_GANADO());
      } catch (e) { console.error('Error notificando descuento de referido:', e); }
    }
  }

  async avisarCarrerasProgramadas() {
    const limite = new Date(Date.now() + botConfig.avisoProgramadaMinutosAntes * 60000);
    const pendientes = await carrerasService.getProgramadasPendientesDeAviso(limite);
    for (const carrera of pendientes) {
      await this.notificarNuevaSolicitud(carrera.id);
      await carrerasService.marcarAvisoProgramadaEnviado(carrera.id);
    }
  }
}

export const notificacionesService = new NotificacionesService();
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/services/notificaciones.service.ts
git commit -m "feat: servicio de notificaciones (dueño, conductor, cliente, referidos)"
```

---

### Task 11: Bot — momento, precio, confirmación de carrera y cancelación

**Files:**
- Modify: `src/services/whatsapp/bot.service.ts` (creado en la Task 9)

**Interfaces:**
- Consumes (nuevo en esta tarea): `carrerasService` (Task 6), `notificacionesService` (Task 10).
- Produces: completa `whatsappBotService.procesarMensaje` con todos los estados restantes: `ESPERANDO_MOMENTO`, `ESPERANDO_FECHA_HORA_PROGRAMADA`, `CONFIRMACION_PRECIO`, `ESPERANDO_ASIGNACION`, `ESPERANDO_SELECCION_CARRERA_CANCELAR`, `ESPERANDO_CONFIRMACION_CANCELACION`. También exporta `limpiarConversacionesInactivas()`, usada por el cron de `app.ts` (Task 12).

- [ ] **Step 1: Agregar imports nuevos al inicio del archivo**

Reemplazar el bloque de imports:

```typescript
import prisma from '../../config/database';
import { radarService } from '../radar.service';
import { clientesService } from '../clientes.service';
import { mensajeriaService } from '../mensajeria.service';
import { messageParser } from './parser.service';
import { MENSAJES, validarNombreCompleto } from './templates';
import { ConversationState, ConversationContext } from '../../types';
```

por:

```typescript
import prisma from '../../config/database';
import { radarService } from '../radar.service';
import { clientesService } from '../clientes.service';
import { carrerasService } from '../carreras.service';
import { notificacionesService } from '../notificaciones.service';
import { mensajeriaService } from '../mensajeria.service';
import { messageParser } from './parser.service';
import { MENSAJES, validarNombreCompleto } from './templates';
import { ConversationState, ConversationContext } from '../../types';
import { botConfig } from '../../config/whatsapp';
```

- [ ] **Step 2: Reemplazar el `switch` de `procesarEstado`**

Reemplazar:

```typescript
      case 'ESPERANDO_CONFIRMACION_DESTINO':
        await this.manejarConfirmacionDireccion(telefono, mensaje, contexto, conversacionId, 'destino'); break;
      default:
        // Estados de momento/precio/asignación/cancelación se agregan en la Task 10.
        await mensajeriaService.enviarMensaje(telefono, MENSAJES.OPCION_INVALIDA());
    }
```

por:

```typescript
      case 'ESPERANDO_CONFIRMACION_DESTINO':
        await this.manejarConfirmacionDireccion(telefono, mensaje, contexto, conversacionId, 'destino'); break;
      case 'ESPERANDO_MOMENTO':
        await this.manejarMomento(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_FECHA_HORA_PROGRAMADA':
        await this.manejarFechaHoraProgramada(telefono, mensaje, contexto, conversacionId); break;
      case 'CONFIRMACION_PRECIO':
        await this.manejarConfirmacionPrecio(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_ASIGNACION':
        await mensajeriaService.enviarMensaje(
          telefono,
          'Ya recibimos tu pedido y estamos asignando un conductor. Te avisamos apenas esté en camino. 🛵'
        );
        break;
      case 'ESPERANDO_SELECCION_CARRERA_CANCELAR':
        await this.manejarSeleccionCarreraCancelar(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_CONFIRMACION_CANCELACION':
        await this.manejarConfirmacionCancelacion(telefono, mensaje, contexto, conversacionId); break;
      default:
        await mensajeriaService.enviarMensaje(telefono, MENSAJES.OPCION_INVALIDA());
    }
```

- [ ] **Step 3: Insertar los nuevos métodos privados**

Insertar el siguiente bloque justo antes del método `private async manejarCancelacionGlobal(telefono: string) {` existente:

```typescript
  private async manejarMomento(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (mensaje === 'momento_ahora') {
      delete contexto.fechaHoraProgramada;
      await this.calcularYMostrarPrecio(telefono, contexto, conversacionId);
    } else if (mensaje === 'momento_programado') {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.SOLICITAR_FECHA_HORA_PROGRAMADA());
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_FECHA_HORA_PROGRAMADA', contexto);
    } else {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.OPCION_INVALIDA());
    }
  }

  private async manejarFechaHoraProgramada(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    const fecha = messageParser.parsearFechaProgramada(mensaje);
    if (!fecha || fecha < new Date()) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.FECHA_PROGRAMADA_INVALIDA());
      return;
    }
    contexto.fechaHoraProgramada = fecha.toISOString();
    await this.calcularYMostrarPrecio(telefono, contexto, conversacionId);
  }

  private async calcularYMostrarPrecio(telefono: string, contexto: ConversationContext, conversacionId: string) {
    try {
      const distanciaKm = await radarService.calcularDistanciaKm(
        { lat: contexto.recogida!.lat!, lng: contexto.recogida!.lng! },
        { lat: contexto.destino!.lat!, lng: contexto.destino!.lng! }
      );
      contexto.distanciaKm = distanciaKm;

      const cliente = await clientesService.buscarPorTelefono(telefono);
      const conDescuento = !!cliente && cliente.descuentosDisponibles > 0;
      let precio = await carrerasService.calcularPrecio(distanciaKm);
      if (conDescuento) precio = Math.round(precio * 0.8);
      contexto.precio = precio;

      await mensajeriaService.enviarMensajeConBotones(
        telefono,
        MENSAJES.PRECIO_CALCULADO({ distanciaKm, precio, conDescuento }),
        [
          { id: 'precio_si', title: '✅ Confirmar' },
          { id: 'precio_no', title: '❌ Cancelar' },
        ]
      );
      await this.actualizarConversacion(conversacionId, 'CONFIRMACION_PRECIO', contexto);
    } catch (error) {
      console.error('Error calculando precio:', error);
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.ERROR_SERVIDOR());
    }
  }

  private async manejarConfirmacionPrecio(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (mensaje === 'precio_no' || messageParser.esNegativo(mensaje)) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.DESPEDIDA());
      await this.finalizarConversacion(conversacionId);
      return;
    }
    if (mensaje !== 'precio_si' && !messageParser.esAfirmativo(mensaje)) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.OPCION_INVALIDA());
      return;
    }

    const cliente = await clientesService.buscarPorTelefono(telefono);
    if (!cliente) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.ERROR_SERVIDOR());
      return;
    }

    const carrera = await carrerasService.create({
      clienteId: cliente.id,
      tipoServicio: contexto.tipoServicio!,
      direccionRecogida: contexto.recogida!.direccionFormateada!,
      recogidaLat: contexto.recogida!.lat!,
      recogidaLng: contexto.recogida!.lng!,
      direccionDestino: contexto.destino!.direccionFormateada!,
      destinoLat: contexto.destino!.lat!,
      destinoLng: contexto.destino!.lng!,
      distanciaKm: contexto.distanciaKm!,
      fechaHoraProgramada: contexto.fechaHoraProgramada ? new Date(contexto.fechaHoraProgramada) : null,
      origen: 'WHATSAPP',
    });

    await mensajeriaService.enviarMensaje(telefono, MENSAJES.CARRERA_CONFIRMADA({ radicado: carrera.radicado }));

    if (!contexto.fechaHoraProgramada) {
      try { await notificacionesService.notificarNuevaSolicitud(carrera.id); } catch (e) { console.error('Error notificando nueva solicitud:', e); }
    }

    await this.actualizarConversacion(conversacionId, 'ESPERANDO_ASIGNACION', { carreraId: carrera.id, radicado: carrera.radicado });
  }

  private async manejarSeleccionCarreraCancelar(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    const radicado = mensaje.startsWith('carrera_') ? mensaje.replace('carrera_', '') : messageParser.extraerRadicado(mensaje);
    if (!radicado) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.RADICADO_NO_ENCONTRADO());
      return;
    }
    const carrera = await carrerasService.buscarPorRadicado(radicado);
    if (!carrera || carrera.cliente.telefono !== telefono) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.RADICADO_NO_ENCONTRADO());
      return;
    }
    contexto.radicado = carrera.radicado;
    contexto.carreraId = carrera.id;
    await mensajeriaService.enviarMensajeConBotones(
      telefono,
      MENSAJES.CONFIRMAR_CANCELACION({ radicado: carrera.radicado, destino: carrera.direccionDestino }),
      [
        { id: 'confirmar_cancelar', title: '✅ Sí, cancelar' },
        { id: 'conservar_carrera', title: '❌ No' },
      ]
    );
    await this.actualizarConversacion(conversacionId, 'ESPERANDO_CONFIRMACION_CANCELACION', contexto);
  }

  private async manejarConfirmacionCancelacion(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (mensaje === 'confirmar_cancelar' || messageParser.esAfirmativo(mensaje)) {
      await carrerasService.cambiarEstado(contexto.carreraId!, 'CANCELADA', 'Cancelado por el cliente vía WhatsApp');
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.CARRERA_CANCELADA());
    } else {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.DESPEDIDA());
    }
    await this.finalizarConversacion(conversacionId);
  }

```

- [ ] **Step 4: Reemplazar `manejarCancelacionGlobal` para que primero revise si hay una carrera activa por cancelar**

Reemplazar:

```typescript
  private async manejarCancelacionGlobal(telefono: string) {
    const conv = await this.obtenerConversacionActiva(telefono);
    if (conv) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.DESPEDIDA());
      await this.finalizarConversacion(conv.id);
    }
  }
```

por:

```typescript
  private async manejarCancelacionGlobal(telefono: string) {
    const activas = await carrerasService.getActivasPorTelefono(telefono);

    if (activas.length === 0) {
      const conv = await this.obtenerConversacionActiva(telefono);
      if (conv) {
        await mensajeriaService.enviarMensaje(telefono, MENSAJES.DESPEDIDA());
        await this.finalizarConversacion(conv.id);
      }
      return;
    }

    const contexto: ConversationContext = {
      carrerasDisponibles: activas.map((c, i) => ({
        numero: i + 1, radicado: c.radicado, tipoServicio: c.tipoServicio, destino: c.direccionDestino,
      })),
    };

    await mensajeriaService.enviarMensajeConLista(telefono, '¿Cuál carrera deseas cancelar?', 'Ver carreras', [
      {
        title: 'Carreras activas',
        rows: activas.map(c => ({ id: `carrera_${c.radicado}`, title: c.radicado, description: c.direccionDestino.substring(0, 72) })),
      },
    ]);

    const conv = await this.obtenerConversacionActiva(telefono) || await this.crearConversacion(telefono);
    await this.actualizarConversacion(conv.id, 'ESPERANDO_SELECCION_CARRERA_CANCELAR', contexto);
  }
```

- [ ] **Step 5: Agregar la función exportada `limpiarConversacionesInactivas` al final del archivo**

Insertar después de `export const whatsappBotService = new WhatsAppBotService();`:

```typescript

export async function limpiarConversacionesInactivas() {
  const fechaLimite = new Date(Date.now() - botConfig.timeoutConversacion);
  const result = await prisma.conversacion.updateMany({
    where: { activa: true, lastActivity: { lt: fechaLimite } },
    data: { activa: false },
  });
  if (result.count > 0) console.log(`✅ ${result.count} conversaciones inactivas limpiadas`);
}
```

- [ ] **Step 6: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Probar el flujo completo con un script ad-hoc**

Reusar/crear `scratch-test.ts` en la raíz (no se commitea):

```typescript
import 'dotenv/config';
import { whatsappBotService } from './src/services/whatsapp/bot.service';

async function main() {
  const telefono = '573001112244';
  await whatsappBotService.procesarMensaje(telefono, 'Hola');
  await whatsappBotService.procesarMensaje(telefono, 'Ana Torres');
  await whatsappBotService.procesarMensaje(telefono, 'no');
  await whatsappBotService.procesarMensaje(telefono, 'tipo_domicilio', true, 'tipo_domicilio');
  await whatsappBotService.procesarMensaje(telefono, 'Cra 27 #45-12, Bucaramanga');
  await whatsappBotService.procesarMensaje(telefono, 'direccion_si', true, 'direccion_si');
  await whatsappBotService.procesarMensaje(telefono, 'Cll 36 #14-56, Bucaramanga');
  await whatsappBotService.procesarMensaje(telefono, 'direccion_si', true, 'direccion_si');
  await whatsappBotService.procesarMensaje(telefono, 'momento_ahora', true, 'momento_ahora');
  await whatsappBotService.procesarMensaje(telefono, 'precio_si', true, 'precio_si');
}
main();
```

Run: `npx ts-node scratch-test.ts`
Expected: sin excepciones no controladas en consola (los `console.error` de fallos de la API de WhatsApp/Radar por falta de credenciales reales son aceptables en esta prueba). Verificar con `npx prisma studio` que se creó una fila en `Carrera` con `estado = ASIGNADA` o `PENDIENTE_ASIGNACION`, `precio` y `distanciaKm` calculados, y que la `Conversacion` quedó en estado `ESPERANDO_ASIGNACION`. Borrar `scratch-test.ts` después.

- [ ] **Step 8: Commit**

```bash
git add src/services/whatsapp/bot.service.ts
git commit -m "feat: bot - momento, precio, confirmación de carrera y cancelación"
```

---

### Task 12: Webhook, auth y arranque del servidor (`app.ts`)

**Files:**
- Create: `src/middleware/auth.ts`
- Create: `src/routes/admin.routes.ts`
- Create: `src/controllers/webhook.controller.ts`
- Create: `src/routes/webhook.routes.ts`
- Create: `src/app.ts`

**Interfaces:**
- Consumes: `whatsappBotService`, `limpiarConversacionesInactivas` (Task 11); `mensajeriaService` (Task 8); `notificacionesService` (Task 10); `WhatsAppWebhookPayload` (Task 3).
- Produces: servidor Express arrancable (`npm run dev`). `verificarAdmin`/`generarToken` (Task 12) — usados por todas las rutas admin de las Tasks 13-15. `adminRoutes` router — se extiende (no se reemplaza) en las Tasks 13-15.

- [ ] **Step 1: Crear `src/middleware/auth.ts`**

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta configurar la variable de entorno ${name}`);
  }
  return value;
}

const JWT_SECRET = requireEnv('JWT_SECRET');

export function generarToken(): string {
  return jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '8h' });
}

export function verificarAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const token = authHeader.split(' ')[1];
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
```

- [ ] **Step 2: Crear `src/routes/admin.routes.ts` (solo login por ahora; se extiende en las Tasks 13-15)**

```typescript
import { Router, Request, Response } from 'express';
import { generarToken } from '../middleware/auth';

const router = Router();

router.post('/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USERNAME;
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminUser || !adminPass) {
    res.status(500).json({ error: 'ADMIN_USERNAME/ADMIN_PASSWORD no están configurados en el servidor' });
    return;
  }

  if (username === adminUser && password === adminPass) {
    res.json({ token: generarToken(), message: 'Login exitoso' });
  } else {
    res.status(401).json({ error: 'Credenciales incorrectas' });
  }
});

export default router;
```

- [ ] **Step 3: Crear `src/controllers/webhook.controller.ts`**

```typescript
import { Request, Response } from 'express';
import { WhatsAppWebhookPayload } from '../types';
import { whatsappBotService } from '../services/whatsapp/bot.service';
import { mensajeriaService } from '../services/mensajeria.service';
import { whatsappConfig } from '../config/whatsapp';

const mensajesProcesados = new Set<string>();

export class WebhookController {
  async verificar(req: Request, res: Response) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === whatsappConfig.verifyToken) {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }

  async recibirMensaje(req: Request, res: Response) {
    res.sendStatus(200);

    try {
      const body: WhatsAppWebhookPayload = req.body;
      if (body.object !== 'whatsapp_business_account') return;

      for (const entry of body.entry) {
        for (const change of entry.changes) {
          const value = change.value;
          if (value.messages) {
            for (const message of value.messages) {
              if (mensajesProcesados.has(message.id)) continue;
              mensajesProcesados.add(message.id);
              if (mensajesProcesados.size > 1000) mensajesProcesados.clear();

              this.procesarMensaje(message);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error procesando webhook:', error);
    }
  }

  private async procesarMensaje(message: any) {
    try {
      const telefono = message.from;

      if (message.type === 'text') {
        const texto = message.text?.body;
        if (texto) {
          await mensajeriaService.registrarEntrante(telefono, texto);
          await whatsappBotService.procesarMensaje(telefono, texto);
        }
      } else if (message.type === 'location' && message.location) {
        const { latitude, longitude } = message.location;
        await mensajeriaService.registrarEntrante(telefono, `📍 Ubicación compartida (${latitude}, ${longitude})`);
        await whatsappBotService.procesarMensaje(telefono, 'UBICACION_COMPARTIDA', false, undefined, { lat: latitude, lng: longitude });
      } else if (message.type === 'interactive') {
        const reply = message.interactive?.button_reply || message.interactive?.list_reply;
        if (reply) {
          await mensajeriaService.registrarEntrante(telefono, reply.title);
          await whatsappBotService.procesarMensaje(telefono, reply.id, true, reply.id);
        }
      }
    } catch (error) {
      console.error('Error procesando mensaje individual:', error);
    }
  }
}

export const webhookController = new WebhookController();
```

- [ ] **Step 4: Crear `src/routes/webhook.routes.ts`**

```typescript
import { Router } from 'express';
import { webhookController } from '../controllers/webhook.controller';

const router = Router();

router.get('/', (req, res) => webhookController.verificar(req, res));
router.post('/', (req, res) => webhookController.recibirMensaje(req, res));

export default router;
```

- [ ] **Step 5: Crear `src/app.ts`**

```typescript
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import cron from 'node-cron';

process.env.TZ = process.env.TZ || 'America/Bogota';

dotenv.config();

import webhookRoutes from './routes/webhook.routes';
import adminRoutes from './routes/admin.routes';
import { limpiarConversacionesInactivas } from './services/whatsapp/bot.service';
import { notificacionesService } from './services/notificaciones.service';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

const adminPanelEnabled = process.env.ADMIN_PANEL_ENABLED !== 'false';

if (adminPanelEnabled) {
  const adminPath = path.join(__dirname, 'admin');
  app.use('/admin', express.static(adminPath));
  app.get('/admin', (_req, res) => res.sendFile(path.join(adminPath, 'index.html')));
  app.get('/admin/*', (_req, res) => res.sendFile(path.join(adminPath, 'index.html')));
}

app.use('/webhook', webhookRoutes);

if (adminPanelEnabled) {
  app.use('/api/admin', adminRoutes);
}

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'mensajeria-bot' }));
app.get('/', (_req, res) => res.json({ message: '🛵 Serveloz Bot WhatsApp', panel: '/admin', webhook: '/webhook', health: '/health' }));

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
});

cron.schedule('*/5 * * * *', async () => {
  await limpiarConversacionesInactivas();
});

cron.schedule('* * * * *', async () => {
  await notificacionesService.avisarCarrerasProgramadas();
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📱 Webhook WhatsApp: http://localhost:${PORT}/webhook`);
  if (adminPanelEnabled) {
    console.log(`⚙️  Panel Admin: http://localhost:${PORT}/admin`);
  }
});

export default app;
```

- [ ] **Step 6: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Arrancar el servidor y probar el webhook end-to-end**

Run: `npm run dev`
Expected en consola: `🚀 Servidor corriendo en puerto 3000` (nota: `/admin` mostrará un error si se visita, porque `src/admin/index.html` aún no existe — se crea en la Task 16; no afecta al webhook).

En otra terminal:

```bash
curl http://localhost:3000/health
```
Expected: `{"status":"ok","timestamp":"...","service":"mensajeria-bot"}`

```bash
curl "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=un_token_secreto_que_tu_eliges&hub.challenge=1234"
```
Expected: `1234` (usar el mismo valor configurado en `WHATSAPP_VERIFY_TOKEN` del `.env`).

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "1",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {"display_phone_number": "570000000", "phone_number_id": "123"},
          "messages": [{"from": "573009998877", "id": "wamid.TEST1", "timestamp": "1700000000", "type": "text", "text": {"body": "Hola"}}]
        },
        "field": "messages"
      }]
    }]
  }'
```
Expected: respuesta HTTP inmediata (200, vacía). En los logs del servidor no debe verse ninguna excepción no controlada (los `console.error` de fallo de envío a la API de WhatsApp por falta de credenciales reales son aceptables). Verificar con `npx prisma studio` que se creó un `Cliente` con `telefono = "573009998877"`, una `Conversacion` en estado `ESPERANDO_NOMBRE`, y un `Mensaje` con `direccion = ENTRANTE`.

- [ ] **Step 8: Commit**

```bash
git add src/middleware src/routes src/controllers src/app.ts
git commit -m "feat: webhook de WhatsApp, autenticación admin y arranque del servidor"
```

---

### Task 13: API admin — dashboard y carreras

**Files:**
- Modify: `src/routes/admin.routes.ts` (creado en la Task 12)

**Interfaces:**
- Consumes: `carrerasService` (Task 6), `clientesService` (Task 6), `radarService` (Task 5), `notificacionesService` (Task 10), `verificarAdmin` (Task 12).
- Produces: endpoints `GET /api/admin/dashboard`, `GET /api/admin/carreras`, `POST /api/admin/carreras/manual`, `PUT /api/admin/carreras/:id/asignar`, `PUT /api/admin/carreras/:id/completar`, `PUT /api/admin/carreras/:id/pago`, `PUT /api/admin/carreras/:id/estado` — usados por el panel (Tasks 17-18).

- [ ] **Step 1: Agregar imports**

Reemplazar:

```typescript
import { Router, Request, Response } from 'express';
import { generarToken } from '../middleware/auth';

const router = Router();
```

por:

```typescript
import { Router, Request, Response } from 'express';
import { generarToken, verificarAdmin } from '../middleware/auth';
import { carrerasService } from '../services/carreras.service';
import { clientesService } from '../services/clientes.service';
import { radarService } from '../services/radar.service';
import { notificacionesService } from '../services/notificaciones.service';
import prisma from '../config/database';

const router = Router();
```

- [ ] **Step 2: Agregar las rutas de dashboard y carreras**

Insertar antes de `export default router;`:

```typescript
// ==================== DASHBOARD ====================
router.get('/dashboard', verificarAdmin, async (_req, res) => {
  try {
    const hoy = new Date();
    const inicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0);
    const finDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);

    const [carrerasHoy, carrerasPendientes, totalConductores, totalClientes] = await Promise.all([
      prisma.carrera.count({ where: { createdAt: { gte: inicioDia, lte: finDia } } }),
      prisma.carrera.count({ where: { estado: { in: ['PENDIENTE_ASIGNACION', 'ASIGNADA'] } } }),
      prisma.conductor.count({ where: { activo: true } }),
      prisma.cliente.count({ where: { activo: true } }),
    ]);

    res.json({ carrerasHoy, carrerasPendientes, totalConductores, totalClientes });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ==================== CARRERAS ====================
router.get('/carreras', verificarAdmin, async (req, res) => {
  try {
    const { estado, conductorId, clienteId } = req.query;
    const carreras = await carrerasService.getAll({
      estado: estado as string | undefined,
      conductorId: conductorId as string | undefined,
      clienteId: clienteId as string | undefined,
    });
    res.json(carreras);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/carreras/manual', verificarAdmin, async (req, res) => {
  try {
    const { clienteTelefono, clienteNombre, tipoServicio, direccionRecogida, direccionDestino, fechaHoraProgramada, conductorId } = req.body;

    const cliente = await clientesService.obtenerOCrear(clienteTelefono, clienteNombre);

    const recogida = await radarService.geocodificar(direccionRecogida);
    const destino = await radarService.geocodificar(direccionDestino);
    if (!recogida || !destino) {
      res.status(400).json({ error: 'No se pudo geocodificar la dirección de recogida o destino' });
      return;
    }

    const distanciaKm = await radarService.calcularDistanciaKm(
      { lat: recogida.lat, lng: recogida.lng },
      { lat: destino.lat, lng: destino.lng }
    );

    const carrera = await carrerasService.create({
      clienteId: cliente!.id,
      tipoServicio,
      direccionRecogida: recogida.direccionFormateada,
      recogidaLat: recogida.lat,
      recogidaLng: recogida.lng,
      direccionDestino: destino.direccionFormateada,
      destinoLat: destino.lat,
      destinoLng: destino.lng,
      distanciaKm,
      fechaHoraProgramada: fechaHoraProgramada ? new Date(fechaHoraProgramada) : null,
      origen: 'PANEL',
      conductorId: conductorId || undefined,
    });

    if (conductorId) {
      try { await notificacionesService.notificarAsignacion(carrera.id); } catch (e) { console.error('Error notificando asignación:', e); }
    }

    res.status(201).json(carrera);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put('/carreras/:id/asignar', verificarAdmin, async (req, res) => {
  try {
    const carrera = await carrerasService.asignarConductor(req.params.id, req.body.conductorId);
    try { await notificacionesService.notificarAsignacion(carrera.id); } catch (e) { console.error('Error notificando asignación:', e); }
    res.json(carrera);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put('/carreras/:id/completar', verificarAdmin, async (req, res) => {
  try {
    const { carrera, referidorNotificar } = await carrerasService.marcarCompletada(req.params.id);
    try { await notificacionesService.notificarCierre(carrera.id, referidorNotificar?.telefono); } catch (e) { console.error('Error notificando cierre:', e); }
    res.json(carrera);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put('/carreras/:id/pago', verificarAdmin, async (req, res) => {
  try {
    const carrera = await carrerasService.actualizarEstadoPago(req.params.id, req.body.estadoPago);
    res.json(carrera);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put('/carreras/:id/estado', verificarAdmin, async (req, res) => {
  try {
    const carrera = await carrerasService.cambiarEstado(req.params.id, req.body.estado, req.body.motivoCancelacion);
    res.json(carrera);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Probar con curl (requiere el servidor corriendo, `npm run dev`)**

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")

curl -s http://localhost:3000/api/admin/dashboard -H "Authorization: Bearer $TOKEN"
```
Expected: JSON con `{ carrerasHoy, carrerasPendientes, totalConductores, totalClientes }`.

- [ ] **Step 5: Commit**

```bash
git add src/routes/admin.routes.ts
git commit -m "feat: API admin - dashboard y gestión de carreras"
```

---

### Task 14: API admin — conductores, clientes y configuración de tarifas

**Files:**
- Modify: `src/routes/admin.routes.ts` (Task 12/13)

**Interfaces:**
- Consumes: `conductoresService` (Task 6), `clientesService` (Task 6), `configuracionService` (Task 6), `verificarAdmin` (Task 12).
- Produces: endpoints `GET/POST /api/admin/conductores`, `PUT/DELETE /api/admin/conductores/:id`, `GET /api/admin/clientes`, `PUT /api/admin/clientes/:id`, `GET/PUT /api/admin/config` — usados por el panel (Task 18).

- [ ] **Step 1: Agregar imports**

Reemplazar:

```typescript
import { Router, Request, Response } from 'express';
import { generarToken, verificarAdmin } from '../middleware/auth';
import { carrerasService } from '../services/carreras.service';
import { clientesService } from '../services/clientes.service';
import { radarService } from '../services/radar.service';
import { notificacionesService } from '../services/notificaciones.service';
import prisma from '../config/database';

const router = Router();
```

por:

```typescript
import { Router, Request, Response } from 'express';
import { generarToken, verificarAdmin } from '../middleware/auth';
import { carrerasService } from '../services/carreras.service';
import { clientesService } from '../services/clientes.service';
import { conductoresService } from '../services/conductores.service';
import { configuracionService } from '../services/configuracion.service';
import { radarService } from '../services/radar.service';
import { notificacionesService } from '../services/notificaciones.service';
import prisma from '../config/database';

const router = Router();
```

- [ ] **Step 2: Agregar las rutas de conductores, clientes y configuración**

Insertar antes de `export default router;`:

```typescript
// ==================== CONDUCTORES ====================
router.get('/conductores', verificarAdmin, async (_req, res) => {
  try {
    const conductores = await conductoresService.getAll();
    res.json(conductores);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/conductores', verificarAdmin, async (req, res) => {
  try {
    const conductor = await conductoresService.create(req.body);
    res.status(201).json(conductor);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put('/conductores/:id', verificarAdmin, async (req, res) => {
  try {
    const conductor = await conductoresService.update(req.params.id, req.body);
    res.json(conductor);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete('/conductores/:id', verificarAdmin, async (req, res) => {
  try {
    await conductoresService.delete(req.params.id);
    res.json({ message: 'Conductor desactivado' });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ==================== CLIENTES ====================
router.get('/clientes', verificarAdmin, async (req, res) => {
  try {
    const { search } = req.query;
    const clientes = await clientesService.getAll(search as string | undefined);
    res.json(clientes);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/clientes/:id', verificarAdmin, async (req, res) => {
  try {
    const cliente = await clientesService.update(req.params.id, req.body);
    res.json(cliente);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ==================== CONFIGURACIÓN ====================
router.get('/config', verificarAdmin, async (_req, res) => {
  try {
    const config = await configuracionService.obtener();
    res.json(config);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/config', verificarAdmin, async (req, res) => {
  try {
    const config = await configuracionService.actualizar(req.body);
    res.json(config);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Probar con curl**

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")

curl -s -X POST http://localhost:3000/api/admin/conductores \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"nombre":"Pedro Gómez","telefono":"573001234567"}'

curl -s http://localhost:3000/api/admin/conductores -H "Authorization: Bearer $TOKEN"
```
Expected: el segundo `curl` devuelve un arreglo JSON con el conductor "Pedro Gómez" recién creado.

- [ ] **Step 5: Commit**

```bash
git add src/routes/admin.routes.ts
git commit -m "feat: API admin - conductores, clientes y configuración de tarifas"
```

---

### Task 15: API admin — conversaciones (chat manual)

**Files:**
- Modify: `src/routes/admin.routes.ts` (Tasks 12-14)

**Interfaces:**
- Consumes: `prisma` (ya importado), `whatsappMessagesService` (Task 4), `mensajeriaService` (Task 8), `verificarAdmin` (Task 12).
- Produces: endpoints `GET /api/admin/conversaciones`, `GET /api/admin/conversaciones/:telefono/mensajes`, `POST /api/admin/conversaciones/:telefono/mensajes`, `PUT /api/admin/conversaciones/:telefono/modo` — usados por el panel (Task 19).

- [ ] **Step 1: Agregar imports**

Reemplazar:

```typescript
import { conductoresService } from '../services/conductores.service';
import { configuracionService } from '../services/configuracion.service';
import { radarService } from '../services/radar.service';
import { notificacionesService } from '../services/notificaciones.service';
import prisma from '../config/database';

const router = Router();
```

por:

```typescript
import { conductoresService } from '../services/conductores.service';
import { configuracionService } from '../services/configuracion.service';
import { radarService } from '../services/radar.service';
import { notificacionesService } from '../services/notificaciones.service';
import { whatsappMessagesService } from '../services/whatsapp/messages.service';
import { mensajeriaService } from '../services/mensajeria.service';
import prisma from '../config/database';

const router = Router();
```

- [ ] **Step 2: Agregar las rutas de conversaciones**

Insertar antes de `export default router;`:

```typescript
// ==================== CONVERSACIONES (CHAT MANUAL) ====================
router.get('/conversaciones', verificarAdmin, async (_req, res) => {
  try {
    const ultimosMensajes = await prisma.mensaje.groupBy({ by: ['telefono'], _max: { timestamp: true } });
    const telefonos = ultimosMensajes
      .sort((a, b) => (b._max.timestamp?.getTime() || 0) - (a._max.timestamp?.getTime() || 0))
      .map(m => m.telefono);

    const conversaciones = await Promise.all(telefonos.map(async telefono => {
      const [cliente, conversacion, ultimoMensaje] = await Promise.all([
        prisma.cliente.findUnique({ where: { telefono } }),
        prisma.conversacion.findFirst({ where: { telefono, activa: true } }),
        prisma.mensaje.findFirst({ where: { telefono }, orderBy: { timestamp: 'desc' } }),
      ]);
      return {
        telefono,
        clienteNombre: cliente?.nombre || telefono,
        modoManual: conversacion?.modoManual || false,
        ultimoMensaje: ultimoMensaje?.contenido || '',
        ultimoMensajeFecha: ultimoMensaje?.timestamp || null,
      };
    }));

    res.json(conversaciones);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/conversaciones/:telefono/mensajes', verificarAdmin, async (req, res) => {
  try {
    const { desde } = req.query;
    const where: any = { telefono: req.params.telefono };
    if (desde) where.timestamp = { gt: new Date(desde as string) };
    const mensajes = await prisma.mensaje.findMany({ where, orderBy: { timestamp: 'asc' } });
    res.json(mensajes);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/conversaciones/:telefono/mensajes', verificarAdmin, async (req, res) => {
  try {
    const telefono = req.params.telefono;
    const { contenido } = req.body;

    const ultimoEntrante = await prisma.mensaje.findFirst({
      where: { telefono, direccion: 'ENTRANTE' },
      orderBy: { timestamp: 'desc' },
    });
    const dentroDeVentana = !!ultimoEntrante && (Date.now() - ultimoEntrante.timestamp.getTime()) < 24 * 60 * 60 * 1000;
    if (!dentroDeVentana) {
      res.status(400).json({ error: 'Han pasado más de 24h desde el último mensaje del cliente. Se necesita una plantilla pre-aprobada para escribirle.' });
      return;
    }

    await whatsappMessagesService.enviarMensaje(telefono, contenido);
    await mensajeriaService.registrarSaliente(telefono, contenido, 'DUEÑO');

    const conversacion = await prisma.conversacion.findFirst({ where: { telefono, activa: true } });
    if (conversacion) {
      await prisma.conversacion.update({ where: { id: conversacion.id }, data: { modoManual: true } });
    }

    res.status(201).json({ message: 'Mensaje enviado' });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put('/conversaciones/:telefono/modo', verificarAdmin, async (req, res) => {
  try {
    const conversacion = await prisma.conversacion.findFirst({ where: { telefono: req.params.telefono, activa: true } });
    if (!conversacion) {
      res.status(404).json({ error: 'No hay una conversación activa para este teléfono' });
      return;
    }
    const actualizada = await prisma.conversacion.update({
      where: { id: conversacion.id },
      data: { modoManual: !!req.body.modoManual },
    });
    res.json(actualizada);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Probar con curl (usar un teléfono que ya haya escrito, ej. el de la Task 12 Step 7)**

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")

curl -s http://localhost:3000/api/admin/conversaciones -H "Authorization: Bearer $TOKEN"
```
Expected: arreglo JSON con el teléfono `573009998877` (o el que se haya usado en pruebas previas), incluyendo `ultimoMensaje` y `modoManual: false`.

- [ ] **Step 5: Commit**

```bash
git add src/routes/admin.routes.ts
git commit -m "feat: API admin - conversaciones y chat manual"
```

---

### Task 16: Panel admin — login, layout y dashboard

**Files:**
- Create: `src/admin/js/auth.js`
- Create: `src/admin/index.html`
- Create: `src/admin/dashboard.html`

**Interfaces:**
- Produces: funciones globales `requireAuth()`, `logout()`, `authFetch(url, options)` (definidas en `auth.js`, cargadas vía `<script src="/admin/js/auth.js">`) — usadas por todas las páginas del panel de las Tasks 17-19. El token JWT se guarda en `localStorage` bajo la clave `token`.

- [ ] **Step 1: Crear `src/admin/js/auth.js`**

```javascript
function getToken() {
  return localStorage.getItem('token');
}

function requireAuth() {
  if (!getToken()) {
    window.location.href = '/admin/index.html';
  }
}

function logout() {
  localStorage.removeItem('token');
  window.location.href = '/admin/index.html';
}

async function authFetch(url, options = {}) {
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    logout();
    throw new Error('No autorizado');
  }
  return response;
}
```

- [ ] **Step 2: Crear `src/admin/index.html` (login)**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🛵 Serveloz - Panel Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 text-white min-h-screen flex items-center justify-center">
  <div class="bg-gray-800 rounded-xl p-8 border border-gray-700 w-full max-w-sm">
    <h1 class="text-2xl font-bold text-center mb-6">🛵 Serveloz</h1>
    <form id="loginForm" class="space-y-4">
      <div>
        <label class="block text-sm text-gray-400 mb-1">Usuario</label>
        <input id="username" type="text" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2" required>
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-1">Contraseña</label>
        <input id="password" type="password" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2" required>
      </div>
      <button type="submit" class="w-full bg-amber-500 hover:bg-amber-600 text-gray-900 font-semibold rounded-lg py-2">Ingresar</button>
      <p id="error" class="text-red-400 text-sm hidden"></p>
    </form>
  </div>

  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      const errorEl = document.getElementById('error');
      errorEl.classList.add('hidden');

      try {
        const response = await fetch('/api/admin/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error de autenticación');
        localStorage.setItem('token', data.token);
        window.location.href = '/admin/dashboard.html';
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
      }
    });
  </script>
</body>
</html>
```

- [ ] **Step 3: Crear `src/admin/dashboard.html`**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🛵 Dashboard - Serveloz Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 text-white min-h-screen">
  <nav class="bg-gray-800 border-b border-gray-700">
    <div class="px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="text-2xl">🛵</span>
        <span class="font-bold text-lg text-amber-400">Serveloz</span>
      </div>
      <div class="hidden md:flex items-center gap-4">
        <a href="/admin/dashboard.html" class="text-amber-400 font-medium">Inicio</a>
        <a href="/admin/carreras.html" class="text-gray-300 hover:text-white">Carreras</a>
        <a href="/admin/conductores.html" class="text-gray-300 hover:text-white">Conductores</a>
        <a href="/admin/clientes.html" class="text-gray-300 hover:text-white">Clientes</a>
        <a href="/admin/conversaciones.html" class="text-gray-300 hover:text-white">Conversaciones</a>
        <a href="/admin/config.html" class="text-gray-300 hover:text-white">Configuración</a>
        <button onclick="logout()" class="text-red-400 hover:text-red-300 text-sm">Salir</button>
      </div>
    </div>
  </nav>

  <main class="max-w-6xl mx-auto px-6 py-8">
    <h1 class="text-2xl font-bold mb-6">Panel Principal</h1>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div class="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div class="text-3xl font-bold text-amber-400" id="carrerasHoy">--</div>
        <div class="text-gray-400 text-sm mt-1">Carreras hoy</div>
      </div>
      <div class="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div class="text-3xl font-bold text-green-400" id="carrerasPendientes">--</div>
        <div class="text-gray-400 text-sm mt-1">Carreras pendientes</div>
      </div>
      <div class="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div class="text-3xl font-bold text-blue-400" id="totalConductores">--</div>
        <div class="text-gray-400 text-sm mt-1">Conductores activos</div>
      </div>
      <div class="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div class="text-3xl font-bold text-purple-400" id="totalClientes">--</div>
        <div class="text-gray-400 text-sm mt-1">Clientes registrados</div>
      </div>
    </div>

    <div class="bg-gray-800 rounded-xl border border-gray-700 p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">Carreras pendientes de asignar</h2>
        <a href="/admin/carreras.html" class="text-amber-400 text-sm hover:underline">Ver todas →</a>
      </div>
      <div id="listaCarreras" class="space-y-3">
        <div class="text-gray-500 text-sm">Cargando...</div>
      </div>
    </div>
  </main>

  <script src="/admin/js/auth.js"></script>
  <script>
    requireAuth();

    async function cargarDashboard() {
      const stats = await (await authFetch('/api/admin/dashboard')).json();
      document.getElementById('carrerasHoy').textContent = stats.carrerasHoy;
      document.getElementById('carrerasPendientes').textContent = stats.carrerasPendientes;
      document.getElementById('totalConductores').textContent = stats.totalConductores;
      document.getElementById('totalClientes').textContent = stats.totalClientes;

      const carreras = await (await authFetch('/api/admin/carreras?estado=PENDIENTE_ASIGNACION')).json();
      const cont = document.getElementById('listaCarreras');
      cont.innerHTML = carreras.length === 0
        ? '<div class="text-gray-500 text-sm">No hay carreras pendientes.</div>'
        : carreras.map(c => `
          <div class="flex justify-between items-center bg-gray-900 rounded-lg px-4 py-3">
            <div>
              <div class="font-medium">${c.radicado} — ${c.cliente.nombre}</div>
              <div class="text-gray-400 text-sm">${c.direccionRecogida} → ${c.direccionDestino}</div>
            </div>
            <div class="text-amber-400 font-semibold">$${c.precio.toLocaleString('es-CO')}</div>
          </div>
        `).join('');
    }

    cargarDashboard();
  </script>
</body>
</html>
```

- [ ] **Step 4: Compilar y copiar assets, luego probar en el navegador**

Run: `npm run build && npm start`
(o mantener `npm run dev` corriendo, que sirve directo desde `src/admin`).

Abrir `http://localhost:3000/admin` en el navegador. Expected: aparece el formulario de login. Ingresar `admin`/`admin` (o los valores de `ADMIN_USERNAME`/`ADMIN_PASSWORD` del `.env`) y verificar que redirige a `dashboard.html` mostrando las 4 tarjetas de estadísticas con números reales (no `--`).

- [ ] **Step 5: Commit**

```bash
git add src/admin/js/auth.js src/admin/index.html src/admin/dashboard.html
git commit -m "feat: panel admin - login, layout y dashboard"
```

---

### Task 17: Panel admin — carreras (asignar, completar, pago) y carrera manual

**Files:**
- Create: `src/admin/carreras.html`

**Interfaces:**
- Consumes: `authFetch`, `requireAuth`, `logout` (Task 16); endpoints de la Task 13 (`GET/POST /api/admin/carreras*`) y Task 14 (`GET /api/admin/conductores`).

- [ ] **Step 1: Crear `src/admin/carreras.html`**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🛵 Carreras - Serveloz Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 text-white min-h-screen">
  <nav class="bg-gray-800 border-b border-gray-700">
    <div class="px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="text-2xl">🛵</span>
        <span class="font-bold text-lg text-amber-400">Serveloz</span>
      </div>
      <div class="hidden md:flex items-center gap-4">
        <a href="/admin/dashboard.html" class="text-gray-300 hover:text-white">Inicio</a>
        <a href="/admin/carreras.html" class="text-amber-400 font-medium">Carreras</a>
        <a href="/admin/conductores.html" class="text-gray-300 hover:text-white">Conductores</a>
        <a href="/admin/clientes.html" class="text-gray-300 hover:text-white">Clientes</a>
        <a href="/admin/conversaciones.html" class="text-gray-300 hover:text-white">Conversaciones</a>
        <a href="/admin/config.html" class="text-gray-300 hover:text-white">Configuración</a>
        <button onclick="logout()" class="text-red-400 hover:text-red-300 text-sm">Salir</button>
      </div>
    </div>
  </nav>

  <main class="max-w-6xl mx-auto px-6 py-8">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">Carreras</h1>
      <button onclick="abrirModalManual()" class="bg-amber-500 hover:bg-amber-600 text-gray-900 font-semibold rounded-lg px-4 py-2">+ Nueva carrera manual</button>
    </div>

    <div class="flex gap-2 mb-4" id="filtros">
      <button data-estado="" class="filtro-btn bg-amber-500 text-gray-900 px-3 py-1 rounded-lg text-sm font-medium">Todas</button>
      <button data-estado="PENDIENTE_ASIGNACION" class="filtro-btn bg-gray-800 px-3 py-1 rounded-lg text-sm">Pendientes</button>
      <button data-estado="ASIGNADA" class="filtro-btn bg-gray-800 px-3 py-1 rounded-lg text-sm">Asignadas</button>
      <button data-estado="COMPLETADA" class="filtro-btn bg-gray-800 px-3 py-1 rounded-lg text-sm">Completadas</button>
      <button data-estado="CANCELADA" class="filtro-btn bg-gray-800 px-3 py-1 rounded-lg text-sm">Canceladas</button>
    </div>

    <div id="listaCarreras" class="space-y-3">
      <div class="text-gray-500 text-sm">Cargando...</div>
    </div>
  </main>

  <div id="modalManual" class="hidden fixed inset-0 bg-black/60 flex items-center justify-center p-4">
    <div class="bg-gray-800 rounded-xl border border-gray-700 p-6 w-full max-w-md">
      <h2 class="text-lg font-semibold mb-4">Nueva carrera manual</h2>
      <form id="formManual" class="space-y-3">
        <input id="m_clienteTelefono" placeholder="Teléfono del cliente" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2" required>
        <input id="m_clienteNombre" placeholder="Nombre del cliente" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2" required>
        <select id="m_tipoServicio" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
          <option value="DOMICILIO">Domicilio</option>
          <option value="MOTOTAXI">Mototaxi</option>
        </select>
        <input id="m_recogida" placeholder="Dirección de recogida" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2" required>
        <input id="m_destino" placeholder="Dirección de destino" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2" required>
        <input id="m_fechaProgramada" type="datetime-local" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
        <select id="m_conductorId" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
          <option value="">Sin asignar todavía</option>
        </select>
        <p id="m_error" class="text-red-400 text-sm hidden"></p>
        <div class="flex gap-2 justify-end pt-2">
          <button type="button" onclick="cerrarModalManual()" class="px-4 py-2 rounded-lg text-gray-300">Cancelar</button>
          <button type="submit" class="bg-amber-500 hover:bg-amber-600 text-gray-900 font-semibold rounded-lg px-4 py-2">Crear</button>
        </div>
      </form>
    </div>
  </div>

  <script src="/admin/js/auth.js"></script>
  <script>
    requireAuth();
    let filtroActual = '';

    async function cargarConductoresSelect() {
      const conductores = await (await authFetch('/api/admin/conductores')).json();
      const select = document.getElementById('m_conductorId');
      select.innerHTML = '<option value="">Sin asignar todavía</option>' +
        conductores.filter(c => c.activo).map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
      return conductores;
    }

    function abrirModalManual() {
      document.getElementById('modalManual').classList.remove('hidden');
      cargarConductoresSelect();
    }
    function cerrarModalManual() {
      document.getElementById('modalManual').classList.add('hidden');
      document.getElementById('formManual').reset();
      document.getElementById('m_error').classList.add('hidden');
    }

    document.getElementById('formManual').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('m_error');
      errorEl.classList.add('hidden');
      const fechaProgramada = document.getElementById('m_fechaProgramada').value;
      try {
        const response = await authFetch('/api/admin/carreras/manual', {
          method: 'POST',
          body: JSON.stringify({
            clienteTelefono: document.getElementById('m_clienteTelefono').value,
            clienteNombre: document.getElementById('m_clienteNombre').value,
            tipoServicio: document.getElementById('m_tipoServicio').value,
            direccionRecogida: document.getElementById('m_recogida').value,
            direccionDestino: document.getElementById('m_destino').value,
            fechaHoraProgramada: fechaProgramada ? new Date(fechaProgramada).toISOString() : null,
            conductorId: document.getElementById('m_conductorId').value || null,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error creando la carrera');
        cerrarModalManual();
        cargarCarreras();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
      }
    });

    document.querySelectorAll('.filtro-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filtro-btn').forEach(b => b.className = 'filtro-btn bg-gray-800 px-3 py-1 rounded-lg text-sm');
        btn.className = 'filtro-btn bg-amber-500 text-gray-900 px-3 py-1 rounded-lg text-sm font-medium';
        filtroActual = btn.dataset.estado;
        cargarCarreras();
      });
    });

    async function asignarConductor(carreraId, conductorId) {
      if (!conductorId) return;
      await authFetch(`/api/admin/carreras/${carreraId}/asignar`, { method: 'PUT', body: JSON.stringify({ conductorId }) });
      cargarCarreras();
    }

    async function marcarCompletada(carreraId) {
      await authFetch(`/api/admin/carreras/${carreraId}/completar`, { method: 'PUT' });
      cargarCarreras();
    }

    async function togglePago(carreraId, estadoPagoActual) {
      const nuevo = estadoPagoActual === 'PAGADO' ? 'PENDIENTE' : 'PAGADO';
      await authFetch(`/api/admin/carreras/${carreraId}/pago`, { method: 'PUT', body: JSON.stringify({ estadoPago: nuevo }) });
      cargarCarreras();
    }

    async function cargarCarreras() {
      const conductores = await cargarConductoresSelect();
      const url = filtroActual ? `/api/admin/carreras?estado=${filtroActual}` : '/api/admin/carreras';
      const carreras = await (await authFetch(url)).json();
      const cont = document.getElementById('listaCarreras');

      cont.innerHTML = carreras.length === 0
        ? '<div class="text-gray-500 text-sm">No hay carreras con este filtro.</div>'
        : carreras.map(c => `
          <div class="bg-gray-800 rounded-xl border border-gray-700 p-4">
            <div class="flex justify-between items-start mb-2">
              <div>
                <div class="font-medium">${c.radicado} — ${c.cliente.nombre} (${c.cliente.telefono})</div>
                <div class="text-gray-400 text-sm">${c.tipoServicio} · ${c.direccionRecogida} → ${c.direccionDestino}</div>
                <div class="text-gray-400 text-sm">${c.distanciaKm.toFixed(1)} km · $${c.precio.toLocaleString('es-CO')} · Pago: ${c.estadoPago}</div>
              </div>
              <span class="text-xs px-2 py-1 rounded-full bg-gray-900 border border-gray-700">${c.estado}</span>
            </div>
            <div class="flex flex-wrap gap-2 items-center mt-2">
              ${c.estado === 'PENDIENTE_ASIGNACION' ? `
                <select id="sel_${c.id}" class="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-sm">
                  <option value="">Elegir conductor...</option>
                  ${conductores.filter(cd => cd.activo).map(cd => `<option value="${cd.id}">${cd.nombre}</option>`).join('')}
                </select>
                <button onclick="asignarConductor('${c.id}', document.getElementById('sel_${c.id}').value)" class="bg-amber-500 hover:bg-amber-600 text-gray-900 text-sm font-medium rounded-lg px-3 py-1">Asignar</button>
              ` : ''}
              ${c.estado === 'ASIGNADA' ? `
                <span class="text-sm text-gray-300">Conductor: ${c.conductor ? c.conductor.nombre : '—'}</span>
                <button onclick="marcarCompletada('${c.id}')" class="bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg px-3 py-1">Marcar completada</button>
              ` : ''}
              ${['ASIGNADA', 'COMPLETADA'].includes(c.estado) ? `
                <button onclick="togglePago('${c.id}', '${c.estadoPago}')" class="text-sm rounded-lg px-3 py-1 border border-gray-700">${c.estadoPago === 'PAGADO' ? 'Marcar pendiente' : 'Marcar pagado'}</button>
              ` : ''}
            </div>
          </div>
        `).join('');
    }

    cargarCarreras();
  </script>
</body>
</html>
```

- [ ] **Step 2: Probar en el navegador**

Con el servidor corriendo, abrir `http://localhost:3000/admin/carreras.html`. Expected: lista las carreras creadas en pruebas anteriores (Tasks 11-12). Probar:
1. Click en "+ Nueva carrera manual", llenar el formulario con un teléfono/nombre nuevo y dos direcciones reales de Bucaramanga, click "Crear". Expected: el modal se cierra y aparece la nueva carrera en la lista con precio y distancia calculados (requiere `RADAR_API_KEY` real).
2. En una carrera `PENDIENTE_ASIGNACION`, elegir un conductor del select y click "Asignar". Expected: la carrera pasa a estado `ASIGNADA` y muestra el nombre del conductor.
3. Click "Marcar completada". Expected: la carrera pasa a `COMPLETADA`.
4. Click "Marcar pagado"/"Marcar pendiente". Expected: el texto del botón cambia y refleja el nuevo estado de pago.

- [ ] **Step 3: Commit**

```bash
git add src/admin/carreras.html
git commit -m "feat: panel admin - gestión de carreras y creación manual"
```

---

### Task 18: Panel admin — conductores, clientes y configuración

**Files:**
- Create: `src/admin/conductores.html`
- Create: `src/admin/clientes.html`
- Create: `src/admin/config.html`

**Interfaces:**
- Consumes: `authFetch`, `requireAuth`, `logout` (Task 16); endpoints de la Task 14 (`GET/POST/PUT /api/admin/conductores*`, `GET/PUT /api/admin/clientes*`, `GET/PUT /api/admin/config`).

- [ ] **Step 1: Crear `src/admin/conductores.html`**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🛵 Conductores - Serveloz Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 text-white min-h-screen">
  <nav class="bg-gray-800 border-b border-gray-700">
    <div class="px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="text-2xl">🛵</span>
        <span class="font-bold text-lg text-amber-400">Serveloz</span>
      </div>
      <div class="hidden md:flex items-center gap-4">
        <a href="/admin/dashboard.html" class="text-gray-300 hover:text-white">Inicio</a>
        <a href="/admin/carreras.html" class="text-gray-300 hover:text-white">Carreras</a>
        <a href="/admin/conductores.html" class="text-amber-400 font-medium">Conductores</a>
        <a href="/admin/clientes.html" class="text-gray-300 hover:text-white">Clientes</a>
        <a href="/admin/conversaciones.html" class="text-gray-300 hover:text-white">Conversaciones</a>
        <a href="/admin/config.html" class="text-gray-300 hover:text-white">Configuración</a>
        <button onclick="logout()" class="text-red-400 hover:text-red-300 text-sm">Salir</button>
      </div>
    </div>
  </nav>

  <main class="max-w-4xl mx-auto px-6 py-8">
    <h1 class="text-2xl font-bold mb-6">Conductores</h1>

    <form id="formNuevo" class="flex flex-wrap gap-2 mb-6">
      <input id="n_nombre" placeholder="Nombre" class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 flex-1 min-w-[160px]" required>
      <input id="n_telefono" placeholder="Teléfono (573001234567)" class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 flex-1 min-w-[160px]" required>
      <button type="submit" class="bg-amber-500 hover:bg-amber-600 text-gray-900 font-semibold rounded-lg px-4 py-2">+ Agregar</button>
    </form>

    <div id="lista" class="space-y-2">
      <div class="text-gray-500 text-sm">Cargando...</div>
    </div>
  </main>

  <script src="/admin/js/auth.js"></script>
  <script>
    requireAuth();

    document.getElementById('formNuevo').addEventListener('submit', async (e) => {
      e.preventDefault();
      await authFetch('/api/admin/conductores', {
        method: 'POST',
        body: JSON.stringify({
          nombre: document.getElementById('n_nombre').value,
          telefono: document.getElementById('n_telefono').value,
        }),
      });
      document.getElementById('formNuevo').reset();
      cargar();
    });

    async function toggleActivo(id, activoActual) {
      await authFetch(`/api/admin/conductores/${id}`, { method: 'PUT', body: JSON.stringify({ activo: !activoActual }) });
      cargar();
    }

    async function cargar() {
      const conductores = await (await authFetch('/api/admin/conductores')).json();
      document.getElementById('lista').innerHTML = conductores.map(c => `
        <div class="flex justify-between items-center bg-gray-800 rounded-lg px-4 py-3 border border-gray-700">
          <div>
            <div class="font-medium">${c.nombre}</div>
            <div class="text-gray-400 text-sm">${c.telefono}</div>
          </div>
          <button onclick="toggleActivo('${c.id}', ${c.activo})" class="text-sm rounded-lg px-3 py-1 border ${c.activo ? 'border-green-600 text-green-400' : 'border-gray-600 text-gray-500'}">
            ${c.activo ? 'Activo' : 'Inactivo'}
          </button>
        </div>
      `).join('');
    }

    cargar();
  </script>
</body>
</html>
```

- [ ] **Step 2: Crear `src/admin/clientes.html`**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🛵 Clientes - Serveloz Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 text-white min-h-screen">
  <nav class="bg-gray-800 border-b border-gray-700">
    <div class="px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="text-2xl">🛵</span>
        <span class="font-bold text-lg text-amber-400">Serveloz</span>
      </div>
      <div class="hidden md:flex items-center gap-4">
        <a href="/admin/dashboard.html" class="text-gray-300 hover:text-white">Inicio</a>
        <a href="/admin/carreras.html" class="text-gray-300 hover:text-white">Carreras</a>
        <a href="/admin/conductores.html" class="text-gray-300 hover:text-white">Conductores</a>
        <a href="/admin/clientes.html" class="text-amber-400 font-medium">Clientes</a>
        <a href="/admin/conversaciones.html" class="text-gray-300 hover:text-white">Conversaciones</a>
        <a href="/admin/config.html" class="text-gray-300 hover:text-white">Configuración</a>
        <button onclick="logout()" class="text-red-400 hover:text-red-300 text-sm">Salir</button>
      </div>
    </div>
  </nav>

  <main class="max-w-4xl mx-auto px-6 py-8">
    <h1 class="text-2xl font-bold mb-6">Clientes</h1>

    <input id="buscar" placeholder="Buscar por nombre o teléfono..." class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-4">

    <div id="lista" class="space-y-2">
      <div class="text-gray-500 text-sm">Cargando...</div>
    </div>
  </main>

  <script src="/admin/js/auth.js"></script>
  <script>
    requireAuth();

    async function cargar(search = '') {
      const url = search ? `/api/admin/clientes?search=${encodeURIComponent(search)}` : '/api/admin/clientes';
      const clientes = await (await authFetch(url)).json();
      document.getElementById('lista').innerHTML = clientes.length === 0
        ? '<div class="text-gray-500 text-sm">Sin resultados.</div>'
        : clientes.map(c => `
          <div class="bg-gray-800 rounded-lg px-4 py-3 border border-gray-700">
            <div class="font-medium">${c.nombre}</div>
            <div class="text-gray-400 text-sm">${c.telefono}</div>
            ${c.descuentosDisponibles > 0 ? `<div class="text-amber-400 text-sm mt-1">🎉 ${c.descuentosDisponibles} descuento(s) de 20% disponible(s)</div>` : ''}
          </div>
        `).join('');
    }

    let timeout;
    document.getElementById('buscar').addEventListener('input', (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => cargar(e.target.value), 300);
    });

    cargar();
  </script>
</body>
</html>
```

- [ ] **Step 3: Crear `src/admin/config.html`**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🛵 Configuración - Serveloz Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 text-white min-h-screen">
  <nav class="bg-gray-800 border-b border-gray-700">
    <div class="px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="text-2xl">🛵</span>
        <span class="font-bold text-lg text-amber-400">Serveloz</span>
      </div>
      <div class="hidden md:flex items-center gap-4">
        <a href="/admin/dashboard.html" class="text-gray-300 hover:text-white">Inicio</a>
        <a href="/admin/carreras.html" class="text-gray-300 hover:text-white">Carreras</a>
        <a href="/admin/conductores.html" class="text-gray-300 hover:text-white">Conductores</a>
        <a href="/admin/clientes.html" class="text-gray-300 hover:text-white">Clientes</a>
        <a href="/admin/conversaciones.html" class="text-gray-300 hover:text-white">Conversaciones</a>
        <a href="/admin/config.html" class="text-amber-400 font-medium">Configuración</a>
        <button onclick="logout()" class="text-red-400 hover:text-red-300 text-sm">Salir</button>
      </div>
    </div>
  </nav>

  <main class="max-w-md mx-auto px-6 py-8">
    <h1 class="text-2xl font-bold mb-6">Configuración de tarifas</h1>

    <form id="form" class="space-y-4 bg-gray-800 rounded-xl border border-gray-700 p-6">
      <div>
        <label class="block text-sm text-gray-400 mb-1">Tarifa base ($)</label>
        <input id="tarifaBase" type="number" step="1" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2" required>
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-1">Tarifa por km ($)</label>
        <input id="tarifaPorKm" type="number" step="1" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2" required>
      </div>
      <button type="submit" class="w-full bg-amber-500 hover:bg-amber-600 text-gray-900 font-semibold rounded-lg py-2">Guardar</button>
      <p id="mensaje" class="text-sm hidden"></p>
    </form>
  </main>

  <script src="/admin/js/auth.js"></script>
  <script>
    requireAuth();

    async function cargar() {
      const config = await (await authFetch('/api/admin/config')).json();
      document.getElementById('tarifaBase').value = config.tarifaBase;
      document.getElementById('tarifaPorKm').value = config.tarifaPorKm;
    }

    document.getElementById('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const mensaje = document.getElementById('mensaje');
      await authFetch('/api/admin/config', {
        method: 'PUT',
        body: JSON.stringify({
          tarifaBase: parseFloat(document.getElementById('tarifaBase').value),
          tarifaPorKm: parseFloat(document.getElementById('tarifaPorKm').value),
        }),
      });
      mensaje.textContent = 'Guardado correctamente.';
      mensaje.className = 'text-green-400 text-sm';
    });

    cargar();
  </script>
</body>
</html>
```

- [ ] **Step 4: Probar en el navegador**

Abrir `http://localhost:3000/admin/conductores.html`, agregar un conductor de prueba, verificar que aparece en la lista y que el botón "Activo"/"Inactivo" alterna correctamente. Repetir en `clientes.html` (verificar que el buscador filtra) y en `config.html` (cambiar la tarifa por km, guardar, recargar la página y confirmar que el valor persiste).

- [ ] **Step 5: Commit**

```bash
git add src/admin/conductores.html src/admin/clientes.html src/admin/config.html
git commit -m "feat: panel admin - conductores, clientes y configuración de tarifas"
```

---

### Task 19: Panel admin — conversaciones (chat manual con polling)

**Files:**
- Create: `src/admin/conversaciones.html`

**Interfaces:**
- Consumes: `authFetch`, `requireAuth`, `logout` (Task 16); endpoints de la Task 15 (`GET /api/admin/conversaciones`, `GET/POST /api/admin/conversaciones/:telefono/mensajes`, `PUT /api/admin/conversaciones/:telefono/modo`).

- [ ] **Step 1: Crear `src/admin/conversaciones.html`**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🛵 Conversaciones - Serveloz Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 text-white min-h-screen">
  <nav class="bg-gray-800 border-b border-gray-700">
    <div class="px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="text-2xl">🛵</span>
        <span class="font-bold text-lg text-amber-400">Serveloz</span>
      </div>
      <div class="hidden md:flex items-center gap-4">
        <a href="/admin/dashboard.html" class="text-gray-300 hover:text-white">Inicio</a>
        <a href="/admin/carreras.html" class="text-gray-300 hover:text-white">Carreras</a>
        <a href="/admin/conductores.html" class="text-gray-300 hover:text-white">Conductores</a>
        <a href="/admin/clientes.html" class="text-gray-300 hover:text-white">Clientes</a>
        <a href="/admin/conversaciones.html" class="text-amber-400 font-medium">Conversaciones</a>
        <a href="/admin/config.html" class="text-gray-300 hover:text-white">Configuración</a>
        <button onclick="logout()" class="text-red-400 hover:text-red-300 text-sm">Salir</button>
      </div>
    </div>
  </nav>

  <main class="max-w-6xl mx-auto px-4 py-6 flex gap-4" style="height: calc(100vh - 80px);">
    <div class="w-72 flex-shrink-0 bg-gray-800 rounded-xl border border-gray-700 overflow-y-auto">
      <div id="listaConversaciones" class="divide-y divide-gray-700">
        <div class="text-gray-500 text-sm p-4">Cargando...</div>
      </div>
    </div>

    <div class="flex-1 bg-gray-800 rounded-xl border border-gray-700 flex flex-col">
      <div id="chatHeader" class="p-4 border-b border-gray-700 flex items-center justify-between">
        <span class="text-gray-400 text-sm">Selecciona una conversación</span>
      </div>
      <div id="chatMensajes" class="flex-1 overflow-y-auto p-4 space-y-3"></div>
      <div id="chatFooter" class="p-4 border-t border-gray-700 hidden">
        <p id="avisoVentana" class="text-amber-400 text-xs mb-2 hidden">Han pasado más de 24h desde el último mensaje del cliente: no se puede enviar texto libre, se necesita una plantilla pre-aprobada.</p>
        <form id="formEnviar" class="flex gap-2">
          <input id="inputMensaje" placeholder="Escribe un mensaje..." class="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
          <button type="submit" class="bg-amber-500 hover:bg-amber-600 text-gray-900 font-semibold rounded-lg px-4 py-2">Enviar</button>
        </form>
      </div>
    </div>
  </main>

  <script src="/admin/js/auth.js"></script>
  <script>
    requireAuth();

    let telefonoActivo = null;
    let ultimoTimestamp = null;
    let pollingInterval = null;

    async function cargarLista() {
      const conversaciones = await (await authFetch('/api/admin/conversaciones')).json();
      document.getElementById('listaConversaciones').innerHTML = conversaciones.map(c => `
        <button onclick="abrirConversacion('${c.telefono}', '${c.clienteNombre.replace(/'/g, "\\'")}')" class="w-full text-left p-4 hover:bg-gray-700 ${telefonoActivo === c.telefono ? 'bg-gray-700' : ''}">
          <div class="flex justify-between items-center">
            <span class="font-medium">${c.clienteNombre}</span>
            ${c.modoManual ? '<span class="text-xs bg-amber-500 text-gray-900 px-2 py-0.5 rounded-full">Manual</span>' : ''}
          </div>
          <div class="text-gray-400 text-sm truncate">${c.ultimoMensaje}</div>
        </button>
      `).join('');
    }

    function renderMensaje(m) {
      const esCliente = m.direccion === 'ENTRANTE';
      return `
        <div class="flex ${esCliente ? 'justify-start' : 'justify-end'}">
          <div class="max-w-xs rounded-lg px-3 py-2 text-sm ${esCliente ? 'bg-gray-700' : 'bg-amber-500 text-gray-900'}">
            <div>${m.contenido}</div>
            <div class="text-xs opacity-60 mt-1">${m.enviadoPor} · ${new Date(m.timestamp).toLocaleTimeString('es-CO')}</div>
          </div>
        </div>
      `;
    }

    async function abrirConversacion(telefono, nombre) {
      telefonoActivo = telefono;
      ultimoTimestamp = null;
      document.getElementById('chatMensajes').innerHTML = '';
      document.getElementById('chatFooter').classList.remove('hidden');
      document.getElementById('chatHeader').innerHTML = `
        <span class="font-medium">${nombre} (${telefono})</span>
        <button onclick="toggleModoManual()" id="btnModo" class="text-xs border border-gray-600 rounded-full px-3 py-1">...</button>
      `;
      await cargarMensajes(true);
      await cargarEstadoModo();
      cargarLista();

      if (pollingInterval) clearInterval(pollingInterval);
      pollingInterval = setInterval(() => cargarMensajes(false), 10000);
    }

    async function cargarMensajes(esCargaInicial) {
      if (!telefonoActivo) return;
      const url = ultimoTimestamp
        ? `/api/admin/conversaciones/${telefonoActivo}/mensajes?desde=${encodeURIComponent(ultimoTimestamp)}`
        : `/api/admin/conversaciones/${telefonoActivo}/mensajes`;
      const mensajes = await (await authFetch(url)).json();
      if (mensajes.length > 0) {
        const cont = document.getElementById('chatMensajes');
        cont.innerHTML += mensajes.map(renderMensaje).join('');
        cont.scrollTop = cont.scrollHeight;
        ultimoTimestamp = mensajes[mensajes.length - 1].timestamp;

        const ultimoEntrante = [...mensajes].reverse().find(m => m.direccion === 'ENTRANTE');
        if (ultimoEntrante) actualizarAvisoVentana(new Date(ultimoEntrante.timestamp));
      } else if (esCargaInicial) {
        actualizarAvisoVentana(null);
      }
    }

    function actualizarAvisoVentana(fechaUltimoEntrante) {
      const aviso = document.getElementById('avisoVentana');
      const dentroDeVentana = fechaUltimoEntrante && (Date.now() - fechaUltimoEntrante.getTime()) < 24 * 60 * 60 * 1000;
      aviso.classList.toggle('hidden', !!dentroDeVentana);
    }

    async function cargarEstadoModo() {
      const conversaciones = await (await authFetch('/api/admin/conversaciones')).json();
      const actual = conversaciones.find(c => c.telefono === telefonoActivo);
      const btn = document.getElementById('btnModo');
      if (btn) btn.textContent = actual && actual.modoManual ? 'Reanudar bot' : 'Tomar control manual';
    }

    async function toggleModoManual() {
      const conversaciones = await (await authFetch('/api/admin/conversaciones')).json();
      const actual = conversaciones.find(c => c.telefono === telefonoActivo);
      const nuevoModo = !(actual && actual.modoManual);
      await authFetch(`/api/admin/conversaciones/${telefonoActivo}/modo`, { method: 'PUT', body: JSON.stringify({ modoManual: nuevoModo }) });
      cargarEstadoModo();
    }

    document.getElementById('formEnviar').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('inputMensaje');
      const contenido = input.value.trim();
      if (!contenido || !telefonoActivo) return;

      const response = await authFetch(`/api/admin/conversaciones/${telefonoActivo}/mensajes`, {
        method: 'POST',
        body: JSON.stringify({ contenido }),
      });
      if (!response.ok) {
        const data = await response.json();
        alert(data.error || 'No se pudo enviar el mensaje');
        return;
      }
      input.value = '';
      await cargarMensajes(false);
      cargarEstadoModo();
    });

    cargarLista();
    setInterval(cargarLista, 15000);
  </script>
</body>
</html>
```

- [ ] **Step 2: Probar en el navegador**

Con el servidor corriendo y al menos una conversación previa (de las pruebas de las Tasks 11-12), abrir `http://localhost:3000/admin/conversaciones.html`. Expected:
1. La lista de la izquierda muestra el teléfono/nombre de cliente con su último mensaje.
2. Al hacer click, se carga el historial de mensajes en la columna derecha, distinguiendo visualmente los del cliente (izquierda, gris) de los del bot/dueño (derecha, ámbar).
3. Escribir un mensaje y enviarlo (dentro de las 24h desde el último mensaje del cliente) — debe aparecer en el chat y quedar registrado como `enviadoPor: DUEÑO` en `Mensaje` (verificar con `npx prisma studio`), y la `Conversacion` debe quedar con `modoManual = true`.
4. Click en "Reanudar bot" — debe volver a `modoManual = false`.

- [ ] **Step 3: Commit**

```bash
git add src/admin/conversaciones.html
git commit -m "feat: panel admin - chat manual con conversaciones de clientes"
```

---

### Task 20: Despliegue y verificación final

**Files:**
- Create: `README.md`

**Interfaces:**
- No produce código nuevo — es la tarea de cierre: documentar cómo correr y desplegar el proyecto, y verificar manualmente el sistema completo de punta a punta antes de considerar la Etapa 1 terminada.

- [ ] **Step 1: Crear `README.md`**

```markdown
# Serveloz — Bot WhatsApp de Domicilios y Mototaxi

Bot de WhatsApp con panel de administración para gestionar domicilios y mototaxi:
cálculo de precio real por distancia, asignación manual de conductores, notificaciones
automáticas, agendamiento anticipado y sistema de referidos.

## Requisitos

- Node.js 18+
- PostgreSQL
- Cuenta de WhatsApp Cloud API (Meta) con número verificado
- Cuenta de Radar (radar.io) para geocoding y distancia

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
- `RADAR_API_KEY`: API key de radar.io.
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
```

- [ ] **Step 2: Checklist de verificación end-to-end**

Con el servidor corriendo (`npm run dev`) y credenciales reales de Meta/Radar en `.env`,
verificar manualmente desde un teléfono real escribiéndole al número de WhatsApp Business:

1. **Registro:** escribir cualquier mensaje desde un número nuevo → el bot pide nombre → responder con nombre y apellido → el bot pregunta por referido → responder "no".
2. **Pedido inmediato:** elegir "Domicilio", enviar una dirección de recogida en texto → confirmar la dirección detectada → enviar una dirección de destino en texto → confirmar → elegir "Ahora" → el bot muestra distancia y precio → confirmar.
3. **Notificación al dueño:** verificar que `ADMINISTRADOR_TELEFONO` recibe el mensaje de nueva solicitud.
4. **Asignación:** en el panel (`/admin/carreras.html`), asignar un conductor de prueba a esa carrera → verificar que el cliente recibe el mensaje con el nombre/teléfono del conductor.
5. **Cierre y referido:** marcar la carrera como completada en el panel → verificar el mensaje de cierre al cliente. Si el cliente tenía un referidor, verificar que a este se le incrementó `descuentosDisponibles` (Prisma Studio) y que recibió el mensaje de descuento ganado.
6. **Pago:** alternar el estado de pago en el panel y confirmar que se refleja.
7. **Programada:** repetir un pedido eligiendo "Programado" con una fecha/hora futura cercana (ej. 3 minutos) → esperar el cron (`* * * * *`) → verificar que `ADMINISTRADOR_TELEFONO` recibe el aviso cuando falta `AVISO_PROGRAMADA_MINUTOS_ANTES` para la hora programada.
8. **Cancelación:** desde el mismo número de cliente, escribir "cancelar" con una carrera activa → seleccionarla de la lista → confirmar la cancelación → verificar que queda en estado `CANCELADA`.
9. **Ubicación nativa:** repetir un pedido compartiendo la ubicación de WhatsApp en vez de escribir la dirección, para ambos puntos (recogida y destino) → verificar que el precio se calcula igual de bien.
10. **Chat manual:** desde el panel (`/admin/conversaciones.html`), abrir la conversación de un cliente que haya escrito hace menos de 24h, enviar un mensaje manual, confirmar que el bot deja de responder automáticamente a ese cliente hasta reanudarlo.
11. **Carrera manual:** crear una carrera desde el panel para un cliente que llamó por fuera de WhatsApp, verificar que el precio se calcula igual y que se puede asignar conductor.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: instrucciones de configuración, despliegue y checklist de verificación"
```

---

## Plan Self-Review

**Cobertura del spec:** cada sección de `docs/superpowers/specs/2026-07-10-mensajeria-bot-etapa1-design.md` tiene tarea(s) correspondientes — arquitectura/stack (Tasks 1, 12, 20), modelo de datos (Task 2, más `Configuracion` agregado en la Task 14 para cumplir "tarifas editables desde el panel sin redeploy"), flujo conversacional completo incluida la captura híbrida de direcciones (Tasks 9, 11), asignación/notificaciones (Tasks 10, 11, 13), panel completo con las 6 vistas descritas (Tasks 16-19), referidos (Tasks 9, 11, 13), chat manual con ventana de 24h y `modoManual` (Tasks 8, 15, 19), fuera de alcance explícito (no se implementó nada de la sección 8 del spec).

**Placeholders:** no quedan "TBD" ni bloques de código incompletos; cada paso de cada tarea tiene código real y ejecutable.

**Consistencia de tipos:** se verificó que `carrerasService.calcularPrecio` es `async` de forma consistente entre su definición (Task 6) y su único llamador (Task 11); que `marcarCompletada` devuelve `{ carrera, referidorNotificar }` de forma consistente entre su definición (Task 6) y su uso en la ruta de completar carrera (Task 13); que `ConversationState` (Task 3) no incluye estados sin handler (se eliminó `ESPERANDO_RESPUESTA_DESPUES_CARRERA`, que no tenía transición posible en el diseño real); que `mensajeriaService` (Task 8) se usa consistentemente en `bot.service.ts` en vez de `whatsappMessagesService` directo, para que el historial de chat quede completo.

