import prisma from '../config/database';
import { servelozConfig } from '../config/whatsapp';

export class ConfiguracionService {
  async obtener() {
    const config = await prisma.configuracion.findUnique({ where: { id: 'default' } });
    if (config) return config;
    return prisma.configuracion.create({
      data: { id: 'default', tarifaBase: servelozConfig.tarifaBase, tarifaPorKm: servelozConfig.tarifaPorKm },
    });
  }

  async actualizar(data: { tarifaBase?: number; tarifaPorKm?: number }) {
    await this.obtener();
    return prisma.configuracion.update({
      where: { id: 'default' },
      data: {
        ...(data.tarifaBase !== undefined && { tarifaBase: data.tarifaBase }),
        ...(data.tarifaPorKm !== undefined && { tarifaPorKm: data.tarifaPorKm }),
      },
    });
  }
}

export const configuracionService = new ConfiguracionService();
