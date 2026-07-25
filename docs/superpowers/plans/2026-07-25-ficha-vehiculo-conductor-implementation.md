# Ficha de vehículo y foto del conductor — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar tipo de vehículo, marca, línea, modelo, placa y foto de cada
conductor, mostrarlos en el panel admin, y enviárselos al cliente (foto con caption)
cuando se le asigna un conductor a su carrera, según
`docs/superpowers/specs/2026-07-25-ficha-vehiculo-conductor-design.md`.

**Architecture:** Los 6 campos nuevos se agregan a `Conductor` (nullable en base de
datos, obligatorios solo en la capa de aplicación). La foto se sube desde el panel
como base64 en el mismo JSON del formulario existente — se reutiliza y extiende
`media.service.ts` (que ya sube a Cloudinary) con un método `subirBase64`. Al asignar
conductor, `notificaciones.service.ts` intenta mandar una imagen con caption
(`mensajeriaService.enviarImagen`, nuevo, mismo patrón que los demás métodos de
`mensajeria.service.ts`/`messages.service.ts`); si el conductor no tiene `fotoUrl`
todavía, cae al mensaje de texto plano que ya existe hoy.

**Tech Stack:** Express + TypeScript + Prisma (PostgreSQL), WhatsApp Cloud API,
Cloudinary (SDK ya instalado, usado hoy por `media.service.ts`).

## Global Constraints

- `npx tsc --noEmit` debe pasar sin errores al final de cada tarea.
- Sin tests automatizados ni CI (criterio ya establecido en el proyecto) —
  verificación manual donde se indique.
- Los 6 campos nuevos (`tipoVehiculo`, `marca`, `linea`, `modelo`, `placa`, `fotoUrl`)
  son `String?` en la base de datos — la migración no debe romper conductores
  existentes.
- La obligatoriedad de esos 6 campos se aplica solo en el servicio/formulario al
  crear o editar un conductor desde el panel — nunca como constraint de Prisma.
- Un conductor sin `fotoUrl` (dato viejo sin migrar) nunca debe bloquear la
  asignación de una carrera; el mensaje al cliente cae a texto plano en ese caso.
- No agregar dependencias nuevas (`multer`, etc.) — la foto viaja como base64 en el
  JSON existente.

---

### Task 1: Modelo de datos y `media.service.ts`

**Files:**
- Modify: `prisma/schema.prisma` (modelo `Conductor`)
- Create: `prisma/migrations/<timestamp>_ficha_vehiculo_conductor/` (generada por
  Prisma)
- Modify: `src/services/media.service.ts` (nuevo método `subirBase64`)

**Interfaces:**
- Produces: `mediaService.subirBase64(base64: string, folder: string): Promise<string>`
  (devuelve la `secure_url` de Cloudinary; lanza error si Cloudinary no está
  configurado). Usado por Task 2.
- Produces: campos `tipoVehiculo`, `marca`, `linea`, `modelo`, `placa`, `fotoUrl`
  (todos `string | null`) en el tipo `Conductor` generado por Prisma. Usados por
  Task 2, Task 3, Task 4.

- [ ] **Step 1: Editar el schema de Prisma**

En `prisma/schema.prisma`, dentro de `model Conductor`, agregar los 6 campos nuevos
justo después de `notas`:

```prisma
model Conductor {
  id        String   @id @default(uuid())
  nombre    String
  telefono  String
  activo    Boolean  @default(true)
  notas     String?

  tipoVehiculo String?
  marca        String?
  linea        String?
  modelo       String?
  placa        String?
  fotoUrl      String?

  carreras Carrera[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([activo])
}
```

- [ ] **Step 2: Generar y aplicar la migración**

Run: `npx prisma migrate dev --name ficha_vehiculo_conductor`
Expected: crea `prisma/migrations/<timestamp>_ficha_vehiculo_conductor/migration.sql`
con 6 `ALTER TABLE "Conductor" ADD COLUMN` (todas nullable, sin `NOT NULL`) y termina
con `Your database is now in sync with your schema.`

- [ ] **Step 3: Agregar `subirBase64` a `media.service.ts`**

En `src/services/media.service.ts`, agregar el método nuevo a la clase
`MediaService`, junto a `descargarYSubir`:

