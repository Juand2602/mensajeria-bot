# Serveloz — Evidencia fotográfica en carreras (cliente y conductor)

Fecha: 2026-07-16
Basado en: conversación de análisis de escenarios reales del dueño sobre el bot de WhatsApp.

## 1. Contexto y problema

El dueño planteó dos necesidades relacionadas con "cubrirse" ante disputas sobre el
estado de un domicilio: que el **cliente** pueda dejar evidencia fotográfica del
objeto que va a enviar (por si llega dañado y hay un reclamo), y que el
**mensajero/conductor** pueda dejar evidencia de que recogió y de que entregó el
domicilio.

Al explorar la implementación se encontró una restricción real: el conductor hoy
**no tiene ningún flujo conversacional con el bot** — solo recibe una plantilla de
notificación de una sola vía (`nueva_carrera_mensajero`, ver
`notificaciones.service.ts`). El modelo `Conversacion` está atado únicamente a
`Cliente`, no hay relación con `Conductor`, y no existe ningún evento de "el
conductor confirma que recogió" — hoy el dueño marca la carrera como completada
manualmente desde el panel.

Este documento diseña cómo agregar evidencia fotográfica para ambos casos sin
construir una máquina de estados completa para conductores (no hace falta, dado que
el flujo acordado es opcional y de un solo intercambio de mensajes).

## 2. Modelo de datos (Prisma)

Tabla nueva:

```prisma
model EvidenciaFoto {
  id        String   @id @default(uuid())
  carreraId String
  carrera   Carrera  @relation(fields: [carreraId], references: [id])
  tipo      String?  // RECOGIDA | ENTREGA — null para fotos del cliente (no aplica)
  autor     String   // CLIENTE | CONDUCTOR
  url       String   // URL en Cloudinary (secure_url)
  createdAt DateTime @default(now())

  @@index([carreraId])
}
```

Se agrega `evidencias EvidenciaFoto[]` a `Carrera`. Es una tabla relacional
independiente (no campos JSON en `Carrera`) — más simple de consultar y de mostrar
en el panel, y más fácil de extender a futuro (ej. agregar quién subió la foto o un
comentario) sin tocar el esquema de `Carrera`.

Migración: aditiva, no afecta datos existentes.

## 3. Flujo del conductor (fotos de recogida/entrega)

**Identificación (webhook):** al llegar cualquier mensaje, se busca el teléfono
remitente en `Conductor` (`activo: true`) antes de asumir que es un cliente. Si
coincide, se enruta a un manejador de conductor separado y liviano, sin la máquina
de estados de `bot.service.ts` (que sigue siendo exclusiva de clientes).

**Cuando llega una foto (`message.type === 'image'`) de un conductor identificado:**

1. Se buscan sus carreras con `estado: 'ASIGNADA'` y `conductorId` = ese conductor.
2. **Cero carreras activas:** responde "No tienes ninguna carrera asignada en este
   momento." y no guarda nada.
3. **Más de una carrera activa** (caso raro — el dueño asigna una por una
   manualmente): responde "Tienes varias carreras activas — comunícate directo con
   el dueño para esta foto en particular." y no guarda nada. Se decidió
   explícitamente no construir un paso de selección de carrera para este caso
   excepcional (YAGNI).
4. **Exactamente una carrera activa:** se descarga la foto y se sube a Cloudinary
   (ver sección 5), se crea la fila `EvidenciaFoto` (`carreraId` conocido,
   `autor: 'CONDUCTOR'`, `tipo: null` todavía), y se le pregunta con botones de
   WhatsApp: **"Recogida"** (`evidencia_recogida`) / **"Entrega"**
   (`evidencia_entrega`).

**Cuando llega la respuesta del botón:** se busca la `EvidenciaFoto` con `tipo: null`
más reciente cuya carrera pertenezca a ese conductor, se actualiza su `tipo`, y se
responde "Listo, guardamos tu foto de recogida/entrega. Gracias 🙌". Si no se
encuentra ninguna foto pendiente (ej. doble tap accidental), se responde "No
encontré una foto pendiente de etiquetar."

Este flujo es completamente **opcional** — si el conductor nunca manda foto, la
carrera sigue su curso normal (el dueño la asigna y la marca completada desde el
panel exactamente igual que hoy). No se agrega ningún paso obligatorio ni se cambia
quién dispara la transición a `COMPLETADA`.

Cualquier otro tipo de mensaje de un conductor identificado (texto libre, por
ejemplo) queda fuera de alcance de este diseño — no se construye un flujo
conversacional general para conductores, solo el intercambio foto → etiqueta descrito
arriba.

## 4. Flujo del cliente (evidencia del objeto, solo domicilios)

Justo después de que el cliente confirma el precio (botón "✅ Confirmar" en
`CONFIRMACION_PRECIO`) y **antes** de crear la carrera — solo si
`contexto.tipoServicio === 'DOMICILIO'`:

