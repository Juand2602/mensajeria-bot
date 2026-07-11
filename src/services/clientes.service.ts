import prisma from '../config/database';

export class ClientesService {
  async buscarPorTelefono(telefono: string) {
    return prisma.cliente.findUnique({ where: { telefono } });
  }

  async crear(data: { nombre: string; telefono: string; referidoPorTelefono?: string }) {
    let referidoPorId: string | undefined;
    if (data.referidoPorTelefono) {
      const referidor = await this.buscarPorTelefono(data.referidoPorTelefono);
      if (referidor) referidoPorId = referidor.id;
    }
    return prisma.cliente.create({
      data: { nombre: data.nombre.trim(), telefono: data.telefono.trim(), referidoPorId },
    });
  }

  async getAll(search?: string) {
    const where: any = {};
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { telefono: { contains: search } },
      ];
    }
    return prisma.cliente.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async getById(id: string) {
    const cliente = await prisma.cliente.findUnique({ where: { id } });
    if (!cliente) throw new Error('Cliente no encontrado');
    return cliente;
  }

  async update(id: string, data: { nombre?: string; activo?: boolean; notas?: string }) {
    return prisma.cliente.update({
      where: { id },
      data: {
        ...(data.nombre && { nombre: data.nombre.trim() }),
        ...(data.activo !== undefined && { activo: data.activo }),
        ...(data.notas !== undefined && { notas: data.notas }),
      },
    });
  }

  async obtenerOCrear(telefono: string, nombre: string) {
    let cliente = await this.buscarPorTelefono(telefono);
    if (!cliente) cliente = await this.crear({ nombre, telefono });
    return cliente;
  }
}

export const clientesService = new ClientesService();
