import axios from 'axios';
import { mapboxConfig } from '../config/whatsapp';
import { AREA_METROPOLITANA_BBOX } from './municipios';

const MAPBOX_BASE_URL = 'https://api.mapbox.com';

export interface CoordenadasGeocoded {
  lat: number;
  lng: number;
  direccionFormateada: string;
}

export class MapboxService {
  // La Geocoding API "clásica" (v5/v6) de Mapbox dejó de indexar POIs (centros
  // comerciales, negocios, parques con nombre propio) — solo resuelve bien
  // direcciones estructuradas (carrera/calle). La Search Box API sí conserva
  // datos de POI y es la reemplazante recomendada por Mapbox; su endpoint
  // `/forward` funciona como una consulta suelta (sin session token, facturado
  // por request) igual que un geocode clásico, así que cubre ambos casos.
  async geocodificar(direccionTexto: string): Promise<CoordenadasGeocoded | null> {
    try {
      const response = await axios.get(`${MAPBOX_BASE_URL}/search/searchbox/v1/forward`, {
        params: {
          q: direccionTexto,
          access_token: mapboxConfig.accessToken,
          country: 'co',
          bbox: AREA_METROPOLITANA_BBOX,
          language: 'es',
          limit: 1,
        },
        timeout: 10000,
      });
      const mejor = response.data?.features?.[0];
      if (!mejor) return null;

      const [lng, lat] = mejor.geometry.coordinates;
      const propiedades = mejor.properties;
      return {
        lat,
        lng,
        direccionFormateada: propiedades.full_address || propiedades.place_formatted || propiedades.name || direccionTexto,
      };
    } catch (error: any) {
      console.error('Error geocodificando con Mapbox:', error.response?.data || error.message);
      return null;
    }
  }

  // Usado cuando el cliente comparte su ubicación GPS actual (no un lugar buscado
  // en WhatsApp, que ya trae su propio nombre/dirección) — convierte lat/lng en
  // una dirección legible para mostrar al dueño/conductor en vez de coordenadas.
  async reverseGeocodificar(lat: number, lng: number): Promise<string | null> {
    try {
      const response = await axios.get(`${MAPBOX_BASE_URL}/search/searchbox/v1/reverse`, {
        params: { longitude: lng, latitude: lat, access_token: mapboxConfig.accessToken, language: 'es' },
        timeout: 10000,
      });
      const mejor = response.data?.features?.[0];
      if (!mejor) return null;
      return mejor.properties?.full_address || mejor.properties?.place_formatted || null;
    } catch (error: any) {
      console.error('Error en reverse geocoding con Mapbox:', error.response?.data || error.message);
      return null;
    }
  }

  async calcularDistanciaKm(origen: { lat: number; lng: number }, destino: { lat: number; lng: number }): Promise<number> {
    try {
      const coords = `${origen.lng},${origen.lat};${destino.lng},${destino.lat}`;
      const response = await axios.get(`${MAPBOX_BASE_URL}/directions/v5/mapbox/driving/${coords}`, {
        params: { access_token: mapboxConfig.accessToken, overview: 'false' },
        timeout: 10000,
      });
      const distanciaMetros = response.data?.routes?.[0]?.distance;
      if (typeof distanciaMetros !== 'number') throw new Error('Respuesta de Mapbox sin distancia válida');
      return distanciaMetros / 1000;
    } catch (error: any) {
      console.error('Error calculando distancia con Mapbox:', error.response?.data || error.message);
      throw new Error('No se pudo calcular la distancia de la ruta');
    }
  }
}

export const mapboxService = new MapboxService();
