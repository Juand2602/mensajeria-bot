-- CreateTable
CREATE TABLE "EvidenciaFoto" (
    "id" TEXT NOT NULL,
    "carreraId" TEXT NOT NULL,
    "tipo" TEXT,
    "autor" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenciaFoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvidenciaFoto_carreraId_idx" ON "EvidenciaFoto"("carreraId");

-- AddForeignKey
ALTER TABLE "EvidenciaFoto" ADD CONSTRAINT "EvidenciaFoto_carreraId_fkey" FOREIGN KEY ("carreraId") REFERENCES "Carrera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
