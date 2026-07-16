export const MUNICIPIOS = ['BUCARAMANGA', 'FLORIDABLANCA', 'GIRON', 'PIEDECUESTA'] as const;
export type Municipio = (typeof MUNICIPIOS)[number];

// Puntos centrales aproximados (parque/centro urbano) de cada municipio del área
// metropolitana de Bucaramanga. Solo se usan para decidir "a cuál de los 4 pertenece
// esta carrera", no para calcular distancia de ruta real.
const CENTROS: Record<Municipio, { lat: number; lng: number }> = {
  BUCARAMANGA: { lat: 7.125, lng: -73.119 },
  FLORIDABLANCA: { lat: 7.0767, lng: -73.0978 },
  GIRON: { lat: 7.0682, lng: -73.1698 },
  PIEDECUESTA: { lat: 6.9886, lng: -73.0503 },
};

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const radianes = (grados: number) => (grados * Math.PI) / 180;
  const dLat = radianes(b.lat - a.lat);
  const dLng = radianes(b.lng - a.lng);
  const lat1 = radianes(a.lat);
  const lat2 = radianes(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function municipioMasCercano(lat: number, lng: number): Municipio {
  let mejor: Municipio = MUNICIPIOS[0];
  let menorDistancia = Infinity;
  for (const municipio of MUNICIPIOS) {
    const distancia = haversineKm({ lat, lng }, CENTROS[municipio]);
    if (distancia < menorDistancia) {
      menorDistancia = distancia;
      mejor = municipio;
    }
  }
  return mejor;
}
