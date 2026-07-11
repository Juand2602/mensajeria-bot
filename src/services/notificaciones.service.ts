import { whatsappMessagesService } from './whatsapp/messages.service';
import { mensajeriaService } from './mensajeria.service';
import { carrerasService } from './carreras.service';
import { MENSAJES } from './whatsapp/templates';
import { botConfig } from '../config/whatsapp';

export class NotificacionesService {
  async notificarNuevaSolicitud(carreraId: string) {
    const carrera = await carrerasService.getById(carreraId);
    const telefonoAdmin = process.env.ADMINISTRADOR_TELEFONO;
    if (!telefonoAdmin) return;

    const mensaje = `🆕 *NUEVA SOLICITUD*

📋 Radicado: ${carrera.radicado}
👤 Cliente: ${carrera.cliente.nombre} (${carrera.cliente.telefono})
🚦 Servicio: ${carrera.tipoServicio}
📍 Recogida: ${carrera.direccionRecogida}
🏁 Destino: ${carrera.direccionDestino}
📏 Distancia: ${carrera.distanciaKm.toFixed(1)} km
💰 Precio: $${carrera.precio.toLocaleString('es-CO')}
${carrera.fechaHoraProgramada ? `📅 Programada: ${carrera.fechaHoraProgramada.toLocaleString('es-CO')}` : '🕐 Para ahora mismo'}

Ingresa al panel para asignar conductor.`;

    try {
      await whatsappMessagesService.enviarMensaje(telefonoAdmin, mensaje);
    } catch (e) { console.error('Error notificando nueva solicitud al dueño:', e); }
  }

  async notificarAsignacion(carreraId: string) {
    const carrera = await carrerasService.getById(carreraId);
    if (!carrera.conductor) return;

    try {
      await whatsappMessagesService.enviarPlantilla(carrera.conductor.telefono, 'nueva_carrera_conductor', 'es', [
        carrera.conductor.nombre,
        carrera.cliente.nombre,
        carrera.direccionRecogida,
        carrera.direccionDestino,
        `$${carrera.precio.toLocaleString('es-CO')}`,
        carrera.radicado,
      ]);
    } catch (e) { console.error('Error notificando al conductor:', e); }

    try {
      await mensajeriaService.enviarMensaje(
        carrera.cliente.telefono,
        `🛵 Tu conductor es *${carrera.conductor.nombre}* (${carrera.conductor.telefono}). ¡Ya va en camino!`
      );
    } catch (e) { console.error('Error notificando asignación al cliente:', e); }
  }

  async notificarCierre(carreraId: string, referidorTelefono?: string | null) {
    const carrera = await carrerasService.getById(carreraId);
    try {
      await mensajeriaService.enviarMensaje(carrera.cliente.telefono, MENSAJES.CARRERA_CERRADA());
    } catch (e) { console.error('Error notificando cierre:', e); }

    if (referidorTelefono) {
      try {
        await mensajeriaService.enviarMensaje(referidorTelefono, MENSAJES.DESCUENTO_GANADO());
      } catch (e) { console.error('Error notificando descuento de referido:', e); }
    }
  }

  async avisarCarrerasProgramadas() {
    const limite = new Date(Date.now() + botConfig.avisoProgramadaMinutosAntes * 60000);
    const pendientes = await carrerasService.getProgramadasPendientesDeAviso(limite);
    for (const carrera of pendientes) {
      await this.notificarNuevaSolicitud(carrera.id);
      await carrerasService.marcarAvisoProgramadaEnviado(carrera.id);
    }
  }
}

export const notificacionesService = new NotificacionesService();
