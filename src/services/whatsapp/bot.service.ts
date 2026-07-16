import prisma from '../../config/database';
import { radarService } from '../radar.service';
import { clientesService } from '../clientes.service';
import { carrerasService } from '../carreras.service';
import { notificacionesService } from '../notificaciones.service';
import { mensajeriaService } from '../mensajeria.service';
import { messageParser } from './parser.service';
import { MENSAJES, validarNombreCompleto } from './templates';
import { ConversationState, ConversationContext } from '../../types';
import { botConfig } from '../../config/whatsapp';

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
      case 'ESPERANDO_MOMENTO':
        await this.manejarMomento(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_FECHA_HORA_PROGRAMADA':
        await this.manejarFechaHoraProgramada(telefono, mensaje, contexto, conversacionId); break;
      case 'CONFIRMACION_PRECIO':
        await this.manejarConfirmacionPrecio(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_ASIGNACION':
        await mensajeriaService.enviarMensaje(
          telefono,
          'Ya recibimos tu pedido y estamos asignando un conductor. Te avisamos apenas esté en camino. 🛵'
        );
        break;
      case 'ESPERANDO_SELECCION_CARRERA_CANCELAR':
        await this.manejarSeleccionCarreraCancelar(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_CONFIRMACION_CANCELACION':
        await this.manejarConfirmacionCancelacion(telefono, mensaje, contexto, conversacionId); break;
      default:
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
      const referidor = await clientesService.buscarReferidor(mensaje);
      if (cliente && referidor && referidor.id !== cliente.id) {
        await prisma.cliente.update({ where: { id: cliente.id }, data: { referidoPorId: referidor.id } });
        await mensajeriaService.enviarMensaje(telefono, '¡Gracias! Registramos quién te recomendó Serveloz 🎉');
      } else if (cliente && !referidor) {
        await mensajeriaService.enviarMensaje(telefono, 'No encontramos a esa persona en nuestro sistema, pero no hay problema, seguimos con tu pedido.');
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

  private async manejarMomento(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (mensaje === 'momento_ahora') {
      delete contexto.fechaHoraProgramada;
      await this.calcularYMostrarPrecio(telefono, contexto, conversacionId);
    } else if (mensaje === 'momento_programado') {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.SOLICITAR_FECHA_HORA_PROGRAMADA());
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_FECHA_HORA_PROGRAMADA', contexto);
    } else {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.OPCION_INVALIDA());
    }
  }

  private async manejarFechaHoraProgramada(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    const fecha = messageParser.parsearFechaProgramada(mensaje);
    if (!fecha || fecha < new Date()) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.FECHA_PROGRAMADA_INVALIDA());
      return;
    }
    contexto.fechaHoraProgramada = fecha.toISOString();
    await this.calcularYMostrarPrecio(telefono, contexto, conversacionId);
  }

  private async calcularYMostrarPrecio(telefono: string, contexto: ConversationContext, conversacionId: string) {
    try {
      const distanciaKm = await radarService.calcularDistanciaKm(
        { lat: contexto.recogida!.lat!, lng: contexto.recogida!.lng! },
        { lat: contexto.destino!.lat!, lng: contexto.destino!.lng! }
      );
      contexto.distanciaKm = distanciaKm;

      const cliente = await clientesService.buscarPorTelefono(telefono);
      const conDescuento = !!cliente && cliente.descuentosDisponibles > 0;
      let precio = await carrerasService.calcularPrecio(distanciaKm, contexto.destino!.lat!, contexto.destino!.lng!);
      if (conDescuento) precio = Math.round(precio * 0.8);
      contexto.precio = precio;

      await mensajeriaService.enviarMensajeConBotones(
        telefono,
        MENSAJES.PRECIO_CALCULADO({ distanciaKm, precio, conDescuento }),
        [
          { id: 'precio_si', title: '✅ Confirmar' },
          { id: 'precio_no', title: '❌ Cancelar' },
        ]
      );
      await this.actualizarConversacion(conversacionId, 'CONFIRMACION_PRECIO', contexto);
    } catch (error) {
      console.error('Error calculando precio:', error);
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.ERROR_SERVIDOR());
    }
  }

  private async manejarConfirmacionPrecio(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (mensaje === 'precio_no' || messageParser.esNegativo(mensaje)) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.DESPEDIDA());
      await this.finalizarConversacion(conversacionId);
      return;
    }
    if (mensaje !== 'precio_si' && !messageParser.esAfirmativo(mensaje)) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.OPCION_INVALIDA());
      return;
    }

    const cliente = await clientesService.buscarPorTelefono(telefono);
    if (!cliente) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.ERROR_SERVIDOR());
      return;
    }

    const carrera = await carrerasService.create({
      clienteId: cliente.id,
      tipoServicio: contexto.tipoServicio!,
      direccionRecogida: contexto.recogida!.direccionFormateada!,
      recogidaLat: contexto.recogida!.lat!,
      recogidaLng: contexto.recogida!.lng!,
      direccionDestino: contexto.destino!.direccionFormateada!,
      destinoLat: contexto.destino!.lat!,
      destinoLng: contexto.destino!.lng!,
      distanciaKm: contexto.distanciaKm!,
      fechaHoraProgramada: contexto.fechaHoraProgramada ? new Date(contexto.fechaHoraProgramada) : null,
      origen: 'WHATSAPP',
    });

    await mensajeriaService.enviarMensaje(telefono, MENSAJES.CARRERA_CONFIRMADA({ radicado: carrera.radicado }));

    if (!contexto.fechaHoraProgramada) {
      try { await notificacionesService.notificarNuevaSolicitud(carrera.id); } catch (e) { console.error('Error notificando nueva solicitud:', e); }
    }

    await this.actualizarConversacion(conversacionId, 'ESPERANDO_ASIGNACION', { carreraId: carrera.id, radicado: carrera.radicado });
  }

  private async manejarSeleccionCarreraCancelar(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    const radicado = mensaje.startsWith('carrera_') ? mensaje.replace('carrera_', '') : messageParser.extraerRadicado(mensaje);
    if (!radicado) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.RADICADO_NO_ENCONTRADO());
      return;
    }
    const carrera = await carrerasService.buscarPorRadicado(radicado);
    if (!carrera || carrera.cliente.telefono !== telefono) {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.RADICADO_NO_ENCONTRADO());
      return;
    }
    contexto.radicado = carrera.radicado;
    contexto.carreraId = carrera.id;
    await mensajeriaService.enviarMensajeConBotones(
      telefono,
      MENSAJES.CONFIRMAR_CANCELACION({ radicado: carrera.radicado, destino: carrera.direccionDestino }),
      [
        { id: 'confirmar_cancelar', title: '✅ Sí, cancelar' },
        { id: 'conservar_carrera', title: '❌ No' },
      ]
    );
    await this.actualizarConversacion(conversacionId, 'ESPERANDO_CONFIRMACION_CANCELACION', contexto);
  }

  private async manejarConfirmacionCancelacion(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (mensaje === 'confirmar_cancelar' || messageParser.esAfirmativo(mensaje)) {
      await carrerasService.cambiarEstado(contexto.carreraId!, 'CANCELADA', 'Cancelado por el cliente vía WhatsApp');
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.CARRERA_CANCELADA());
    } else {
      await mensajeriaService.enviarMensaje(telefono, MENSAJES.DESPEDIDA());
    }
    await this.finalizarConversacion(conversacionId);
  }

  private async manejarCancelacionGlobal(telefono: string) {
    const activas = await carrerasService.getActivasPorTelefono(telefono);

    if (activas.length === 0) {
      const conv = await this.obtenerConversacionActiva(telefono);
      if (conv) {
        await mensajeriaService.enviarMensaje(telefono, MENSAJES.DESPEDIDA());
        await this.finalizarConversacion(conv.id);
      }
      return;
    }

    const contexto: ConversationContext = {
      carrerasDisponibles: activas.map((c, i) => ({
        numero: i + 1, radicado: c.radicado, tipoServicio: c.tipoServicio, destino: c.direccionDestino,
      })),
    };

    await mensajeriaService.enviarMensajeConLista(telefono, '¿Cuál carrera deseas cancelar?', 'Ver carreras', [
      {
        title: 'Carreras activas',
        rows: activas.map(c => ({ id: `carrera_${c.radicado}`, title: c.radicado, description: c.direccionDestino.substring(0, 72) })),
      },
    ]);

    const conv = await this.obtenerConversacionActiva(telefono) || await this.crearConversacion(telefono);
    await this.actualizarConversacion(conv.id, 'ESPERANDO_SELECCION_CARRERA_CANCELAR', contexto);
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

export async function limpiarConversacionesInactivas() {
  const fechaLimite = new Date(Date.now() - botConfig.timeoutConversacion);
  const result = await prisma.conversacion.updateMany({
    where: { activa: true, lastActivity: { lt: fechaLimite } },
    data: { activa: false },
  });
  if (result.count > 0) console.log(`✅ ${result.count} conversaciones inactivas limpiadas`);
}
