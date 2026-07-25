import prisma from '../config/database';
import { mediaService } from './media.service';

interface DatosConductor {
  nombre: string;
  telefono: string;
  notas?: string;
  tipoVehiculo: string;
  marca: string;
  linea: string;
  modelo: string;
  placa: string;
  fotoBase64: string;
}

interface DatosConductorUpdate {
  nombre?: string;
  telefono?: string;
  activo?: boolean;
  notas?: string;
  tipoVehiculo?: string;
  marca?: string;
  linea?: string;
  modelo?: string;
  placa?: string;
  fotoBase64?: string;
}

const CAMPOS_VEHICULO_OBLIGATORIOS = ['tipoVehiculo', 'marca', 'linea', 'modelo', 'placa'] as const;

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

  async create(data: DatosConductor) {
    for (const campo of CAMPOS_VEHICULO_OBLIGATORIOS) {
      if (!data[campo]?.trim()) throw new Error(`El campo "${campo}" es obligatorio`);
    }
    if (!data.fotoBase64?.trim()) throw new Error('La foto del conductor es obligatoria');

    const fotoUrl = await mediaService.subirBase64(data.fotoBase64, 'serveloz/conductores');

    return prisma.conductor.create({
      data: {
        nombre: data.nombre.trim(),
        telefono: data.telefono.trim(),
        notas: data.notas,
        tipoVehiculo: data.tipoVehiculo.trim(),
        marca: data.marca.trim(),
        linea: data.linea.trim(),
        modelo: data.modelo.trim(),
        placa: data.placa.trim(),
        fotoUrl,
      },
    });
  }

  async update(id: string, data: DatosConductorUpdate) {
    const fotoUrl = data.fotoBase64?.trim()
      ? await mediaService.subirBase64(data.fotoBase64, 'serveloz/conductores')
      : undefined;

    return prisma.conductor.update({
      where: { id },
      data: {
        ...(data.nombre && { nombre: data.nombre.trim() }),
        ...(data.telefono && { telefono: data.telefono.trim() }),
        ...(data.activo !== undefined && { activo: data.activo }),
        ...(data.notas !== undefined && { notas: data.notas }),
        ...(data.tipoVehiculo !== undefined && { tipoVehiculo: data.tipoVehiculo.trim() }),
        ...(data.marca !== undefined && { marca: data.marca.trim() }),
        ...(data.linea !== undefined && { linea: data.linea.trim() }),
        ...(data.modelo !== undefined && { modelo: data.modelo.trim() }),
        ...(data.placa !== undefined && { placa: data.placa.trim() }),
        ...(fotoUrl !== undefined && { fotoUrl }),
      },
    });
  }

  async delete(id: string) {
    return prisma.conductor.update({ where: { id }, data: { activo: false } });
  }
}

export const conductoresService = new ConductoresService();
