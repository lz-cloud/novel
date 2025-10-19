import express from 'express';
import bcrypt from 'bcryptjs';
import { authenticateJWT, generateJwtAndSession, revokeSession } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    if (!email || !username || !password) return res.status(400).json({ error: 'Missing fields' });

    const existing = await req.prisma.user.findFirst({ where: { OR: [{ email }, { username }] } });
    if (existing) return res.status(409).json({ error: 'Email or username already exists' });

    const hash = await bcrypt.hash(password, 10);
    const user = await req.prisma.user.create({
      data: { email, username, passwordHash: hash },
      select: { id: true, email: true, username: true, role: true, createdAt: true },
    });
    res.status(201).json(user);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login (email or username)
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body; // identifier can be email or username
    if (!identifier || !password) return res.status(400).json({ error: 'Missing fields' });

    const user = await req.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
    });
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.isDisabled) return res.status(403).json({ error: 'Account disabled' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = await generateJwtAndSession({ prisma: req.prisma, redis: req.redis, user });
    res.json({ token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout
router.post('/logout', authenticateJWT(true), async (req, res) => {
  try {
    const jti = req.user?.jti;
    if (jti) await revokeSession({ prisma: req.prisma, redis: req.redis, jti });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Me
router.get('/me', authenticateJWT(true), async (req, res) => {
  const user = await req.prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, email: true, username: true, role: true, createdAt: true },
  });
  res.json(user);
});

// Bookmarks of current user
router.get('/me/bookmarks', authenticateJWT(true), async (req, res) => {
  const bookmarks = await req.prisma.bookmark.findMany({
    where: { userId: req.user.id },
    include: { novel: { select: { id: true, title: true, coverUrl: true } } },
  });
  res.json(bookmarks);
});

// Request password reset (returns token for demo; in production, email it)
router.post('/request-reset', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const user = await req.prisma.user.findUnique({ where: { email } });
  if (!user) return res.json({ success: true });
  const token = uuidv4();
  await req.redis.set(`pwdreset:${token}`, String(user.id), { EX: 60 * 15 });
  res.json({ token });
});

// Reset password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Missing fields' });
  const userId = await req.redis.get(`pwdreset:${token}`);
  if (!userId) return res.status(400).json({ error: 'Invalid or expired token' });
  const hash = await bcrypt.hash(password, 10);
  await req.prisma.user.update({ where: { id: Number(userId) }, data: { passwordHash: hash } });
  await req.redis.del(`pwdreset:${token}`);
  res.json({ success: true });
});

// Admin: list users
router.get('/users', authenticateJWT(true), requireAdmin, async (req, res) => {
  const users = await req.prisma.user.findMany({ select: { id: true, email: true, username: true, role: true, isDisabled: true, createdAt: true } });
  res.json(users);
});

// Admin: disable/enable user
router.put('/users/:id/disable', authenticateJWT(true), requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { disable } = req.body;
  const user = await req.prisma.user.update({ where: { id }, data: { isDisabled: Boolean(disable) } });
  res.json({ id: user.id, isDisabled: user.isDisabled });
});

// Admin: change role
router.put('/users/:id/role', authenticateJWT(true), requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { role } = req.body; // 'USER' | 'ADMIN'
  if (!['USER', 'ADMIN'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const user = await req.prisma.user.update({ where: { id }, data: { role } });
  res.json({ id: user.id, role: user.role });
});

export default router;
