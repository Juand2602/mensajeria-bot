-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "email" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "referidoPorId" TEXT,
    "descuentosDisponibles" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conductor" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conductor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Carrera" (
    "id" TEXT NOT NULL,
    "radicado" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "conductorId" TEXT,
    "tipoServicio" TEXT NOT NULL,
    "direccionRecogida" TEXT NOT NULL,
    "recogidaLat" DOUBLE PRECISION NOT NULL,
    "recogidaLng" DOUBLE PRECISION NOT NULL,
    "direccionDestino" TEXT NOT NULL,
    "destinoLat" DOUBLE PRECISION NOT NULL,
    "destinoLng" DOUBLE PRECISION NOT NULL,
    "distanciaKm" DOUBLE PRECISION NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE_ASIGNACION',
    "estadoPago" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "fechaHoraProgramada" TIMESTAMP(3),
    "avisoProgramadaEnviado" BOOLEAN NOT NULL DEFAULT false,
    "descuentoAplicado" BOOLEAN NOT NULL DEFAULT false,
    "origen" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "notas" TEXT,
    "motivoCancelacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Carrera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversacion" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'INICIAL',
    "contexto" TEXT NOT NULL,
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "modoManual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuracion" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "tarifaBase" DOUBLE PRECISION NOT NULL DEFAULT 3000,
    "tarifaPorKm" DOUBLE PRECISION NOT NULL DEFAULT 800,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuracion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mensaje" (
    "id" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "clienteId" TEXT,
    "direccion" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "enviadoPor" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mensaje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_telefono_key" ON "Cliente"("telefono");

-- CreateIndex
CREATE INDEX "Cliente_telefono_idx" ON "Cliente"("telefono");

-- CreateIndex
CREATE INDEX "Cliente_nombre_idx" ON "Cliente"("nombre");

-- CreateIndex
CREATE INDEX "Conductor_activo_idx" ON "Conductor"("activo");

-- CreateIndex
CREATE UNIQUE INDEX "Carrera_radicado_key" ON "Carrera"("radicado");

-- CreateIndex
CREATE INDEX "Carrera_radicado_idx" ON "Carrera"("radicado");

-- CreateIndex
CREATE INDEX "Carrera_estado_idx" ON "Carrera"("estado");

-- CreateIndex
CREATE INDEX "Carrera_conductorId_idx" ON "Carrera"("conductorId");

-- CreateIndex
CREATE INDEX "Carrera_fechaHoraProgramada_idx" ON "Carrera"("fechaHoraProgramada");

-- CreateIndex
CREATE INDEX "Conversacion_telefono_activa_idx" ON "Conversacion"("telefono", "activa");

-- CreateIndex
CREATE INDEX "Conversacion_lastActivity_idx" ON "Conversacion"("lastActivity");

-- CreateIndex
CREATE INDEX "Mensaje_telefono_timestamp_idx" ON "Mensaje"("telefono", "timestamp");

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_referidoPorId_fkey" FOREIGN KEY ("referidoPorId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Carrera" ADD CONSTRAINT "Carrera_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Carrera" ADD CONSTRAINT "Carrera_conductorId_fkey" FOREIGN KEY ("conductorId") REFERENCES "Conductor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversacion" ADD CONSTRAINT "Conversacion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensaje" ADD CONSTRAINT "Mensaje_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
