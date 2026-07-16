# Modelo de tarifas por municipio — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la fórmula de precio `tarifaBase + tarifaPorKm × distanciaKm` por
`max(tarifaMinima, tarifaPorKm(municipio del destino) × distanciaKm)`, redondeado al
múltiplo de $100 más cercano, según
`docs/superpowers/specs/2026-07-15-modelo-tarifas-por-municipio-design.md`.

**Architecture:** Un helper puro (`municipios.ts`) determina el municipio de destino
comparando su coordenada contra 4 puntos centrales fijos (haversine). Un servicio nuevo
(`tarifa-municipio.service.ts`) gestiona la tabla `TarifaMunicipio` (tarifa por km por
municipio, auto-sembrada igual que `configuracionService.obtener()` ya hace hoy).
`carreras.service.ts` combina ambos con la `tarifaMinima` de `Configuracion` para
calcular el precio final. El panel admin (`config.html`) y dos endpoints nuevos exponen
la edición de estos valores.

**Tech Stack:** Express + TypeScript + Prisma (PostgreSQL), HTML/Tailwind CDN sin build
step para el panel admin. Sin framework de tests automatizados (mismo criterio que el
resto del proyecto) — verificación manual con `ts-node` y `curl` contra el servidor de
desarrollo.

## Global Constraints

- Sin tests automatizados ni lint (criterio ya establecido en el proyecto, ver
  `docs/superpowers/specs/2026-07-10-mensajeria-bot-etapa1-design.md`).
- `tsc --noEmit` debe pasar sin errores al final de cada tarea.
- No modificar el flujo de descuento de referido (20%, aplicado después del cálculo de
  precio) — se mantiene exactamente igual que hoy.
- No diferenciar por `tipoServicio` (DOMICILIO vs MOTOTAXI) — misma fórmula para ambos.
- Las coordenadas centrales de los 4 municipios son constantes de código, no editables
  desde el panel.

---

### Task 1: Modelo de datos y cálculo de precio

**Files:**
- Modify: `prisma/schema.prisma:114-120` (modelo `Configuracion`)
- Create: `prisma/migrations/<timestamp>_tarifas_por_municipio/` (generada por Prisma)
- Create: `src/services/municipios.ts`
- Create: `src/services/tarifa-municipio.service.ts`
- Modify: `src/services/configuracion.service.ts`
- Modify: `src/config/whatsapp.ts:16-24`
- Modify: `src/services/carreras.service.ts:21-24`
- Modify: `src/services/whatsapp/bot.service.ts:259`
- Modify: `.env.example:10-11`

**Interfaces:**
- Produces: `municipioMasCercano(lat: number, lng: number): Municipio` y el tipo
  `Municipio = 'BUCARAMANGA' | 'FLORIDABLANCA' | 'GIRON' | 'PIEDECUESTA'`, ambos
  exportados desde `src/services/municipios.ts`. Usados por `tarifa-municipio.service.ts`
  (indirectamente, comparte el tipo) y por `carreras.service.ts`.
- Produces: `tarifaMunicipioService.obtenerTarifaPorKm(municipio: Municipio): Promise<number>`
  y `tarifaMunicipioService.obtenerTodas(): Promise<TarifaMunicipio[]>` y
  `tarifaMunicipioService.actualizar(municipio: Municipio, tarifaPorKm: number)`, desde
  `src/services/tarifa-municipio.service.ts`. Usados por `carreras.service.ts` (Task 1) y
  por las rutas admin (Task 2).
- Produces: `carrerasService.calcularPrecio(distanciaKm: number, destinoLat: number, destinoLng: number): Promise<number>` —
  cambia de firma respecto a hoy (antes solo `distanciaKm`). Consumida por
  `bot.service.ts` y por el propio `carreras.service.ts.create()`.
- Consumes: `configuracionService.obtener()` ahora devuelve `{ id, tarifaMinima, updatedAt }`
  (sin `tarifaBase`/`tarifaPorKm`).

- [ ] **Step 1: Editar el schema de Prisma**

Reemplazar en `prisma/schema.prisma` (líneas 114-120):

