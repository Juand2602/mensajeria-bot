# Contacto de entrega y notas de dirección por tramo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un campo de contacto de entrega (nombre/teléfono de quien recibe un
domicilio), duplicar la nota de aclaración de dirección para recogida y destino (antes
solo existía para destino), y mostrar en la confirmación de dirección lo que el
cliente escribió junto a lo que Mapbox encontró.

**Architecture:** Todo el trabajo de conversación vive en la máquina de estados de
`src/services/whatsapp/bot.service.ts`, generalizando el mecanismo de un solo paso
opcional (`ESPERANDO_NOTA_ADICIONAL`) a una cola de hasta tres pasos opcionales
(`ESPERANDO_PASO_PENDIENTE`). Un campo nuevo en `Carrera` (`contactoEntrega`) se suma
a `notas`, ambos ya soportados end-to-end (notificaciones + panel admin).

**Tech Stack:** Node.js/TypeScript, Prisma (una migración nueva, no destructiva),
mensajería WhatsApp Cloud API vía `mensajeriaService`.

## Global Constraints

- Este proyecto no tiene tests automatizados ni lint configurado — la verificación de
  cada tarea es `npx tsc --noEmit` (debe quedar limpio al final de CADA tarea) más una
  descripción de prueba manual. El bot no se puede correr end-to-end en este entorno
  (sin credenciales de WhatsApp Cloud API en vivo), así que las pruebas manuales se
  hacen por inspección de código (trazar las ramas nuevas contra el código real) en
  vez de una conversación real — igual que en el plan anterior.
- Botones interactivos de WhatsApp: máximo 3 por mensaje, título máximo 20 caracteres
  UTF-16. El único botón nuevo de este plan es `Omitir` (6 caracteres), ya usado en el
  plan anterior — no hace falta reverificar.
- El botón `paso_omitir` reemplaza a `nota_omitir` (mismo propósito, un solo id
  genérico para los tres tipos de paso pendiente).
- Todo el código nuevo sigue el estilo existente del archivo: comentarios solo cuando
  explican un porqué no obvio, nunca qué hace la línea siguiente.
- Los cambios de tipos/plantillas y sus consumidores en `bot.service.ts` van en la
  MISMA tarea (Task 2) — separarlos dejaría el proyecto sin compilar entre tareas, lo
  cual no es un estado válido de "tarea completa".

---

## Task 1: Esquema y migración

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_contacto_entrega_carrera/` (generado por Prisma)

**Interfaces:**
- Produces: `Carrera.contactoEntrega String?` disponible en el cliente de Prisma
  generado, consumido por la Task 3.

- [ ] **Step 1: Agregar el campo a `Carrera`**

En `prisma/schema.prisma`, dentro de `model Carrera`, la sección de notas es hoy:

```prisma
  notas             String?
  motivoCancelacion String?
```

Cámbiala a:

```prisma
  notas             String?
  contactoEntrega   String?
  motivoCancelacion String?
```

- [ ] **Step 2: Generar y aplicar la migración**

Run: `npx prisma migrate dev --name contacto_entrega_carrera`
Expected: migración creada y aplicada sin errores, sin pérdida de datos (columna
nueva, nullable). Este comando también corre `prisma generate`, así que el cliente de
Prisma queda actualizado con el campo nuevo.

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin salida (nada en el código TypeScript referencia el campo todavía).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: agregar columna contactoEntrega a Carrera"
```

---

## Task 2: Tipos, plantillas y cola de pasos pendientes

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/services/whatsapp/templates.ts`
- Modify: `src/services/whatsapp/bot.service.ts`

**Interfaces:**
- Produces: tipo exportado `PasoPendiente = 'notaRecogida' | 'notaDestino' |
  'contactoDestino'`. `ConversationState` gana `'ESPERANDO_PASO_PENDIENTE'` (reemplaza
  a `'ESPERANDO_NOTA_ADICIONAL'`). `ConversationContext` gana `pasosPendientes?:
  PasoPendiente[]`, `pasoActual?: PasoPendiente`, `pasoPendienteSiguiente?: 'destino' |
  'momento' | 'crear'` (reemplaza a `notaAdicionalSiguiente`), `notaRecogida?: string`,
  `notaDestino?: string`, `contactoEntrega?: string`. `MENSAJES.CONFIRMAR_DIRECCION`
  cambia de firma a `(textoBuscado: string, direccionEncontrada: string) => string`.
  `private async encolarPasosPendientes(telefono: string, contexto:
  ConversationContext, conversacionId: string, pasos: PasoPendiente[], siguiente:
  'destino' | 'momento' | 'crear'): Promise<void>` en `WhatsAppBotService`, consumida
  por la Task 4 solo por lectura de `contexto.notaRecogida`/`notaDestino`/
  `contactoEntrega` que esta tarea deja poblados en tiempo de ejecución.

- [ ] **Step 1: Actualizar `ConversationState` y agregar `PasoPendiente`**

En `src/types/index.ts`, el tipo `ConversationState` termina hoy así:

```ts
  | 'ESPERANDO_CONFIRMACION_AYUDA'
  | 'ESPERANDO_NOTA_ADICIONAL'
  | 'COMPLETADA';
