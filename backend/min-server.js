const express = require('express');
const path = require('path');
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
} catch (e) { console.error('dotenv:', e.message); }

try {
  const pino = require('pino');
  const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
} catch (e) { console.error('pino:', e.message); }

try {
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'change_me_in_production';
  const ADMIN_USER = process.env.ADMIN_USER || 'iara';
  const ADMIN_PASS = process.env.ADMIN_PASS || 'pulseras2026';

  app.post('/api/admin/login', (req, res) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
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

try {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  const useLocalFallback = !process.env.DATABASE_URL || process.env.DATABASE_URL.includes('user:password@localhost');
  let localProducts = [];
  let nextProductId = 1;

  async function initDB() {
    if (useLocalFallback) {
      console.log('local fallback mode');
      return;
    }
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT DEFAULT 'pulseras', price REAL NOT NULL, description TEXT DEFAULT '', emoji TEXT DEFAULT '📿', image TEXT DEFAULT '', badge TEXT DEFAULT '', stock INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
      console.log('products table ready');
    } catch (err) {
      console.error('initDB error:', err.message);
    }
  }
  initDB().catch(e => console.error('initDB uncaught:', e.message));

  app.get('/api/products', async (req, res) => {
    try {
      if (useLocalFallback) return res.json(localProducts);
      const { rows } = await pool.query('SELECT * FROM products ORDER BY id ASC');
      res.json(rows);
    } catch (err) {
      console.error('products error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // adminAuth middleware
  function adminAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.headers['x-admin-token'];
    if (!token) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.role !== 'admin') {
        return res.status(401).json({ error: 'No autorizado' });
      }
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }
  }

  app.get('/api/admin/products', adminAuth, async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM products ORDER BY id ASC');
      res.json(rows);
    } catch (err) {
      console.error('admin products error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/products', adminAuth, async (req, res) => {
    const { name, category, price, description, emoji, image, badge, stock = 0 } = req.body || {};
    if (!name || !price) return res.status(400).json({ error: 'Nombre y precio son obligatorios' });
    try {
      const result = await pool.query(
        'INSERT INTO products (name, category, price, description, emoji, image, badge, stock) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
        [name, category || 'pulseras', Number(price), description || '', emoji || '📿', image || '', badge || '', Number(stock)]
      );
      res.status(201).json({ id: result.rows[0].id, name, category, price, description, emoji, image, badge, stock });
    } catch (err) {
      console.error('create product error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

} catch (e) { console.error('pg:', e.message); }

try {
  const fs = require('fs');
  const multer = require('multer');
  const uploadsDir = path.join(__dirname, '..', 'uploads', 'products');
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}_${safe}`);
    }
  });
  const fileFilter = (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    cb(null, allowed.includes(file.mimetype));
  };
  const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });
  console.log('multer loaded');

  app.post('/api/admin/upload', adminAuth, upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });
    res.json({ url: `/uploads/products/${req.file.filename}`, filename: req.file.filename });
  });
} catch (e) { console.error('multer:', e.message); }

try {
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
  app.use(express.static(path.join(__dirname, '..')));
  console.log('static middleware ready');
} catch (e) { console.error('static:', e.message); }

if (process.env.VERCEL) {
  module.exports = app;
} else {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
}
