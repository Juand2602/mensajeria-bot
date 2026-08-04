# Cotización sin pedido y nota adicional de dirección — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un botón de cotización que reutiliza el flujo de pedido existente sin
crear una carrera, y un paso opcional de "información adicional" para direcciones
aproximadas o de conjunto/apartamento, guardado en el campo `notas` ya existente.

**Architecture:** Todo el trabajo vive en la máquina de estados de
`src/services/whatsapp/bot.service.ts` (un estado nuevo, dos ramas de contexto nuevas).
No hay endpoints, tablas ni componentes de UI nuevos — el panel admin ya muestra
`notas` en el detalle de carrera desde una sesión anterior.

**Tech Stack:** Node.js/TypeScript, Prisma (sin migraciones nuevas — `Carrera.notas` ya
existe), mensajería WhatsApp Cloud API vía `mensajeriaService`.

## Global Constraints

- Este proyecto no tiene tests automatizados ni lint configurado (ver `README.md`,
  sección Comandos) — la verificación de cada tarea es `npx tsc --noEmit` (debe quedar
  limpio) más una descripción de prueba manual. No hay pasos de "escribir test que
  falla" en este plan por esa razón.
- Botones interactivos de WhatsApp: máximo 3 por mensaje, y cada título máximo 20
  caracteres UTF-16. Los 4 títulos nuevos de este plan ya están verificados:
  `💰 Cotizar` (10), `✅ Pedir servicio` (16), `🔄 Cotizar otra` (15), `Omitir` (6).
- El campo `notas` de `Carrera` y de `ConversationContext` ya existen (agregados para
  el flujo de mandado) — no se necesita ninguna migración de Prisma en este plan.
- Seguir el estilo existente del archivo: comentarios solo cuando explican un porqué no
  obvio (ver comentarios actuales en `bot.service.ts`), nunca comentarios que describan
  qué hace la línea siguiente.

---

## Task 1: Tipos y plantillas nuevas

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/services/whatsapp/templates.ts`

**Interfaces:**
- Produces: `ConversationState` gana el valor `'ESPERANDO_NOTA_ADICIONAL'`.
  `ConversationContext` gana `soloCotizacion?: boolean` y
  `notaAdicionalSiguiente?: 'momento' | 'crear'`. `MENSAJES.COTIZACION_CALCULADA(info:
  { distanciaKm: number; precio: number; conDescuento: boolean })` y
  `MENSAJES.SOLICITAR_NOTA_ADICIONAL()` quedan disponibles para las tareas siguientes.

- [ ] **Step 1: Agregar el estado nuevo y los campos de contexto**

En `src/types/index.ts`, el tipo `ConversationState` termina hoy así:

```ts
  | 'ESPERANDO_CONFIRMACION_AYUDA'
  | 'COMPLETADA';
```

Cámbialo a:

```ts
  | 'ESPERANDO_CONFIRMACION_AYUDA'
  | 'ESPERANDO_NOTA_ADICIONAL'
  | 'COMPLETADA';
```

Y en `ConversationContext`, agrega los dos campos nuevos junto a `esMandado`/`notas`:

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
  ...
```

- [ ] **Step 2: Agregar las plantillas de mensaje nuevas**

En `src/services/whatsapp/templates.ts`, dentro del objeto `MENSAJES`, justo después de
`PRECIO_CALCULADO`, agrega:

```ts
  COTIZACION_CALCULADA: (info: { distanciaKm: number; precio: number; conDescuento: boolean }) =>
    `💰 *Cotización*\n\n📏 Distancia: ${info.distanciaKm.toFixed(1)} km\n💵 Precio: $${info.precio.toLocaleString('es-CO')}${info.conDescuento ? ' (con tu 20% de descuento por referido aplicado)' : ''}\n\n¿Qué deseas hacer?`,
```

Y después de `SOLICITAR_ZONA_MANDADO` (antes de `DESPEDIDA`), agrega:

```ts
  SOLICITAR_NOTA_ADICIONAL: () =>
    '📝 Si tu dirección es un conjunto/apartamento, o el punto exacto no aparece en el mapa, cuéntanos aquí (torre, apto, interior, o una referencia como "al lado de la tienda"). Si no necesitas aclarar nada, toca *Omitir*.',
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin salida (compilación limpia). Nada más consume estos símbolos todavía, así
que no hay comportamiento que probar manualmente en esta tarea.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/services/whatsapp/templates.ts
git commit -m "feat: agregar tipos y plantillas para cotización y nota adicional"
```

