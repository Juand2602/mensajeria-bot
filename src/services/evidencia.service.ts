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

  // Un conductor puede también ser cliente (ej. el dueño, que a veces hace de
  // mensajero). Solo tiene sentido interceptar su texto libre con el mensaje
  // fijo de "eres conductor" justo cuando tiene una foto esperando etiqueta —
  // en cualquier otro momento su texto debe seguir el flujo normal de cliente.
  // Se acota a carreras todavía ASIGNADA: si una foto queda sin etiquetar para
  // siempre (ej. la carrera se completó antes de que el conductor tocara el
  // botón), no debe bloquear el flujo de cliente de ese número indefinidamente.
  async tienePendienteDeConductor(conductorId: string): Promise<boolean> {
    const pendiente = await prisma.evidenciaFoto.findFirst({
      where: { tipo: null, autor: 'CONDUCTOR', carrera: { conductorId, estado: 'ASIGNADA' } },
    });
    return !!pendiente;
  }
}

export const evidenciaService = new EvidenciaService();