```typescript
  // Sube una imagen ya codificada en base64 (data URI, ej. desde un <input
  // type="file"> del panel admin) directamente a Cloudinary, sin pasar por la
  // Graph API de WhatsApp.
  async subirBase64(base64: string, folder: string): Promise<string> {
    if (!cloudinaryConfig.cloudName || !cloudinaryConfig.apiKey || !cloudinaryConfig.apiSecret) {
      throw new Error('Cloudinary no está configurado (faltan CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET)');
    }
    const resultado = await cloudinary.uploader.upload(base64, { folder });
    return resultado.secure_url;
  }
```

- [ ] **Step 4: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/services/media.service.ts
git commit -m "feat: agregar campos de vehículo y foto a Conductor"
```

---

### Task 2: `conductores.service.ts` — validación y subida de foto

**Files:**
- Modify: `src/services/conductores.service.ts`

**Interfaces:**
- Consumes: `mediaService.subirBase64(base64: string, folder: string): Promise<string>`
  (Task 1).
- Produces: `conductoresService.create(data)` ahora exige y guarda los 6 campos
  nuevos (`data.fotoBase64` es la imagen sin subir; el resultado guardado es
  `fotoUrl`). `conductoresService.update(id, data)` acepta los mismos campos, todos
  opcionales, y solo sube foto nueva si viene `fotoBase64`. Usado por Task 4 (rutas ya
  existentes, sin cambios) y Task 5 (formulario del panel).

- [ ] **Step 1: Reescribir `conductores.service.ts`**

Reemplazar el archivo completo:

```typescript
import prisma from '../config/database';
import { mediaService } from './media.service';

interface DatosConductor {
  nombre: string;
  telefono: string;
  notas?: string;
  tipoVehiculo: string;
  marca: string;
  linea: string;
  modelo: string;
  placa: string;
  fotoBase64: string;
}

interface DatosConductorUpdate {
  nombre?: string;
  telefono?: string;
  activo?: boolean;
  notas?: string;
  tipoVehiculo?: string;
  marca?: string;
  linea?: string;
  modelo?: string;
  placa?: string;
  fotoBase64?: string;
}

const CAMPOS_VEHICULO_OBLIGATORIOS = ['tipoVehiculo', 'marca', 'linea', 'modelo', 'placa'] as const;

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

  async buscarPorTelefono(telefono: string) {
    return prisma.conductor.findFirst({ where: { telefono, activo: true } });
  }

  async create(data: DatosConductor) {
    for (const campo of CAMPOS_VEHICULO_OBLIGATORIOS) {
      if (!data[campo]?.trim()) throw new Error(`El campo "${campo}" es obligatorio`);
    }
    if (!data.fotoBase64?.trim()) throw new Error('La foto del conductor es obligatoria');

    const fotoUrl = await mediaService.subirBase64(data.fotoBase64, 'serveloz/conductores');

    return prisma.conductor.create({
      data: {
        nombre: data.nombre.trim(),
        telefono: data.telefono.trim(),
        notas: data.notas,
        tipoVehiculo: data.tipoVehiculo.trim(),
        marca: data.marca.trim(),
        linea: data.linea.trim(),
        modelo: data.modelo.trim(),
        placa: data.placa.trim(),
        fotoUrl,
      },
    });
  }

  async update(id: string, data: DatosConductorUpdate) {
    const fotoUrl = data.fotoBase64?.trim()
      ? await mediaService.subirBase64(data.fotoBase64, 'serveloz/conductores')
      : undefined;

    return prisma.conductor.update({
      where: { id },
      data: {
        ...(data.nombre && { nombre: data.nombre.trim() }),
        ...(data.telefono && { telefono: data.telefono.trim() }),
        ...(data.activo !== undefined && { activo: data.activo }),
        ...(data.notas !== undefined && { notas: data.notas }),
        ...(data.tipoVehiculo !== undefined && { tipoVehiculo: data.tipoVehiculo.trim() }),
        ...(data.marca !== undefined && { marca: data.marca.trim() }),
        ...(data.linea !== undefined && { linea: data.linea.trim() }),
        ...(data.modelo !== undefined && { modelo: data.modelo.trim() }),
        ...(data.placa !== undefined && { placa: data.placa.trim() }),
        ...(fotoUrl !== undefined && { fotoUrl }),
      },
    });
  }

  async delete(id: string) {
    return prisma.conductor.update({ where: { id }, data: { activo: false } });
  }
}

