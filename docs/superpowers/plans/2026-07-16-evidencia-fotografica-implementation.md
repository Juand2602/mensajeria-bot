# Evidencia fotográfica — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que el cliente (solo domicilios) y el conductor adjunten fotos de
evidencia por WhatsApp, asociadas a la carrera correspondiente y visibles en el panel
admin, según
`docs/superpowers/specs/2026-07-16-evidencia-fotografica-design.md`.

**Architecture:** Una tabla `EvidenciaFoto` compartida. Un servicio de descarga+subida
(`media.service.ts`, WhatsApp Media API → Cloudinary) y un servicio de negocio
(`evidencia.service.ts`) reutilizados por ambos flujos. El flujo del cliente se integra
en la máquina de estados existente de `bot.service.ts` (un estado nuevo). El flujo del
conductor es un manejador aparte y sin estado persistente (`conductor-bot.service.ts`),
enrutado desde el webhook por identificación de teléfono — el conductor nunca entra a
la máquina de estados de clientes.

**Tech Stack:** Express + TypeScript + Prisma (PostgreSQL), WhatsApp Cloud API,
Cloudinary (SDK oficial de Node) para almacenamiento de imágenes.

## Global Constraints

- `tsc --noEmit` debe pasar sin errores al final de cada tarea.
- Sin tests automatizados ni CI (criterio ya establecido en el proyecto) —
  verificación manual, incluyendo pruebas reales por WhatsApp donde se indique.
- Las fotos son siempre opcionales — nunca bloquean la asignación de conductor ni la
  transición a `COMPLETADA`, que siguen disparándose exactamente igual que hoy desde
  el panel.
- Si un conductor tiene más de una carrera `ASIGNADA` a la vez, no se construye un
  paso de selección: se responde con un mensaje informativo y no se guarda la foto
  (decisión explícita del spec, sección 3).
- La verificación real de subida a Cloudinary requiere que el usuario haya creado su
  cuenta y configurado `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/
  `CLOUDINARY_API_SECRET`. Si no lo ha hecho todavía, esa verificación puntual queda
  pendiente en el reporte de la tarea — no bloquea completar el resto de la tarea.

---

### Task 1: Modelo de datos, Cloudinary, y servicios base (media + evidencia)

**Files:**
- Modify: `prisma/schema.prisma` (modelo `Carrera`, nuevo modelo `EvidenciaFoto`)
- Create: `prisma/migrations/<timestamp>_evidencia_fotografica/` (generada por Prisma)
- Modify: `package.json` (nueva dependencia `cloudinary`)
- Modify: `src/config/whatsapp.ts` (nuevo `cloudinaryConfig`)
- Modify: `.env.example`
- Modify: `src/services/conductores.service.ts` (nuevo método `buscarPorTelefono`)
- Create: `src/services/media.service.ts`
- Create: `src/services/evidencia.service.ts`

**Interfaces:**
- Produces: `mediaService.descargarYSubir(mediaId: string): Promise<string>` (devuelve
  la `secure_url` de Cloudinary). Usado por Task 2 y Task 3.
- Produces: `evidenciaService.crear(carreraId: string, autor: 'CLIENTE' | 'CONDUCTOR', url: string, tipo?: 'RECOGIDA' | 'ENTREGA')`
  y `evidenciaService.etiquetarPendienteDeConductor(conductorId: string, tipo: 'RECOGIDA' | 'ENTREGA')`.
  Usados por Task 2 y Task 3.
- Produces: `conductoresService.buscarPorTelefono(telefono: string)` → `Conductor | null`
  (solo conductores con `activo: true`). Usado por Task 3.

- [ ] **Step 1: Editar el schema de Prisma**

En `prisma/schema.prisma`, agregar `evidencias EvidenciaFoto[]` al modelo `Carrera`
(justo antes del cierre, junto a los demás campos de relación) y el modelo nuevo
después de `Carrera`:

```prisma
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

  evidencias EvidenciaFoto[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([radicado])
  @@index([estado])
  @@index([conductorId])
  @@index([fechaHoraProgramada])
}

