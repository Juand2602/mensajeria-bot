function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta configurar la variable de entorno ${name}`);
  }
  return value;
}

export const whatsappConfig = {
  apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0',
  token: process.env.WHATSAPP_TOKEN || '',
  phoneId: process.env.WHATSAPP_PHONE_ID || '',
  verifyToken: requireEnv('WHATSAPP_VERIFY_TOKEN'),
};

export const servelozConfig = {
  nombre: process.env.SERVELOZ_NOMBRE || 'Serveloz',
  tarifaMinima: parseFloat(process.env.TARIFA_MINIMA || '3300'),
};

export const pagoConfig = {
  // Número de Nequi/Llave a mostrar en el chat, opcional — si no se configura,
  // el bot solo lista los métodos aceptados sin un número específico.
  numeroNequiLlave: process.env.PAGO_NEQUI_LLAVE_NUMERO || '',
};

export const mapboxConfig = {
  accessToken: requireEnv('MAPBOX_ACCESS_TOKEN'),
};

export const botConfig = {
  timeoutConversacion: parseInt(process.env.TIMEOUT_CONVERSACION || '300000'),
  avisoProgramadaMinutosAntes: parseInt(process.env.AVISO_PROGRAMADA_MINUTOS_ANTES || '30'),
  // También sirve como margen mínimo: si al asignar el conductor ya faltan
  // menos de estos minutos para la hora programada, no se agenda el
  // recordatorio de ejecución — la propia notificación de asignación ya
  // cumple ese rol. Tienen que ser el mismo valor: si el margen fuera menor al
  // umbral del recordatorio, cualquier asignación dentro de esa ventana igual
  // dispararía el recordatorio casi de inmediato después de la asignación.
  avisoEjecucionMinutosAntes: parseInt(process.env.AVISO_EJECUCION_MINUTOS_ANTES || '30'),
  // Timeout independiente (más largo) para conversaciones en modoManual — un
  // cliente esperando respuesta de un asesor no debería perderse a los 5 min
  // del timeoutConversacion normal. Al vencer, el bot se reanuda solo (cubre
  // tanto al asesor que nunca respondió como al admin que olvidó pulsar
  // "Reanudar bot").
  timeoutModoManualMinutos: parseInt(process.env.TIMEOUT_MODO_MANUAL_MINUTOS || '30'),
  // Minutos antes de cada timeout en los que se manda un único aviso de
  // inactividad al cliente (en vez de dejar que la conversación expire en
  // silencio). Distintos porque timeoutConversacion son minutos y
  // timeoutModoManualMinutos ya está en minutos.
  avisoInactividadAntesMinutos: parseInt(process.env.AVISO_INACTIVIDAD_ANTES_MINUTOS || '2'),
  avisoInactividadModoManualAntesMinutos: parseInt(process.env.AVISO_INACTIVIDAD_MODO_MANUAL_ANTES_MINUTOS || '5'),
};

export const cloudinaryConfig = {
  // Opcional — si no está configurado, media.service.ts falla de forma clara
  // y ya capturada en lugar de tumbar el arranque de todo el bot.
  cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
  apiKey: process.env.CLOUDINARY_API_KEY || '',
  apiSecret: process.env.CLOUDINARY_API_SECRET || '',
};