export const conductoresService = new ConductoresService();
```

Nota: `update` no reutiliza `CAMPOS_VEHICULO_OBLIGATORIOS` porque en edición todos los
campos son opcionales a nivel de request (se puede editar solo el teléfono, por
ejemplo) — la obligatoriedad de completar la ficha completa al editar un conductor
viejo se exige en el formulario del panel (Task 5), no aquí, igual que hoy pasa con
`nombre`/`telefono` en `update`.

- [ ] **Step 2: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add src/services/conductores.service.ts
git commit -m "feat: validar y guardar ficha de vehículo al crear/editar conductor"
```

---

### Task 3: Envío de imagen por WhatsApp (`messages.service.ts` + `mensajeria.service.ts`)

**Files:**
- Modify: `src/services/whatsapp/messages.service.ts`
- Modify: `src/services/mensajeria.service.ts`

**Interfaces:**
- Produces: `whatsappMessagesService.enviarImagen(telefono: string, url: string, caption: string): Promise<any>`. Usado por `mensajeriaService.enviarImagen` en este mismo
  task.
- Produces: `mensajeriaService.enviarImagen(telefono: string, url: string, caption: string): Promise<any>` (envía y registra el mensaje saliente, mismo patrón que
  `enviarMensaje`/`enviarUbicacion`). Usado por Task 4.

- [ ] **Step 1: Agregar `enviarImagen` a `messages.service.ts`**

En `src/services/whatsapp/messages.service.ts`, agregar el método a la clase
`WhatsAppMessagesService`, junto a `enviarUbicacion`:

```typescript
  async enviarImagen(telefono: string, url: string, caption: string): Promise<any> {
    return this.sendRequest('messages', {
      messaging_product: 'whatsapp',
      to: telefono,
      type: 'image',
      image: { link: url, caption },
    });
  }
```

- [ ] **Step 2: Agregar `enviarImagen` a `mensajeria.service.ts`**

En `src/services/mensajeria.service.ts`, agregar el método a la clase
`MensajeriaService`, junto a `enviarUbicacion`:

```typescript
  async enviarImagen(telefono: string, url: string, caption: string): Promise<any> {
    const resultado = await whatsappMessagesService.enviarImagen(telefono, url, caption);
    await this.registrarSaliente(telefono, `📷 ${caption}`, 'BOT');
    return resultado;
  }
```

- [ ] **Step 3: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 4: Commit**

```bash
git add src/services/whatsapp/messages.service.ts src/services/mensajeria.service.ts
git commit -m "feat: agregar envío de imagen con caption por WhatsApp"
```

---

### Task 4: `notificaciones.service.ts` — mensaje al cliente con foto y ficha del vehículo

**Files:**
- Modify: `src/services/notificaciones.service.ts:49-54`

**Interfaces:**
- Consumes: `mensajeriaService.enviarImagen(telefono, url, caption)` (Task 3),
  `carrera.conductor.fotoUrl`/`tipoVehiculo`/`marca`/`linea`/`modelo`/`placa` (Task 1).

- [ ] **Step 1: Reemplazar el bloque de notificación al cliente**

En `src/services/notificaciones.service.ts`, dentro de `notificarAsignacion`,
reemplazar:

```typescript
    try {
      await mensajeriaService.enviarMensaje(
        carrera.cliente.telefono,
        `🛵 Tu conductor es *${carrera.conductor.nombre}* (${carrera.conductor.telefono}). ¡Ya va en camino!`
      );
    } catch (e) { console.error('Error notificando asignación al cliente:', e); }
```

por:

```typescript
    try {
      const c = carrera.conductor;
      if (c.fotoUrl && c.tipoVehiculo && c.marca && c.linea && c.modelo && c.placa) {
        const caption = `🛵 Tu conductor es *${c.nombre}*\n📞 ${c.telefono}\n🏍️ ${c.tipoVehiculo} · ${c.marca} ${c.linea} ${c.modelo}\n🔖 Placa: ${c.placa}\n¡Ya va en camino!`;
        await mensajeriaService.enviarImagen(carrera.cliente.telefono, c.fotoUrl, caption);
      } else {
        await mensajeriaService.enviarMensaje(
          carrera.cliente.telefono,
          `🛵 Tu conductor es *${c.nombre}* (${c.telefono}). ¡Ya va en camino!`
        );
      }
    } catch (e) { console.error('Error notificando asignación al cliente:', e); }
```

