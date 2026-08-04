# Cotización sin pedido y nota adicional de dirección — Spec de diseño

Fecha: 2026-08-03

## Contexto y propósito

El dueño reportó dos problemas de negocio:

1. Clientes quieren saber cuánto cuesta un domicilio/mototaxi a una dirección antes de
   decidirse a pedirlo, sin tener que comprometerse a un pedido real.
2. Clientes abandonan el flujo a mitad de camino, principalmente al dar direcciones:
   - Direcciones informales o no estructuradas (ej. "terminal entrada 2") que Mapbox no
     encuentra en absoluto.
   - Direcciones que Mapbox sí encuentra pero de forma aproximada (ej. el cliente pide
     "carrera 17 #59-78" y Mapbox devuelve "carrera 17 #59-76", la casa vecina) — la
     dirección exacta existe pero el geocoder no la tiene indexada con ese número.
   - Conjuntos, edificios o apartamentos que necesitan información adicional (torre,
     apto, interior, portería) que una dirección geocodificada por sí sola no captura.

El cálculo de precio ya existe antes de crear la carrera (estado `CONFIRMACION_PRECIO`)
— no hace falta nueva lógica de precio, solo una entrada explícita de "solo cotizar" y
una salida que no fuerza a pedir o perderse.

## Alcance

- Botón de cotización en el menú principal, que reutiliza el flujo de direcciones
  existente y termina en una pantalla de precio con opciones de pedir, cotizar otra
  dirección, o salir.
- Paso opcional de "información adicional" después de confirmar el destino, para
  aclarar direcciones aproximadas o dar datos de apartamento/conjunto — se guarda en el
  campo `notas` de la carrera (mismo campo que ya usa el flujo de mandado).

Fuera de alcance: detección automática de coincidencias aproximadas vía metadata de
Mapbox (`match_code` u otros) para cambiar el texto de confirmación de dirección — el
paso de nota adicional ya cubre este caso sin depender de un campo de la API de Mapbox
que no está verificado en este proyecto. Cambiar el umbral de intentos fallidos (se
mantiene en 2, sin cambios). Cambios al flujo de registro de nombre para clientes
nuevos.

## 1. Botón de Cotización

**Entrada**: nuevo botón `menu_cotizar` ("💰 Cotizar") en el segundo mensaje del menú
principal, junto a "🙋 Hablar con asesor" (2 botones, dentro del límite de 3 por
mensaje de WhatsApp).

En `manejarMenuPrincipal`, `menu_cotizar` hace lo mismo que `menu_pedir` (envía el menú
de tipo de servicio, pasa a `ESPERANDO_TIPO_SERVICIO`) pero además marca
`contexto.soloCotizacion = true`.

**Flujo**: idéntico al de pedido normal (tipo de servicio → recogida → confirmar →
destino → confirmar → momento) hasta llegar a `calcularYMostrarPrecio`. El paso de nota
adicional (sección 2) se salta mientras `soloCotizacion` sea `true`.

**Pantalla de precio con `soloCotizacion = true`**: en vez del mensaje/botones actuales
de "Confirmar / Cancelar", se envía un mensaje de cotización con 3 botones:

- `cotizacion_pedir` — "✅ Pedir servicio"
- `cotizacion_otra` — "🔄 Cotizar otra"
- `btn_salir` — "🚪 Salir al menú" (botón global ya existente, sin cambios)

**`manejarConfirmacionPrecio`** gana una rama para `contexto.soloCotizacion`:

- `cotizacion_pedir`: pone `soloCotizacion = false`. Si `!esMandado`, pide la nota
  adicional (`ESPERANDO_NOTA_ADICIONAL`, con `contexto.notaAdicionalSiguiente = 'crear'`
  — ver sección 2) antes de continuar; si es mandado, continúa directo al mismo punto al
  que llegaría un pedido normal confirmado (evidencia si es domicilio, o crear la
  carrera si es mototaxi/mandado).
- `cotizacion_otra`: limpia `recogida`, `destino`, `distanciaKm`, `precio`,
  `intentosRecogida`, `intentosDestino` del contexto (conserva `tipoServicio`,
  `esMandado` y su `notas` si aplica) y vuelve a pedir la dirección de recogida
  (`SOLICITAR_RECOGIDA` o `SOLICITAR_ZONA_MANDADO` según `esMandado`), estado
  `ESPERANDO_RECOGIDA`.
- Cualquier otro texto: `OPCION_INVALIDA`, igual que el resto del bot.

La lógica que hoy sigue a una confirmación de precio afirmativa (`tipoServicio ===
'DOMICILIO'` → pedir evidencia; si no → crear la carrera) se extrae a un método
compartido `continuarTrasConfirmacionPrecio`, reutilizado tanto por la rama normal
(`precio_si`) como por `cotizacion_pedir` (vía el paso de nota adicional) y por el flujo
de nota adicional cuando viene marcado como `'crear'` (sección 2).