```prisma
// ==================== CONFIGURACIÓN (fila única, editable desde el panel) ====================
model Configuracion {
  id           String   @id @default("default")
  tarifaMinima Float    @default(3300)
  updatedAt    DateTime @updatedAt
}

// ==================== TARIFA POR KM SEGÚN MUNICIPIO DE DESTINO ====================
model TarifaMunicipio {
  municipio   String   @id // BUCARAMANGA | FLORIDABLANCA | GIRON | PIEDECUESTA
  tarifaPorKm Float
  updatedAt   DateTime @updatedAt
}
```

- [ ] **Step 2: Generar y aplicar la migración**

Run: `npx prisma migrate dev --name tarifas_por_municipio`
Expected: crea `prisma/migrations/<timestamp>_tarifas_por_municipio/migration.sql` y
termina con `Your database is now in sync with your schema.` sin errores. Si pregunta
por pérdida de datos en la columna `tarifaBase`/`tarifaPorKm` (que ya no existen en el
schema), confirmar — es la fila única de configuración, no hay carreras ni datos de
clientes involucrados.

- [ ] **Step 3: Crear el helper geográfico puro**

Crear `src/services/municipios.ts`:

```typescript
export const MUNICIPIOS = ['BUCARAMANGA', 'FLORIDABLANCA', 'GIRON', 'PIEDECUESTA'] as const;
export type Municipio = (typeof MUNICIPIOS)[number];

// Puntos centrales aproximados (parque/centro urbano) de cada municipio del área
// metropolitana de Bucaramanga. Solo se usan para decidir "a cuál de los 4 pertenece
// esta carrera", no para calcular distancia de ruta real.
const CENTROS: Record<Municipio, { lat: number; lng: number }> = {
  BUCARAMANGA: { lat: 7.125, lng: -73.119 },
  FLORIDABLANCA: { lat: 7.0767, lng: -73.0978 },
  GIRON: { lat: 7.0682, lng: -73.1698 },
  PIEDECUESTA: { lat: 6.9886, lng: -73.0503 },
};

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const radianes = (grados: number) => (grados * Math.PI) / 180;
  const dLat = radianes(b.lat - a.lat);
  const dLng = radianes(b.lng - a.lng);
  const lat1 = radianes(a.lat);
  const lat2 = radianes(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function municipioMasCercano(lat: number, lng: number): Municipio {
  let mejor: Municipio = MUNICIPIOS[0];
  let menorDistancia = Infinity;
  for (const municipio of MUNICIPIOS) {
    const distancia = haversineKm({ lat, lng }, CENTROS[municipio]);
    if (distancia < menorDistancia) {
      menorDistancia = distancia;
      mejor = municipio;
    }
  }
  return mejor;
}
```

- [ ] **Step 4: Verificar el helper manualmente**

Run:
```bash
npx ts-node -e "
import { municipioMasCercano } from './src/services/municipios';
console.log(municipioMasCercano(7.125, -73.119));
console.log(municipioMasCercano(7.0767, -73.0978));
console.log(municipioMasCercano(7.0682, -73.1698));
console.log(municipioMasCercano(6.9886, -73.0503));
"
```
Expected: cuatro líneas, en este orden: `BUCARAMANGA`, `FLORIDABLANCA`, `GIRON`,
`PIEDECUESTA` (cada centro debe clasificarse como sí mismo).

- [ ] **Step 5: Crear el servicio de tarifas por municipio**

Crear `src/services/tarifa-municipio.service.ts`:

```typescript
import prisma from '../config/database';
import { MUNICIPIOS, Municipio } from './municipios';

const TARIFA_POR_KM_DEFAULT: Record<Municipio, number> = {
  BUCARAMANGA: 1200,
  FLORIDABLANCA: 1200,
  GIRON: 1100,
  PIEDECUESTA: 1100,
};

export class TarifaMunicipioService {
  async obtenerTodas() {
    await prisma.tarifaMunicipio.createMany({
      data: MUNICIPIOS.map((municipio) => ({ municipio, tarifaPorKm: TARIFA_POR_KM_DEFAULT[municipio] })),
      skipDuplicates: true,
    });
    return prisma.tarifaMunicipio.findMany({ orderBy: { municipio: 'asc' } });
  }

  async actualizar(municipio: string, tarifaPorKm: number) {
    if (!MUNICIPIOS.includes(municipio as Municipio)) {
      throw new Error(`Municipio inválido: ${municipio}`);
    }
    await this.obtenerTodas();
    return prisma.tarifaMunicipio.update({ where: { municipio }, data: { tarifaPorKm } });
  }

  async obtenerTarifaPorKm(municipio: Municipio): Promise<number> {
    const filas = await this.obtenerTodas();
    const fila = filas.find((f) => f.municipio === municipio) ?? filas.find((f) => f.municipio === 'BUCARAMANGA');
    if (!fila) throw new Error('No se pudo determinar la tarifa por km: falta configuración de municipios');
    return fila.tarifaPorKm;
  }
}

export const tarifaMunicipioService = new TarifaMunicipioService();
```

