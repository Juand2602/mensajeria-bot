-- Drop old columns from Configuracion
ALTER TABLE "Configuracion" DROP COLUMN "tarifaBase";
ALTER TABLE "Configuracion" DROP COLUMN "tarifaPorKm";

-- Add new column to Configuracion
ALTER TABLE "Configuracion" ADD COLUMN "tarifaMinima" DOUBLE PRECISION NOT NULL DEFAULT 3300;

-- CreateTable TarifaMunicipio
CREATE TABLE "TarifaMunicipio" (
    "municipio" TEXT NOT NULL,
    "tarifaPorKm" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TarifaMunicipio_pkey" PRIMARY KEY ("municipio")
);