```

Cámbialo a:

```ts
  | 'ESPERANDO_CONFIRMACION_AYUDA'
  | 'ESPERANDO_PASO_PENDIENTE'
  | 'COMPLETADA';
```

Justo antes de `export interface ConversationContext {`, agrega:

```ts
export type PasoPendiente = 'notaRecogida' | 'notaDestino' | 'contactoDestino';

```

- [ ] **Step 2: Actualizar `ConversationContext`**

`ConversationContext` es hoy:

```ts
export interface ConversationContext {
  nombre?: string;
  referidoTelefono?: string;
  tipoServicio?: 'DOMICILIO' | 'MOTOTAXI';
  esMandado?: boolean;
  notas?: string;
  soloCotizacion?: boolean;
  notaAdicionalSiguiente?: 'momento' | 'crear';
  recogida?: DireccionPendiente;
  destino?: DireccionPendiente;
  intentosRecogida?: number;
  intentosDestino?: number;
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

Cámbiala a:

```ts
export interface ConversationContext {
  nombre?: string;
  referidoTelefono?: string;
  tipoServicio?: 'DOMICILIO' | 'MOTOTAXI';
  esMandado?: boolean;
  notas?: string;
  soloCotizacion?: boolean;
  pasosPendientes?: PasoPendiente[];
  pasoActual?: PasoPendiente;
  pasoPendienteSiguiente?: 'destino' | 'momento' | 'crear';
  notaRecogida?: string;
  notaDestino?: string;
  contactoEntrega?: string;
  recogida?: DireccionPendiente;
  destino?: DireccionPendiente;
  intentosRecogida?: number;
  intentosDestino?: number;
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

- [ ] **Step 3: Actualizar `CONFIRMAR_DIRECCION` y reemplazar `SOLICITAR_NOTA_ADICIONAL`**

En `src/services/whatsapp/templates.ts`, `CONFIRMAR_DIRECCION` es hoy:

```ts
  CONFIRMAR_DIRECCION: (direccion: string) => `Encontramos esta dirección:\n\n📍 *${direccion}*\n\n¿Es correcta?`,
```

Cámbialo a:

```ts
  CONFIRMAR_DIRECCION: (textoBuscado: string, direccionEncontrada: string) =>
    `Buscaste: *${textoBuscado}*\n📍 Encontramos: *${direccionEncontrada}*\n\n_(Es la coincidencia más cercana que encontramos. Si el número no es exacto, responde "Sí" de todas formas — en el siguiente paso podrás escribir la aclaración exacta. Si esta dirección no tiene nada que ver con la tuya, responde "No" para intentar de nuevo.)_\n\n¿Es correcta?`,
```

`SOLICITAR_NOTA_ADICIONAL` es hoy:

```ts
  SOLICITAR_NOTA_ADICIONAL: () =>
    '📝 Si tu dirección es un conjunto/apartamento, o el punto exacto no aparece en el mapa, cuéntanos aquí (torre, apto, interior, o una referencia como "al lado de la tienda"). Si no necesitas aclarar nada, toca *Omitir*.',
```

Reemplázalo por:

```ts
  SOLICITAR_NOTA_RECOGIDA: () =>
    '📝 Si la dirección de *recogida* es un conjunto/apartamento, o el punto exacto no aparece en el mapa, cuéntanos aquí (torre, apto, interior, o una referencia). Si no necesitas aclarar nada, toca *Omitir*.',
  SOLICITAR_NOTA_DESTINO: () =>
    '📝 Si la dirección de *destino* es un conjunto/apartamento, o el punto exacto no aparece en el mapa, cuéntanos aquí (torre, apto, interior, o una referencia). Si no necesitas aclarar nada, toca *Omitir*.',
  SOLICITAR_CONTACTO_ENTREGA: () =>
    '👤 *¿Quién recibe el domicilio en el destino?* Escribe el nombre y teléfono de esa persona (ej: "Carmen García, 3001234567"). Si eres tú, escribe tu nombre, o toca Omitir.',
```

- [ ] **Step 4: Importar `PasoPendiente` en `bot.service.ts`**

La línea de import de tipos en `bot.service.ts` es hoy:

```ts
import { ConversationState, ConversationContext, UbicacionCompartida, ImagenRecibida } from '../../types';
```

Cámbiala a:

```ts
import { ConversationState, ConversationContext, UbicacionCompartida, ImagenRecibida, PasoPendiente } from '../../types';
```

- [ ] **Step 5: Reemplazar `enviarSolicitudNotaAdicional`/`manejarNotaAdicional` por el mecanismo de cola**

Ambos métodos son hoy:

```ts
  private async enviarSolicitudNotaAdicional(
    telefono: string,
    contexto: ConversationContext,
    conversacionId: string,
    siguiente: 'momento' | 'crear'
  ) {
    contexto.notaAdicionalSiguiente = siguiente;
    await mensajeriaService.enviarMensajeConBotones(telefono, MENSAJES.SOLICITAR_NOTA_ADICIONAL(), [
      { id: 'nota_omitir', title: 'Omitir' },
    ]);
    await this.actualizarConversacion(conversacionId, 'ESPERANDO_NOTA_ADICIONAL', contexto);
  }

  private async manejarNotaAdicional(
    telefono: string,
    mensaje: string,
    contexto: ConversationContext,
    conversacionId: string,
    esBoton: boolean,
    ubicacion?: UbicacionCompartida,
    imagen?: ImagenRecibida
  ) {
    // Solo se guarda la nota si el cliente realmente escribió texto libre: un
    // botón (el de "Omitir", o uno viejo que quedó tocable de un mensaje
    // anterior) o una ubicación/foto compartida llegan aquí como el id del
    // botón o como el centinela 'UBICACION_COMPARTIDA'/'IMAGEN_RECIBIDA', que
    // no son una nota válida para el dueño ni el conductor.
    if (!esBoton && !ubicacion && !imagen) {
      contexto.notas = mensaje.trim();
    }
    const siguiente = contexto.notaAdicionalSiguiente;
    delete contexto.notaAdicionalSiguiente;
    if (siguiente === 'crear') {
      await this.continuarTrasConfirmacionPrecio(telefono, contexto, conversacionId);
    } else {
      await this.enviarSolicitudMomento(telefono, contexto, conversacionId);
    }
  }
```

Reemplázalos por:

```ts
  private async avanzarPasoPendiente(telefono: string, contexto: ConversationContext, conversacionId: string) {
    const [paso, ...resto] = contexto.pasosPendientes || [];
    if (!paso) {
      const siguiente = contexto.pasoPendienteSiguiente;
      delete contexto.pasoPendienteSiguiente;
      if (siguiente === 'destino') {
        await mensajeriaService.enviarMensaje(telefono, MENSAJES.SOLICITAR_DESTINO());
        await this.actualizarConversacion(conversacionId, 'ESPERANDO_DESTINO', contexto);
      } else if (siguiente === 'crear') {
        await this.continuarTrasConfirmacionPrecio(telefono, contexto, conversacionId);
      } else {
        await this.enviarSolicitudMomento(telefono, contexto, conversacionId);
      }
      return;
    }
    contexto.pasosPendientes = resto;
    contexto.pasoActual = paso;
    const mensajePorPaso: Record<PasoPendiente, string> = {
      notaRecogida: MENSAJES.SOLICITAR_NOTA_RECOGIDA(),
      notaDestino: MENSAJES.SOLICITAR_NOTA_DESTINO(),
      contactoDestino: MENSAJES.SOLICITAR_CONTACTO_ENTREGA(),
    };
    await mensajeriaService.enviarMensajeConBotones(telefono, mensajePorPaso[paso], [
      { id: 'paso_omitir', title: 'Omitir' },
    ]);
    await this.actualizarConversacion(conversacionId, 'ESPERANDO_PASO_PENDIENTE', contexto);
  }

  private async encolarPasosPendientes(
    telefono: string,
    contexto: ConversationContext,
    conversacionId: string,
    pasos: PasoPendiente[],
    siguiente: 'destino' | 'momento' | 'crear'
  ) {
    contexto.pasosPendientes = pasos;
    contexto.pasoPendienteSiguiente = siguiente;
    await this.avanzarPasoPendiente(telefono, contexto, conversacionId);
  }

  private async manejarPasoPendiente(
    telefono: string,
    mensaje: string,
    contexto: ConversationContext,
    conversacionId: string,
    esBoton: boolean,
    ubicacion?: UbicacionCompartida,
    imagen?: ImagenRecibida
  ) {
    // Solo se guarda si el cliente realmente escribió texto libre: un botón
    // (el de "Omitir", o uno viejo que quedó tocable de un mensaje anterior)
    // o una ubicación/foto compartida llegan aquí como el id del botón o como
    // el centinela 'UBICACION_COMPARTIDA'/'IMAGEN_RECIBIDA', que no son una
    // respuesta válida para este paso.
    if (!esBoton && !ubicacion && !imagen && contexto.pasoActual) {
      const valor = mensaje.trim();
      if (contexto.pasoActual === 'notaRecogida') contexto.notaRecogida = valor;
      else if (contexto.pasoActual === 'notaDestino') contexto.notaDestino = valor;
      else if (contexto.pasoActual === 'contactoDestino') contexto.contactoEntrega = valor;
    }
    delete contexto.pasoActual;
    await this.avanzarPasoPendiente(telefono, contexto, conversacionId);
  }
```

- [ ] **Step 6: Actualizar el `case` en `procesarEstado`**

En el `switch` de `procesarEstado`, la línea es hoy:

```ts
      case 'ESPERANDO_NOTA_ADICIONAL':
        await this.manejarNotaAdicional(telefono, mensaje, contexto, conversacionId, esBoton, ubicacion, imagen); break;
```

Cámbiala a:

```ts
      case 'ESPERANDO_PASO_PENDIENTE':
        await this.manejarPasoPendiente(telefono, mensaje, contexto, conversacionId, esBoton, ubicacion, imagen); break;
```

- [ ] **Step 7: Reescribir `avanzarDespuesDeDireccion` para encolar en ambos tramos**

`avanzarDespuesDeDireccion` es hoy:

```ts
  private async avanzarDespuesDeDireccion(
    telefono: string,
    contexto: ConversationContext,
    conversacionId: string,
    campo: 'recogida' | 'destino'
  ) {
    if (campo === 'recogida') {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.SOLICITAR_DESTINO());
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_DESTINO', contexto);
    } else if (!contexto.esMandado && !contexto.soloCotizacion) {
      await this.enviarSolicitudNotaAdicional(telefono, contexto, conversacionId, 'momento');
    } else {
      await this.enviarSolicitudMomento(telefono, contexto, conversacionId);
    }
  }
```

Cámbiala a:

```ts
  private async avanzarDespuesDeDireccion(
    telefono: string,
    contexto: ConversationContext,
    conversacionId: string,
    campo: 'recogida' | 'destino'
  ) {
    if (campo === 'recogida') {
      if (!contexto.esMandado && !contexto.soloCotizacion) {
        await this.encolarPasosPendientes(telefono, contexto, conversacionId, ['notaRecogida'], 'destino');
      } else {
        await mensajeriaService.enviarMensaje(telefono, MENSAJES.SOLICITAR_DESTINO());
        await this.actualizarConversacion(conversacionId, 'ESPERANDO_DESTINO', contexto);
      }
    } else if (!contexto.esMandado && !contexto.soloCotizacion) {
      const pasos: PasoPendiente[] = contexto.tipoServicio === 'DOMICILIO' ? ['notaDestino', 'contactoDestino'] : ['notaDestino'];
      await this.encolarPasosPendientes(telefono, contexto, conversacionId, pasos, 'momento');
    } else {
      await this.enviarSolicitudMomento(telefono, contexto, conversacionId);
    }
  }
```

- [ ] **Step 8: Actualizar la conversión de cotización a pedido en `manejarConfirmacionPrecio`**

El bloque `cotizacion_pedir` dentro de `manejarConfirmacionPrecio` es hoy:

```ts
      if (mensaje === 'cotizacion_pedir') {
        contexto.soloCotizacion = false;
        if (contexto.esMandado) {
          await this.continuarTrasConfirmacionPrecio(telefono, contexto, conversacionId);
        } else {
          await this.enviarSolicitudNotaAdicional(telefono, contexto, conversacionId, 'crear');
        }
        return;
      }
```

Cámbialo a:

```ts
      if (mensaje === 'cotizacion_pedir') {
        contexto.soloCotizacion = false;
        if (contexto.esMandado) {
          await this.continuarTrasConfirmacionPrecio(telefono, contexto, conversacionId);
        } else {
          const pasos: PasoPendiente[] =
            contexto.tipoServicio === 'DOMICILIO'
              ? ['notaRecogida', 'notaDestino', 'contactoDestino']
              : ['notaRecogida', 'notaDestino'];
          await this.encolarPasosPendientes(telefono, contexto, conversacionId, pasos, 'crear');
        }
        return;
      }
```

- [ ] **Step 9: Pasar el texto original a `CONFIRMAR_DIRECCION`**

En `manejarDireccion`, el bloque que confirma una dirección geocodificada es hoy:

```ts
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
```

Cámbialo a:

```ts
    contexto[campo] = {
      direccionTexto: mensaje,
      direccionFormateada: resultado.direccionFormateada,
      lat: resultado.lat,
      lng: resultado.lng,
    };
    await mensajeriaService.enviarMensajeConBotones(telefono, MENSAJES.CONFIRMAR_DIRECCION(mensaje, resultado.direccionFormateada), [
      { id: 'direccion_si', title: '✅ Sí' },
      { id: 'direccion_no', title: '❌ No' },
    ]);
```

- [ ] **Step 10: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin salida. Confirma con
`grep -n "NotaAdicional\|ESPERANDO_NOTA_ADICIONAL" src/services/whatsapp/bot.service.ts`
que no queda ningún símbolo viejo, y con
`grep -n "CONFIRMAR_DIRECCION" src/services/whatsapp/bot.service.ts` que hay un solo
call site y recibe dos argumentos.

- [ ] **Step 11: Prueba manual por inspección — trazar los cuatro caminos de la cola**

Sin ejecutar el bot (sin credenciales en este entorno), traza a mano contra el código
final y documenta en tu reporte:

1. Domicilio normal (no mandado, no cotización): tras confirmar recogida →
   `avanzarDespuesDeDireccion('recogida')` → `encolarPasosPendientes(['notaRecogida'],
   'destino')` → `avanzarPasoPendiente` manda `SOLICITAR_NOTA_RECOGIDA` y pasa a
   `ESPERANDO_PASO_PENDIENTE` con `pasoActual = 'notaRecogida'`. Cliente escribe texto
   libre → `manejarPasoPendiente` guarda `contexto.notaRecogida`, cola vacía →
   `avanzarPasoPendiente` ve `pasoPendienteSiguiente === 'destino'` → manda
   `SOLICITAR_DESTINO`, pasa a `ESPERANDO_DESTINO`. Tras confirmar destino →
   `encolarPasosPendientes(['notaDestino', 'contactoDestino'], 'momento')` → dos pasos
   seguidos, guardando `contexto.notaDestino` y `contexto.contactoEntrega` → cola
   vacía → `enviarSolicitudMomento`.
2. Mototaxi normal: igual al punto 1 pero la cola de destino es solo `['notaDestino']`
   (sin `contactoDestino`, por el chequeo `tipoServicio === 'DOMICILIO'`).
3. Mandado: `esMandado` es `true` en ambas ramas de `avanzarDespuesDeDireccion` →
   nunca se encola nada, va directo a `SOLICITAR_DESTINO` y luego a
   `enviarSolicitudMomento` — sin cambios respecto al comportamiento anterior.
4. Cotización de un domicilio → "Pedir servicio": `soloCotizacion` era `true` durante
   toda la recolección de direcciones, así que ambas ramas de
   `avanzarDespuesDeDireccion` la saltaron. Al pulsar `cotizacion_pedir`, se encola
   `['notaRecogida', 'notaDestino', 'contactoDestino']` con siguiente `'crear'` — los
   tres pasos se preguntan seguidos y al vaciarse la cola se llama a
   `continuarTrasConfirmacionPrecio` directo (sin volver a preguntar el momento, que ya
   se resolvió antes de calcular el precio).

- [ ] **Step 12: Commit**

```bash
git add src/types/index.ts src/services/whatsapp/templates.ts src/services/whatsapp/bot.service.ts
git commit -m "feat: generalizar nota adicional a una cola de pasos pendientes y comparar dirección buscada vs encontrada"
```

---

## Task 3: Servicio de carreras, notificaciones y panel admin

**Files:**
- Modify: `src/services/carreras.service.ts`
- Modify: `src/services/notificaciones.service.ts`
- Modify: `src/admin/carreras.html`

**Interfaces:**
- Consumes: `Carrera.contactoEntrega` (Task 1, ya migrado).
- Produces: `CrearCarreraInput.contactoEntrega?: string`, consumido por la Task 4.

- [ ] **Step 1: `CrearCarreraInput` y `create()`**

En `src/services/carreras.service.ts`, `CrearCarreraInput` es hoy:

```ts
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
  notas?: string;
}
```

Cámbialo a:

```ts
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
  notas?: string;
  contactoEntrega?: string;
}
```

Dentro de `create()`, el bloque de `prisma.carrera.create` tiene hoy:

```ts
        origen: data.origen || 'WHATSAPP',
        notas: data.notas || null,
      },