- [ ] **Step 2: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add src/services/notificaciones.service.ts
git commit -m "feat: enviar foto y ficha de vehículo al cliente al asignar conductor"
```

---

### Task 5: Panel admin — formulario y detalle de conductores

**Files:**
- Modify: `src/admin/conductores.html`

**Interfaces:**
- Consumes: `POST /api/admin/conductores` y `PUT /api/admin/conductores/:id` (ya
  existentes, sin cambios de ruta — ahora aceptan `tipoVehiculo`, `marca`, `linea`,
  `modelo`, `placa`, `fotoBase64` en el body, ver Task 2).

- [ ] **Step 1: Agregar campos al formulario**

En `src/admin/conductores.html`, dentro de `<form id="formConductor">`, agregar
después del `<textarea id="c_notas">` y antes de `<p id="c_error">`:

```html
        <select id="c_tipoVehiculo" class="w-full bg-canvas border border-line rounded-lg px-3 py-2" required>
          <option value="">Tipo de vehículo</option>
          <option value="Motocicleta">Motocicleta</option>
          <option value="Automóvil">Automóvil</option>
          <option value="Bicicleta">Bicicleta</option>
        </select>
        <input id="c_marca" placeholder="Marca (ej. Bajaj)" class="w-full bg-canvas border border-line rounded-lg px-3 py-2" required>
        <input id="c_linea" placeholder="Línea (ej. Boxer CT 100)" class="w-full bg-canvas border border-line rounded-lg px-3 py-2" required>
        <input id="c_modelo" placeholder="Modelo / año (ej. 2014)" class="w-full bg-canvas border border-line rounded-lg px-3 py-2" required>
        <input id="c_placa" placeholder="Placa" class="w-full bg-canvas border border-line rounded-lg px-3 py-2" required>
        <div>
          <label class="block text-sm text-gray-400 mb-1">Foto del conductor</label>
          <input id="c_foto" type="file" accept="image/*" class="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm">
          <img id="c_fotoPreview" class="hidden mt-2 h-20 w-20 object-cover rounded-lg border border-line">
        </div>
```

- [ ] **Step 2: Precargar y limpiar los campos nuevos en `abrirModalConductor`/`cerrarModalConductor`**

Reemplazar la función `abrirModalConductor` existente:

```javascript
    let fotoBase64Actual = null;

    function abrirModalConductor(conductor) {
      conductorEditandoId = conductor ? conductor.id : null;
      fotoBase64Actual = null;
      document.getElementById('modalConductorTitulo').textContent = conductor ? 'Editar conductor' : 'Nuevo conductor';
      document.getElementById('c_nombre').value = conductor ? conductor.nombre : '';
      document.getElementById('c_telefono').value = conductor ? conductor.telefono : '';
      document.getElementById('c_notas').value = conductor && conductor.notas ? conductor.notas : '';
      document.getElementById('c_tipoVehiculo').value = conductor && conductor.tipoVehiculo ? conductor.tipoVehiculo : '';
      document.getElementById('c_marca').value = conductor && conductor.marca ? conductor.marca : '';
      document.getElementById('c_linea').value = conductor && conductor.linea ? conductor.linea : '';
      document.getElementById('c_modelo').value = conductor && conductor.modelo ? conductor.modelo : '';
      document.getElementById('c_placa').value = conductor && conductor.placa ? conductor.placa : '';
      document.getElementById('c_foto').value = '';
      const preview = document.getElementById('c_fotoPreview');
      if (conductor && conductor.fotoUrl) {
        preview.src = conductor.fotoUrl;
        preview.classList.remove('hidden');
      } else {
        preview.classList.add('hidden');
      }
      document.getElementById('c_error').classList.add('hidden');
      document.getElementById('modalConductor').classList.remove('hidden');
    }
```

Y agregar, justo después (nueva función, no reemplaza nada), el listener que convierte
el archivo elegido a base64:

```javascript
    document.getElementById('c_foto').addEventListener('change', (e) => {
      const archivo = e.target.files[0];
      if (!archivo) { fotoBase64Actual = null; return; }
      const reader = new FileReader();
      reader.onload = () => {
        fotoBase64Actual = reader.result;
        const preview = document.getElementById('c_fotoPreview');
        preview.src = fotoBase64Actual;
        preview.classList.remove('hidden');
      };
      reader.readAsDataURL(archivo);
    });
