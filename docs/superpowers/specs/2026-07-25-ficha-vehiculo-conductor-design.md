# Ficha de vehículo y foto del conductor — Spec de diseño

Fecha: 2026-07-25

## Contexto y propósito

Hoy `Conductor` solo guarda `nombre`, `telefono`, `activo`, `notas`. Cuando el panel
asigna un conductor a una carrera, el cliente recibe un mensaje de texto simple:

> 🛵 Tu conductor es *Simón Molina* (3001234567). ¡Ya va en camino!

El dueño quiere que el cliente pueda identificar al conductor y al vehículo que llega
(tipo de vehículo, marca, línea, modelo, placa) y ver su foto, tanto en el panel de
administración como en el mensaje de WhatsApp que recibe al asignarle un conductor.

## Alcance

- Nuevos campos de vehículo + foto en `Conductor`.
- Formulario y vistas del panel admin (`conductores.html`) para capturarlos y
  mostrarlos.
- Subida de la foto a Cloudinary desde el panel.
- Mensaje de imagen con caption al cliente cuando se asigna conductor, con fallback a
  texto plano si el conductor todavía no tiene foto cargada.

Fuera de alcance: separar `nombre` en nombre/apellido (se mantiene como un solo campo
de texto libre, igual que hoy); mostrar la ficha del vehículo en el detalle de una
carrera (`carreras.html`); cambios al mensaje que recibe el propio conductor
(`nueva_carrera_mensajero`); carga de datos reales de conductores existentes (acción
operativa del dueño vía el panel, no parte de este plan).

## 1. Modelo de datos

En `prisma/schema.prisma`, modelo `Conductor`, se agregan (todos `String?`, nullable a
nivel de base de datos):

```prisma
tipoVehiculo  String?
marca         String?
linea         String?
modelo        String?
placa         String?
fotoUrl       String?
```

Nullable en la base de datos para no romper la migración de los conductores ya
existentes, que quedan con estos campos vacíos hasta que alguien los edite. La
obligatoriedad se aplica en la capa de aplicación (ver sección 2), no como constraint
de base de datos.

## 2. Panel admin — formulario y vistas de conductores

**Formulario (`conductores.html`, crear/editar)**, nuevos campos bajo `c_notas`:
- `c_tipoVehiculo`: `<select>` con opciones fijas `Motocicleta`, `Automóvil`,
  `Bicicleta`.
- `c_marca`, `c_linea`, `c_modelo`, `c_placa`: inputs de texto.
- `c_foto`: `<input type="file" accept="image/*">`. Al seleccionar el archivo, se
  convierte a base64 en el navegador (`FileReader.readAsDataURL`) antes de incluirlo
  en el body JSON del `POST`/`PUT` existente (`fotoBase64`), sin agregar un endpoint
  multipart nuevo.

**Validación**: los 6 campos (tipo, marca, línea, modelo, placa, foto) son obligatorios
al crear un conductor nuevo. Al editar un conductor existente que todavía no los
tiene, también se le exige completarlos antes de guardar (empuja a migrar la data
vieja), pero esto no bloquea acciones ya existentes como `toggleActivo`.

**Backend** (`conductoresService`, `admin.routes.ts`):
- `create(data)`: exige los 6 campos; si viene `fotoBase64`, sube la imagen a
  Cloudinary (carpeta `serveloz/conductores`, mismo patrón que
  `media.service.ts` → `serveloz/evidencias`) y guarda el `secure_url` resultante en
  `fotoUrl`.
- `update(id, data)`: si viene un `fotoBase64` nuevo, sube y reemplaza `fotoUrl`; si
  no viene, conserva el `fotoUrl` actual.
- Falla con un error de dominio claro (mismo estilo que el resto del servicio) si
  falta alguno de los 6 campos obligatorios.

**Lista y detalle**: la tarjeta de la lista (`cargar()`) no cambia — sigue mostrando
solo nombre/teléfono/estado. El modal de detalles (`abrirDetalles`) agrega la ficha del
vehículo (tipo, marca, línea, modelo, placa) y la foto del conductor, debajo de los
datos que ya muestra.

## 3. Notificación al cliente al asignar conductor

`notificaciones.service.ts` → `notificarAsignacion`: el mensaje al cliente pasa de
texto plano a **imagen con caption**:

> 🛵 Tu conductor es **Simón Molina**
> 📞 3001234567
> 🏍️ Motocicleta · Bajaj Boxer CT 100 2014
> 🔖 Placa: XGW84E
> ¡Ya va en camino!

Formato del caption: línea 1 nombre, línea 2 teléfono, línea 3 `tipoVehiculo · marca
línea modelo`, línea 4 placa, línea 5 el cierre fijo "¡Ya va en camino!".

**Nuevo método** `WhatsAppMessagesService.enviarImagen(telefono, url, caption)`, mismo
patrón que los métodos existentes (`enviarMensaje`, `enviarUbicacion`, etc.): POST a la
Graph API con `type: "image"`, `image: { link: url, caption }`.

**Fallback sin foto**: si el conductor asignado no tiene `fotoUrl` (conductor viejo aún
no editado), se mantiene el mensaje de texto plano actual, sin ficha de vehículo, para
no romper la notificación mientras se completa la migración de datos.

## Errores y casos borde

- Cloudinary no configurado: mismo comportamiento que ya existe en `media.service.ts`
  (error claro, no un fallback silencioso) — se reutiliza esa validación.
- Conductor sin alguno de los 6 campos nuevos al momento de asignarlo (dato viejo sin
  migrar): no bloquea la asignación ni la carrera; solo cambia el mensaje al cliente al
  fallback de texto plano descrito arriba.
- `enviarImagen` falla (ej. Cloudinary URL inválida, WhatsApp rechaza la imagen): se
  captura y loguea igual que los demás envíos en `notificarAsignacion` (`try/catch`
  independiente por mensaje), sin tumbar el resto del flujo de asignación.

## Verificación

- `npx tsc --noEmit` limpio.
- Migración de Prisma aplicada sin pérdida de datos sobre conductores existentes.
- Prueba manual en el panel: crear un conductor nuevo sin completar algún campo
  obligatorio → error visible; completarlo → se guarda con foto en Cloudinary.
- Prueba manual de asignación: asignar un conductor con ficha completa a una carrera
  desde el panel → el cliente recibe la imagen con el caption esperado; asignar un
  conductor sin ficha (dato viejo) → el cliente recibe el mensaje de texto plano de
  siempre.