---

## Task 2: Botón de cotización en el menú principal

**Files:**
- Modify: `src/services/whatsapp/bot.service.ts`

**Interfaces:**
- Consumes: `ConversationContext.soloCotizacion` (Task 1).
- Produces: botón `menu_cotizar` que marca `contexto.soloCotizacion = true` y entra al
  mismo flujo que `menu_pedir`.

- [ ] **Step 1: Agregar el botón al segundo mensaje del menú principal**

En `bot.service.ts`, el método `enviarMenuPrincipal` termina hoy así:

```ts
    await mensajeriaService.enviarMensajeConBotones(telefono, 'También puedes:', [
      { id: 'menu_ayuda', title: '🙋 Hablar con asesor' },
    ]);
  }
```

Cámbialo a:

```ts
    await mensajeriaService.enviarMensajeConBotones(telefono, 'También puedes:', [
      { id: 'menu_ayuda', title: '🙋 Hablar con asesor' },
      { id: 'menu_cotizar', title: '💰 Cotizar' },
    ]);
  }
```

- [ ] **Step 2: Manejar el botón en `manejarMenuPrincipal`**

El método empieza hoy así:

```ts
  private async manejarMenuPrincipal(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (mensaje === 'menu_pedir') {
      await this.enviarMenuTipoServicio(telefono);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_TIPO_SERVICIO', contexto);
    } else if (mensaje === 'menu_referidos') {
```

Cámbialo a:

```ts
  private async manejarMenuPrincipal(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (mensaje === 'menu_pedir') {
      await this.enviarMenuTipoServicio(telefono);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_TIPO_SERVICIO', contexto);
    } else if (mensaje === 'menu_cotizar') {
      contexto.soloCotizacion = true;
      await this.enviarMenuTipoServicio(telefono);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_TIPO_SERVICIO', contexto);
    } else if (mensaje === 'menu_referidos') {
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 4: Prueba manual**

Desde WhatsApp (o el número de pruebas configurado): enviar cualquier mensaje para
llegar al menú principal → pulsar **"💰 Cotizar"** en el segundo mensaje de botones →
confirmar que aparece el menú de tipo de servicio (Domicilio/Mototaxi/Mandado), igual
que al pulsar "Pedir servicio". El resto del flujo (direcciones, momento, precio)
todavía se comporta como un pedido normal en esta tarea — eso se corrige en las tareas
4 y 5.

- [ ] **Step 5: Commit**

```bash
git add src/services/whatsapp/bot.service.ts
git commit -m "feat: agregar botón de cotización al menú principal"
```

---

## Task 3: Extraer `continuarTrasConfirmacionPrecio` (refactor sin cambio de comportamiento)

**Files:**
- Modify: `src/services/whatsapp/bot.service.ts`

**Interfaces:**
- Produces: `private async continuarTrasConfirmacionPrecio(telefono: string, contexto:
  ConversationContext, conversacionId: string): Promise<void>` — dado un contexto con
  `recogida`/`destino`/`precio` ya resueltos, envía el paso de evidencia (domicilio) o
  crea la carrera directamente (mototaxi/mandado). Usado por `manejarConfirmacionPrecio`
  aquí, y por `manejarNotaAdicional` en la Task 4.

- [ ] **Step 1: Extraer el método**

`manejarConfirmacionPrecio` es hoy:

```ts
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
        { id: 'evidencia_continuar', title: 'Continuar sin foto' },
      ]);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_EVIDENCIA_CLIENTE', contexto);
      return;
    }

    await this.crearCarreraConfirmada(telefono, contexto, conversacionId);
  }
```

Cámbialo a:

```ts
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
    await this.continuarTrasConfirmacionPrecio(telefono, contexto, conversacionId);
  }

  private async continuarTrasConfirmacionPrecio(telefono: string, contexto: ConversationContext, conversacionId: string) {
    if (contexto.tipoServicio === 'DOMICILIO') {
      await mensajeriaService.enviarMensajeConBotones(telefono, MENSAJES.SOLICITAR_EVIDENCIA_CLIENTE(), [
        { id: 'evidencia_continuar', title: 'Continuar sin foto' },
      ]);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_EVIDENCIA_CLIENTE', contexto);
      return;
    }

    await this.crearCarreraConfirmada(telefono, contexto, conversacionId);
  }
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 3: Prueba manual de regresión**

