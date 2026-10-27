import express from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const token = jwt.sign({ email, role: 'admin' }, env.JWT_SECRET, { expiresIn: '8h' });

  return res.json({
    token,
    user: { email, role: 'admin' },
  });
});

router.post('/register', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const token = jwt.sign({ email, role: 'admin' }, env.JWT_SECRET, { expiresIn: '8h' });

  return res.json({
    token,
    user: { email, role: 'admin' },
  });
});

router.get('/gmail/connect', (_req, res) => {
  res.json({
    message: 'Register a Gmail OAuth client and redirect the user to Google authorization.',
    redirectUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  });
});

router.get('/gmail/callback', (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ message: 'Missing Google OAuth code.' });
  }

  return res.json({ message: 'Gmail OAuth callback received successfully.', code });
});

router.get('/gmail/status', (_req, res) => {
  res.json({ connected: false, message: 'Configure OAuth credentials to enable Gmail tracking.' });
});

export default router;