// ==================== EVIDENCIA FOTOGRÁFICA ====================
model EvidenciaFoto {
  id        String   @id @default(uuid())
  carreraId String
  carrera   Carrera  @relation(fields: [carreraId], references: [id])
  tipo      String?  // RECOGIDA | ENTREGA — null para fotos del cliente (no aplica)
  autor     String   // CLIENTE | CONDUCTOR
  url       String
  createdAt DateTime @default(now())

  @@index([carreraId])
}
```

(No modificar nada más de `Carrera` — solo se agrega el campo `evidencias` antes de
`createdAt`.)

- [ ] **Step 2: Generar y aplicar la migración**

Run: `npx prisma migrate dev --name evidencia_fotografica`
Expected: crea `prisma/migrations/<timestamp>_evidencia_fotografica/migration.sql` y
termina con `Your database is now in sync with your schema.` sin errores.

- [ ] **Step 3: Instalar la dependencia de Cloudinary**

Run: `npm install cloudinary`
Expected: agrega `cloudinary` a `dependencies` en `package.json` y a
`package-lock.json` sin errores.

- [ ] **Step 4: Agregar `cloudinaryConfig`**

En `src/config/whatsapp.ts`, agregar al final del archivo:

```typescript
export const cloudinaryConfig = {
  cloudName: requireEnv('CLOUDINARY_CLOUD_NAME'),
  apiKey: requireEnv('CLOUDINARY_API_KEY'),
  apiSecret: requireEnv('CLOUDINARY_API_SECRET'),
};
```

- [ ] **Step 5: Documentar las variables de entorno**

En `.env.example`, agregar después de la sección de Mapbox:

```
# ==================== CLOUDINARY (evidencia fotográfica) ====================
CLOUDINARY_CLOUD_NAME=tu_cloud_name
CLOUDINARY_API_KEY=tu_api_key
CLOUDINARY_API_SECRET=tu_api_secret
```

- [ ] **Step 6: Agregar `buscarPorTelefono` a `conductores.service.ts`**

En `src/services/conductores.service.ts`, agregar este método a la clase
`ConductoresService` (antes de `async create(...)`, por ejemplo):

```typescript
  async buscarPorTelefono(telefono: string) {
    return prisma.conductor.findFirst({ where: { telefono, activo: true } });
  }
```

- [ ] **Step 7: Crear `src/services/media.service.ts`**

```typescript
import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';
import { whatsappConfig, cloudinaryConfig } from '../config/whatsapp';

cloudinary.config({
  cloud_name: cloudinaryConfig.cloudName,
  api_key: cloudinaryConfig.apiKey,
  api_secret: cloudinaryConfig.apiSecret,
});

export class MediaService {
  // Descarga una imagen recibida por WhatsApp (identificada por su media id) y la
  // sube a Cloudinary para tener una URL durable — la URL que da la Graph API de
  // Meta expira a los pocos minutos, así que no sirve guardarla directamente.
  async descargarYSubir(mediaId: string): Promise<string> {
    const metaResponse = await axios.get(`${whatsappConfig.apiUrl}/${mediaId}`, {
      headers: { Authorization: `Bearer ${whatsappConfig.token}` },
      timeout: 10000,
    });
    const urlTemporal = metaResponse.data?.url;
    if (!urlTemporal) throw new Error('WhatsApp no devolvió una URL de descarga para el media id');

    const archivo = await axios.get(urlTemporal, {
      headers: { Authorization: `Bearer ${whatsappConfig.token}` },
      responseType: 'arraybuffer',
      timeout: 15000,
    });

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'serveloz/evidencias' },
        (error, result) => {
          if (error || !result) return reject(error || new Error('Cloudinary no devolvió resultado'));
          resolve(result.secure_url);
        }
      );
      uploadStream.end(Buffer.from(archivo.data));
    });
  }
}

export const mediaService = new MediaService();
```

- [ ] **Step 8: Crear `src/services/evidencia.service.ts`**

```typescript
import prisma from '../config/database';

export type AutorEvidencia = 'CLIENTE' | 'CONDUCTOR';
export type TipoEvidencia = 'RECOGIDA' | 'ENTREGA';

