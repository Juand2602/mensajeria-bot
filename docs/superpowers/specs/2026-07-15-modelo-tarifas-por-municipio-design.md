# Serveloz — Modelo de tarifas por municipio (rediseño de precio)

Fecha: 2026-07-15
Basado en: pruebas reales del dueño sobre `docs/superpowers/specs/2026-07-10-mensajeria-bot-etapa1-design.md`.

## 1. Contexto y problema

Tras probar el bot con una carrera real (CC Megamall → CC Cacique, Bucaramanga), el
dueño consideró el precio calculado ($8.700) demasiado alto frente a lo que cobra la
competencia informal (inDrive/Didi, ~$6.000 en promedio) y frente a lo que él mismo
cobraría por esa distancia ($1.200/km × 4.5km ≈ $5.400).

Investigando la causa se encontraron dos problemas distintos, ya resueltos o entendidos
antes de este diseño:

1. La fórmula (`tarifaBase + tarifaPorKm × distanciaKm`) no tenía ningún error — el
   número alto salía porque la fila de `Configuracion` en la base de datos tenía valores
   de una prueba anterior (`tarifaBase=5000`, `tarifaPorKm=1000`) que no correspondían al
   `.env` actual. Esto confirmó algo importante de la arquitectura actual: **`.env` solo
   siembra la fila de configuración la primera vez; después, el panel de administración
   es la única fuente real** — un cambio en `.env` no tiene efecto si la fila ya existe.
2. Una vez corregido ese valor, seguía sin encajar con la forma en que el dueño realmente
   piensa sus tarifas: no usa una tarifa base fija + por km en todo el rango de
   distancias — usa una **tarifa plana para trayectos cortos/cercanos** ($3.300, sin
   importar los extremos exactos del viaje) y **tarifa por km distinta según el
   municipio de destino** para trayectos más largos (Bucaramanga/Floridablanca
   $1.200/km, Girón/Piedecuesta $1.100/km).

Este documento diseña el nuevo modelo de cálculo de precio que refleja esa realidad de
negocio, reemplazando `tarifaBase` + `tarifaPorKm` único por un piso mínimo + tarifa por
km dependiente del municipio de destino.

## 2. Modelo de datos (Prisma)

**`Configuracion` (se modifica):**

```
Configuracion
  id            String   @id @default("default")
  tarifaMinima  Float    @default(3300)   // reemplaza tarifaBase
  updatedAt     DateTime @updatedAt
  // tarifaPorKm se elimina de aquí — se reemplaza por TarifaMunicipio
```

**`TarifaMunicipio` (tabla nueva):**

```
TarifaMunicipio
  municipio     String  @id   // "BUCARAMANGA" | "FLORIDABLANCA" | "GIRON" | "PIEDECUESTA"
  tarifaPorKm   Float
  updatedAt     DateTime @updatedAt
```

Precargada (mismo patrón de auto-creación que ya usa `configuracionService.obtener()`
para la fila `default` de `Configuracion`) con:

| municipio     | tarifaPorKm |
|---------------|-------------|
| BUCARAMANGA   | 1200        |
| FLORIDABLANCA | 1200        |
| GIRON         | 1100        |
| PIEDECUESTA   | 1100        |

Las coordenadas centrales de cada municipio (usadas solo para detectar a cuál
pertenece una carrera, ver sección 3) son **constantes fijas en código**, no datos de
base de datos editables desde el panel — son un dato técnico de geolocalización, no
una decisión de negocio del dueño.

Migración: aditiva (agrega `tarifaMinima` y la tabla `TarifaMunicipio`, elimina
`tarifaBase`/`tarifaPorKm` de `Configuracion`). No aplica a carreras ya creadas — su
`precio` ya calculado no se recalcula retroactivamente.

## 3. Lógica de cálculo

**Detectar municipio de una carrera** (nuevo, en un servicio o helper, ej.
`municipios.ts`):

```
municipioMasCercano(lat, lng):
  calcula distancia en línea recta (fórmula haversine) desde (lat, lng) a cada uno
  de los 4 puntos centrales fijos (Bucaramanga, Floridablanca, Girón, Piedecuesta)
  devuelve el municipio con menor distancia
```

Se eligió comparar contra 4 puntos centrales fijos (en vez de leer el municipio del
texto que devuelve el geocodificador, o usar polígonos de límite municipal reales)
porque:
- Es independiente del proveedor de geocoding — sobrevive intacto al swap de
  Nominatim/OSRM a Mapbox (o cualquier proveedor futuro), ya que solo necesita
  coordenadas, que todo geocodificador devuelve igual.
- Es la opción más simple que resuelve el caso real: el área metropolitana de
  Bucaramanga tiene exactamente 4 municipios fijos, que no van a cambiar.
- El margen de error en el límite exacto entre dos municipios (unos metros) es
  irrelevante para fijar una tarifa de domicilio.

**Calcular precio** (reemplaza `calcularPrecio` en `carreras.service.ts`):

