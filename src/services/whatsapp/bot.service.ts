import prisma from '../../config/database';
import { radarService } from '../radar.service';
import { clientesService } from '../clientes.service';
import { mensajeriaService } from '../mensajeria.service';
import { messageParser } from './parser.service';
import { MENSAJES, validarNombreCompleto } from './templates';
import { ConversationState, ConversationContext } from '../../types';

const NOMBRE_PLACEHOLDER = 'Cliente Nuevo';

export class WhatsAppBotService {
  async procesarMensaje(
    telefono: string,
    mensaje: string,
    esBoton: boolean = false,
    buttonId?: string,
    ubicacion?: { lat: number; lng: number }
  ) {
    try {
      if (messageParser.esComandoCancelacion(mensaje)) {
        await this.manejarCancelacionGlobal(telefono);
        return;
      }

      let conversacion = await this.obtenerConversacionActiva(telefono);
      if (!conversacion) {
        conversacion = await this.crearConversacion(telefono);
        await this.enviarSaludoInicial(telefono, conversacion.cliente, conversacion.id);
        return;
      }

      if (conversacion.modoManual) return;

      await this.actualizarActividad(conversacion.id);
      const estado = conversacion.estado as ConversationState;
      const contexto: ConversationContext = JSON.parse(conversacion.contexto);
      const mensajeAProcesar = esBoton && buttonId ? buttonId : mensaje;
      await this.procesarEstado(telefono, mensajeAProcesar, estado, contexto, conversacion.id, ubicacion);
    } catch (error) {
      console.error('Error procesando mensaje:', error);
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.ERROR_SERVIDOR());
    }
  }

  private async enviarSaludoInicial(telefono: string, cliente: { nombre: string }, conversacionId: string) {
    if (cliente.nombre === NOMBRE_PLACEHOLDER) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.BIENVENIDA());
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.SOLICITAR_NOMBRE());
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_NOMBRE', {});
    } else {
      await mensajeriaService.enviarMensaje(telefono, `🛵 ¡Hola de nuevo, ${cliente.nombre}!`);
      await this.enviarMenuTipoServicio(telefono);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_TIPO_SERVICIO', {});
    }
  }

  private async enviarMenuTipoServicio(telefono: string) {
    await mensajeriaService.enviarMensajeConBotones(telefono, MENSAJES.SOLICITAR_TIPO_SERVICIO(), [
      { id: 'tipo_domicilio', title: '📦 Domicilio' },
      { id: 'tipo_mototaxi', title: '🛵 Mototaxi' },
    ]);
  }

  private async procesarEstado(
    telefono: string,
    mensaje: string,
    estado: ConversationState,
    contexto: ConversationContext,
    conversacionId: string,
    ubicacion?: { lat: number; lng: number }
  ) {
    switch (estado) {
      case 'ESPERANDO_NOMBRE':
        await this.manejarNombre(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_REFERIDO':
        await this.manejarReferido(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_TIPO_SERVICIO':
        await this.manejarTipoServicio(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_RECOGIDA':
        await this.manejarDireccion(telefono, mensaje, contexto, conversacionId, 'recogida', ubicacion); break;
      case 'ESPERANDO_CONFIRMACION_RECOGIDA':
        await this.manejarConfirmacionDireccion(telefono, mensaje, contexto, conversacionId, 'recogida'); break;
      case 'ESPERANDO_DESTINO':
        await this.manejarDireccion(telefono, mensaje, contexto, conversacionId, 'destino', ubicacion); break;
      case 'ESPERANDO_CONFIRMACION_DESTINO':
        await this.manejarConfirmacionDireccion(telefono, mensaje, contexto, conversacionId, 'destino'); break;
      default:
        // Estados de momento/precio/asignación/cancelación se agregan en la Task 10.
        await mensajeriaService.enviarMensaje(telefono, MENSAJES.OPCION_INVALIDA());
    }
  }

  private async manejarNombre(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (!validarNombreCompleto(mensaje)) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.NOMBRE_INVALIDO());
      return;
    }
    const cliente = await clientesService.buscarPorTelefono(telefono);
    if (cliente) await clientesService.update(cliente.id, { nombre: mensaje.trim() });
    contexto.nombre = mensaje.trim();
    await mensajeriaService.enviarMensaje(telefono, MENSAJES.SOLICITAR_REFERIDO());
    await this.actualizarConversacion(conversacionId, 'ESPERANDO_REFERIDO', contexto);
  }

  private async manejarReferido(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (!messageParser.esNegativo(mensaje)) {
      const cliente = await clientesService.buscarPorTelefono(telefono);
      const referidor = await clientesService.buscarPorTelefono(mensaje.trim());
      if (cliente && referidor && referidor.id !== cliente.id) {
        await prisma.cliente.update({ where: { id: cliente.id }, data: { referidoPorId: referidor.id } });
      }
    }
    await this.enviarMenuTipoServicio(telefono);
    await this.actualizarConversacion(conversacionId, 'ESPERANDO_TIPO_SERVICIO', contexto);
  }

  private async manejarTipoServicio(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (mensaje === 'tipo_domicilio') contexto.tipoServicio = 'DOMICILIO';
    else if (mensaje === 'tipo_mototaxi') contexto.tipoServicio = 'MOTOTAXI';
    else {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.OPCION_INVALIDA());
      await this.enviarMenuTipoServicio(telefono);
      return;
    }
    await mensajeriaService.enviarMensaje(telefono, MENSAJES.SOLICITAR_RECOGIDA());
    await this.actualizarConversacion(conversacionId, 'ESPERANDO_RECOGIDA', contexto);
  }

  private async manejarDireccion(
    telefono: string,
    mensaje: string,
    contexto: ConversationContext,
    conversacionId: string,
    campo: 'recogida' | 'destino',
    ubicacion?: { lat: number; lng: number }
  ) {
    if (ubicacion) {
      contexto[campo] = {
        lat: ubicacion.lat,
        lng: ubicacion.lng,
        direccionFormateada: `Ubicación compartida (${ubicacion.lat.toFixed(5)}, ${ubicacion.lng.toFixed(5)})`,
      };
      await this.avanzarDespuesDeDireccion(telefono, contexto, conversacionId, campo);
      return;
    }

    const resultado = await radarService.geocodificar(mensaje);
    if (!resultado) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.DIRECCION_NO_ENCONTRADA());
      return;
    }

    contexto[campo] = {
      direccionTexto: mensaje,
      direccionFormateada: resultado.direccionFormateada,
      lat: resultado.lat,
      lng: resultado.lng,
    };
    await mensajeriaService.enviarMensajeConBotones(telefono, MENSAJES.CONFIRMAR_DIRECCION(resultado.direccionFormateada), [
      { id: 'direccion_si', title: '✅ Sí' },
      { id: 'direccion_no', title: '❌ No' },
    ]);
    await this.actualizarConversacion(
      conversacionId,
      campo === 'recogida' ? 'ESPERANDO_CONFIRMACION_RECOGIDA' : 'ESPERANDO_CONFIRMACION_DESTINO',
      contexto
    );
  }

  private async manejarConfirmacionDireccion(
    telefono: string,
    mensaje: string,
    contexto: ConversationContext,
    conversacionId: string,
    campo: 'recogida' | 'destino'
  ) {
    if (mensaje === 'direccion_si' || messageParser.esAfirmativo(mensaje)) {
      await this.avanzarDespuesDeDireccion(telefono, contexto, conversacionId, campo);
    } else if (mensaje === 'direccion_no' || messageParser.esNegativo(mensaje)) {
      delete contexto[campo];
      await mensajeriaService.enviarMensaje(telefono, campo === 'recogida' ? MENSAJES.SOLICITAR_RECOGIDA() : MENSAJES.SOLICITAR_DESTINO());
      await this.actualizarConversacion(conversacionId, campo === 'recogida' ? 'ESPERANDO_RECOGIDA' : 'ESPERANDO_DESTINO', contexto);
    } else {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.OPCION_INVALIDA());
    }
  }

  private async avanzarDespuesDeDireccion(
    telefono: string,
    contexto: ConversationContext,
    conversacionId: string,
    campo: 'recogida' | 'destino'
  ) {
    if (campo === 'recogida') {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.SOLICITAR_DESTINO());
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_DESTINO', contexto);
    } else {
      await mensajeriaService.enviarMensajeConBotones(telefono, MENSAJES.SOLICITAR_MOMENTO(), [
        { id: 'momento_ahora', title: '🕐 Ahora' },
        { id: 'momento_programado', title: '📅 Programado' },
      ]);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_MOMENTO', contexto);
    }
  }

  private async manejarCancelacionGlobal(telefono: string) {
    const conv = await this.obtenerConversacionActiva(telefono);
    if (conv) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.DESPEDIDA());
      await this.finalizarConversacion(conv.id);
    }
  }

  private async obtenerConversacionActiva(telefono: string) {
    return prisma.conversacion.findFirst({ where: { telefono, activa: true }, include: { cliente: true } });
  }

  private async crearConversacion(telefono: string) {
    let cliente = await clientesService.buscarPorTelefono(telefono);
    if (!cliente) cliente = await clientesService.crear({ nombre: NOMBRE_PLACEHOLDER, telefono });
    return prisma.conversacion.create({
      data: { clienteId: cliente.id, telefono, estado: 'INICIAL', contexto: JSON.stringify({}), activa: true },
      include: { cliente: true },
    });
  }

  private async actualizarConversacion(id: string, estado: ConversationState, contexto: ConversationContext) {
    return prisma.conversacion.update({ where: { id }, data: { estado, contexto: JSON.stringify(contexto), lastActivity: new Date() } });
  }

  private async actualizarActividad(id: string) {
    return prisma.conversacion.update({ where: { id }, data: { lastActivity: new Date() } });
  }

  private async finalizarConversacion(id: string) {
    return prisma.conversacion.update({ where: { id }, data: { activa: false, estado: 'COMPLETADA' } });
  }
}

export const whatsappBotService = new WhatsAppBotService();