Hacer un pedido normal de domicilio de principio a fin (sin tocar cotización) y
confirmar que el comportamiento es idéntico al de antes de este cambio: precio →
Confirmar → pedir evidencia → crear carrera. Este paso es solo un refactor, no debe
cambiar nada observable.

- [ ] **Step 4: Commit**

```bash
git add src/services/whatsapp/bot.service.ts
git commit -m "refactor: extraer continuarTrasConfirmacionPrecio de manejarConfirmacionPrecio"
```

---

## Task 4: Paso de nota adicional

**Files:**
- Modify: `src/services/whatsapp/bot.service.ts`

**Interfaces:**
- Consumes: `ConversationState.ESPERANDO_NOTA_ADICIONAL`,
  `ConversationContext.notaAdicionalSiguiente`, `MENSAJES.SOLICITAR_NOTA_ADICIONAL`
  (Task 1); `continuarTrasConfirmacionPrecio` (Task 3).
- Produces: `private async enviarSolicitudNotaAdicional(telefono: string, contexto:
  ConversationContext, conversacionId: string, siguiente: 'momento' | 'crear'):
  Promise<void>` y `private async manejarNotaAdicional(telefono: string, mensaje:
  string, contexto: ConversationContext, conversacionId: string): Promise<void>` — usados
  también por la Task 5.

- [ ] **Step 1: Extraer `enviarSolicitudMomento` y agregar `enviarSolicitudNotaAdicional`**

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
    } else {
      await mensajeriaService.enviarMensajeConBotones(telefono, MENSAJES.SOLICITAR_MOMENTO(), [
        { id: 'momento_ahora', title: '🕐 Ahora' },
        { id: 'momento_programado', title: '📅 Programado' },
      ]);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_MOMENTO', contexto);
    }
  }
```

Cámbialo a:

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

  private async enviarSolicitudMomento(telefono: string, contexto: ConversationContext, conversacionId: string) {
    await mensajeriaService.enviarMensajeConBotones(telefono, MENSAJES.SOLICITAR_MOMENTO(), [
      { id: 'momento_ahora', title: '🕐 Ahora' },
      { id: 'momento_programado', title: '📅 Programado' },
    ]);
    await this.actualizarConversacion(conversacionId, 'ESPERANDO_MOMENTO', contexto);
  }

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

  private async manejarNotaAdicional(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (mensaje !== 'nota_omitir') {
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

- [ ] **Step 2: Despachar el estado nuevo en `procesarEstado`**

El `switch` de `procesarEstado` tiene hoy, en este orden:

```ts
      case 'ESPERANDO_DESTINO':
        await this.manejarDireccion(telefono, mensaje, contexto, conversacionId, 'destino', ubicacion); break;
      case 'ESPERANDO_CONFIRMACION_DESTINO':
        await this.manejarConfirmacionDireccion(telefono, mensaje, contexto, conversacionId, 'destino'); break;
      case 'ESPERANDO_MOMENTO':