- [ ] **Step 6: Actualizar `configuracion.service.ts`**

Reemplazar todo el contenido de `src/services/configuracion.service.ts`:

```typescript
import prisma from '../config/database';
import { servelozConfig } from '../config/whatsapp';

export class ConfiguracionService {
  async obtener() {
    const config = await prisma.configuracion.findUnique({ where: { id: 'default' } });
    if (config) return config;
    return prisma.configuracion.create({
      data: { id: 'default', tarifaMinima: servelozConfig.tarifaMinima },
    });
  }

  async actualizar(data: { tarifaMinima?: number }) {
    await this.obtener();
    return prisma.configuracion.update({
      where: { id: 'default' },
      data: {
        ...(data.tarifaMinima !== undefined && { tarifaMinima: data.tarifaMinima }),
      },
    });
  }
}

export const configuracionService = new ConfiguracionService();
```

- [ ] **Step 7: Actualizar `src/config/whatsapp.ts`**

Reemplazar (líneas 16-24):

```typescript
export const servelozConfig = {
  nombre: process.env.SERVELOZ_NOMBRE || 'Serveloz',
  tarifaMinima: parseFloat(process.env.TARIFA_MINIMA || '3300'),
};
```

(Elimina las líneas de `tarifaBase`/`tarifaPorKm`; `radarConfig` ya fue eliminado en el
swap de geocoding anterior y no se toca aquí.)

- [ ] **Step 8: Actualizar `calcularPrecio` en `carreras.service.ts`**

En `src/services/carreras.service.ts`, agregar el import y reemplazar el método
(líneas 1-24):

```typescript
import prisma from '../config/database';
import { configuracionService } from './configuracion.service';
import { generarRadicado } from './whatsapp/templates';
import { municipioMasCercano } from './municipios';
import { tarifaMunicipioService } from './tarifa-municipio.service';

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
  async calcularPrecio(distanciaKm: number, destinoLat: number, destinoLng: number): Promise<number> {
    const config = await configuracionService.obtener();
    const municipio = municipioMasCercano(destinoLat, destinoLng);
    const tarifaPorKm = await tarifaMunicipioService.obtenerTarifaPorKm(municipio);
    const precioBruto = Math.max(config.tarifaMinima, tarifaPorKm * distanciaKm);
    return Math.round(precioBruto / 100) * 100;
  }
```

Y en el mismo archivo, dentro de `create()` (línea ~30), cambiar:

```typescript
    let precio = await this.calcularPrecio(data.distanciaKm);
```

por:

```typescript
    let precio = await this.calcularPrecio(data.distanciaKm, data.destinoLat, data.destinoLng);
```

El resto de `create()` (descuento de referido, creación de la carrera) no cambia.

- [ ] **Step 9: Actualizar el llamador en `bot.service.ts`**

En `src/services/whatsapp/bot.service.ts:259`, cambiar:

```typescript
      let precio = await carrerasService.calcularPrecio(distanciaKm);
```

por:

```typescript
      let precio = await carrerasService.calcularPrecio(distanciaKm, contexto.destino!.lat!, contexto.destino!.lng!);
```

- [ ] **Step 10: Actualizar `.env.example`**

En `.env.example`, reemplazar (líneas 10-11, la sección de tarifa que ya no tiene
Radar):

```
# ==================== DATOS DE SERVELOZ ====================
SERVELOZ_NOMBRE=Serveloz
TARIFA_MINIMA=3300
```

(Elimina `TARIFA_BASE`/`TARIFA_POR_KM` de esa sección; las tarifas por km ahora viven
en la tabla `TarifaMunicipio`, editable solo desde el panel, sin variable de entorno.)

- [ ] **Step 11: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin salida (sin errores).

- [ ] **Step 12: Verificar el cálculo de precio con los casos reales del spec**

Con el servidor de base de datos corriendo y la migración ya aplicada, ejecutar:

```bash
npx ts-node -e "
import { carrerasService } from './src/services/carreras.service';
(async () => {
  // Caso 1: destino en el centro de Bucaramanga, 4.5km — debe dar 5400
  const p1 = await carrerasService.calcularPrecio(4.5, 7.125, -73.119);
  console.log('Caso Megamall->Cacique (esperado 5400):', p1);

  // Caso 2: destino en el centro de Floridablanca, 1.5km — debe dar el piso 3300
  const p2 = await carrerasService.calcularPrecio(1.5, 7.0767, -73.0978);
  console.log('Caso trayecto corto en Floridablanca (esperado 3300):', p2);
  process.exit(0);
})();
"
```
Expected: `Caso Megamall->Cacique (esperado 5400): 5400` y
`Caso trayecto corto en Floridablanca (esperado 3300): 3300`. Si la tabla
`TarifaMunicipio` no tenía filas antes de correr esto, `obtenerTodas()` las siembra
automáticamente con los valores por defecto (1200/1200/1100/1100), así que no hace
falta ningún paso manual de seed antes de esta verificación.

- [ ] **Step 13: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/services/municipios.ts \
  src/services/tarifa-municipio.service.ts src/services/configuracion.service.ts \
  src/config/whatsapp.ts src/services/carreras.service.ts \
  src/services/whatsapp/bot.service.ts .env.example
git commit -m "feat: precio por tarifa mínima + tarifa por km según municipio de destino"
```

---

### Task 2: Endpoints admin para tarifas por municipio

**Files:**
- Modify: `src/routes/admin.routes.ts:6` (import) y después de la línea 204 (sección
  `CONFIGURACIÓN`)

**Interfaces:**
- Consumes: `tarifaMunicipioService.obtenerTodas()` / `.actualizar(municipio, tarifaPorKm)`
  (Task 1).
- Produces: `GET /api/admin/tarifas-municipio` → `TarifaMunicipio[]`;
  `PUT /api/admin/tarifas-municipio/:municipio` con body `{ tarifaPorKm: number }` →
  `TarifaMunicipio` actualizada. Consumidos por `config.html` (Task 3).

- [ ] **Step 1: Agregar el import**

En `src/routes/admin.routes.ts:6`, después de la línea del import de
`configuracionService`:

```typescript
import { tarifaMunicipioService } from '../services/tarifa-municipio.service';
```

- [ ] **Step 2: Agregar los endpoints**

Después del bloque `// ==================== CONFIGURACIÓN ====================`
(después de la línea 204, antes de la sección de conversaciones), agregar:

```typescript
// ==================== TARIFAS POR MUNICIPIO ====================
router.get('/tarifas-municipio', verificarAdmin, async (_req, res) => {
  try {
    const tarifas = await tarifaMunicipioService.obtenerTodas();
    res.json(tarifas);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/tarifas-municipio/:municipio', verificarAdmin, async (req, res) => {
  try {
    const tarifa = await tarifaMunicipioService.actualizar(req.params.municipio, req.body.tarifaPorKm);
    res.json(tarifa);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 4: Verificar los endpoints manualmente**

Con el servidor corriendo (`npm run dev`) y un token válido (usar el mismo flujo que ya
usa el panel: `POST /api/admin/auth/login` con las credenciales de `.env`):

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<ADMIN_USERNAME>","password":"<ADMIN_PASSWORD>"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

curl -s http://localhost:3000/api/admin/tarifas-municipio -H "Authorization: Bearer $TOKEN"

curl -s -X PUT http://localhost:3000/api/admin/tarifas-municipio/GIRON \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"tarifaPorKm": 1150}'
```
Expected: el primer `curl` devuelve un arreglo con 4 objetos `{municipio, tarifaPorKm, updatedAt}`.
El segundo devuelve `{"municipio":"GIRON","tarifaPorKm":1150,...}`. Volver a correr el
primer `curl` para confirmar que `GIRON` quedó en `1150` (y luego, si se quiere,
revertirlo a `1100` con otro `PUT`).

- [ ] **Step 5: Commit**

```bash
git add src/routes/admin.routes.ts
git commit -m "feat: endpoints admin para tarifas por municipio"
```

---

### Task 3: Panel admin — actualizar `config.html`

**Files:**
- Modify: `src/admin/config.html` (reemplazo completo del `<form>` y su script)

