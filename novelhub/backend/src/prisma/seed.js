import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Admin user
  const adminEmail = 'admin@novelhub.local';
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN' },
    create: {
      email: adminEmail,
      username: 'admin',
      passwordHash: await bcrypt.hash('Admin12345!', 10),
      role: 'ADMIN',
    },
  });

  // Categories
  const categories = [
    { name: 'Fantasy', slug: 'fantasy' },
    { name: 'Sci-Fi', slug: 'sci-fi' },
    { name: 'Romance', slug: 'romance' },
    { name: 'Mystery', slug: 'mystery' },
    { name: 'History', slug: 'history' },
  ];
  for (const cat of categories) {
    await prisma.category.upsert({ where: { slug: cat.slug }, update: {}, create: cat });
  }

  // Sample novel + chapters
  const fantasy = await prisma.category.findUnique({ where: { slug: 'fantasy' } });
  const novel = await prisma.novel.upsert({
    where: { id: 1 },
    update: {},
    create: {
      title: 'The Seeded Saga',
      description: 'An example novel created by the seed script.',
      authorId: admin.id,
      tags: ['example', 'seed'],
      categories: { create: [{ category: { connect: { id: fantasy.id } } }] },
    },
  });

  const ch1 = await prisma.chapter.upsert({
    where: { id: 1 },
    update: {},
    create: {
      title: 'Chapter 1: Awakening',
      content: '<p>This is the beginning of our story...</p>',
      isDraft: false,
      order: 1,
      novelId: novel.id,
    },
  });

  await prisma.chapter.upsert({
    where: { id: 2 },
    update: {},
    create: {
      title: 'Chapter 2: Journey',
      content: '<p>The journey continues...</p>',
      isDraft: false,
      order: 2,
      novelId: novel.id,
    },
  });

  console.log('Seed completed. Admin user:', adminEmail);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