export class EvidenciaService {
  async crear(carreraId: string, autor: AutorEvidencia, url: string, tipo?: TipoEvidencia) {
    return prisma.evidenciaFoto.create({
      data: { carreraId, autor, url, tipo: tipo || null },
    });
  }

  // Busca la foto de conductor más reciente que todavía no tiene tipo asignado,
  // para la carrera activa de un conductor específico, y le pone el tipo.
  async etiquetarPendienteDeConductor(conductorId: string, tipo: TipoEvidencia) {
    const pendiente = await prisma.evidenciaFoto.findFirst({
      where: { tipo: null, autor: 'CONDUCTOR', carrera: { conductorId } },
      orderBy: { createdAt: 'desc' },
    });
    if (!pendiente) return null;
    return prisma.evidenciaFoto.update({ where: { id: pendiente.id }, data: { tipo } });
  }
}

export const evidenciaService = new EvidenciaService();
```

- [ ] **Step 9: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin salida (sin errores). Si `prisma.evidenciaFoto` no existe como tipo,
confirma que el Step 2 (migración) corrió correctamente — la migración regenera el
cliente de Prisma automáticamente.

- [ ] **Step 10: Verificar `evidencia.service.ts` contra la base de datos real**

Con la base de datos de desarrollo corriendo y al menos una carrera ya creada (real o
de una prueba anterior), ejecutar:

```bash
npx ts-node -e "
import prisma from './src/config/database';
import { evidenciaService } from './src/services/evidencia.service';
(async () => {
  const carrera = await prisma.carrera.findFirst();
  if (!carrera) { console.log('No hay carreras en la BD — crea una manual desde el panel primero.'); process.exit(1); }
  const foto = await evidenciaService.crear(carrera.id, 'CONDUCTOR', 'https://example.com/foto-test.jpg');
  console.log('Creada sin tipo:', foto.tipo === null);
  if (carrera.conductorId) {
    const actualizada = await evidenciaService.etiquetarPendienteDeConductor(carrera.conductorId, 'RECOGIDA');
    console.log('Etiquetada correctamente:', actualizada?.tipo === 'RECOGIDA');
  } else {
    console.log('La carrera de prueba no tiene conductor — se probará el etiquetado real en la Task 3.');
  }
  await prisma.evidenciaFoto.delete({ where: { id: foto.id } });
  process.exit(0);
})();
"
```
Expected: `Creada sin tipo: true`, y si la carrera de prueba tenía conductor,
`Etiquetada correctamente: true`.

- [ ] **Step 11: Nota sobre `mediaService.descargarYSubir`**

Esta función requiere credenciales reales de Cloudinary para probarse de punta a
punta (descarga real desde WhatsApp + subida real). Si el usuario ya tiene su cuenta
y las 3 variables de entorno configuradas, se puede probar en la Task 3 (con una foto
real de conductor). Si no las tiene todavía, anotar esto como pendiente en el reporte
de esta tarea — no bloquea el resto del plan, ya que el resto del código no depende
de que esta llamada específica se haya ejecutado con éxito todavía.

- [ ] **Step 12: Commit**

```bash
git add prisma/schema.prisma prisma/migrations package.json package-lock.json \
  src/config/whatsapp.ts .env.example src/services/conductores.service.ts \
  src/services/media.service.ts src/services/evidencia.service.ts
