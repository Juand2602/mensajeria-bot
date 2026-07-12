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

  private normalizarTelefono(texto: string): string {
    const soloDigitos = texto.replace(/\D/g, '');
    if (soloDigitos.length === 10 && soloDigitos.startsWith('3')) return `57${soloDigitos}`;
    return soloDigitos;
  }

  // El bot le pide al cliente "nombre o número" de quien lo refirió. Un nombre
  // nunca coincide con una búsqueda por teléfono, y un número escrito con
  // espacios/guiones o sin el indicativo de país tampoco coincide con el
  // formato exacto que guarda WhatsApp — por eso se normaliza el teléfono y,
  // si no hay coincidencia, se intenta por nombre (solo si es inequívoco).
  async buscarReferidor(query: string) {
    const telefonoNormalizado = this.normalizarTelefono(query);
    if (telefonoNormalizado) {
      const porTelefono = await this.buscarPorTelefono(telefonoNormalizado);
      if (porTelefono) return porTelefono;
    }

    const coincidencias = await prisma.cliente.findMany({
      where: { nombre: { contains: query.trim(), mode: 'insensitive' } },
      take: 2,
    });
    return coincidencias.length === 1 ? coincidencias[0] : null;
  }
}

export const clientesService = new ClientesService();