```

- [ ] **Step 3: Incluir los campos nuevos en el submit del formulario**

Reemplazar el listener de `submit` de `formConductor`:

```javascript
    document.getElementById('formConductor').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('c_error');
      errorEl.classList.add('hidden');
      const body = {
        nombre: document.getElementById('c_nombre').value,
        telefono: document.getElementById('c_telefono').value,
        notas: document.getElementById('c_notas').value || null,
        tipoVehiculo: document.getElementById('c_tipoVehiculo').value,
        marca: document.getElementById('c_marca').value,
        linea: document.getElementById('c_linea').value,
        modelo: document.getElementById('c_modelo').value,
        placa: document.getElementById('c_placa').value,
      };
      if (fotoBase64Actual) body.fotoBase64 = fotoBase64Actual;
      if (!conductorEditandoId && !fotoBase64Actual) {
        errorEl.textContent = 'La foto del conductor es obligatoria';
        errorEl.classList.remove('hidden');
        return;
      }
      try {
        const response = conductorEditandoId
          ? await authFetch(`/api/admin/conductores/${conductorEditandoId}`, { method: 'PUT', body: JSON.stringify(body) })
          : await authFetch('/api/admin/conductores', { method: 'POST', body: JSON.stringify(body) });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'No se pudo guardar el conductor');
        }
        cerrarModalConductor();
        cargar();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
      }
    });
```

- [ ] **Step 4: Limpiar `fotoBase64Actual` al cerrar el modal**

Reemplazar `cerrarModalConductor`:

```javascript
    function cerrarModalConductor() {
      document.getElementById('modalConductor').classList.add('hidden');
      document.getElementById('formConductor').reset();
      document.getElementById('c_fotoPreview').classList.add('hidden');
      conductorEditandoId = null;
      fotoBase64Actual = null;
    }
```

- [ ] **Step 5: Mostrar la ficha del vehículo y la foto en el modal de detalles**

En la función `abrirDetalles`, dentro del template literal asignado a
`contenido.innerHTML`, agregar el bloque de vehículo justo después del `div` que
contiene nombre/teléfono/registrado/notas (antes del `grid grid-cols-2` de
estadísticas). Reemplazar:

```javascript
      contenido.innerHTML = `
        <div class="space-y-1 mb-4">
          <div class="text-base font-semibold text-white">${esc(conductor.nombre)}</div>
          <div class="text-gray-400">${esc(conductor.telefono)}</div>
          <div class="text-gray-400">Registrado: ${new Date(conductor.createdAt).toLocaleDateString('es-CO')}</div>
          <div class="text-gray-400">${conductor.notas ? esc(conductor.notas) : 'Sin notas.'}</div>
        </div>
```

por:

```javascript
      contenido.innerHTML = `
        <div class="space-y-1 mb-4">
          <div class="text-base font-semibold text-white">${esc(conductor.nombre)}</div>
          <div class="text-gray-400">${esc(conductor.telefono)}</div>
          <div class="text-gray-400">Registrado: ${new Date(conductor.createdAt).toLocaleDateString('es-CO')}</div>
          <div class="text-gray-400">${conductor.notas ? esc(conductor.notas) : 'Sin notas.'}</div>
        </div>
        <div class="flex gap-3 items-start mb-4 bg-canvas rounded-lg border border-line p-3">
          ${conductor.fotoUrl ? `<img src="${esc(urlSegura(conductor.fotoUrl))}" alt="Foto de ${esc(conductor.nombre)}" class="h-16 w-16 object-cover rounded-lg shrink-0">` : ''}
          <div class="text-sm text-gray-300 space-y-0.5">
            ${conductor.tipoVehiculo ? `<div>🏍️ ${esc(conductor.tipoVehiculo)} · ${esc(conductor.marca || '')} ${esc(conductor.linea || '')} ${esc(conductor.modelo || '')}</div>` : '<div class="text-gray-500">Ficha de vehículo incompleta — edítalo para completarla.</div>'}
            ${conductor.placa ? `<div>🔖 Placa: ${esc(conductor.placa)}</div>` : ''}
          </div>
        </div>
```

- [ ] **Step 6: Agregar el helper `urlSegura`**

Agregar, junto a las demás funciones del `<script>` (antes de `abrirDetalles`), el
mismo helper ya usado en `src/admin/carreras.html:121-129`:

```javascript
    function urlSegura(valor) {
      try {
        const url = new URL(valor);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '#';
      } catch {
        return '#';
      }
    }
