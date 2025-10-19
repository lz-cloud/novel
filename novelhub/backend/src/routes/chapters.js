import express from 'express';
import { authenticateJWT } from '../middleware/auth.js';

const router = express.Router();

// Get a chapter
router.get('/:id', authenticateJWT(false), async (req, res) => {
  const id = Number(req.params.id);
  const chapter = await req.prisma.chapter.findUnique({ include: { novel: true }, where: { id } });
  if (!chapter) return res.status(404).json({ error: 'Not found' });
  const isOwner = req.user?.id === chapter.novel.authorId;
  if (chapter.isDraft && !isOwner) return res.status(403).json({ error: 'Forbidden' });
  res.json(chapter);
});

// Create a chapter
router.post('/novel/:novelId', authenticateJWT(true), async (req, res) => {
  const novelId = Number(req.params.novelId);
  const { title, content, isDraft = true } = req.body;
  const novel = await req.prisma.novel.findUnique({ where: { id: novelId } });
  if (!novel) return res.status(404).json({ error: 'Novel not found' });
  if (novel.authorId !== req.user.id && req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });

  const last = await req.prisma.chapter.findFirst({ where: { novelId }, orderBy: { order: 'desc' } });
  const order = (last?.order || 0) + 1;
  const chapter = await req.prisma.chapter.create({
    data: { title, content, isDraft, order, novelId },
  });
  res.status(201).json(chapter);
});

// Update a chapter
router.put('/:id', authenticateJWT(true), async (req, res) => {
  const id = Number(req.params.id);
  const chapter = await req.prisma.chapter.findUnique({ include: { novel: true }, where: { id } });
  if (!chapter) return res.status(404).json({ error: 'Not found' });
  if (chapter.novel.authorId !== req.user.id && req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });

  const { title, content, isDraft } = req.body;
  const updated = await req.prisma.chapter.update({ where: { id }, data: { title, content, isDraft } });
  res.json(updated);
});

export default router;