```

Cámbialo a:

```ts
      case 'ESPERANDO_DESTINO':
        await this.manejarDireccion(telefono, mensaje, contexto, conversacionId, 'destino', ubicacion); break;
      case 'ESPERANDO_CONFIRMACION_DESTINO':
        await this.manejarConfirmacionDireccion(telefono, mensaje, contexto, conversacionId, 'destino'); break;
      case 'ESPERANDO_NOTA_ADICIONAL':
        await this.manejarNotaAdicional(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_MOMENTO':
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 4: Prueba manual — domicilio normal con nota**

Pedir un domicilio normal (no mandado, no cotización) hasta confirmar el destino →
confirmar que aparece el mensaje de información adicional con el botón "Omitir" →
escribir una nota de prueba (ej. "Apto 302, torre B") → confirmar que sigue a la
pregunta de "¿para cuándo?" igual que antes → completar el pedido → revisar en el panel
admin (detalle de la carrera) que la nota quedó guardada.

- [ ] **Step 5: Prueba manual — mandado sin nota**

Pedir un mandado completo y confirmar que el paso de nota adicional **no** aparece
(pasa directo de confirmar destino a "¿para cuándo?"), ya que el encargo del mandado ya
ocupa el campo `notas`.

- [ ] **Step 6: Prueba manual — botón "Omitir"**

Repetir un domicilio normal y, en el paso de nota adicional, pulsar "Omitir" en vez de
escribir texto → confirmar que sigue el flujo igual y que la carrera queda sin nota.

- [ ] **Step 7: Commit**

```bash
git add src/services/whatsapp/bot.service.ts
git commit -m "feat: agregar paso opcional de nota adicional tras confirmar destino"
```

---

## Task 5: Pantalla de precio para cotización

**Files:**
- Modify: `src/services/whatsapp/bot.service.ts`

**Interfaces:**
- Consumes: `MENSAJES.COTIZACION_CALCULADA` (Task 1), `enviarSolicitudNotaAdicional`
  (Task 4), `continuarTrasConfirmacionPrecio` (Task 3), botón global `btn_salir` (ya
  manejado en `procesarMensaje`, sin cambios).
- Produces: comportamiento completo de cotización de principio a fin.

- [ ] **Step 1: Ramificar `calcularYMostrarPrecio` según `soloCotizacion`**

El método es hoy:

```ts
  private async calcularYMostrarPrecio(telefono: string, contexto: ConversationContext, conversacionId: string) {
    try {
      const distanciaKm = await mapboxService.calcularDistanciaKm(
        { lat: contexto.recogida!.lat!, lng: contexto.recogida!.lng! },
        { lat: contexto.destino!.lat!, lng: contexto.destino!.lng! }
      );
      contexto.distanciaKm = distanciaKm;

      const cliente = await clientesService.buscarPorTelefono(telefono);
      const conDescuento = !!cliente && cliente.descuentosDisponibles > 0;
      let precio = await carrerasService.calcularPrecio(distanciaKm, contexto.destino!.lat!, contexto.destino!.lng!);
      if (conDescuento) precio = Math.round((precio * 0.8) / 100) * 100;
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
```

Cámbialo a:

```ts
  private async calcularYMostrarPrecio(telefono: string, contexto: ConversationContext, conversacionId: string) {
    try {
      const distanciaKm = await mapboxService.calcularDistanciaKm(
        { lat: contexto.recogida!.lat!, lng: contexto.recogida!.lng! },
        { lat: contexto.destino!.lat!, lng: contexto.destino!.lng! }
      );
      contexto.distanciaKm = distanciaKm;

      const cliente = await clientesService.buscarPorTelefono(telefono);
      const conDescuento = !!cliente && cliente.descuentosDisponibles > 0;
      let precio = await carrerasService.calcularPrecio(distanciaKm, contexto.destino!.lat!, contexto.destino!.lng!);
      if (conDescuento) precio = Math.round((precio * 0.8) / 100) * 100;
      contexto.precio = precio;

      if (contexto.soloCotizacion) {
        await mensajeriaService.enviarMensajeConBotones(
          telefono,
          MENSAJES.COTIZACION_CALCULADA({ distanciaKm, precio, conDescuento }),
          [
            { id: 'cotizacion_pedir', title: '✅ Pedir servicio' },
            { id: 'cotizacion_otra', title: '🔄 Cotizar otra' },
            { id: 'btn_salir', title: '🚪 Salir al menú' },
          ]
        );
      } else {
        await mensajeriaService.enviarMensajeConBotones(
          telefono,
          MENSAJES.PRECIO_CALCULADO({ distanciaKm, precio, conDescuento }),
          [
            { id: 'precio_si', title: '✅ Confirmar' },
            { id: 'precio_no', title: '❌ Cancelar' },
          ]
        );
      }
      await this.actualizarConversacion(conversacionId, 'CONFIRMACION_PRECIO', contexto);
    } catch (error) {
      console.error('Error calculando precio:', error);
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.ERROR_SERVIDOR());
    }
  }
```

- [ ] **Step 2: Ramificar `manejarConfirmacionPrecio` según `soloCotizacion`**

Después de la Task 3, el método es:

```ts
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
    await this.continuarTrasConfirmacionPrecio(telefono, contexto, conversacionId);
  }
```

Cámbialo a:

```ts
  private async manejarConfirmacionPrecio(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (contexto.soloCotizacion) {
      if (mensaje === 'cotizacion_pedir') {
        contexto.soloCotizacion = false;
        if (contexto.esMandado) {
          await this.continuarTrasConfirmacionPrecio(telefono, contexto, conversacionId);
        } else {
          await this.enviarSolicitudNotaAdicional(telefono, contexto, conversacionId, 'crear');
        }
        return;
      }
      if (mensaje === 'cotizacion_otra') {
        delete contexto.recogida;
        delete contexto.destino;
        delete contexto.distanciaKm;
        delete contexto.precio;
        delete contexto.intentosRecogida;
        delete contexto.intentosDestino;
        const mensajeRecogida = contexto.esMandado ? MENSAJES.SOLICITAR_ZONA_MANDADO() : MENSAJES.SOLICITAR_RECOGIDA();
        await mensajeriaService.enviarMensaje(telefono, mensajeRecogida);
        await this.actualizarConversacion(conversacionId, 'ESPERANDO_RECOGIDA', contexto);
        return;
      }
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.OPCION_INVALIDA());
      return;
    }

    if (mensaje === 'precio_no' || messageParser.esNegativo(mensaje)) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.DESPEDIDA());
      await this.finalizarConversacion(conversacionId);
      return;
    }
    if (mensaje !== 'precio_si' && !messageParser.esAfirmativo(mensaje)) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.OPCION_INVALIDA());
      return;
    }
    await this.continuarTrasConfirmacionPrecio(telefono, contexto, conversacionId);
  }
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 4: Prueba manual — cotizar y pedir**

Menú principal → "💰 Cotizar" → Domicilio → dar recogida y destino → confirmar que
aparece el mensaje de **Cotización** (no "Resumen de tu carrera") con los 3 botones
"Pedir servicio / Cotizar otra / Salir al menú" → pulsar "✅ Pedir servicio" →
confirmar que aparece el paso de nota adicional (no se repite la pregunta de
"¿para cuándo?") → completar → confirmar que la carrera se crea con la
`fechaHoraProgramada`/momento que se había elegido durante la cotización.

- [ ] **Step 5: Prueba manual — cotizar otra dirección**

Repetir una cotización hasta ver el precio → pulsar "🔄 Cotizar otra" → confirmar que
pide de nuevo la dirección de recogida sin volver a preguntar el tipo de servicio → dar
una nueva recogida/destino → confirmar que el nuevo precio se calcula correctamente.

- [ ] **Step 6: Prueba manual — cotizar un mandado y pedirlo**

Menú principal → "💰 Cotizar" → Mandado/Compra → dar el encargo y la zona → ver el
precio de cotización → pulsar "✅ Pedir servicio" → confirmar que **no** aparece el
paso de nota adicional (va directo a evidencia/creación) porque ya es un mandado.

- [ ] **Step 7: Prueba manual — salir desde la cotización**

Repetir una cotización hasta ver el precio → pulsar "🚪 Salir al menú" → confirmar que
vuelve al menú principal sin crear ninguna carrera.

- [ ] **Step 8: Commit**

```bash
git add src/services/whatsapp/bot.service.ts
git commit -m "feat: pantalla de precio y confirmación específicas para cotización"
```

---

## Task 6: Verificación final end-to-end

No hay cambios de código en esta tarea — es la lista de regresión completa antes de dar
por terminado el trabajo, tal como pide la sección "Verificación" del spec.

- [ ] **Step 1: `npx tsc --noEmit` limpio**

Run: `npx tsc --noEmit`
Expected: sin salida, sobre el estado final de todas las tareas anteriores.

- [ ] **Step 2: Flujo completo de cotización**

Cotizar un domicilio → ver precio → "Cotizar otra" → nueva dirección → precio
actualizado → "Pedir servicio" → nota adicional → evidencia → carrera creada, con la
nota visible en el aviso de WhatsApp que recibe el dueño (`notificarNuevaSolicitud`) y
en el detalle de la carrera en el panel admin.

- [ ] **Step 3: Pedido normal con nota adicional**

Pedido normal (no cotización) de un domicilio a un conjunto/apartamento → la nota
adicional aparece antes de "¿para cuándo?" → se guarda y llega al conductor asignado
(`notificarAsignacion`).

- [ ] **Step 4: Mandado completo sin nota adicional**

Mandado de principio a fin → confirmar que el paso de nota adicional no aparece en
ningún punto (ni en el flujo normal ni si se llega ahí desde una cotización) porque el
campo `notas` ya lo ocupa el encargo del mandado.

- [ ] **Step 5: Menú principal sin regresión**

Confirmar que el menú principal sigue mostrando los 3 botones originales en el primer
mensaje y ahora 2 en el segundo ("Hablar con asesor", "Cotizar"), y que "Pedir
servicio" (sin pasar por cotización) sigue funcionando exactamente igual que antes de
este plan.