**Interfaces:**
- Consumes: `GET/PUT /api/admin/config` (ya existente, ahora con `tarifaMinima` en vez
  de `tarifaBase`/`tarifaPorKm`) y `GET/PUT /api/admin/tarifas-municipio/:municipio`
  (Task 2).

- [ ] **Step 1: Reemplazar el formulario y el script**

Reemplazar el contenido de `src/admin/config.html` completo (mantiene el mismo `<nav>`
con menú móvil ya existente, solo cambia `<main>` y el `<script>` final):

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
      <button id="btnMenuMobile" class="md:hidden p-2 -mr-2 text-gray-300" aria-label="Abrir menú" aria-expanded="false">
        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>
    </div>
    <div id="menuMobile" class="hidden md:hidden border-t border-gray-700 px-4 py-2 space-y-1">
      <a href="/admin/dashboard.html" class="block px-2 py-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white">Inicio</a>
      <a href="/admin/carreras.html" class="block px-2 py-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white">Carreras</a>
      <a href="/admin/conductores.html" class="block px-2 py-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white">Conductores</a>
      <a href="/admin/clientes.html" class="block px-2 py-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white">Clientes</a>
      <a href="/admin/conversaciones.html" class="block px-2 py-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white">Conversaciones</a>
      <a href="/admin/config.html" class="block px-2 py-2 rounded-lg text-amber-400 font-medium">Configuración</a>
      <button onclick="logout()" class="block w-full text-left px-2 py-2 rounded-lg text-red-400 hover:bg-gray-700">Salir</button>
    </div>
  </nav>

  <main class="max-w-md mx-auto px-6 py-8">
    <h1 class="text-2xl font-bold mb-6">Configuración de tarifas</h1>

    <form id="form" class="space-y-4 bg-gray-800 rounded-xl border border-gray-700 p-6">
      <div>
        <label class="block text-sm text-gray-400 mb-1">Tarifa mínima ($)</label>
        <input id="tarifaMinima" type="number" step="1" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2" required>
      </div>

      <div class="border-t border-gray-700 pt-4">
        <p class="text-sm text-gray-400 mb-2">Tarifa por km según municipio de destino</p>
        <div class="space-y-2">
          <div>
            <label class="block text-xs text-gray-500 mb-1">Bucaramanga</label>
            <input id="tarifa_BUCARAMANGA" type="number" step="1" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2" required>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Floridablanca</label>
            <input id="tarifa_FLORIDABLANCA" type="number" step="1" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2" required>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Girón</label>
            <input id="tarifa_GIRON" type="number" step="1" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2" required>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Piedecuesta</label>
            <input id="tarifa_PIEDECUESTA" type="number" step="1" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2" required>
          </div>
        </div>
      </div>

      <button type="submit" class="w-full bg-amber-500 hover:bg-amber-600 text-gray-900 font-semibold rounded-lg py-2">Guardar</button>
      <p id="mensaje" class="text-sm hidden"></p>
    </form>
  </main>

  <script src="/admin/js/auth.js"></script>
  <script>
    requireAuth();
    initMobileNav();

    const MUNICIPIOS = ['BUCARAMANGA', 'FLORIDABLANCA', 'GIRON', 'PIEDECUESTA'];

    async function cargar() {
      const config = await (await authFetch('/api/admin/config')).json();
      document.getElementById('tarifaMinima').value = config.tarifaMinima;

      const tarifas = await (await authFetch('/api/admin/tarifas-municipio')).json();
      tarifas.forEach(t => {
        const input = document.getElementById(`tarifa_${t.municipio}`);
        if (input) input.value = t.tarifaPorKm;
      });
    }

    document.getElementById('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const mensaje = document.getElementById('mensaje');
      mensaje.classList.add('hidden');

      try {
        await authFetch('/api/admin/config', {
          method: 'PUT',
          body: JSON.stringify({ tarifaMinima: parseFloat(document.getElementById('tarifaMinima').value) }),
        });

        for (const municipio of MUNICIPIOS) {
          const tarifaPorKm = parseFloat(document.getElementById(`tarifa_${municipio}`).value);
          await authFetch(`/api/admin/tarifas-municipio/${municipio}`, {
            method: 'PUT',
            body: JSON.stringify({ tarifaPorKm }),
          });
        }

        mensaje.textContent = 'Guardado correctamente.';
        mensaje.className = 'text-green-400 text-sm';
      } catch (err) {
        mensaje.textContent = 'No se pudo guardar. Intenta de nuevo.';
        mensaje.className = 'text-red-400 text-sm';
      }
    });

    cargar();
  </script>
