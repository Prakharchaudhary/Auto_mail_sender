import crypto from 'crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const router = express.Router();

// Slow down password guessing: 10 attempts per 15 minutes per IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Try again in 15 minutes.' },
});

/** Constant-time comparison so response timing doesn't leak how much of the value matched. */
function safeEqual(a, b) {
  const left = crypto.createHash('sha256').update(String(a)).digest();
  const right = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}

router.post('/login', loginLimiter, (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD || !env.JWT_SECRET) {
    return res.status(500).json({ message: 'Admin login is not configured on the server.' });
  }

  const emailOk = safeEqual(email, env.ADMIN_EMAIL);
  const passwordOk = safeEqual(password, env.ADMIN_PASSWORD);
  if (!emailOk || !passwordOk) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const token = jwt.sign({ email, role: 'admin' }, env.JWT_SECRET, { expiresIn: '12h' });
  return res.json({ token, user: { email, role: 'admin' } });
});

// Single-admin app: self-registration is disabled.
router.post('/register', (_req, res) => {
  res.status(403).json({ message: 'Registration is disabled.' });
});

router.get('/gmail/status', (_req, res) => {
  res.json({ connected: false, message: 'Gmail reply tracking is not set up yet.' });
});

export default router;