```

Cámbialo a:

```ts
        origen: data.origen || 'WHATSAPP',
        notas: data.notas || null,
        contactoEntrega: data.contactoEntrega || null,
      },
```

- [ ] **Step 2: Notificar el contacto de entrega al dueño y al conductor**

En `src/services/notificaciones.service.ts`, dentro de `notificarNuevaSolicitud`, el
bloque de notas es hoy:

```ts
      if (carrera.notas) {
        await mensajeriaService.enviarMensaje(telefonoAdmin, `📝 Nota: ${carrera.notas}`);
      }
    } catch (e) { console.error('Error notificando nueva solicitud al dueño:', e); }
```

Cámbialo a:

```ts
      if (carrera.notas) {
        await mensajeriaService.enviarMensaje(telefonoAdmin, `📝 Nota: ${carrera.notas}`);
      }
      if (carrera.contactoEntrega) {
        await mensajeriaService.enviarMensaje(telefonoAdmin, `👤 Recibe: ${carrera.contactoEntrega}`);
      }
    } catch (e) { console.error('Error notificando nueva solicitud al dueño:', e); }
```

Dentro de `notificarAsignacion`, el bloque análogo es hoy:

```ts
      if (carrera.notas) {
        await mensajeriaService.enviarMensaje(carrera.conductor.telefono, `📝 Nota: ${carrera.notas}`);
      }
    } catch (e) { console.error('Error notificando al conductor:', e); }