git commit -m "feat: modelo de datos y servicios base de evidencia fotográfica"
```

---

### Task 2: Flujo del cliente — foto de evidencia opcional en domicilios

**Files:**
- Modify: `src/types/index.ts` (nuevo estado, tipo `ImagenRecibida`, campo `image` en `WhatsAppMessage`)
- Modify: `src/services/whatsapp/templates.ts` (nuevos mensajes)
- Modify: `src/controllers/webhook.controller.ts` (manejo base de `message.type === 'image'`)
- Modify: `src/services/whatsapp/bot.service.ts` (refactor + nuevo estado)

**Interfaces:**
- Consumes: `mediaService.descargarYSubir` y `evidenciaService.crear` (Task 1).
- Produces: `crearCarreraConfirmada(telefono, contexto, conversacionId, evidenciaUrl?)`
  — método privado de `WhatsAppBotService`, reemplaza la lógica que hoy vive inline en
  `manejarConfirmacionPrecio`. Usado también por Task 3 indirectamente (Task 3 no lo
  llama directo, pero depende de que el estado `ESPERANDO_EVIDENCIA_CLIENTE` y el
  webhook de imágenes ya existan).
- Produces: `procesarMensaje`/`procesarEstado` de `WhatsAppBotService` ganan un 6to
  parámetro opcional `imagen?: ImagenRecibida`.

- [ ] **Step 1: Actualizar `src/types/index.ts`**

Agregar el campo `image` a `WhatsAppMessage` (línea 6, junto a `location`):

```typescript
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  image?: { id: string; mime_type?: string };
```

Agregar el nuevo estado a `ConversationState`, después de `'CONFIRMACION_PRECIO'`:

```typescript
  | 'CONFIRMACION_PRECIO'
  | 'ESPERANDO_EVIDENCIA_CLIENTE'
  | 'ESPERANDO_ASIGNACION'
```

Agregar la interfaz nueva, junto a `UbicacionCompartida`:

```typescript
export interface ImagenRecibida {
  mediaId: string;
}
```

- [ ] **Step 2: Agregar mensajes nuevos a `templates.ts`**

En `src/services/whatsapp/templates.ts`, agregar estas entradas al objeto `MENSAJES`
(después de `CARRERA_CONFIRMADA`/`METODOS_PAGO`, por ejemplo):

```typescript
  SOLICITAR_EVIDENCIA_CLIENTE: () =>
    '📷 Si quieres, envía ahora una *foto del objeto* como evidencia (opcional). Si no, toca el botón para continuar.',
  EVIDENCIA_CLIENTE_GUARDADA: () => '📷 Foto guardada como evidencia. ¡Gracias!',
  EVIDENCIA_ERROR: () => 'No pudimos procesar la foto. Puedes intentar de nuevo, o continuar sin ella.',
