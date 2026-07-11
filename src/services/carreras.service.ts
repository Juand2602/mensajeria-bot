import prisma from '../config/database';
import { configuracionService } from './configuracion.service';
import { generarRadicado } from './whatsapp/templates';

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
  async calcularPrecio(distanciaKm: number): Promise<number> {
    const config = await configuracionService.obtener();
    return Math.round(config.tarifaBase + config.tarifaPorKm * distanciaKm);
  }

  async create(data: CrearCarreraInput) {
    const cliente = await prisma.cliente.findUnique({ where: { id: data.clienteId } });
    if (!cliente) throw new Error('Cliente no encontrado');

    let precio = await this.calcularPrecio(data.distanciaKm);
    let descuentoAplicado = false;
    if (cliente.descuentosDisponibles > 0) {
      precio = Math.round(precio * 0.8);
      descuentoAplicado = true;
    }

    const carrera = await prisma.carrera.create({
      data: {
        radicado: generarRadicado(),
        clienteId: data.clienteId,
        conductorId: data.conductorId || null,
        tipoServicio: data.tipoServicio,
        direccionRecogida: data.direccionRecogida,
        recogidaLat: data.recogidaLat,
        recogidaLng: data.recogidaLng,
        direccionDestino: data.direccionDestino,
        destinoLat: data.destinoLat,
        destinoLng: data.destinoLng,
        distanciaKm: data.distanciaKm,
        precio,
        estado: data.conductorId ? 'ASIGNADA' : 'PENDIENTE_ASIGNACION',
        fechaHoraProgramada: data.fechaHoraProgramada || null,
        descuentoAplicado,
        origen: data.origen || 'WHATSAPP',
      },
      include: { cliente: true, conductor: true },
    });

    if (descuentoAplicado) {
      await prisma.cliente.update({
        where: { id: cliente.id },
        data: { descuentosDisponibles: { decrement: 1 } },
      });
    }

    return carrera;
  }

  async getById(id: string) {
    const carrera = await prisma.carrera.findUnique({ where: { id }, include: { cliente: true, conductor: true } });
    if (!carrera) throw new Error('Carrera no encontrada');
    return carrera;
  }

  async buscarPorRadicado(radicado: string) {
    return prisma.carrera.findUnique({ where: { radicado }, include: { cliente: true, conductor: true } });
  }

  async getAll(filters?: { estado?: string; conductorId?: string; clienteId?: string }) {
    const where: any = {};
    if (filters?.estado) where.estado = filters.estado;
    if (filters?.conductorId) where.conductorId = filters.conductorId;
    if (filters?.clienteId) where.clienteId = filters.clienteId;
    return prisma.carrera.findMany({ where, include: { cliente: true, conductor: true }, orderBy: { createdAt: 'desc' } });
  }

  async getActivasPorTelefono(telefono: string) {
    return prisma.carrera.findMany({
      where: { cliente: { telefono }, estado: { in: ['PENDIENTE_ASIGNACION', 'ASIGNADA'] } },
      include: { cliente: true, conductor: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
  }

  async asignarConductor(id: string, conductorId: string) {
    return prisma.carrera.update({
      where: { id },
      data: { conductorId, estado: 'ASIGNADA' },
      include: { cliente: true, conductor: true },
    });
  }

  async cambiarEstado(id: string, estado: string, motivoCancelacion?: string) {
    return prisma.carrera.update({
      where: { id },
      data: { estado, motivoCancelacion: motivoCancelacion || null },
      include: { cliente: true, conductor: true },
    });
  }

  async marcarCompletada(id: string) {
    const carrera = await prisma.carrera.update({
      where: { id },
      data: { estado: 'COMPLETADA' },
      include: { cliente: true, conductor: true },
    });

    let referidorNotificar: { telefono: string } | null = null;
    if (carrera.cliente.referidoPorId) {
      const yaTuvoCompletadaAntes = await prisma.carrera.count({
        where: { clienteId: carrera.clienteId, estado: 'COMPLETADA', id: { not: carrera.id } },
      });
      if (yaTuvoCompletadaAntes === 0) {
        const referidor = await prisma.cliente.update({
          where: { id: carrera.cliente.referidoPorId },
          data: { descuentosDisponibles: { increment: 1 } },
        });
        referidorNotificar = { telefono: referidor.telefono };
      }
    }

    return { carrera, referidorNotificar };
  }

  async actualizarEstadoPago(id: string, estadoPago: string) {
    return prisma.carrera.update({ where: { id }, data: { estadoPago }, include: { cliente: true, conductor: true } });
  }

  async getProgramadasPendientesDeAviso(antesDe: Date) {
    return prisma.carrera.findMany({
      where: {
        estado: 'PENDIENTE_ASIGNACION',
        fechaHoraProgramada: { lte: antesDe },
        avisoProgramadaEnviado: false,
        NOT: { fechaHoraProgramada: null },
      },
      include: { cliente: true },
    });
  }

  async marcarAvisoProgramadaEnviado(id: string) {
    return prisma.carrera.update({ where: { id }, data: { avisoProgramadaEnviado: true } });
  }
}

export const carrerasService = new CarrerasService();
