import prisma from '../config/database';
import { servelozConfig } from '../config/whatsapp';

export class ConfiguracionService {
  async obtener() {
    const config = await prisma.configuracion.findUnique({ where: { id: 'default' } });
    if (config) return config;
    return prisma.configuracion.create({
      data: { id: 'default', tarifaMinima: servelozConfig.tarifaMinima },
    });
  }

  async actualizar(data: { tarifaMinima?: number }) {
    await this.obtener();
    return prisma.configuracion.update({
      where: { id: 'default' },
      data: {
        ...(data.tarifaMinima !== undefined && { tarifaMinima: data.tarifaMinima }),
      },
    });
  }
}

export const configuracionService = new ConfiguracionService();
