import axios from 'axios';

// Nominatim/OSRM en vez de Radar: Radar pasó a ser 100% sales-gated (signup redirige a
// agendar demo, exige correo corporativo). Estos son servidores públicos gratuitos de
// OpenStreetMap sin API key, pensados solo para pruebas: Nominatim limita a 1 req/seg
// y exige un User-Agent identificable; el servidor demo de OSRM no tiene SLA. Para
// producción hay que volver a un proveedor con key propia (Radar, Mapbox, Google).
const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const OSRM_BASE_URL = 'https://router.project-osrm.org';
const USER_AGENT = 'Serveloz-Bot/1.0 (pruebas; contacto)';

export interface CoordenadasGeocoded {
  lat: number;
  lng: number;
  direccionFormateada: string;
}

export class RadarService {
  async geocodificar(direccionTexto: string): Promise<CoordenadasGeocoded | null> {
    try {
      const response = await axios.get(`${NOMINATIM_BASE_URL}/search`, {
        headers: { 'User-Agent': USER_AGENT },
        params: { q: direccionTexto, countrycodes: 'co', format: 'json', limit: 1 },
        timeout: 10000,
      });
      const resultados = response.data;
      if (!resultados || resultados.length === 0) return null;

      const mejor = resultados[0];
      return {
        lat: parseFloat(mejor.lat),
        lng: parseFloat(mejor.lon),
        direccionFormateada: mejor.display_name || direccionTexto,
      };
    } catch (error: any) {
      console.error('Error geocodificando con Nominatim:', error.response?.data || error.message);
      return null;
    }
  }

  async calcularDistanciaKm(origen: { lat: number; lng: number }, destino: { lat: number; lng: number }): Promise<number> {
    try {
      const coords = `${origen.lng},${origen.lat};${destino.lng},${destino.lat}`;
      const response = await axios.get(`${OSRM_BASE_URL}/route/v1/driving/${coords}`, {
        headers: { 'User-Agent': USER_AGENT },
        params: { overview: 'false' },
        timeout: 10000,
      });
      const distanciaMetros = response.data?.routes?.[0]?.distance;
      if (typeof distanciaMetros !== 'number') throw new Error('Respuesta de OSRM sin distancia válida');
      return distanciaMetros / 1000;
    } catch (error: any) {
      console.error('Error calculando distancia con OSRM:', error.response?.data || error.message);
      throw new Error('No se pudo calcular la distancia de la ruta');
    }
  }
}

export const radarService = new RadarService();
