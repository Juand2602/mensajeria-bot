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
      // La plantilla no tiene un parámetro para esta nota (viene del encargo de
      // un mandado, o de la aclaración opcional de dirección/apto) — se manda
      // como texto libre aparte, dentro de la ventana de 24h que la propia
      // plantilla abre.
      if (carrera.notas) {
        await mensajeriaService.enviarMensaje(telefonoAdmin, `📝 Nota: ${carrera.notas}`);
      }
      if (carrera.contactoEntrega) {
        await mensajeriaService.enviarMensaje(telefonoAdmin, `👤 Recibe: ${carrera.contactoEntrega}`);
      }
    } catch (e) { console.error('Error notificando nueva solicitud al dueño:', e); }
  }

  async notificarAsignacion(carreraId: string) {
    const carrera = await carrerasService.getById(carreraId);
    if (!carrera.conductor) return;

    try {
      // Domicilio usa una plantilla aparte con el recordatorio de fotos de
      // recogida/entrega ya fijo en el cuerpo — mototaxi sigue con la original.
      const esDomicilio = carrera.tipoServicio === 'DOMICILIO';
      const plantilla = esDomicilio ? 'nueva_carrera_mensajero_domicilio' : 'nueva_carrera_mensajero';
      // nueva_carrera_mensajero_domicilio no lleva parámetro de tipo de
      // servicio (ya lo dice el cuerpo fijo: "nuevo domicilio de Serveloz").
      const params = esDomicilio
        ? [
            carrera.conductor.nombre,
            carrera.cliente.nombre,
            carrera.cliente.telefono,
            carrera.direccionRecogida,
            carrera.direccionDestino,
            `$${carrera.precio.toLocaleString('es-CO')}`,
            carrera.radicado,
          ]
        : [
            carrera.conductor.nombre,
            carrera.cliente.nombre,
            carrera.cliente.telefono,
            nombreTipoServicio(carrera.tipoServicio),
            carrera.direccionRecogida,
            carrera.direccionDestino,
            `$${carrera.precio.toLocaleString('es-CO')}`,
            carrera.radicado,
          ];
      await whatsappMessagesService.enviarPlantilla(carrera.conductor.telefono, plantilla, 'es', params);
      if (carrera.notas) {
        await mensajeriaService.enviarMensaje(carrera.conductor.telefono, `📝 Nota: ${carrera.notas}`);
      }
      if (carrera.contactoEntrega) {
        await mensajeriaService.enviarMensaje(carrera.conductor.telefono, `👤 Recibe: ${carrera.contactoEntrega}`);
      }
    } catch (e) { console.error('Error notificando al conductor:', e); }

    try {
      const c = carrera.conductor;
      if (c.fotoUrl && c.tipoVehiculo && c.marca && c.linea && c.modelo && c.placa) {
        const caption = `🛵 Tu conductor es *${c.nombre}*\nTelefono: ${c.telefono}\n${c.tipoVehiculo}: ${c.marca} ${c.linea} ${c.modelo}\nPlaca: ${c.placa}\n¡Ya va en camino!`;
        await mensajeriaService.enviarImagen(carrera.cliente.telefono, c.fotoUrl, caption);
      } else {
        await mensajeriaService.enviarMensaje(
          carrera.cliente.telefono,
          `🛵 Tu conductor es *${c.nombre}* (${c.telefono}). ¡Ya va en camino!`
        );
      }
    } catch (e) { console.error('Error notificando asignación al cliente:', e); }
  }

  async notificarCancelacion(carreraId: string, estadoPrevio: string, motivo?: string | null) {
    const carrera = await carrerasService.getById(carreraId);
    const telefonoAdmin = process.env.ADMINISTRADOR_TELEFONO;
    if (!telefonoAdmin) return;

    try {
      await whatsappMessagesService.enviarPlantilla(telefonoAdmin, 'carrera_cancelada_admin', 'es', [
        carrera.cliente.nombre,
        carrera.cliente.telefono,
        carrera.radicado,
        estadoPrevio,
        carrera.conductor?.nombre || 'Sin asignar',
        motivo || 'No especificado',
      ]);
    } catch (e) { console.error('Error notificando cancelación al dueño:', e); }
  }

  // A diferencia de notificarCancelacion (carrera ya cancelada), este aviso es
  // para cuando el cliente INTENTÓ cancelar una carrera ya asignada y el bot se
  // lo bloqueó (la conversación queda en modo manual, ver bot.service.ts).
  async notificarIntentoCancelacionAsignada(carreraId: string) {
    const carrera = await carrerasService.getById(carreraId);
    const telefonoAdmin = process.env.ADMINISTRADOR_TELEFONO;
    if (!telefonoAdmin) return;
    try {
      await whatsappMessagesService.enviarPlantilla(telefonoAdmin, 'intento_cancelacion_asignada_admin', 'es', [
        carrera.cliente.nombre,
        carrera.cliente.telefono,
        carrera.radicado,
        carrera.conductor?.nombre || 'Sin asignar',
      ]);
    } catch (e) { console.error('Error notificando intento de cancelación de carrera asignada:', e); }
  }

  async notificarRecordatorioEjecucionConductor(carreraId: string) {
    const carrera = await carrerasService.getById(carreraId);
    if (!carrera.conductor || !carrera.fechaHoraProgramada) return;

    try {
      await whatsappMessagesService.enviarPlantilla(carrera.conductor.telefono, 'recordatorio_servicio_conductor', 'es', [
        carrera.conductor.nombre,
        carrera.fechaHoraProgramada.toLocaleString('es-CO'),
        carrera.cliente.nombre,
        carrera.cliente.telefono,
        nombreTipoServicio(carrera.tipoServicio),
        carrera.direccionRecogida,
        carrera.direccionDestino,
        `$${carrera.precio.toLocaleString('es-CO')}`,
        carrera.radicado,
      ]);
    } catch (e) { console.error('Error notificando recordatorio de ejecución al conductor:', e); }
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

  async notificarSolicitudAyudaHumana(telefonoCliente: string, nombreCliente: string) {
    const telefonoAdmin = process.env.ADMINISTRADOR_TELEFONO;
    if (!telefonoAdmin) return;
    try {
      await whatsappMessagesService.enviarPlantilla(telefonoAdmin, 'solicitud_ayuda_humana_admin', 'es', [
        nombreCliente,
        telefonoCliente,
      ]);
    } catch (e) { console.error('Error notificando solicitud de ayuda humana:', e); }
  }

  async notificarRecordatorioProgramadaAdmin(carreraId: string) {
    const carrera = await carrerasService.getById(carreraId);
    const telefonoAdmin = process.env.ADMINISTRADOR_TELEFONO;
    if (!telefonoAdmin || !carrera.fechaHoraProgramada) return;

    try {
      await whatsappMessagesService.enviarPlantilla(telefonoAdmin, 'recordatorio_carrera_programada_admin', 'es', [
        carrera.radicado,
        carrera.fechaHoraProgramada.toLocaleString('es-CO'),
        carrera.cliente.nombre,
        carrera.cliente.telefono,
        nombreTipoServicio(carrera.tipoServicio),
        carrera.direccionRecogida,
        carrera.direccionDestino,
        carrera.distanciaKm.toFixed(1),
        `$${carrera.precio.toLocaleString('es-CO')}`,
      ]);
    } catch (e) { console.error('Error notificando recordatorio de carrera programada al dueño:', e); }
  }

  // Dos avisos independientes, cada uno con su propio flag para no reenviar:
  // uno al dueño si la carrera sigue sin conductor asignado (recuérdame
  // asignarla), y otro al conductor si ya fue asignado (recuérdale que tiene
  // un servicio pendiente, por si lo asignaste con mucha anticipación).
  async avisarCarrerasProgramadas() {
    const limiteAsignacion = new Date(Date.now() + botConfig.avisoProgramadaMinutosAntes * 60000);
    const pendientes = await carrerasService.getProgramadasPendientesDeAviso(limiteAsignacion);
    for (const carrera of pendientes) {
      await this.notificarRecordatorioProgramadaAdmin(carrera.id);
      await carrerasService.marcarAvisoProgramadaEnviado(carrera.id);
    }

    const limiteEjecucion = new Date(Date.now() + botConfig.avisoEjecucionMinutosAntes * 60000);
    const asignadas = await carrerasService.getAsignadasProximasAEjecutar(limiteEjecucion);
    for (const carrera of asignadas) {
      await this.notificarRecordatorioEjecucionConductor(carrera.id);
      await carrerasService.marcarAvisoEjecucionEnviado(carrera.id);
    }
  }
}

export const notificacionesService = new NotificacionesService();
