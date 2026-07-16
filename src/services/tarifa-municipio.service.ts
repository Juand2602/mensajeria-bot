import prisma from '../config/database';
import { MUNICIPIOS, Municipio } from './municipios';

const TARIFA_POR_KM_DEFAULT: Record<Municipio, number> = {
  BUCARAMANGA: 1200,
  FLORIDABLANCA: 1200,
  GIRON: 1100,
  PIEDECUESTA: 1100,
};

export class TarifaMunicipioService {
  async obtenerTodas() {
    await prisma.tarifaMunicipio.createMany({
      data: MUNICIPIOS.map((municipio) => ({ municipio, tarifaPorKm: TARIFA_POR_KM_DEFAULT[municipio] })),
      skipDuplicates: true,
    });
    return prisma.tarifaMunicipio.findMany({ orderBy: { municipio: 'asc' } });
  }

  async actualizar(municipio: string, tarifaPorKm: number) {
    if (!MUNICIPIOS.includes(municipio as Municipio)) {
      throw new Error(`Municipio inválido: ${municipio}`);
    }
    await this.obtenerTodas();
    return prisma.tarifaMunicipio.update({ where: { municipio }, data: { tarifaPorKm } });
  }

  async obtenerTarifaPorKm(municipio: Municipio): Promise<number> {
    const filas = await this.obtenerTodas();
    const fila = filas.find((f) => f.municipio === municipio) ?? filas.find((f) => f.municipio === 'BUCARAMANGA');
    if (!fila) throw new Error('No se pudo determinar la tarifa por km: falta configuración de municipios');
    return fila.tarifaPorKm;
  }
}

export const tarifaMunicipioService = new TarifaMunicipioService();
