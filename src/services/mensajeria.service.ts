import prisma from '../config/database';
import { whatsappMessagesService, ReplyButton, ListSection } from './whatsapp/messages.service';

export class MensajeriaService {
  async registrarEntrante(telefono: string, contenido: string) {
    const cliente = await prisma.cliente.findUnique({ where: { telefono } });
    await prisma.mensaje.create({
      data: { telefono, clienteId: cliente?.id, direccion: 'ENTRANTE', contenido, enviadoPor: 'CLIENTE' },
    });
  }

  async registrarSaliente(telefono: string, contenido: string, enviadoPor: 'BOT' | 'DUEÑO') {
    const cliente = await prisma.cliente.findUnique({ where: { telefono } });
    await prisma.mensaje.create({
      data: { telefono, clienteId: cliente?.id, direccion: 'SALIENTE', contenido, enviadoPor },
    });
  }

  async enviarMensaje(telefono: string, mensaje: string): Promise<any> {
    const resultado = await whatsappMessagesService.enviarMensaje(telefono, mensaje);
    await this.registrarSaliente(telefono, mensaje, 'BOT');
    return resultado;
  }

  async enviarMensajeConBotones(telefono: string, mensaje: string, botones: ReplyButton[]): Promise<any> {
    const resultado = await whatsappMessagesService.enviarMensajeConBotones(telefono, mensaje, botones);
    const opciones = botones.map(b => b.title).join(' / ');
    await this.registrarSaliente(telefono, `${mensaje}\n[Opciones: ${opciones}]`, 'BOT');
    return resultado;
  }

  async enviarMensajeConLista(telefono: string, mensaje: string, buttonText: string, sections: ListSection[]): Promise<any> {
    const resultado = await whatsappMessagesService.enviarMensajeConLista(telefono, mensaje, buttonText, sections);
    await this.registrarSaliente(telefono, mensaje, 'BOT');
    return resultado;
  }

  async enviarUbicacion(telefono: string, lat: number, lng: number, nombre?: string, direccion?: string): Promise<any> {
    const resultado = await whatsappMessagesService.enviarUbicacion(telefono, lat, lng, nombre, direccion);
    await this.registrarSaliente(telefono, `📍 Ubicación enviada: ${nombre || ''} ${direccion || ''}`.trim(), 'BOT');
    return resultado;
  }
}

export const mensajeriaService = new MensajeriaService();
