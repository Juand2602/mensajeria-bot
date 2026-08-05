# Contacto de entrega y notas de dirección por tramo — Spec de diseño

Fecha: 2026-08-05

## Contexto y propósito

El dueño reportó dos problemas de negocio, con casos reales de clientes:

1. En un domicilio, la persona que hace el pedido por WhatsApp (el `Cliente`) no
   siempre es quien recibe en el destino (ej. María pide, Carmen recibe). Hoy no hay
   forma de decirle al conductor a nombre de quién preguntar o a qué teléfono llamar
   al llegar.
2. Una clienta pidió un domicilio a "calle 101 #12-45"; Mapbox solo encontró
   "calle 101 #12-44" (la casa vecina) y el bot mostró esa dirección como si fuera
   exacta. La clienta confirmó sin darse cuenta del cambio de número y quedó con la
   duda de si el domicilio llegaría a la casa correcta. El paso de "información
   adicional" agregado en la sesión anterior (`docs/superpowers/specs/2026-08-03-...`)
   solo se pregunta una vez, después del destino — nunca después de la recogida,
   que es justamente donde ocurrió este caso.

## Alcance

- Nuevo paso opcional para capturar nombre y teléfono de quien recibe en el destino.
- El paso de nota de dirección (ya existente) se duplica para recogida, además de
  destino, con mensajes específicos a cada tramo.
- El mensaje de confirmación de dirección (`CONFIRMAR_DIRECCION`) muestra lo que el
  cliente escribió junto a lo que Mapbox encontró, con una aclaración corta de qué
  hacer en cada caso (número inexacto vs. dirección totalmente distinta).
- Mecanismo de cola de pasos pendientes para que la cotización, al convertirse en
  pedido, no se salte ninguno de estos pasos opcionales.

Fuera de alcance: detección automática de coincidencias aproximadas vía metadata de
Mapbox (igual que en el spec anterior — se sigue prefiriendo no depender de un campo
no verificado de la API). Separar el contacto de entrega en columnas de nombre y
teléfono independientes (se guarda como un solo texto libre). Aplicar el contacto de
entrega a mototaxi o mandado (ver sección 1).

## 1. Contacto de entrega (destino)

Nuevo paso opcional, solo para domicilio (no mototaxi, no mandado), después de
confirmar el destino:

> 👤 *¿Quién recibe el domicilio en el destino?* Escribe el nombre y teléfono de esa
> persona (ej: "Carmen García, 3001234567"). Si eres tú, escribe tu nombre, o toca
> Omitir.

Botón: `paso_omitir` ("Omitir") — mismo id genérico que ya usan los demás pasos
opcionales de esta cadena (ver sección 4).

Se guarda en un campo nuevo `Carrera.contactoEntrega` (`String?`, nullable, sin
migración destructiva). Al conductor y al dueño les llega como línea aparte,
independiente de la nota de dirección:

> 👤 Recibe: Carmen García - 3001234567

Se omite todo el paso (no se pregunta) si `contexto.tipoServicio !== 'DOMICILIO'` o
`contexto.esMandado` es `true`.

## 2. Nota de dirección en recogida y en destino

El paso de nota (ya existente para destino) se duplica para recogida, con mensajes
específicos a cada tramo para que el cliente sepa cuál dirección está aclarando:

> 📝 Si la dirección de **recogida** es un conjunto/apartamento, o el punto exacto no
> aparece en el mapa, cuéntanos aquí (torre, apto, interior, o una referencia). Si no
> necesitas aclarar nada, toca *Omitir*.

> 📝 Si la dirección de **destino** es un conjunto/apartamento, o el punto exacto no
> aparece en el mapa, cuéntanos aquí (torre, apto, interior, o una referencia). Si no
> necesitas aclarar nada, toca *Omitir*.

Ambas notas se guardan por separado (`contexto.notaRecogida`, `contexto.notaDestino`)
y se combinan en un solo `Carrera.notas` al crear la carrera:

