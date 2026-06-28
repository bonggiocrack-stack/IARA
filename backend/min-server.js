const express = require('express');
const app = express();
app.use(express.json());
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/debug-env', (req, res) => {
  res.json({
    ADMIN_USER: process.env.ADMIN_USER || 'NOT_SET',
    ADMIN_PASS: process.env.ADMIN_PASS ? '***SET***' : 'NOT_SET',
    JWT_SECRET: process.env.JWT_SECRET ? '***SET***' : 'NOT_SET',
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'NOT_SET',
    ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || 'NOT_SET'
  });
});

try {
  const helmet = require('helmet');
  app.use(helmet());
} catch (e) { console.error('helmet:', e.message); }

try {
  const cors = require('cors');
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
  const corsOptions = allowedOrigins.length
    ? { origin: allowedOrigins, credentials: true, methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }
    : { origin: '*', credentials: true };
  app.use(cors(corsOptions));
} catch (e) { console.error('cors:', e.message); }

try {
  const dotenv = require('dotenv');
  dotenv.config();
} catch (e) { console.error('dotenv:', e.message); }

try {
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'change_me_in_production';
  console.log('jwt loaded, secret length:', JWT_SECRET.length);

  app.post('/api/admin/login', (req, res) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
      const ADMIN_USER = process.env.ADMIN_USER || 'iara';
      const ADMIN_PASS = process.env.ADMIN_PASS || 'pulseras2026';
      if (username !== ADMIN_USER || password !== ADMIN_PASS) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }
      const token = jwt.sign({ role: 'admin', user: ADMIN_USER }, JWT_SECRET, { expiresIn: '8h' });
      res.json({ token, user: ADMIN_USER });
    } catch (err) {
      console.error('login error:', err);
      res.status(500).json({ error: err.message });
    }
  });
} catch (e) { console.error('jwt:', e.message); }

if (process.env.VERCEL) {
  module.exports = app;
} else {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
}
