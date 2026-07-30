import { pagoConfig } from '../../config/whatsapp';

export function generarRadicado(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo = '';
  for (let i = 0; i < 6; i++) codigo += chars[Math.floor(Math.random() * chars.length)];
  return `SRV-${codigo}`;
}

export function formatearFecha(fecha: Date): string {
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${dias[fecha.getDay()]} ${fecha.getDate()} de ${meses[fecha.getMonth()]}`;
}

export function formatearHora(fechaOHora: Date | string): string {
  let h: number, m: number;
  if (typeof fechaOHora === 'string') {
    [h, m] = fechaOHora.split(':').map(Number);
  } else {
    h = fechaOHora.getHours();
    m = fechaOHora.getMinutes();
  }
  const periodo = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${periodo}`;
}

export function validarNombreCompleto(texto: string): boolean {
  const partes = texto.trim().split(/\s+/).filter(p => p.length >= 2);
  return partes.length >= 2 && texto.trim().length <= 60;
}

export const MENSAJES = {
  BIENVENIDA: () => '🛵 *¡Hola! Soy el asistente de Serveloz.*\n\n¿Qué necesitas hoy?',
  SOLICITAR_NOMBRE: () => '🛵 Antes de continuar, ¿cuál es tu *nombre completo*?',
  NOMBRE_INVALIDO: () => '🛵 Por favor escribe tu nombre completo (nombre y apellido).',
  MENU_PRINCIPAL: () => '¿Qué necesitas hoy?',
  INFO_REFERIDOS: () =>
    '🎁 *Programa de referidos*\n\nInvita a un amigo a pedir con Serveloz. Cuando haga su primer pedido y escriba tu nombre o tu número aquí, tú ganas un *20% de descuento* en tu próxima carrera.\n\n¿Alguien te recomendó *a ti*? Escribe su nombre o número. Si no, escribe *"no"*.',
  INFO_REFERIDOS_YA_REGISTRADO: () => 'Ya tienes registrado quién te recomendó Serveloz — ¡gracias! 🎉',
  SOLICITAR_TIPO_SERVICIO: () => '¿Qué servicio necesitas?',
  SOLICITAR_RECOGIDA: () =>
    '📍 Escribe la *dirección de recogida* (ej: "Calle 57 #27-30" o "Megamall") o comparte tu ubicación 📎 — ambas opciones funcionan igual de bien.',
  CONFIRMAR_DIRECCION: (direccion: string) => `Encontramos esta dirección:\n\n📍 *${direccion}*\n\n¿Es correcta?`,
  DIRECCION_NO_ENCONTRADA: () => '🛵 No pude encontrar esa dirección. Intenta escribirla de nuevo (ej: "Cra 27 #45-12") o comparte tu ubicación 📍.',
  SOLICITAR_DESTINO: () =>
    '📍 Ahora escribe la *dirección de destino* (ej: "Carrera 33 #45-10" o "Centro Comercial Cacique") o comparte tu ubicación 📎.',
  SUGERIR_UBICACION_EXACTA: (campo: 'recogida' | 'destino') =>
    `📍 Seguimos sin encontrar bien la dirección de ${campo}. Para más precisión, comparte tu ubicación (📎 → Ubicación).\n\nSi no estás en ese lugar exacto, usa la opción *"Buscar un lugar"* dentro de Ubicación para buscarlo y enviarlo, en vez de tu posición actual.`,
  SOLICITAR_MOMENTO: () => '¿Para cuándo necesitas el servicio?',
  SOLICITAR_FECHA_HORA_PROGRAMADA: () => '📅 Escribe la fecha y hora (ej: *"mañana 3:00pm"* o *"25/12 10:00am"*).',
  FECHA_PROGRAMADA_INVALIDA: () => 'No entendí la fecha/hora. Intenta de nuevo, por ejemplo: *"mañana 3:00pm"*.',
  PRECIO_CALCULADO: (info: { distanciaKm: number; precio: number; conDescuento: boolean }) =>
    `💰 *Resumen de tu carrera*\n\n📏 Distancia: ${info.distanciaKm.toFixed(1)} km\n💵 Precio: $${info.precio.toLocaleString('es-CO')}${info.conDescuento ? ' (con tu 20% de descuento por referido aplicado)' : ''}\n\n¿Confirmas el pedido?`,
  CARRERA_CONFIRMADA: (info: { radicado: string }) =>
    `✅ *¡Pedido confirmado!*\n\n📋 Radicado: ${info.radicado}\n\nEstamos buscando el conductor disponible. Te avisamos en cuanto se asigne.\n\n${MENSAJES.METODOS_PAGO()}`,
  METODOS_PAGO: () =>
  `💳 *¡Puedes pagar de la forma que prefieras!*

  💵 Efectivo
  🏦 Nequi
  🔑 Bre-B/Llave${
    pagoConfig.numeroNequiLlave
      ? `

💰 *Nequi / Bre-b / Llave*
━━━━━━━━━━━━━━━━
*${pagoConfig.numeroNequiLlave}*`
      : ""
  }

🛵 *Gracias por preferirnos.*`,
  SOLICITAR_EVIDENCIA_CLIENTE: () =>
    '📷 Si quieres, envía ahora una *foto del objeto* como evidencia (opcional). Si no, toca el botón para continuar.',
  EVIDENCIA_CLIENTE_GUARDADA: () => '📷 Foto guardada como evidencia. ¡Gracias!',
  EVIDENCIA_ERROR: () => 'No pudimos procesar la foto. Puedes intentar de nuevo, o continuar sin ella.',
  CARRERA_ASIGNADA: (info: { conductor: string; telefono: string }) =>
    `🛵 *¡Tu conductor está en camino!*\n\n👤 ${info.conductor}\n📱 ${info.telefono}\n\nPuedes contactarlo directamente si lo necesitas.`,
  CARRERA_CERRADA: () => '✅ *Carrera completada.* ¡Gracias por confiar en Serveloz! Escríbenos cuando necesites otro servicio.',
  DESCUENTO_GANADO: () => '🎉 Ganaste un 20% de descuento por referir a un nuevo cliente. Se aplicará automáticamente en tu próximo pedido.',
  SIN_CARRERAS_ACTIVAS: () => 'Aún no tienes servicios activos para cancelar.',
  CONFIRMAR_CANCELACION: (info: { radicado: string; destino: string }) =>
    `¿Deseas cancelar esta carrera?\n\n📋 ${info.radicado} — destino: ${info.destino}`,
  CARRERA_CANCELADA: () => '❌ Tu carrera fue cancelada.',
  CANCELACION_NO_PERMITIDA_ASIGNADA: (info: { radicado: string }) =>
    `🛵 La carrera ${info.radicado} ya tiene un conductor asignado y puede estar en camino, así que no podemos cancelarla por aquí.\n\nEscríbenos y te atenderá una persona para gestionar la cancelación.`,
  RADICADO_NO_ENCONTRADO: () => 'No encontramos una carrera activa con ese radicado.',
  OPCION_INVALIDA: () => 'No entendí tu respuesta. Por favor intenta de nuevo.',
  ERROR_SERVIDOR: () => '🛵 Tuvimos un problema procesando tu solicitud. Por favor intenta de nuevo en un momento.',
  SOLICITUD_AYUDA_HUMANA: () => '🙋 Listo, ya avisamos al equipo de Serveloz para que te atienda personalmente. En un momento te escriben por aquí mismo.',
  CONFIRMAR_AYUDA_HUMANA: () => '🙋 ¿Seguro que necesitas hablar con un asesor?',
  MODO_MANUAL_ACTIVO: () => '🙋 Seguimos gestionando tu solicitud con un asesor. En breve te contactamos por aquí mismo.',
  AVISO_INACTIVIDAD: () => '¿Sigues ahí? Si tu pedido es especial o tienes algún inconveniente, usa el botón de abajo para hablar con un asesor.',
  AVISO_MODO_MANUAL_INACTIVO: () => 'Nuestro equipo aún no te ha respondido. Si necesitas solicitar un nuevo servicio mientras tanto, escribe *cancelar* para volver al menú.',
  BOT_REANUDADO: () => 'Hemos reanudado el bot para que puedas continuar con un nuevo pedido. 🛵',
  SOLICITAR_ENCARGO_MANDADO: () => '🧾 Cuéntanos qué necesitas que compremos o hagamos (ej: "Comprar una caja de ganchos en cualquier papelería o Recoger un paquete").',
  SOLICITAR_ZONA_MANDADO: () =>
    '📍 Ahora dinos en qué dirección, barrio o punto de referencia prefieres que hagamos la compra/mandado (ej: "Papeleria centro" o "Calle 48 # 33-11") o comparte tu ubicación 📎.',
  DESPEDIDA: () => '¡Gracias por escribir a Serveloz! Cuando necesites un domicilio o mototaxi, aquí estamos. 🛵',
};