```

Cámbialo a:

```ts
      if (carrera.notas) {
        await mensajeriaService.enviarMensaje(carrera.conductor.telefono, `📝 Nota: ${carrera.notas}`);
      }
      if (carrera.contactoEntrega) {
        await mensajeriaService.enviarMensaje(carrera.conductor.telefono, `👤 Recibe: ${carrera.contactoEntrega}`);
      }
    } catch (e) { console.error('Error notificando al conductor:', e); }
```

- [ ] **Step 3: Mostrar el contacto de entrega en el panel admin**

En `src/admin/carreras.html`, dentro de `verDetalles`, la línea de la nota es hoy:

```js
      if (c.notas) filas.push(['Nota', esc(c.notas)]);
```

Cámbiala a:

```js
      if (c.notas) filas.push(['Nota', esc(c.notas)]);
      if (c.contactoEntrega) filas.push(['Contacto de entrega', esc(c.contactoEntrega)]);
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin salida. `carreras.html` no compila con `tsc` (JS estático sin build) —
verifica por inspección que el JS agregado es sintácticamente válido (una línea,
mismo patrón que la de arriba).

- [ ] **Step 5: Commit**

```bash
git add src/services/carreras.service.ts src/services/notificaciones.service.ts src/admin/carreras.html
git commit -m "feat: propagar contacto de entrega a creación de carrera, notificaciones y panel admin"
```

