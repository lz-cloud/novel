import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET || 'insecure_secret';
const SESSION_TTL_SECONDS = parseInt(process.env.SESSION_TTL_SECONDS || '604800', 10);

export function authenticateJWT(required = true) {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers['authorization'] || req.headers['Authorization'];
      if (!authHeader) {
        if (required) return res.status(401).json({ error: 'Unauthorized' });
        return next();
      }
      const [scheme, token] = authHeader.split(' ');
      if (scheme !== 'Bearer' || !token) {
        if (required) return res.status(401).json({ error: 'Invalid token format' });
        return next();
      }
      const payload = jwt.verify(token, JWT_SECRET);
      // Check session in Redis
      const jti = payload.jti;
      const sessionKey = `session:${jti}`;
      const exists = await req.redis.exists(sessionKey);
      if (!exists) {
        return res.status(401).json({ error: 'Session expired' });
      }
      req.user = payload;
      req.token = token;
      next();
    } catch (e) {
      console.error('Auth error:', e);
      return res.status(401).json({ error: 'Unauthorized' });
    }
  };
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

export async function generateJwtAndSession({ prisma, redis, user }) {
  const jti = uuidv4();
  const payload = { id: user.id, role: user.role, username: user.username, jti };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d', jwtid: jti });
  // Store session in DB and Redis
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await prisma.session.create({
    data: {
      jti,
      userId: user.id,
      expiresAt,
    },
  });
  await redis.set(`session:${jti}`, '1', { EX: SESSION_TTL_SECONDS });
  return token;
}

export async function revokeSession({ prisma, redis, jti }) {
  await redis.del(`session:${jti}`);
  await prisma.session.updateMany({ where: { jti }, data: { revoked: true } });
}