```

- [ ] **Step 3: Manejar mensajes de imagen en el webhook**

En `src/controllers/webhook.controller.ts`, dentro de `procesarMensaje`, agregar una
rama nueva (antes de la rama `else if (message.type === 'location' ...)`, por
ejemplo):

```typescript
      if (message.type === 'image' && message.image) {
        await mensajeriaService.registrarEntrante(telefono, '📷 Foto enviada');
        await whatsappBotService.procesarMensaje(telefono, 'IMAGEN_RECIBIDA', false, undefined, undefined, {
          mediaId: message.image.id,
        });
      } else if (message.type === 'text') {
```

(Nota: en este paso *todas* las fotos, sin importar quién las mande, entran al flujo
de cliente — la identificación de conductor se agrega en la Task 3, insertándose antes
de esta rama.)

- [ ] **Step 4: Refactor de `bot.service.ts`**

En `src/services/whatsapp/bot.service.ts`:

Actualizar el import de tipos (línea 9):

```typescript
import { ConversationState, ConversationContext, UbicacionCompartida, ImagenRecibida } from '../../types';
```

Agregar imports nuevos, junto a los demás imports de servicios:

```typescript
import { mediaService } from '../media.service';
import { evidenciaService } from '../evidencia.service';
```

Actualizar la firma de `procesarMensaje` para aceptar el 6to parámetro:

```typescript
  async procesarMensaje(
    telefono: string,
    mensaje: string,
    esBoton: boolean = false,
    buttonId?: string,
    ubicacion?: UbicacionCompartida,
    imagen?: ImagenRecibida
  ) {
```

Y su única línea que llama a `procesarEstado` (dentro del mismo método), para pasar
`imagen`:

```typescript
      await this.procesarEstado(telefono, mensajeAProcesar, estado, contexto, conversacion.id, ubicacion, imagen);
```

Actualizar la firma de `procesarEstado`:

```typescript
  private async procesarEstado(
    telefono: string,
    mensaje: string,
    estado: ConversationState,
    contexto: ConversationContext,
    conversacionId: string,
    ubicacion?: UbicacionCompartida,
    imagen?: ImagenRecibida
  ) {
```

Agregar el caso nuevo al `switch` de `procesarEstado`, después de
`case 'CONFIRMACION_PRECIO':`:

```typescript
      case 'ESPERANDO_EVIDENCIA_CLIENTE':
        await this.manejarEvidenciaCliente(telefono, mensaje, contexto, conversacionId, imagen); break;
```

Reemplazar el cuerpo completo de `manejarConfirmacionPrecio` (mantiene su firma
igual) y agregar los dos métodos nuevos justo después:

```typescript
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

    if (contexto.tipoServicio === 'DOMICILIO') {
      await mensajeriaService.enviarMensajeConBotones(telefono, MENSAJES.SOLICITAR_EVIDENCIA_CLIENTE(), [
        { id: 'evidencia_continuar', title: '➡️ Continuar sin foto' },
      ]);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_EVIDENCIA_CLIENTE', contexto);
      return;
    }

    await this.crearCarreraConfirmada(telefono, contexto, conversacionId);
  }

  private async manejarEvidenciaCliente(
    telefono: string,
    mensaje: string,
    contexto: ConversationContext,
    conversacionId: string,
    imagen?: ImagenRecibida
  ) {
    if (imagen) {
      try {
        const url = await mediaService.descargarYSubir(imagen.mediaId);
        await this.crearCarreraConfirmada(telefono, contexto, conversacionId, url);
      } catch (error) {
        console.error('Error procesando evidencia del cliente:', error);
        await mensajeriaService.enviarMensaje(telefono, MENSAJES.EVIDENCIA_ERROR());
      }
      return;
    }
    if (mensaje === 'evidencia_continuar' || messageParser.esNegativo(mensaje)) {
      await this.crearCarreraConfirmada(telefono, contexto, conversacionId);
      return;
    }
    await mensajeriaService.enviarMensaje(telefono, MENSAJES.OPCION_INVALIDA());
  }

  private async crearCarreraConfirmada(
    telefono: string,
    contexto: ConversationContext,
    conversacionId: string,
    evidenciaUrl?: string
  ) {
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

    if (evidenciaUrl) {
      await evidenciaService.crear(carrera.id, 'CLIENTE', evidenciaUrl);
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.EVIDENCIA_CLIENTE_GUARDADA());
    }

    await mensajeriaService.enviarMensaje(telefono, MENSAJES.CARRERA_CONFIRMADA({ radicado: carrera.radicado }));

    if (!contexto.fechaHoraProgramada) {
      try { await notificacionesService.notificarNuevaSolicitud(carrera.id); } catch (e) { console.error('Error notificando nueva solicitud:', e); }
    }

    await this.actualizarConversacion(conversacionId, 'ESPERANDO_ASIGNACION', { carreraId: carrera.id, radicado: carrera.radicado });
  }
```

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 6: Verificar manualmente por WhatsApp**

Con el servidor corriendo y conectado a un número real de WhatsApp Business (ya
usado en pruebas anteriores de este proyecto), simular un pedido de **domicilio**
completo hasta confirmar el precio. Confirmar que:
1. Tras tocar "✅ Confirmar", el bot pide la foto (opcional) en vez de crear la
   carrera de inmediato.
2. Tocar "➡️ Continuar sin foto" crea la carrera igual que antes (mismo mensaje de
   confirmación + métodos de pago).
3. Repetir el pedido y esta vez enviar una foto real: el bot debe confirmar "Foto
   guardada como evidencia" y luego seguir con la confirmación normal. (Si
   `CLOUDINARY_*` no está configurado todavía, este sub-paso fallará con
   `EVIDENCIA_ERROR` — anotarlo como pendiente hasta que exista la cuenta, no es un
   bug de esta tarea.)
4. Repetir un pedido de **mototaxi**: confirmar que no aparece el paso de foto y la
   carrera se crea igual que siempre.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/services/whatsapp/templates.ts \
  src/controllers/webhook.controller.ts src/services/whatsapp/bot.service.ts
git commit -m "feat: foto de evidencia opcional del cliente en domicilios"
```

---

### Task 3: Flujo del conductor — identificación + foto etiquetada

**Files:**
- Create: `src/services/whatsapp/conductor-bot.service.ts`
- Modify: `src/controllers/webhook.controller.ts` (identificación de conductor)

**Interfaces:**
- Consumes: `conductoresService.buscarPorTelefono`, `mediaService.descargarYSubir`,
  `evidenciaService.crear`/`etiquetarPendienteDeConductor` (Task 1). Consume el manejo
  base de `message.type === 'image'` agregado en Task 2 (Step 3 de esa tarea), que
  esta tarea modifica para agregar la rama de conductor.
- Produces: `conductorBotService.procesarFoto(conductor, mediaId)` y
  `conductorBotService.procesarEtiqueta(conductor, tipo)`.

- [ ] **Step 1: Crear `src/services/whatsapp/conductor-bot.service.ts`**

```typescript
import prisma from '../../config/database';
import { mediaService } from '../media.service';
import { evidenciaService } from '../evidencia.service';
import { whatsappMessagesService } from './messages.service';

export class ConductorBotService {
  // Usa whatsappMessagesService directo (no mensajeriaService): el registro de
  // saliente de mensajeriaService busca un Cliente por teléfono para asociar el
  // mensaje — un conductor no es un Cliente, así que no aplica ese historial.
  async procesarFoto(conductor: { id: string; telefono: string }, mediaId: string) {
    const activas = await prisma.carrera.findMany({ where: { conductorId: conductor.id, estado: 'ASIGNADA' } });

    if (activas.length === 0) {
      await whatsappMessagesService.enviarMensaje(conductor.telefono, 'No tienes ninguna carrera asignada en este momento.');
      return;
    }
    if (activas.length > 1) {
      await whatsappMessagesService.enviarMensaje(
        conductor.telefono,
        'Tienes varias carreras activas — comunícate directo con el dueño para esta foto en particular.'
      );
      return;
    }

    try {
      const url = await mediaService.descargarYSubir(mediaId);
      await evidenciaService.crear(activas[0].id, 'CONDUCTOR', url);
      await whatsappMessagesService.enviarMensajeConBotones(conductor.telefono, '📷 Foto recibida. ¿Es de recogida o de entrega?', [
        { id: 'evidencia_recogida', title: 'Recogida' },
        { id: 'evidencia_entrega', title: 'Entrega' },
      ]);
    } catch (error) {
      console.error('Error procesando foto de conductor:', error);
      await whatsappMessagesService.enviarMensaje(conductor.telefono, 'No pudimos procesar la foto, intenta de nuevo.');
    }
  }

  async procesarEtiqueta(conductor: { id: string; telefono: string }, tipo: 'RECOGIDA' | 'ENTREGA') {
    const actualizada = await evidenciaService.etiquetarPendienteDeConductor(conductor.id, tipo);
    if (!actualizada) {
      await whatsappMessagesService.enviarMensaje(conductor.telefono, 'No encontré una foto pendiente de etiquetar.');
      return;
    }
    await whatsappMessagesService.enviarMensaje(conductor.telefono, `Listo, guardamos tu foto de ${tipo.toLowerCase()}. Gracias 🙌`);
  }
}

export const conductorBotService = new ConductorBotService();
```

- [ ] **Step 2: Enrutar por identificación de conductor en el webhook**

En `src/controllers/webhook.controller.ts`:

Agregar los imports:

```typescript
import { conductoresService } from '../services/conductores.service';
import { conductorBotService } from '../services/whatsapp/conductor-bot.service';
```

Reemplazar la rama de imagen agregada en la Task 2 (Step 3) por esta versión que
primero verifica si el remitente es un conductor:

```typescript
      if (message.type === 'image' && message.image) {
        await mensajeriaService.registrarEntrante(telefono, '📷 Foto enviada');
        const conductor = await conductoresService.buscarPorTelefono(telefono);
        if (conductor) {
          await conductorBotService.procesarFoto(conductor, message.image.id);
        } else {
          await whatsappBotService.procesarMensaje(telefono, 'IMAGEN_RECIBIDA', false, undefined, undefined, {
            mediaId: message.image.id,
          });
        }
      } else if (message.type === 'text') {
```

Y en la rama `else if (message.type === 'interactive')` (más abajo en el mismo
método), reemplazar:

```typescript
      } else if (message.type === 'interactive') {
        const reply = message.interactive?.button_reply || message.interactive?.list_reply;
        if (reply) {
          await mensajeriaService.registrarEntrante(telefono, reply.title);
          await whatsappBotService.procesarMensaje(telefono, reply.id, true, reply.id);
        }
      }
```

por:

```typescript
      } else if (message.type === 'interactive') {
        const reply = message.interactive?.button_reply || message.interactive?.list_reply;
        if (reply) {
          await mensajeriaService.registrarEntrante(telefono, reply.title);
          const conductor = await conductoresService.buscarPorTelefono(telefono);
          if (conductor && (reply.id === 'evidencia_recogida' || reply.id === 'evidencia_entrega')) {
            await conductorBotService.procesarEtiqueta(conductor, reply.id === 'evidencia_recogida' ? 'RECOGIDA' : 'ENTREGA');
          } else {
            await whatsappBotService.procesarMensaje(telefono, reply.id, true, reply.id);
          }
        }
      }
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 4: Verificar manualmente por WhatsApp**

Requiere un conductor real (con su teléfono guardado en el panel → Conductores) con
una carrera en estado `ASIGNADA` en ese momento (asignarla desde el panel de
Carreras). Desde el WhatsApp del conductor:
1. Enviar una foto al número del bot → debe responder con los botones
   "Recogida"/"Entrega" (si `CLOUDINARY_*` ya está configurado; si no, anotar como
   pendiente igual que en la Task 2).
2. Tocar "Recogida" → debe confirmar "Listo, guardamos tu foto de recogida."
3. Repetir con "Entrega" para la misma carrera.
4. Verificar en la base de datos (o esperar la Task 4 para verlo en el panel) que
   quedaron 2 filas en `EvidenciaFoto` para esa carrera, una con `tipo: 'RECOGIDA'` y
   otra con `tipo: 'ENTREGA'`.
5. Desde un número que **no** sea conductor, confirmar que enviar una foto sigue
   entrando al flujo normal de cliente (Task 2), no al de conductor.

- [ ] **Step 5: Commit**

```bash
git add src/services/whatsapp/conductor-bot.service.ts src/controllers/webhook.controller.ts
git commit -m "feat: foto de evidencia de recogida/entrega del conductor"
```

---

### Task 4: Panel admin — mostrar evidencias en Carreras

**Files:**
- Modify: `src/services/carreras.service.ts:76,90` (agregar `evidencias: true` a los
  `include` de `getById` y `getAll`)
- Modify: `src/admin/carreras.html` (miniaturas de evidencia en cada tarjeta)

**Interfaces:**
- Consumes: el modelo `EvidenciaFoto` (Task 1) vía la relación `evidencias` de
  `Carrera`.

- [ ] **Step 1: Incluir `evidencias` en las consultas de carreras**

En `src/services/carreras.service.ts`, cambiar (en `getById`, línea 76):

```typescript
    const carrera = await prisma.carrera.findUnique({ where: { id }, include: { cliente: true, conductor: true } });
```

por:

```typescript
    const carrera = await prisma.carrera.findUnique({ where: { id }, include: { cliente: true, conductor: true, evidencias: true } });
```

Y en `getAll` (línea 90):

```typescript
    return prisma.carrera.findMany({ where, include: { cliente: true, conductor: true }, orderBy: { createdAt: 'desc' } });
```

por:

```typescript
    return prisma.carrera.findMany({ where, include: { cliente: true, conductor: true, evidencias: true }, orderBy: { createdAt: 'desc' } });
```

- [ ] **Step 2: Mostrar las evidencias en cada tarjeta de carrera**

En `src/admin/carreras.html`, dentro de la función `cargarCarreras()`, agregar un
bloque nuevo justo después del `</div>` que cierra el grupo de píldoras de
km/precio/pago (el que contiene `${c.distanciaKm.toFixed(1)} km`) y antes del `<div
class="flex flex-wrap gap-2 items-center pt-3 border-t border-line">` de los botones
de acción:

```html
            ${c.evidencias && c.evidencias.length > 0 ? `
              <div class="flex flex-wrap gap-2 mb-3">
                ${c.evidencias.map(ev => `
                  <a href="${esc(ev.url)}" target="_blank" rel="noopener" class="text-xs px-2 py-1 rounded-lg border border-line text-gray-300 hover:border-brand-blue">
                    📷 ${ev.autor === 'CLIENTE' ? 'Cliente' : ev.tipo === 'RECOGIDA' ? 'Recogida' : ev.tipo === 'ENTREGA' ? 'Entrega' : 'Conductor'}
                  </a>
                `).join('')}
              </div>
            ` : ''}
```

- [ ] **Step 3: Verificar en el navegador**

Con el servidor corriendo y al menos una carrera con evidencias ya guardadas (de las
pruebas de Task 2/3), entrar a `/admin/carreras.html` y confirmar que aparecen las
etiquetas "📷 Cliente"/"📷 Recogida"/"📷 Entrega" en la tarjeta correspondiente, y que
cada una abre la imagen real en una pestaña nueva. Confirmar también que una carrera
sin evidencias no muestra esta sección (sin espacio vacío raro).

- [ ] **Step 4: Commit**

```bash
git add src/services/carreras.service.ts src/admin/carreras.html
git commit -m "feat: panel admin - mostrar evidencia fotográfica en carreras"
```

---

### Task 5: Verificación final y limpieza

**Files:**
- No se crean ni modifican archivos de producto — solo verificación y
  `PROGRESS.md`.

- [ ] **Step 1: Confirmar que no quedan referencias rotas**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 2: Confirmar el estado de la cuenta de Cloudinary**

Si en las Tasks 2-3 alguna verificación quedó pendiente por falta de
`CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`, y el usuario ya
tiene la cuenta creada para este momento, repetir esa prueba puntual (mandar una foto
real de cliente y una de conductor) para confirmar que la subida a Cloudinary
funciona de punta a punta. Si todavía no la tiene, dejarlo anotado explícitamente
como pendiente al reportar el resultado de esta tarea.

- [ ] **Step 3: Actualizar `PROGRESS.md`**

Leer el archivo primero para igualar tono/formato, y agregar una sección nueva con la
fecha de hoy describiendo: la tabla `EvidenciaFoto`, el flujo opcional de foto del
cliente en domicilios, el flujo opcional de foto de recogida/entrega del conductor
(sin máquina de estados nueva, por identificación de teléfono en el webhook), y el
requisito de una cuenta de Cloudinary configurada para que la subida real funcione en
producción.

- [ ] **Step 4: Commit final**

```bash
git add PROGRESS.md
git commit -m "docs: actualizar progreso con evidencia fotográfica de clientes y conductores"
```

---

## Self-Review

**Cobertura del spec:** las 8 secciones del spec están cubiertas — modelo de datos
(Task 1), flujo del conductor (Task 3), flujo del cliente (Task 2), almacenamiento
(Task 1, `media.service.ts`), panel admin (Task 4), casos borde (manejo de errores en
Task 2 Step 4 y Task 3 Step 1), y verificación (Task 5).

**Placeholders:** ninguno — cada paso incluye código completo o comando exacto con
salida esperada. La única espera legítima (cuenta de Cloudinary) está marcada
explícitamente como una verificación pendiente, no como trabajo sin especificar.

**Consistencia de tipos:** `AutorEvidencia`/`TipoEvidencia` se definen una sola vez en
`evidencia.service.ts` y se usan con los mismos valores literales (`'CLIENTE'`,
`'CONDUCTOR'`, `'RECOGIDA'`, `'ENTREGA'`) en `bot.service.ts` y
`conductor-bot.service.ts`. La firma de `procesarMensaje`/`procesarEstado` con el
parámetro `imagen` es la misma en su definición (Task 2) y en el único punto donde el
webhook la invoca (Task 2 Step 3, modificado en Task 3 Step 2).
