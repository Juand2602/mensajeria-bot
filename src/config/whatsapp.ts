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

export const botConfig = {
  timeoutConversacion: parseInt(process.env.TIMEOUT_CONVERSACION || '300000'),
  avisoProgramadaMinutosAntes: parseInt(process.env.AVISO_PROGRAMADA_MINUTOS_ANTES || '30'),
};