- Si hay ambas: `Recogida: {notaRecogida} | Destino: {notaDestino}`.
- Si hay solo una: se manda sin etiqueta, igual que hoy.
- Si es mandado: sin cambios — se sigue usando `contexto.notas` tal cual (el encargo),
  y ninguno de los dos pasos de nota se pregunta.
- Si es cotización (`soloCotizacion`): ninguno de los dos pasos se pregunta durante la
  cotización — se preguntan si el cliente confirma "Pedir servicio" (ver sección 4).

## 3. Mensaje de confirmación de dirección con comparación

`CONFIRMAR_DIRECCION` pasa de recibir solo la dirección encontrada a recibir también
el texto que el cliente escribió:

> Buscaste: *calle 101 #12-45*
> 📍 Encontramos: *Calle 101 #12-44, Bucaramanga*
>
> _(Es la coincidencia más cercana que encontramos. Si el número no es exacto,
> responde "Sí" de todas formas — en el siguiente paso podrás escribir la aclaración
> exacta. Si esta dirección no tiene nada que ver con la tuya, responde "No" para
> intentar de nuevo.)_
>
> ¿Es correcta?

Este mensaje solo aplica al flujo de búsqueda por texto (`manejarDireccion`, rama sin
`ubicacion`) — cuando el cliente comparte su ubicación GPS no hay ambigüedad que
comparar, así que ese camino sigue sin pasar por esta confirmación (sin cambios).

## 4. Mecanismo técnico: cola de pasos pendientes

Con hasta tres pasos opcionales encadenables (nota de recogida, nota de destino,
contacto de entrega) y dos formas de llegar a ellos (flujo normal, o cotización
convertida en pedido), se generaliza el flag único que ya existía
(`notaAdicionalSiguiente: 'momento' | 'crear'`) a una cola:

```ts
type PasoPendiente = 'notaRecogida' | 'notaDestino' | 'contactoDestino';
```

`ConversationContext` gana:
- `pasosPendientes?: PasoPendiente[]` — los que faltan por preguntar.
- `pasoActual?: PasoPendiente` — el que se acaba de enviar y se está esperando responder.
- `pasoPendienteSiguiente?: 'destino' | 'momento' | 'crear'` — qué hacer cuando la cola
  se vacía (reemplaza a `notaAdicionalSiguiente`; gana el valor `'destino'` frente al
  spec anterior, para el caso de recogida descrito abajo).
- `notaRecogida?: string`, `notaDestino?: string`, `contactoEntrega?: string`.

Un solo estado (`ESPERANDO_PASO_PENDIENTE`, reemplaza a `ESPERANDO_NOTA_ADICIONAL`)
maneja los tres tipos de paso. Dos funciones:

- `encolarPasosPendientes(contexto, pasos, siguiente)`: fija la cola y qué sigue
  después, luego avanza al primer paso.
- `avanzarPasoPendiente(telefono, contexto, conversacionId)`: saca el siguiente paso
  de la cola; si no queda ninguno, ejecuta `pasoPendienteSiguiente` (pide el momento, o
  crea la carrera); si queda uno, lo guarda en `pasoActual`, manda el mensaje
  correspondiente con el botón `paso_omitir`, y pasa a `ESPERANDO_PASO_PENDIENTE`.

El manejador del estado (`manejarPasoPendiente`) guarda la respuesta en el campo de
contexto que le toca según `pasoActual` (a menos que el mensaje sea `paso_omitir`),
limpia `pasoActual`, y llama a `avanzarPasoPendiente` de nuevo.

**Puntos de entrada a la cola** — `contactoDestino` solo se agrega a la lista cuando
`contexto.tipoServicio === 'DOMICILIO'` (mototaxi conserva las notas de dirección,
igual que hoy, pero no tiene "contacto de entrega" — no aplica a un pasajero):