</body>
</html>
```

- [ ] **Step 2: Verificar en el navegador**

Con el servidor corriendo (`npm run dev`), entrar a `http://localhost:3000/admin/config.html`,
iniciar sesión, y confirmar que:
1. Los 5 campos (tarifa mínima + 4 municipios) se precargan con los valores actuales.
2. Cambiar un valor y presionar "Guardar" muestra "Guardado correctamente." y, al
   recargar la página, el nuevo valor sigue ahí.
3. El menú hamburguesa en móvil (ya implementado antes) sigue funcionando en esta
   página.

- [ ] **Step 3: Commit**

```bash
git add src/admin/config.html
git commit -m "feat: panel admin - editar tarifa mínima y tarifa por km por municipio"
```

---

### Task 4: Verificación end-to-end con los casos reales y limpieza

**Files:**
- No se crean ni modifican archivos de producto en esta tarea — solo verificación y,
  si hace falta, ajustes menores encontrados durante la prueba.

- [ ] **Step 1: Confirmar que no quedan referencias a los campos viejos**

Run:
```bash
grep -rn "tarifaBase\|TARIFA_BASE\|TARIFA_POR_KM" src .env.example
```
Expected: sin resultados (aparte de, potencialmente, `tarifaPorKm` que sí sigue
existiendo como campo de `TarifaMunicipio` — verificar que cualquier `tarifaPorKm` que
aparezca sea de esa tabla nueva, no del `Configuracion` viejo).

- [ ] **Step 2: Probar el flujo completo desde el panel (creación manual de carrera)**

Con el servidor corriendo, usar el panel (`Carreras` → `+ Nueva carrera manual`) para
crear una carrera con recogida y destino reales que reproduzcan el caso de Megamall→
Cacique (o cualquier par de direcciones dentro de Bucaramanga con ~4.5km de distancia
real). Confirmar que el precio mostrado en la lista de carreras es consistente con
`tarifaPorKm(BUCARAMANGA) × distanciaKm`, redondeado a $100, con el piso de
`tarifaMinima` aplicado si la distancia es corta.

- [ ] **Step 3: Probar el flujo completo desde WhatsApp (si hay acceso a un número de prueba)**

Repetir un pedido de domicilio real por WhatsApp con las dos direcciones de prueba y
confirmar que el precio que el bot muestra en `MENSAJES.PRECIO_CALCULADO` coincide con
el mismo cálculo. Si no hay acceso a WhatsApp en este momento, dejar esta verificación
pendiente y anotarlo explícitamente al reportar el resultado de esta tarea.

- [ ] **Step 4: Actualizar `PROGRESS.md`**

Agregar una entrada breve a la sección "Qué se hizo en esta sesión" (o crear una nueva
sección con la fecha de hoy) describiendo el cambio de modelo de tarifas, siguiendo el
mismo formato que ya usa el resto del archivo.

- [ ] **Step 5: Commit final**

```bash
git add PROGRESS.md
git commit -m "docs: actualizar progreso con el nuevo modelo de tarifas por municipio"
```

---

## Self-Review

**Cobertura del spec:** las 7 secciones del spec están cubiertas — modelo de datos
(Task 1, Steps 1-2), lógica de cálculo (Task 1, Steps 3-9), panel admin (Task 2 y 3),
casos borde (fallback a Bucaramanga en `tarifaMunicipioService.obtenerTarifaPorKm`,
Task 1 Step 5; redondeo a $100, Task 1 Step 8), y validación de los casos reales
(Task 1 Step 12 y Task 4 Step 2).

**Placeholders:** ninguno — cada paso incluye código completo o comando exacto con
salida esperada.

**Consistencia de tipos:** `Municipio` se define una sola vez en `municipios.ts` y se
importa en `tarifa-municipio.service.ts` y (transitivamente, vía el valor de retorno de
`municipioMasCercano`) en `carreras.service.ts`. La firma de `calcularPrecio` es la
misma en su definición (Task 1, Step 8) y en ambos puntos donde se llama (Task 1,
Steps 8 y 9).
