import { Request, Response } from 'express';
import { WhatsAppWebhookPayload } from '../types';
import { whatsappBotService } from '../services/whatsapp/bot.service';
import { mensajeriaService } from '../services/mensajeria.service';
import { conductoresService } from '../services/conductores.service';
import { conductorBotService } from '../services/whatsapp/conductor-bot.service';
import { whatsappMessagesService } from '../services/whatsapp/messages.service';
import { whatsappConfig } from '../config/whatsapp';

const mensajesProcesados = new Set<string>();

export class WebhookController {
  async verificar(req: Request, res: Response) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === whatsappConfig.verifyToken) {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }

  async recibirMensaje(req: Request, res: Response) {
    res.sendStatus(200);

    try {
      const body: WhatsAppWebhookPayload = req.body;
      if (body.object !== 'whatsapp_business_account') return;

      for (const entry of body.entry) {
        for (const change of entry.changes) {
          const value = change.value;
          if (value.messages) {
            for (const message of value.messages) {
              if (mensajesProcesados.has(message.id)) continue;
              mensajesProcesados.add(message.id);
              if (mensajesProcesados.size > 1000) mensajesProcesados.clear();

              this.procesarMensaje(message);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error procesando webhook:', error);
    }
  }

  private async procesarMensaje(message: any) {
    try {
      const telefono = message.from;

      if (message.type === 'text') {
        const texto = message.text?.body;
        if (texto) {
          await mensajeriaService.registrarEntrante(telefono, texto);
          const conductor = await conductoresService.buscarPorTelefono(telefono);
          if (conductor) {
            await whatsappMessagesService.enviarMensaje(
              telefono,
              '📷 Puedes enviarme una foto de evidencia cuando quieras. Si necesitas hablar sobre una carrera, contacta al dueño directamente.'
            );
          } else {
            await whatsappBotService.procesarMensaje(telefono, texto);
          }
        }
      } else if (message.type === 'image' && message.image) {
        await mensajeriaService.registrarEntrante(telefono, '📷 Foto enviada');
        const conductor = await conductoresService.buscarPorTelefono(telefono);
        if (conductor) {
          await conductorBotService.procesarFoto(conductor, message.image.id);
        } else {
          await whatsappBotService.procesarMensaje(telefono, 'IMAGEN_RECIBIDA', false, undefined, undefined, {
            mediaId: message.image.id,
          });
        }
      } else if (message.type === 'location' && message.location) {
        const { latitude, longitude, name, address } = message.location;
        await mensajeriaService.registrarEntrante(telefono, `📍 Ubicación compartida (${latitude}, ${longitude})`);
        await whatsappBotService.procesarMensaje(telefono, 'UBICACION_COMPARTIDA', false, undefined, {
          lat: latitude,
          lng: longitude,
          nombre: name,
          direccion: address,
        });
      } else if (message.type === 'interactive') {
        const reply = message.interactive?.button_reply || message.interactive?.list_reply;
        if (reply) {
          await mensajeriaService.registrarEntrante(telefono, reply.title);
          const conductor = await conductoresService.buscarPorTelefono(telefono);
          if (conductor && (reply.id === 'evidencia_recogida' || reply.id === 'evidencia_entrega')) {
            await conductorBotService.procesarEtiqueta(conductor, reply.id === 'evidencia_recogida' ? 'RECOGIDA' : 'ENTREGA');
          } else {
            await whatsappBotService.procesarMensaje(telefono, reply.id, true, reply.id);
          }
        }
      }
    } catch (error) {
      console.error('Error procesando mensaje individual:', error);
    }
  }
}

export const webhookController = new WebhookController();