- Tras confirmar recogida (si no es mandado ni cotización):
  `encolarPasosPendientes(contexto, ['notaRecogida'], 'destino')`.
- Tras confirmar destino (si no es mandado ni cotización):
  `encolarPasosPendientes(contexto, esDomicilio ? ['notaDestino', 'contactoDestino'] : ['notaDestino'], 'momento')`.
- Al pulsar "✅ Pedir servicio" desde una cotización, si no es mandado:
  `encolarPasosPendientes(contexto, esDomicilio ? ['notaRecogida', 'notaDestino', 'contactoDestino'] : ['notaRecogida', 'notaDestino'], 'crear')`.
  Si es mandado, sigue igual que hoy (directo a `continuarTrasConfirmacionPrecio`).

## 5. Cambios de datos y plantillas

**`prisma/schema.prisma`**: `Carrera` gana `contactoEntrega String?` (nullable, sin
migración destructiva, mismo patrón que `notas`).

**`src/services/carreras.service.ts`**: `CrearCarreraInput` gana
`contactoEntrega?: string`; `create()` lo pasa al `prisma.carrera.create`.

**`src/services/notificaciones.service.ts`**: `notificarNuevaSolicitud` y
`notificarAsignacion` mandan la línea de contacto (`👤 Recibe: ...`) como mensaje de
seguimiento aparte, igual que ya hacen con `notas`, cuando `carrera.contactoEntrega`
existe.

**`src/admin/carreras.html`**: el modal de detalles agrega una fila "Contacto de
entrega" cuando `c.contactoEntrega` existe (mismo patrón que la fila de notas ya
agregada).

**`src/services/whatsapp/templates.ts`**: `CONFIRMAR_DIRECCION` cambia de firma (ver
sección 3); se agregan `SOLICITAR_NOTA_RECOGIDA`, `SOLICITAR_NOTA_DESTINO` (reemplazan
a `SOLICITAR_NOTA_ADICIONAL`) y `SOLICITAR_CONTACTO_ENTREGA`.

## Errores y casos borde

- Cliente comparte ubicación GPS en vez de texto en cualquiera de los tres pasos
  pendientes: mismo criterio ya establecido en el spec anterior — no se guarda como
  respuesta válida (se trata como si hubiera tocado Omitir), evita guardar el texto
  sentinela de ubicación/imagen como nota o contacto.
- Cliente pulsa un botón viejo (de un paso ya pasado) mientras está en
  `ESPERANDO_PASO_PENDIENTE`: mismo criterio ya establecido — solo texto libre real
  (no botón, no ubicación, no imagen) se guarda; cualquier botón se trata como
  "omitir este paso".
- Mototaxi: conserva `notaRecogida`/`notaDestino` (ya las tenía antes de este cambio,
  sin tipoServicio de por medio) pero nunca entra a la cola con `contactoDestino` —
  ver la condición `esDomicilio` en la sección 4.

## Verificación

- `npx tsc --noEmit` limpio.
- Migración de Prisma aplicada sin pérdida de datos.
- Prueba manual: domicilio completo con nota de recogida, nota de destino y contacto
  de entrega, los tres llenados → verificar que las tres líneas le llegan al
  conductor y aparecen en el detalle del panel admin.
- Prueba manual: domicilio con los tres pasos omitidos → carrera se crea sin notas ni
  contacto, sin mensajes de más al conductor.
- Prueba manual: dirección con número aproximado → confirmar el nuevo mensaje de
  comparación aparece, responder "Sí" → confirmar que el siguiente paso (nota) permite
  aclarar el número exacto.
- Prueba manual: cotización de un domicilio → "Pedir servicio" → confirmar que
  aparecen los tres pasos opcionales en orden (nota recogida, nota destino, contacto)
  antes de crear la carrera.
- Prueba manual: mandado completo → confirmar que ninguno de los tres pasos nuevos
  aparece en ningún punto del flujo (ni directo ni vía cotización).