---

## Task 4: Combinar notas y enviar contacto de entrega al crear la carrera

**Files:**
- Modify: `src/services/whatsapp/bot.service.ts`

**Interfaces:**
- Consumes: `contexto.notaRecogida`/`notaDestino`/`contactoEntrega` (Task 2);
  `CrearCarreraInput.contactoEntrega` (Task 3).
- Produces: `private construirNotas(contexto: ConversationContext): string |
  undefined`.

- [ ] **Step 1: Agregar `construirNotas` y usarla en `crearCarreraConfirmada`**

`crearCarreraConfirmada` arma hoy el input de la carrera así:

```ts
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
      notas: contexto.notas,
    });
```

Cámbialo a:

```ts
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
      notas: this.construirNotas(contexto),
      contactoEntrega: contexto.contactoEntrega,
    });
```

Justo antes de `private async crearCarreraConfirmada(`, agrega el método nuevo:

```ts
  // Los mandados ya usan contexto.notas para el encargo (capturado antes de pedir
  // direcciones) — para el resto de servicios, se arman las notas de recogida y
  // destino combinadas solo si hay ambas, o sin etiqueta si hay solo una.
  private construirNotas(contexto: ConversationContext): string | undefined {
    if (contexto.esMandado) return contexto.notas;
    const { notaRecogida, notaDestino } = contexto;
    if (notaRecogida && notaDestino) return `Recogida: ${notaRecogida} | Destino: ${notaDestino}`;
    return notaRecogida || notaDestino || undefined;
  }

```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 3: Prueba manual por inspección**