1. El bot pregunta si quiere adjuntar una foto del objeto (opcional), con un botón
   de salida ("➡️ Continuar sin foto"), y pasa a un nuevo estado
   `ESPERANDO_EVIDENCIA_CLIENTE`.
2. Esperando en ese estado:
   - **Llega una foto:** se descarga y sube a Cloudinary, y **entonces** se crea la
     carrera junto con su `EvidenciaFoto` (`autor: 'CLIENTE'`, `tipo: null`).
   - **Llega el botón "Continuar sin foto"** (o una respuesta negativa): se crea la
     carrera igual, sin evidencia.
   - Cualquier otra cosa: `MENSAJES.OPCION_INVALIDA()`, se mantiene en el mismo
     estado.
3. Para `MOTOTAXI` no cambia nada respecto a hoy: la carrera se crea de inmediato al
   confirmar el precio, sin este paso intermedio (no hay "objeto" que fotografiar).

**Refactor necesario:** la lógica de creación de carrera que hoy vive inline en
`manejarConfirmacionPrecio` (crear la `Carrera`, notificar al dueño, enviar
`CARRERA_CONFIRMADA` + métodos de pago, pasar a `ESPERANDO_ASIGNACION`) se extrae a
un método compartido `crearCarreraConfirmada(telefono, contexto, conversacionId,
evidenciaUrl?)`, llamado tanto por el camino de mototaxi (inmediato, sin evidencia)
como por el de domicilio (tras la foto o el skip) — evita duplicar esa lógica entre
los dos caminos.

**Cambio transversal:** el webhook debe empezar a manejar mensajes `type: 'image'`
(hoy se ignoran por completo), pasando un `mediaId` opcional a través de
`procesarMensaje`/`procesarEstado`, igual que ya se hace hoy con `ubicacion` para
mensajes de tipo `location`.

## 5. Descarga desde WhatsApp y subida a Cloudinary

Nuevo `src/services/media.service.ts`, con una sola responsabilidad:

```typescript
class MediaService {
  async descargarYSubir(mediaId: string): Promise<string> {
    // 1. GET https://graph.facebook.com/v18.0/{mediaId} (con el token del bot)
    //    → devuelve una URL temporal de descarga
    // 2. GET esa URL temporal (mismo token) → los bytes de la imagen
    // 3. Subir el buffer a Cloudinary (SDK oficial de Node, upload_stream)
    // 4. Devolver la `secure_url` de Cloudinary
  }
}
```

Se usa desde ambos flujos (cliente y conductor) — un solo punto de descarga y
subida, sin duplicar esa lógica.

**Nueva dependencia:** `cloudinary` (SDK oficial de Node).
**Nuevas variables de entorno:** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET` (del dashboard de una cuenta gratuita de Cloudinary — el
usuario debe crearla antes de que esta funcionalidad pueda arrancar en producción;
mismo patrón que la cuenta de Mapbox).

## 6. Panel de administración

En `carreras.html`, se agrega `evidencias: true` al `include` que ya usan
`carrerasService.getAll()`/`getById()` — sin crear un endpoint nuevo. En cada
tarjeta de carrera, solo si `evidencias.length > 0`, se agrega una sección con
miniaturas agrupadas por autor/tipo (ej. "📷 Cliente", "📷 Recogida", "📷 Entrega"),
cada una como link directo a la imagen en Cloudinary (abre en pestaña nueva — no se
construye un visor propio).

## 7. Casos borde y manejo de errores

- **Falla la descarga de WhatsApp o la subida a Cloudinary:** se avisa al
  cliente/conductor ("No pudimos procesar la foto, intenta de nuevo o continúa sin
  ella") sin trabar el flujo — el cliente puede seguir tocando "Continuar sin foto".
- **Conductor sin carreras activas / con más de una:** ver sección 3, puntos 2 y 3.
- **Tamaño/formato de imagen:** WhatsApp ya limita el tamaño de las fotos que deja
  enviar (unos pocos MB); Cloudinary los acepta sin problema — no hace falta
  validación adicional de tamaño o formato.
- **Pruebas:** sin automatizadas, mismo criterio que el resto del proyecto —
  verificación manual con una foto real de cliente y una de conductor (incluyendo
  el etiquetado por botones) antes de dar por buena la implementación.

## 8. Fuera de alcance de este documento

- Flujo conversacional general para conductores (más allá del intercambio foto →
  etiqueta): si más adelante se quiere que el conductor confirme recogida/entrega
  como eventos que cambian el estado de la carrera, es un diseño aparte.
- Selección de carrera cuando un conductor tiene más de una activa al mismo tiempo
  (se decidió explícitamente responder con un mensaje y no construir ese paso).
- Visor de imágenes dentro del panel (se abre directamente en Cloudinary).
- Compresión/transformación de imágenes más allá de lo que Cloudinary hace por
  defecto.
