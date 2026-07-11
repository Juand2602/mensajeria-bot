import { Router, Request, Response } from 'express';
import { generarToken, verificarAdmin } from '../middleware/auth';
import { carrerasService } from '../services/carreras.service';
import { clientesService } from '../services/clientes.service';
import { conductoresService } from '../services/conductores.service';
import { configuracionService } from '../services/configuracion.service';
import { radarService } from '../services/radar.service';
import { notificacionesService } from '../services/notificaciones.service';
import { whatsappMessagesService } from '../services/whatsapp/messages.service';
import { mensajeriaService } from '../services/mensajeria.service';
import prisma from '../config/database';

const router = Router();

router.post('/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USERNAME;
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminUser || !adminPass) {
    res.status(500).json({ error: 'ADMIN_USERNAME/ADMIN_PASSWORD no están configurados en el servidor' });
    return;
  }

  if (username === adminUser && password === adminPass) {
    res.json({ token: generarToken(), message: 'Login exitoso' });
  } else {
    res.status(401).json({ error: 'Credenciales incorrectas' });
  }
});

// ==================== DASHBOARD ====================
router.get('/dashboard', verificarAdmin, async (_req, res) => {
  try {
    const hoy = new Date();
    const inicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0);
    const finDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);

    const [carrerasHoy, carrerasPendientes, totalConductores, totalClientes] = await Promise.all([
      prisma.carrera.count({ where: { createdAt: { gte: inicioDia, lte: finDia } } }),
      prisma.carrera.count({ where: { estado: { in: ['PENDIENTE_ASIGNACION', 'ASIGNADA'] } } }),
      prisma.conductor.count({ where: { activo: true } }),
      prisma.cliente.count({ where: { activo: true } }),
    ]);

    res.json({ carrerasHoy, carrerasPendientes, totalConductores, totalClientes });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ==================== CARRERAS ====================
router.get('/carreras', verificarAdmin, async (req, res) => {
  try {
    const { estado, conductorId, clienteId } = req.query;
    const carreras = await carrerasService.getAll({
      estado: estado as string | undefined,
      conductorId: conductorId as string | undefined,
      clienteId: clienteId as string | undefined,
    });
    res.json(carreras);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/carreras/manual', verificarAdmin, async (req, res) => {
  try {
    const { clienteTelefono, clienteNombre, tipoServicio, direccionRecogida, direccionDestino, fechaHoraProgramada, conductorId } = req.body;

    if (!['DOMICILIO', 'MOTOTAXI'].includes(tipoServicio)) {
      res.status(400).json({ error: 'tipoServicio debe ser DOMICILIO o MOTOTAXI' });
      return;
    }

    const cliente = await clientesService.obtenerOCrear(clienteTelefono, clienteNombre);

    const recogida = await radarService.geocodificar(direccionRecogida);
    const destino = await radarService.geocodificar(direccionDestino);
    if (!recogida || !destino) {
      res.status(400).json({ error: 'No se pudo geocodificar la dirección de recogida o destino' });
      return;
    }

    const distanciaKm = await radarService.calcularDistanciaKm(
      { lat: recogida.lat, lng: recogida.lng },
      { lat: destino.lat, lng: destino.lng }
    );

    const carrera = await carrerasService.create({
      clienteId: cliente!.id,
      tipoServicio,
      direccionRecogida: recogida.direccionFormateada,
      recogidaLat: recogida.lat,
      recogidaLng: recogida.lng,
      direccionDestino: destino.direccionFormateada,
      destinoLat: destino.lat,
      destinoLng: destino.lng,
      distanciaKm,
      fechaHoraProgramada: fechaHoraProgramada ? new Date(fechaHoraProgramada) : null,
      origen: 'PANEL',
      conductorId: conductorId || undefined,
    });

    if (conductorId) {
      try { await notificacionesService.notificarAsignacion(carrera.id); } catch (e) { console.error('Error notificando asignación:', e); }
    }

    res.status(201).json(carrera);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put('/carreras/:id/asignar', verificarAdmin, async (req, res) => {
  try {
    const carrera = await carrerasService.asignarConductor(req.params.id, req.body.conductorId);
    try { await notificacionesService.notificarAsignacion(carrera.id); } catch (e) { console.error('Error notificando asignación:', e); }
    res.json(carrera);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put('/carreras/:id/completar', verificarAdmin, async (req, res) => {
  try {
    const { carrera, referidorNotificar } = await carrerasService.marcarCompletada(req.params.id);
    try { await notificacionesService.notificarCierre(carrera.id, referidorNotificar?.telefono); } catch (e) { console.error('Error notificando cierre:', e); }
    res.json(carrera);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put('/carreras/:id/pago', verificarAdmin, async (req, res) => {
  try {
    if (!['PENDIENTE', 'PAGADO'].includes(req.body.estadoPago)) {
      res.status(400).json({ error: 'estadoPago debe ser PENDIENTE o PAGADO' });
      return;
    }
    const carrera = await carrerasService.actualizarEstadoPago(req.params.id, req.body.estadoPago);
    res.json(carrera);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put('/carreras/:id/estado', verificarAdmin, async (req, res) => {
  try {
    if (!['PENDIENTE_ASIGNACION', 'ASIGNADA', 'COMPLETADA', 'CANCELADA'].includes(req.body.estado)) {
      res.status(400).json({ error: 'estado debe ser PENDIENTE_ASIGNACION, ASIGNADA, COMPLETADA o CANCELADA' });
      return;
    }
    const carrera = await carrerasService.cambiarEstado(req.params.id, req.body.estado, req.body.motivoCancelacion);
    res.json(carrera);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ==================== CONDUCTORES ====================
router.get('/conductores', verificarAdmin, async (_req, res) => {
  try {
    const conductores = await conductoresService.getAll();
    res.json(conductores);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/conductores', verificarAdmin, async (req, res) => {
  try {
    const conductor = await conductoresService.create(req.body);
    res.status(201).json(conductor);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put('/conductores/:id', verificarAdmin, async (req, res) => {
  try {
    const conductor = await conductoresService.update(req.params.id, req.body);
    res.json(conductor);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete('/conductores/:id', verificarAdmin, async (req, res) => {
  try {
    await conductoresService.delete(req.params.id);
    res.json({ message: 'Conductor desactivado' });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ==================== CLIENTES ====================
router.get('/clientes', verificarAdmin, async (req, res) => {
  try {
    const { search } = req.query;
    const clientes = await clientesService.getAll(search as string | undefined);
    res.json(clientes);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/clientes/:id', verificarAdmin, async (req, res) => {
  try {
    const cliente = await clientesService.update(req.params.id, req.body);
    res.json(cliente);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ==================== CONFIGURACIÓN ====================
router.get('/config', verificarAdmin, async (_req, res) => {
  try {
    const config = await configuracionService.obtener();
    res.json(config);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/config', verificarAdmin, async (req, res) => {
  try {
    const config = await configuracionService.actualizar(req.body);
    res.json(config);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ==================== CONVERSACIONES (CHAT MANUAL) ====================
router.get('/conversaciones', verificarAdmin, async (_req, res) => {
  try {
    const ultimosMensajes = await prisma.mensaje.groupBy({ by: ['telefono'], _max: { timestamp: true } });
    const telefonos = ultimosMensajes
      .sort((a, b) => (b._max.timestamp?.getTime() || 0) - (a._max.timestamp?.getTime() || 0))
      .map(m => m.telefono);

    const conversaciones = await Promise.all(telefonos.map(async telefono => {
      const [cliente, conversacion, ultimoMensaje] = await Promise.all([
        prisma.cliente.findUnique({ where: { telefono } }),
        prisma.conversacion.findFirst({ where: { telefono, activa: true } }),
        prisma.mensaje.findFirst({ where: { telefono }, orderBy: { timestamp: 'desc' } }),
      ]);
      return {
        telefono,
        clienteNombre: cliente?.nombre || telefono,
        modoManual: conversacion?.modoManual || false,
        ultimoMensaje: ultimoMensaje?.contenido || '',
        ultimoMensajeFecha: ultimoMensaje?.timestamp || null,
      };
    }));

    res.json(conversaciones);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/conversaciones/:telefono/mensajes', verificarAdmin, async (req, res) => {
  try {
    const { desde } = req.query;
    const where: any = { telefono: req.params.telefono };
    if (desde) where.timestamp = { gt: new Date(desde as string) };
    const mensajes = await prisma.mensaje.findMany({ where, orderBy: { timestamp: 'asc' } });
    res.json(mensajes);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/conversaciones/:telefono/mensajes', verificarAdmin, async (req, res) => {
  try {
    const telefono = req.params.telefono;
    const { contenido } = req.body;

    const ultimoEntrante = await prisma.mensaje.findFirst({
      where: { telefono, direccion: 'ENTRANTE' },
      orderBy: { timestamp: 'desc' },
    });
    const dentroDeVentana = !!ultimoEntrante && (Date.now() - ultimoEntrante.timestamp.getTime()) < 24 * 60 * 60 * 1000;
    if (!dentroDeVentana) {
      res.status(400).json({ error: 'Han pasado más de 24h desde el último mensaje del cliente. Se necesita una plantilla pre-aprobada para escribirle.' });
      return;
    }

    try {
      await whatsappMessagesService.enviarMensaje(telefono, contenido);
    } catch (e: any) {
      console.error('Error enviando mensaje manual por WhatsApp:', e.response?.data || e.message);
      res.status(502).json({ error: 'No se pudo enviar el mensaje por WhatsApp. Intenta de nuevo.' });
      return;
    }
    await mensajeriaService.registrarSaliente(telefono, contenido, 'DUEÑO');

    const conversacion = await prisma.conversacion.findFirst({ where: { telefono, activa: true } });
    if (conversacion) {
      await prisma.conversacion.update({ where: { id: conversacion.id }, data: { modoManual: true } });
    }

    res.status(201).json({ message: 'Mensaje enviado' });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put('/conversaciones/:telefono/modo', verificarAdmin, async (req, res) => {
  try {
    const conversacion = await prisma.conversacion.findFirst({ where: { telefono: req.params.telefono, activa: true } });
    if (!conversacion) {
      res.status(404).json({ error: 'No hay una conversación activa para este teléfono' });
      return;
    }
    const actualizada = await prisma.conversacion.update({
      where: { id: conversacion.id },
      data: { modoManual: !!req.body.modoManual },
    });
    res.json(actualizada);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

export default router;
