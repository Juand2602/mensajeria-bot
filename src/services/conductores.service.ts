import prisma from '../config/database';

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

  async create(data: { nombre: string; telefono: string; notas?: string }) {
    return prisma.conductor.create({
      data: { nombre: data.nombre.trim(), telefono: data.telefono.trim(), notas: data.notas },
    });
  }

  async update(id: string, data: { nombre?: string; telefono?: string; activo?: boolean; notas?: string }) {
    return prisma.conductor.update({
      where: { id },
      data: {
        ...(data.nombre && { nombre: data.nombre.trim() }),
        ...(data.telefono && { telefono: data.telefono.trim() }),
        ...(data.activo !== undefined && { activo: data.activo }),
        ...(data.notas !== undefined && { notas: data.notas }),
      },
    });
  }

  async delete(id: string) {
    return prisma.conductor.update({ where: { id }, data: { activo: false } });
  }
}

export const conductoresService = new ConductoresService();