Traza los tres casos y confírmalos contra el código final:
- `notaRecogida` y `notaDestino` con valor → `construirNotas` devuelve
  `"Recogida: X | Destino: Y"`.
- Solo uno de los dos con valor → devuelve ese valor solo, sin etiqueta.
- Mandado (`esMandado: true`) → devuelve `contexto.notas` tal cual (el encargo),
  ignorando `notaRecogida`/`notaDestino` aunque tuvieran valor (no deberían, porque la
  Task 2 nunca los encola para mandado).

- [ ] **Step 4: Commit**

```bash
git add src/services/whatsapp/bot.service.ts
git commit -m "feat: combinar notas de recogida/destino y enviar contacto de entrega al crear la carrera"
```

---

## Task 5: Verificación final end-to-end

No hay cambios de código en esta tarea — es la lista de regresión completa antes de
dar por terminado el trabajo, tal como pide la sección "Verificación" del spec.

- [ ] **Step 1: `npx tsc --noEmit` limpio**

Run: `npx tsc --noEmit`
Expected: sin salida, sobre el estado final de todas las tareas anteriores.

- [ ] **Step 2: Domicilio completo con los tres pasos llenados**

Domicilio normal → llenar nota de recogida, nota de destino y contacto de entrega (los
tres) → confirmar que las tres líneas le llegan al conductor
(`notificarAsignacion`) y al dueño (`notificarNuevaSolicitud`), y que aparecen en el
detalle de la carrera en el panel admin (`Nota` combinada + `Contacto de entrega`).

