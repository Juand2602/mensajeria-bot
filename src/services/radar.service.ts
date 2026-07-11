import axios from 'axios';
import { radarConfig } from '../config/whatsapp';

const RADAR_BASE_URL = 'https://api.radar.io/v1';

export interface CoordenadasGeocoded {
  lat: number;
  lng: number;
  direccionFormateada: string;
}

export class RadarService {
  private headers() {
    return { Authorization: radarConfig.apiKey };
  }

  async geocodificar(direccionTexto: string): Promise<CoordenadasGeocoded | null> {
    try {
      const response = await axios.get(`${RADAR_BASE_URL}/geocode/forward`, {
        headers: this.headers(),
        params: { query: direccionTexto, country: 'CO' },
        timeout: 10000,
      });
      const addresses = response.data?.addresses;
      if (!addresses || addresses.length === 0) return null;

      const mejor = addresses[0];
      return {
        lat: mejor.latitude,
        lng: mejor.longitude,
        direccionFormateada: mejor.formattedAddress || direccionTexto,
      };
    } catch (error: any) {
      console.error('Error geocodificando con Radar:', error.response?.data || error.message);
      return null;
    }
  }

  async calcularDistanciaKm(origen: { lat: number; lng: number }, destino: { lat: number; lng: number }): Promise<number> {
    try {
      const response = await axios.get(`${RADAR_BASE_URL}/route/distance`, {
        headers: this.headers(),
        params: {
          origin: `${origen.lat},${origen.lng}`,
          destination: `${destino.lat},${destino.lng}`,
          modes: 'car',
          units: 'metric',
        },
        timeout: 10000,
      });
      const distanciaMetros = response.data?.routes?.car?.distance?.value;
      if (typeof distanciaMetros !== 'number') throw new Error('Respuesta de Radar sin distancia válida');
      return distanciaMetros / 1000;
    } catch (error: any) {
      console.error('Error calculando distancia con Radar:', error.response?.data || error.message);
      throw new Error('No se pudo calcular la distancia de la ruta');
    }
  }
}

export const radarService = new RadarService();
