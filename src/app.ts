import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import cron from 'node-cron';

process.env.TZ = process.env.TZ || 'America/Bogota';

dotenv.config();

import webhookRoutes from './routes/webhook.routes';
import adminRoutes from './routes/admin.routes';
import { limpiarConversacionesInactivas } from './services/whatsapp/bot.service';
import { notificacionesService } from './services/notificaciones.service';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

const adminPanelEnabled = process.env.ADMIN_PANEL_ENABLED !== 'false';

if (adminPanelEnabled) {
  const adminPath = path.join(__dirname, 'admin');
  app.use('/admin', express.static(adminPath));
  app.get('/admin', (_req, res) => res.sendFile(path.join(adminPath, 'index.html')));
  app.get('/admin/*', (_req, res) => res.sendFile(path.join(adminPath, 'index.html')));
}

app.use('/webhook', webhookRoutes);

if (adminPanelEnabled) {
  app.use('/api/admin', adminRoutes);
}

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'mensajeria-bot' }));
app.get('/', (_req, res) => res.json({ message: '🛵 Serveloz Bot WhatsApp', panel: '/admin', webhook: '/webhook', health: '/health' }));

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
});

cron.schedule('*/5 * * * *', async () => {
  await limpiarConversacionesInactivas();
});

cron.schedule('* * * * *', async () => {
  await notificacionesService.avisarCarrerasProgramadas();
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📱 Webhook WhatsApp: http://localhost:${PORT}/webhook`);
  if (adminPanelEnabled) {
    console.log(`⚙️  Panel Admin: http://localhost:${PORT}/admin`);
  }
});

export default app;
