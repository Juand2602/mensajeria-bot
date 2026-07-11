import { Router, Request, Response } from 'express';
import { generarToken, verificarAdmin } from '../middleware/auth';
import { carrerasService } from '../services/carreras.service';
import { clientesService } from '../services/clientes.service';
import { radarService } from '../services/radar.service';
import { notificacionesService } from '../services/notificaciones.service';
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

export default router;
