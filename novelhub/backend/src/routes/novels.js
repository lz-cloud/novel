import express from 'express';
import { authenticateJWT } from '../middleware/auth.js';

const router = express.Router();

// List novels with filters
router.get('/', async (req, res) => {
  const { q, category, tag, author } = req.query;
  const where = {
    AND: [
      q
        ? {
            OR: [
              { title: { contains: String(q), mode: 'insensitive' } },
              { description: { contains: String(q), mode: 'insensitive' } },
              { author: { username: { contains: String(q), mode: 'insensitive' } } },
            ],
          }
        : {},
      category
        ? { categories: { some: { category: { slug: String(category) } } } }
        : {},
      tag ? { tags: { has: String(tag) } } : {},
      author ? { author: { username: String(author) } } : {},
    ],
  };
  const novels = await req.prisma.novel.findMany({
    where,
    include: { author: { select: { id: true, username: true } }, categories: { include: { category: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(novels);
});

// Get a single novel
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const novel = await req.prisma.novel.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, username: true } },
      categories: { include: { category: true } },
      _count: { select: { chapters: true, bookmarks: true } },
    },
  });
  if (!novel) return res.status(404).json({ error: 'Not found' });
  res.json(novel);
});

// Create a new novel (author only)
router.post('/', authenticateJWT(true), async (req, res) => {
  const { title, coverUrl, description, categoryIds = [], tags = [] } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const data = {
    title,
    coverUrl: coverUrl || null,
    description: description || '',
    authorId: req.user.id,
    tags,
    categories: { create: categoryIds.map((categoryId) => ({ category: { connect: { id: Number(categoryId) } } })) },
  };
  const novel = await req.prisma.novel.create({ data });
  res.status(201).json(novel);
});

// Update a novel (owner or admin)
router.put('/:id', authenticateJWT(true), async (req, res) => {
  const id = Number(req.params.id);
  const novel = await req.prisma.novel.findUnique({ where: { id } });
  if (!novel) return res.status(404).json({ error: 'Not found' });
  const isOwner = novel.authorId === req.user.id;
  const isAdmin = req.user.role === 'ADMIN';
  if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Forbidden' });

  const { title, coverUrl, description, tags } = req.body;
  const updated = await req.prisma.novel.update({
    where: { id },
    data: { title, coverUrl, description, tags },
  });
  res.json(updated);
});

// List chapters of a novel
router.get('/:id/chapters', authenticateJWT(false), async (req, res) => {
  const id = Number(req.params.id);
  const novel = await req.prisma.novel.findUnique({ where: { id } });
  if (!novel) return res.status(404).json({ error: 'Not found' });

  const isOwner = req.user?.id === novel.authorId;
  const where = { novelId: id, ...(isOwner ? {} : { isDraft: false }) };
  const chapters = await req.prisma.chapter.findMany({ where, orderBy: { order: 'asc' } });
  res.json(chapters);
});

// Bookmark toggle
router.post('/:id/bookmark', authenticateJWT(true), async (req, res) => {
  const novelId = Number(req.params.id);
  const exists = await req.prisma.bookmark.findUnique({ where: { userId_novelId: { userId: req.user.id, novelId } } });
  if (exists) {
    await req.prisma.bookmark.delete({ where: { userId_novelId: { userId: req.user.id, novelId } } });
    return res.json({ bookmarked: false });
  }
  await req.prisma.bookmark.create({ data: { userId: req.user.id, novelId } });
  res.json({ bookmarked: true });
});

export default router;