```

- [ ] **Step 7: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin salida (este archivo es HTML/JS suelto, no lo toca `tsc`, pero se
corre igual para confirmar que las tareas anteriores no quedaron rotas).

- [ ] **Step 8: Commit**

```bash
git add src/admin/conductores.html
git commit -m "feat: formulario y detalle de ficha de vehículo en panel de conductores"
```

---

### Task 6: Verificación manual end-to-end y actualización de `PROGRESS.md`

**Files:**
- No se crean ni modifican archivos de producto — solo verificación y `PROGRESS.md`.

- [ ] **Step 1: Levantar el servidor local**

Run: `npm run dev`
Expected: arranca sin errores en `http://localhost:3000`.

- [ ] **Step 2: Probar el formulario de conductor en el panel**

En `http://localhost:3000/admin/conductores.html`:
1. Click "+ Agregar conductor", dejar el tipo de vehículo vacío y enviar → debe
   bloquear el envío por `required` del `<select>`.
2. Completar con datos reales (por ejemplo el conductor Simón Molina que el dueño va a
   cargar) incluyendo una foto real desde el input de archivo, y guardar → debe
   aparecer en la lista.
3. Abrir "Ver detalles" del conductor recién creado → debe mostrar la foto, tipo,
   marca, línea, modelo y placa.
4. Editar el mismo conductor sin tocar el campo de foto → debe guardar sin pedir
   la foto de nuevo y conservar la `fotoUrl` anterior (confirmar con "Ver detalles").

- [ ] **Step 3: Probar la notificación al cliente**

Con el conductor de la Step 2 (ficha completa) y una carrera `PENDIENTE_ASIGNACION`
creada de antemano (por WhatsApp o `POST /api/admin/carreras/manual`), asignarlo desde
`carreras.html` y confirmar en el teléfono del cliente de prueba que llega **una**
imagen con el caption esperado (nombre, teléfono, tipo/marca/línea/modelo, placa,
"¡Ya va en camino!").

Si no hay forma de probar esto con un teléfono real en este momento, dejarlo anotado
explícitamente como pendiente al reportar el resultado de esta tarea — no bloquea el
resto.

- [ ] **Step 4: Confirmar el fallback sin foto**

Con un conductor que quedó sin ficha completa (cualquiera de los que ya existían antes
de este cambio, sin editar), asignarlo a otra carrera de prueba y confirmar que el
cliente recibe el mensaje de texto plano de siempre (sin imagen), sin que la
asignación falle.

- [ ] **Step 5: Actualizar `PROGRESS.md`**

Leer el archivo primero para igualar tono/formato, y agregar una sección nueva con la
fecha de hoy describiendo: los 6 campos nuevos de `Conductor`, la subida de foto desde
el panel (base64 → Cloudinary, carpeta `serveloz/conductores`), el mensaje de imagen
con caption al cliente al asignar conductor, y el fallback a texto plano para
conductores sin ficha completa.

- [ ] **Step 6: Commit final**

```bash
git add PROGRESS.md
git commit -m "docs: actualizar progreso con ficha de vehículo y foto del conductor"
```

---

## Self-Review

**Cobertura del spec:** modelo de datos (Task 1), formulario y vistas del panel
(Task 5), subida de foto vía base64 (Task 1 Step 3, Task 2), mensaje de imagen al
cliente con fallback a texto (Task 3, Task 4), verificación (Task 6). Las exclusiones
explícitas del spec (separar nombre/apellido, ficha en `carreras.html`, cambios al
mensaje del propio conductor, carga de datos reales) no tienen tareas — correcto, están
fuera de alcance.

**Placeholders:** ninguno — cada paso trae el código completo a insertar/reemplazar,
con la ubicación exacta en el archivo existente.

**Consistencia de tipos:** `DatosConductor`/`DatosConductorUpdate` (Task 2) usan los
mismos nombres de campo (`tipoVehiculo`, `marca`, `linea`, `modelo`, `placa`,
`fotoBase64`) que envía el formulario del panel (Task 5 Step 3) y que lee
`notificaciones.service.ts` desde `carrera.conductor` (Task 4, mismos nombres que
Prisma genera a partir del schema de Task 1). `mediaService.subirBase64(base64,
folder)` se define en Task 1 Step 3 y se llama con esa misma firma en Task 2.
`mensajeriaService.enviarImagen(telefono, url, caption)` se define en Task 3 Step 2 y
se llama con esa misma firma en Task 4.
