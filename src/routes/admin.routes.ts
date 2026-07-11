import { Router, Request, Response } from 'express';
import { generarToken } from '../middleware/auth';

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

export default router;
