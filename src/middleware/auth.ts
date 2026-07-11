import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta configurar la variable de entorno ${name}`);
  }
  return value;
}

const JWT_SECRET = requireEnv('JWT_SECRET');

export function generarToken(): string {
  return jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '8h' });
}

export function verificarAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const token = authHeader.split(' ')[1];
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