- [ ] **Step 3: Domicilio con los tres pasos omitidos**

Domicilio normal → tocar "Omitir" en los tres pasos → la carrera se crea sin `notas`
ni `contactoEntrega`, sin mensajes de más al conductor ni al dueño, ni filas de más en
el panel admin.

- [ ] **Step 4: Dirección con número aproximado**

Pedir una dirección que Mapbox resuelva a un número distinto al escrito → confirmar
que aparece "Buscaste: ... / Encontramos: ..." con las dos aclaraciones → responder
"Sí" → confirmar que el siguiente paso (nota de esa misma dirección) permite escribir
la aclaración del número exacto.

- [ ] **Step 5: Cotización de un domicilio → "Pedir servicio"**

Cotizar un domicilio → "Pedir servicio" → confirmar que aparecen los tres pasos
opcionales en orden (nota recogida, nota destino, contacto de entrega) antes de que se
cree la carrera, y que no se vuelve a preguntar el momento (ya resuelto durante la
cotización).

- [ ] **Step 6: Mototaxi vía cotización**

Cotizar un mototaxi → "Pedir servicio" → confirmar que solo aparecen nota de recogida
y nota de destino (sin contacto de entrega, porque no es domicilio).

- [ ] **Step 7: Mandado completo, directo y vía cotización**

Mandado de principio a fin (directo) → confirmar que ninguno de los pasos nuevos
aparece en ningún punto. Repetir cotizando un mandado y pulsando "Pedir servicio" →
mismo resultado, cero pasos nuevos, va directo a evidencia/creación.
