import { whatsappMessagesService } from './whatsapp/messages.service';
import { mensajeriaService } from './mensajeria.service';
import { carrerasService } from './carreras.service';
import { MENSAJES } from './whatsapp/templates';
import { botConfig } from '../config/whatsapp';

function nombreTipoServicio(tipoServicio: string): string {
  return tipoServicio === 'DOMICILIO' ? 'Domicilio' : 'Mototaxi';
}

export class NotificacionesService {
  async notificarNuevaSolicitud(carreraId: string) {
    const carrera = await carrerasService.getById(carreraId);
    const telefonoAdmin = process.env.ADMINISTRADOR_TELEFONO;
    if (!telefonoAdmin) return;

    try {
      await whatsappMessagesService.enviarPlantilla(telefonoAdmin, 'nueva_solicitud_admin', 'es', [
        carrera.radicado,
        carrera.cliente.nombre,
        carrera.cliente.telefono,
        nombreTipoServicio(carrera.tipoServicio),
        carrera.direccionRecogida,
        carrera.direccionDestino,
        carrera.distanciaKm.toFixed(1),
        `$${carrera.precio.toLocaleString('es-CO')}`,
        carrera.fechaHoraProgramada ? carrera.fechaHoraProgramada.toLocaleString('es-CO') : 'Para ahora mismo',
      ]);
    } catch (e) { console.error('Error notificando nueva solicitud al dueño:', e); }
  }

  async notificarAsignacion(carreraId: string) {
    const carrera = await carrerasService.getById(carreraId);
    if (!carrera.conductor) return;

    try {
      await whatsappMessagesService.enviarPlantilla(carrera.conductor.telefono, 'nueva_carrera_mensajero', 'es', [
        carrera.conductor.nombre,
        carrera.cliente.nombre,
        carrera.cliente.telefono,
        nombreTipoServicio(carrera.tipoServicio),
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

  // Sin plantilla aprobada por Meta para este caso todavía — usa texto libre, así
  // que solo llega si el dueño le ha escrito al bot en las últimas 24h. Si ese
  // deja de cumplirse en la práctica, conviene pedir una plantilla como la de
  // nueva_solicitud_admin para este aviso también.
  async notificarSolicitudAyudaHumana(telefonoCliente: string, nombreCliente: string) {
    const telefonoAdmin = process.env.ADMINISTRADOR_TELEFONO;
    if (!telefonoAdmin) return;
    try {
      await whatsappMessagesService.enviarMensaje(
        telefonoAdmin,
        `🙋 *${nombreCliente}* (${telefonoCliente}) pidió hablar con una persona. La conversación ya quedó en modo manual — respóndele desde el panel (Conversaciones).`
      );
    } catch (e) { console.error('Error notificando solicitud de ayuda humana:', e); }
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
