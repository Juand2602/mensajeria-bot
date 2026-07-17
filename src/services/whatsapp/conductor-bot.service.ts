import prisma from '../../config/database';
import { mediaService } from '../media.service';
import { evidenciaService } from '../evidencia.service';
import { whatsappMessagesService } from './messages.service';

export class ConductorBotService {
  // Usa whatsappMessagesService directo (no mensajeriaService): el registro de
  // saliente de mensajeriaService busca un Cliente por teléfono para asociar el
  // mensaje — un conductor no es un Cliente, así que no aplica ese historial.
  async procesarFoto(conductor: { id: string; telefono: string }, mediaId: string) {
    const activas = await prisma.carrera.findMany({ where: { conductorId: conductor.id, estado: 'ASIGNADA' } });

    if (activas.length === 0) {
      await whatsappMessagesService.enviarMensaje(conductor.telefono, 'No tienes ninguna carrera asignada en este momento.');
      return;
    }
    if (activas.length > 1) {
      await whatsappMessagesService.enviarMensaje(
        conductor.telefono,
        'Tienes varias carreras activas — comunícate directo con el dueño para esta foto en particular.'
      );
      return;
    }

    try {
      const url = await mediaService.descargarYSubir(mediaId);
      await evidenciaService.crear(activas[0].id, 'CONDUCTOR', url);
      await whatsappMessagesService.enviarMensajeConBotones(conductor.telefono, '📷 Foto recibida. ¿Es de recogida o de entrega?', [
        { id: 'evidencia_recogida', title: 'Recogida' },
        { id: 'evidencia_entrega', title: 'Entrega' },
      ]);
    } catch (error) {
      console.error('Error procesando foto de conductor:', error);
      await whatsappMessagesService.enviarMensaje(conductor.telefono, 'No pudimos procesar la foto, intenta de nuevo.');
    }
  }

  async procesarEtiqueta(conductor: { id: string; telefono: string }, tipo: 'RECOGIDA' | 'ENTREGA') {
    const actualizada = await evidenciaService.etiquetarPendienteDeConductor(conductor.id, tipo);
    if (!actualizada) {
      await whatsappMessagesService.enviarMensaje(conductor.telefono, 'No encontré una foto pendiente de etiquetar.');
      return;
    }
    await whatsappMessagesService.enviarMensaje(conductor.telefono, `Listo, guardamos tu foto de ${tipo.toLowerCase()}. Gracias 🙌`);
  }
}

export const conductorBotService = new ConductorBotService();