## 2. Nota adicional de dirección

**Nuevo estado**: `ESPERANDO_NOTA_ADICIONAL`.

**Disparo**: en `avanzarDespuesDeDireccion`, después de confirmar el destino
(`campo === 'destino'`), si `!contexto.esMandado && !contexto.soloCotizacion`, en vez de
ir directo a `SOLICITAR_MOMENTO` se envía:

> 📝 *Si tu dirección es un conjunto/apartamento, o el punto exacto no aparece en el
> mapa, cuéntanos aquí (torre, apto, interior, o una referencia como "al lado de la
> tienda"). Si no necesitas aclarar nada, toca Omitir.*

con un botón `nota_omitir` ("Omitir"), y se guarda `contexto.notaAdicionalSiguiente =
'momento'`. Si es mandado o es cotización, sigue igual que hoy (`SOLICITAR_MOMENTO`
directo) — un mandado ya dio esa info libre en "cuéntanos qué necesitas" al inicio, y
una cotización no la necesita todavía.

**`manejarNotaAdicional`** (nuevo método):

- Si el mensaje no es `nota_omitir`, guarda `contexto.notas = mensaje.trim()`.
- Lee `contexto.notaAdicionalSiguiente`:
  - `'momento'` (caso normal): envía `SOLICITAR_MOMENTO` con los botones
    ahora/programado, pasa a `ESPERANDO_MOMENTO` — mismo punto al que llegaría hoy
    después de confirmar el destino.
  - `'crear'` (viene de "✅ Pedir servicio" tras una cotización, donde el momento ya se
    resolvió antes de calcular el precio): llama a
    `continuarTrasConfirmacionPrecio` directamente, sin volver a preguntar el momento.

**Reutilización del campo `notas`**: es el mismo campo ya agregado a `Carrera` para el
flujo de mandado — no requiere cambios de esquema. Ya se envía como mensaje de
seguimiento al dueño y al conductor (`notificarNuevaSolicitud`,
`notificarAsignacion`), así que la nota queda visible sin tocar
`notificaciones.service.ts`.

## 3. Cambios de tipos y plantillas

**`src/types/index.ts`**:

```ts
export type ConversationState =
  | ... // estados existentes
  | 'ESPERANDO_NOTA_ADICIONAL'
  | 'COMPLETADA';

export interface ConversationContext {
  // ...campos existentes
  soloCotizacion?: boolean;
  notaAdicionalSiguiente?: 'momento' | 'crear';
}
```

**`src/services/whatsapp/templates.ts`**: nuevos mensajes `COTIZACION_CALCULADA` (mismo
contenido que `PRECIO_CALCULADO` pero encabezado "💰 *Cotización*" y cierre "¿Qué deseas
hacer?" en vez de "¿Confirmas el pedido?") y `SOLICITAR_NOTA_ADICIONAL`. Los títulos de
los botones nuevos (`💰 Cotizar`, `✅ Pedir servicio`, `🔄 Cotizar otra`, `Omitir`) se
verifican contra el límite de 20 caracteres UTF-16 de WhatsApp durante la
implementación, igual que los botones agregados en la sesión anterior.

## Errores y casos borde

- Cliente pulsa `cotizacion_otra` sin haber llegado nunca a `CONFIRMACION_PRECIO` (botón
  viejo/reenviado): no aplica — este botón solo se envía junto con el precio, y la
  validación global de conversación expirada (`!conversacion` en `procesarMensaje`) ya
  cubre el caso de un botón viejo sin conversación activa detrás.
- Cliente en `ESPERANDO_NOTA_ADICIONAL` comparte ubicación o imagen en vez de texto: se
  trata igual que cualquier texto libre — se guarda como nota lo que venga en
  `mensaje`; si el payload no trae texto (ej. solo ubicación), no hay nada que hacer
  distinto a como ya maneja `procesarMensaje` otros mensajes sin texto en estados que no
  lo esperan expresamente.
- `soloCotizacion` y `esMandado` nunca se marcan `true` a la vez en la primera pasada
  (el menú de cotización entra por el mismo selector de tipo de servicio, así que un
  cliente puede cotizar un mandado) — en ese caso se salta la nota adicional por ambos
  motivos, sin conflicto.

## Verificación

- `npx tsc --noEmit` limpio.
- Prueba manual: cotizar un domicilio → ver precio con las 3 opciones → "Cotizar otra"
  → nueva dirección de recogida sin repetir tipo de servicio → precio actualizado →
  "Pedir servicio" → nota adicional → evidencia → carrera creada con la nota visible en
  el aviso al dueño.
- Prueba manual: pedido normal (no cotización) de un domicilio a un conjunto/apartamento
  → nota adicional aparece antes de "¿para cuándo?" → se guarda y llega al conductor
  asignado.
- Prueba manual: mandado completo → confirma que la nota adicional no aparece (ya usó el
  campo `notas` para el encargo).
