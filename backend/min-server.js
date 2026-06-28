const express = require('express');
const app = express();
app.use(express.json());
app.get('/api/health', (req, res) => res.json({ ok: true }));

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
  console.log('dotenv loaded, NODE_ENV:', process.env.NODE_ENV);
} catch (e) { console.error('dotenv:', e.message); }

try {
  const pino = require('pino');
  const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
  console.log('pino loaded');
} catch (e) { console.error('pino:', e.message); }

try {
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'change_me_in_production';
  console.log('jwt loaded');
} catch (e) { console.error('jwt:', e.message); }

try {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  console.log('pg pool created');

  const useLocalFallback = !process.env.DATABASE_URL || process.env.DATABASE_URL.includes('user:password@localhost');
  let localProducts = [];
  let localTestimonials = [];
  let localSiteTexts = {};
  let nextProductId = 1;
  let nextTestimonialId = 1;

  async function initDB() {
    if (useLocalFallback) {
      console.log('local fallback mode');
      return;
    }
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT DEFAULT 'pulseras', price REAL NOT NULL)`);
      console.log('products table ready');
    } catch (err) {
      console.error('initDB error:', err.message);
    }
  }
  initDB().catch(e => console.error('initDB uncaught:', e.message));

} catch (e) { console.error('pg init:', e.message); }

// Login endpoint
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  const ADMIN_USER = process.env.ADMIN_USER || 'iara';
  const ADMIN_PASS = process.env.ADMIN_PASS || 'pulseras2026';
  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  const token = jwt.sign({ role: 'admin', user: ADMIN_USER }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: ADMIN_USER });
});

// Static files (simplified)
try {
  const path = require('path');
  const fs = require('fs');
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
  console.log('static middleware ready');
} catch (e) { console.error('static error:', e.message); }

if (process.env.VERCEL) {
  module.exports = app;
} else {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
}
