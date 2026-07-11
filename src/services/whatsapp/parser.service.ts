export class MessageParserService {
  normalizarRespuesta(texto: string): string {
    return texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  esAfirmativo(texto: string): boolean {
    const n = this.normalizarRespuesta(texto);
    return ['si', 'sí', 'yes', 'ok', '1', 'cierto', 'claro', 'de acuerdo', 'sip', 'sep'].some(a => n.includes(a));
  }

  esNegativo(texto: string): boolean {
    const n = this.normalizarRespuesta(texto);
    return ['no', '2', 'nop', 'nope', 'negativo', 'nó'].some(neg => n.includes(neg));
  }

  esComandoCancelacion(texto: string): boolean {
    const n = this.normalizarRespuesta(texto);
    return ['cancelar', 'salir', 'exit', 'atras', 'volver'].includes(n);
  }

  parsearOpcionNumerica(texto: string, max: number): number | null {
    const textoLimpio = texto.replace(/[^\d\s]/g, '').trim();
    const numero = parseInt(textoLimpio);
    if (isNaN(numero) || numero < 1 || numero > max) return null;
    return numero;
  }

  extraerRadicado(texto: string): string | null {
    const t = texto.trim().toUpperCase().replace(/\s+/g, '');
    const m1 = t.match(/SRV[-\s]?([A-Z0-9]{6})/i);
    if (m1) return `SRV-${m1[1]}`;
    const m2 = t.match(/^([A-Z0-9]{6})$/);
    if (m2) return `SRV-${m2[1]}`;
    return null;
  }

  private parsearDiaBase(textoLower: string): Date | null {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    if (textoLower.includes('hoy')) return hoy;
    if (textoLower.includes('mañana') || textoLower.includes('manana')) {
      const d = new Date(hoy);
      d.setDate(d.getDate() + 1);
      return d;
    }

    const diasSemana: Record<string, number> = {
      lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 0,
    };
    for (const [dia, numero] of Object.entries(diasSemana)) {
      if (textoLower.includes(dia)) {
        const fecha = new Date(hoy);
        const diaActual = fecha.getDay();
        let diff = numero - diaActual;
        if (diff <= 0) diff += 7;
        fecha.setDate(fecha.getDate() + diff);
        return fecha;
      }
    }

    const fechaRegex = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/;
    const match = textoLower.match(fechaRegex);
    if (match) {
      const [, dia, mes, anio] = match;
      const anioCompleto = anio ? (anio.length === 2 ? 2000 + parseInt(anio) : parseInt(anio)) : hoy.getFullYear();
      const fecha = new Date(anioCompleto, parseInt(mes) - 1, parseInt(dia));
      if (!isNaN(fecha.getTime())) return fecha;
    }

    return null;
  }

  private parsearHora(textoLower: string): { horas: number; minutos: number } | null {
    // Requiere am/pm o un separador ":" junto al número — evita que un número
    // suelto de una fecha como "25/12" se confunda con una hora.
    let match = textoLower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
    let periodo: string | undefined;
    if (match) {
      periodo = match[3];
    } else {
      match = textoLower.match(/(\d{1,2}):(\d{2})/);
    }
    if (!match) return null;

    let horas = parseInt(match[1]);
    const minutos = match[2] ? parseInt(match[2]) : 0;
    if (periodo === 'pm' && horas < 12) horas += 12;
    if (periodo === 'am' && horas === 12) horas = 0;
    if (horas > 23 || minutos > 59) return null;
    return { horas, minutos };
  }

  parsearFechaProgramada(texto: string): Date | null {
    const textoLower = this.normalizarRespuesta(texto);
    const dia = this.parsearDiaBase(textoLower);
    if (!dia) return null;
    const hora = this.parsearHora(textoLower);
    if (!hora) return null;
    const fecha = new Date(dia);
    fecha.setHours(hora.horas, hora.minutos, 0, 0);
    return fecha;
  }
}

export const messageParser = new MessageParserService();