```
calcularPrecio(distanciaKm, destinoLat, destinoLng):
  config = Configuracion.obtener()                      // trae tarifaMinima
  municipio = municipioMasCercano(destinoLat, destinoLng)
  tarifa = TarifaMunicipio.buscar(municipio)
           ?? TarifaMunicipio.buscar('BUCARAMANGA')      // respaldo si falta la fila
  precioBruto = max(config.tarifaMinima, tarifa.tarifaPorKm × distanciaKm)
  return Math.round(precioBruto / 100) * 100             // redondeo a $100 más cercano
```

La tarifa aplicada depende del **municipio de destino** (no del origen, ni de un
promedio entre ambos) — decisión tomada explícitamente por el dueño para el caso de
carreras que cruzan entre municipios.

El descuento de referido (20% si el cliente tiene crédito disponible) se sigue
aplicando **después** de este cálculo, exactamente igual que hoy (`carreras.service.ts`,
sin cambios en esa parte).

Aplica igual para `DOMICILIO` y `MOTOTAXI` — no hay fórmula ni tarifa mínima separada
por tipo de servicio (decisión explícita: mantenerlo simple por ahora, diferenciar
después si hace falta).

**Cambio de firma:** `calcularPrecio` pasa de `(distanciaKm)` a
`(distanciaKm, destinoLat, destinoLng)`. Ambos puntos de llamada actuales (bot de
WhatsApp en `bot.service.ts`, y creación manual de carrera en `admin.routes.ts` /
`carreras.service.ts`) ya tienen las coordenadas de destino disponibles en ese momento,
así que no se le pide nada nuevo ni al cliente ni al dueño.

## 4. Panel de administración

`config.html` cambia de 2 campos a:
- **Tarifa mínima** ($) — reemplaza el actual "Tarifa base".
- **Tarifa por km** — un campo por municipio (Bucaramanga, Floridablanca, Girón,
  Piedecuesta), en vez del único campo genérico de hoy.

Backend: `configuracion.service.ts` sigue manejando `tarifaMinima` igual que hoy maneja
`tarifaBase`. Se agrega manejo de `TarifaMunicipio` (mismo servicio o uno nuevo,
`tarifaMunicipioService`, con `obtenerTodas()` / `actualizar(municipio, tarifaPorKm)`), y
dos endpoints nuevos en `admin.routes.ts` (`GET`/`PUT /api/admin/tarifas-municipio`)
siguiendo el mismo patrón que ya existe para `/api/admin/config`.

No se toca el login, la autenticación, ni el resto de páginas del panel.

## 5. Casos borde y manejo de errores

- **Geocoding falla o no hay coordenadas de destino:** comportamiento sin cambios —
  ya existe manejo de error (`catch` en `calcularYMostrarPrecio` →
  `MENSAJES.ERROR_SERVIDOR()`). Sin coordenadas no se puede calcular precio.
- **Falta una fila en `TarifaMunicipio`** (dato de configuración incompleto o
  corrupto): se usa la tarifa de Bucaramanga como respaldo en vez de fallar la
  solicitud completa — evita que un problema de configuración tumbe una carrera real.
- **Redondeo:** el precio final se redondea al múltiplo de $100 más cercano
  (`Math.round(precio / 100) * 100`), aplicado al resultado final (después del piso,
  la tarifa por municipio, y el descuento de referido si aplica). Reemplaza el
  redondeo al peso exacto que se usa hoy.
- **Migración de datos:** aditiva, no requiere migrar carreras históricas (ver
  sección 2).
- **Pruebas:** sin tests automatizados (mismo criterio que el resto del proyecto,
  spec de Etapa 1). Se valida manualmente recalculando a mano los casos reales que
  motivaron este diseño (Megamall→Cacique, un trayecto corto tipo Campanazo) antes de
  dar por buena la implementación.

## 6. Validación de los casos reales que motivaron este diseño

- **Megamall → CC Cacique** (4.5km real según Google Maps, en Bucaramanga):
  `max(3300, 1200 × 4.5) = max(3300, 5400) = 5400` → redondeado a `5400`. Coincide con
  la cifra que el dueño considera justa (~$5.400).
- **Trayecto corto dentro de una zona cercana** (ej. Campanazo, Floridablanca,
  ~1-2km): `max(3300, 1200 × 1.5) = max(3300, 1800) = 3300`. Coincide con la tarifa
  plana de $3.300 que el dueño ya cobra para esos casos, sin necesidad de mantener una
  lista explícita de zonas — el piso mínimo la reproduce automáticamente para
  cualquier trayecto suficientemente corto.

## 7. Fuera de alcance de este documento

- Diferenciar tarifa/mínimo por tipo de servicio (domicilio vs. mototaxi) — se decidió
  explícitamente mantenerlos iguales por ahora.
- Editar desde el panel las coordenadas centrales de los municipios (son constantes de
  código).
- Cualquier ajuste al proveedor de geocoding/distancia (Nominatim/OSRM → Mapbox) — es
  un cambio independiente, ya conversado por separado, que no debería requerir tocar
  nada de este diseño gracias a que la detección de municipio no depende del proveedor.
