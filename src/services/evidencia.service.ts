import prisma from '../config/database';

export type AutorEvidencia = 'CLIENTE' | 'CONDUCTOR';
export type TipoEvidencia = 'RECOGIDA' | 'ENTREGA';

export class EvidenciaService {
  async crear(carreraId: string, autor: AutorEvidencia, url: string, tipo?: TipoEvidencia) {
    return prisma.evidenciaFoto.create({
      data: { carreraId, autor, url, tipo: tipo || null },
    });
  }

  // Busca la foto de conductor más reciente que todavía no tiene tipo asignado,
  // para la carrera activa de un conductor específico, y le pone el tipo.
  async etiquetarPendienteDeConductor(conductorId: string, tipo: TipoEvidencia) {
    const pendiente = await prisma.evidenciaFoto.findFirst({
      where: { tipo: null, autor: 'CONDUCTOR', carrera: { conductorId } },
      orderBy: { createdAt: 'desc' },
    });
    if (!pendiente) return null;
    return prisma.evidenciaFoto.update({ where: { id: pendiente.id }, data: { tipo } });
  }
}

export const evidenciaService = new EvidenciaService();
