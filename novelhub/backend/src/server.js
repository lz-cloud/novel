import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';

import authRoutes from './routes/auth.js';
import novelRoutes from './routes/novels.js';
import chapterRoutes from './routes/chapters.js';

// Env
dotenv.config();

const app = express();
const prisma = new PrismaClient();

// Redis client
const redis = createClient({ url: process.env.REDIS_URL });
redis.on('error', (err) => console.error('Redis Client Error', err));
await redis.connect();

// Security & parsing middleware
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  cors({
    origin: (origin, cb) => cb(null, true),
    credentials: true,
  })
);

const limiter = rateLimit({ windowMs: 60 * 1000, max: 300 });
app.use(limiter);

// Attach db/cache to req
app.use((req, _res, next) => {
  req.prisma = prisma;
  req.redis = redis;
  next();
});

// Passport OAuth strategies
const FRONTEND_URL = process.env.FRONTEND_URL || process.env.PUBLIC_URL || 'http://localhost:8080';
const JWT_REDIRECT = `${FRONTEND_URL}/oauth/callback`;

if (process.env.OAUTH_GITHUB_CLIENT_ID && process.env.OAUTH_GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.OAUTH_GITHUB_CLIENT_ID,
        clientSecret: process.env.OAUTH_GITHUB_CLIENT_SECRET,
        callbackURL: process.env.OAUTH_GITHUB_CALLBACK_URL || `${FRONTEND_URL}/api/auth/github/callback`,
        scope: ['user:email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await prisma.user.findUnique({ where: { githubId: profile.id } });
          if (!user) {
            const email = profile.emails?.[0]?.value || `gh_${profile.id}@novelhub.local`;
            const username = profile.username || `gh_${profile.id}`;
            user = await prisma.user.upsert({
              where: { email },
              update: { githubId: profile.id },
              create: {
                email,
                username,
                githubId: profile.id,
              },
            });
          }
          done(null, user);
        } catch (e) {
          done(e);
        }
      }
    )
  );
}

if (process.env.OAUTH_GOOGLE_CLIENT_ID && process.env.OAUTH_GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.OAUTH_GOOGLE_CLIENT_ID,
        clientSecret: process.env.OAUTH_GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.OAUTH_GOOGLE_CALLBACK_URL || `${FRONTEND_URL}/api/auth/google/callback`,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          let user = await prisma.user.findUnique({ where: { googleId: profile.id } });
          if (!user) {
            const email = profile.emails?.[0]?.value || `gg_${profile.id}@novelhub.local`;
            const username = profile.displayName?.replace(/\s+/g, '_').toLowerCase() || `gg_${profile.id}`;
            user = await prisma.user.upsert({
              where: { email },
              update: { googleId: profile.id },
              create: {
                email,
                username,
                googleId: profile.id,
              },
            });
          }
          done(null, user);
        } catch (e) {
          done(e);
        }
      }
    )
  );
}

app.use(passport.initialize());

// Health endpoint
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// OAuth routes
import { generateJwtAndSession } from './middleware/auth.js';

if (passport._strategies.github) {
  app.get('/api/auth/github', passport.authenticate('github', { session: false }));
  app.get(
    '/api/auth/github/callback',
    passport.authenticate('github', { failureRedirect: `${FRONTEND_URL}/login?error=github`, session: false }),
    async (req, res) => {
      const user = req.user;
      const token = await generateJwtAndSession({ prisma, redis, user });
      const redirect = `${JWT_REDIRECT}?token=${token}`;
      res.redirect(redirect);
    }
  );
}

if (passport._strategies.google) {
  app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
  app.get(
    '/api/auth/google/callback',
    passport.authenticate('google', { failureRedirect: `${FRONTEND_URL}/login?error=google`, session: false }),
    async (req, res) => {
      const user = req.user;
      const token = await generateJwtAndSession({ prisma, redis, user });
      const redirect = `${JWT_REDIRECT}?token=${token}`;
      res.redirect(redirect);
    }
  );
}

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/novels', novelRoutes);
app.use('/api/chapters', chapterRoutes);

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT_BACKEND || 4000;
app.listen(PORT, () => {
  console.log(`NovelHub backend running on port ${PORT}`);
});
