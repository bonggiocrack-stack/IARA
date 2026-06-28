const helmet = require('helmet');
const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const pino = require('pino');
const { Pool } = require('pg');

dotenv.config();

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change_me_in_production';

app.use(helmet());
const allowedOrigin = process.env.ALLOWED_ORIGIN;
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()) : [];
const corsOptions = allowedOrigins.length
  ? { origin: allowedOrigins, credentials: true, methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }
  : allowedOrigin
    ? { origin: allowedOrigin, credentials: true, methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }
    : { origin: '*', credentials: true, methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] };
app.use(cors(corsOptions));
let server;

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 5;

function rateLimitMiddleware(req, res, next) {
  const key = req.ip;
  const now = Date.now();
  const record = rateLimitMap.get(key);
  if (!record || now - record.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { start: now, count: 1 });
    return next();
  }
  if (record.count >= RATE_LIMIT_MAX) {
    logger.warn({ ip: key, path: req.path }, 'rate_limit_exceeded');
    return res.status(429).json({ error: 'Demasiados intentos. Intentá más tarde.' });
  }
  record.count += 1;
  next();
}

app.use(express.json());

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.headers['x-admin-token'];
  if (!token) {
    logger.warn({ ip: req.ip, path: req.path }, 'auth_missing_token');
    return res.status(401).json({ error: 'No autorizado' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      logger.warn({ ip: req.ip, path: req.path }, 'auth_invalid_role');
      return res.status(401).json({ error: 'No autorizado' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    logger.warn({ ip: req.ip, path: req.path, error: err.message }, 'auth_invalid_token');
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

const ADMIN_USER = process.env.ADMIN_USER || 'iara';
const ADMIN_PASS = process.env.ADMIN_PASS || 'pulseras2026';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 2000,
  idleTimeoutMillis: 5000
});

const useLocalFallback = !process.env.DATABASE_URL || process.env.DATABASE_URL.includes('user:password@localhost');
let localProducts = [];
let localTestimonials = [];
let localSiteTexts = {};
let nextProductId = 1;
let nextTestimonialId = 1;

async function initDB() {
  if (useLocalFallback) {
    logger.warn('Usando modo local (sin PostgreSQL) — los datos se guardan en memoria');
    try {
      const productsPath = path.join(__dirname, '..', 'products.json');
      if (fs.existsSync(productsPath)) {
        const data = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));
        localProducts = (Array.isArray(data) ? data : []).map((p, idx) => ({
          ...p,
          id: p.id ?? idx + 1,
          price: Number(p.price || 0)
        }));
        nextProductId = localProducts.reduce((max, p) => Math.max(max, p.id || 0), 0) + 1;
      }
    } catch (e) {
      logger.warn({ error: e.message }, 'local_products_load_failed');
    }
    logger.info('local_mode_initialized');
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT DEFAULT 'pulseras',
        price REAL NOT NULL,
        description TEXT DEFAULT '',
        emoji TEXT DEFAULT '📿',
        image TEXT DEFAULT '',
        badge TEXT DEFAULT '',
        stock INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        items JSONB NOT NULL,
        shipping_name TEXT NOT NULL,
        shipping_address TEXT NOT NULL,
        shipping_phone TEXT NOT NULL,
        shipping_zip TEXT NOT NULL,
        shipping_city TEXT DEFAULT '',
        subtotal REAL NOT NULL,
        shipping_cost REAL NOT NULL,
        total REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        payment_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscribers (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_texts (
        id SERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        value TEXT DEFAULT '',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS testimonials (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        comment TEXT NOT NULL,
        rating INTEGER DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
        image TEXT DEFAULT '',
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    logger.info('database_initialized');
  } catch (err) {
    logger.error({ error: err.message }, 'database_init_failed');
    throw err;
  }
}
initDB();

if (!useLocalFallback) {
  migrateProductsFromJson();
}

app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.options('/api/*', cors(corsOptions));

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    logger.warn({ ip: req.ip, username }, 'login_failed');
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  const token = jwt.sign({ role: 'admin', user: ADMIN_USER }, JWT_SECRET, { expiresIn: '8h' });
  logger.info({ ip: req.ip, username }, 'login_success');
  res.json({ token, user: ADMIN_USER });
});

app.get('/api/products', async (req, res) => {
  try {
    if (useLocalFallback) {
      return res.json(localProducts.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        price: Number(p.price),
        description: p.description,
        emoji: p.emoji || '📿',
        image: p.image || '',
        badge: p.badge || ''
      })));
    }
    const { rows } = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(rows.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      price: Number(p.price),
      description: p.description,
      emoji: p.emoji || '📿',
      image: p.image || '',
      badge: p.badge || ''
    })));
  } catch (err) {
    logger.error({ error: err.message }, 'db_error');
    res.status(500).json({ error: err.message });
  }
});

if (false) {
  app.get('/api/products', async (req, res) => {
    try {
      res.json(localProducts.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        price: Number(p.price),
        description: p.description,
        emoji: p.emoji || '📿',
        image: p.image || '',
        badge: p.badge || ''
      })));
    } catch (err) {
      logger.error({ error: err.message }, 'db_error');
      res.status(500).json({ error: err.message });
    }
  });
}

app.post('/api/reviews', async (req, res) => {
  const { product_id, rating, comment } = req.body || {};
  if (!product_id || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'product_id y rating (1-5) son requeridos' });
  }
  try {
    const result = await pool.query('INSERT INTO reviews (product_id, rating, comment) VALUES ($1, $2, $3) RETURNING id', [product_id, rating, comment || '']);
    logger.info({ reviewId: result.rows[0].id, productId: product_id, rating }, 'review_created');
    res.status(201).json({ id: result.rows[0].id, product_id, rating, comment });
  } catch (err) {
    logger.error({ error: err.message }, 'review_insert_error');
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/:id/reviews', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query('SELECT * FROM reviews WHERE product_id = $1 ORDER BY created_at DESC', [id]);
    res.json(rows);
  } catch (err) {
    logger.error({ error: err.message }, 'db_error');
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/newsletter', async (req, res) => {
  const { email } = req.body || {};
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Email inválido' });
  try {
    await pool.query('INSERT INTO subscribers (email) VALUES ($1) ON CONFLICT (email) DO NOTHING', [email]);
    logger.info({ email }, 'newsletter_signup');
    res.json({ ok: true, message: 'Suscripto!' });
  } catch (err) {
    logger.error({ error: err.message }, 'newsletter_error');
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', async (req, res) => {
  const { items, shipping_name, shipping_address, shipping_phone, shipping_zip, shipping_city, subtotal, shipping_cost, total, payment_id } = req.body || {};
  if (!items || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Carrito vacío' });
  if (!shipping_name || !shipping_address || !shipping_phone || !shipping_zip) {
    return res.status(400).json({ error: 'Faltan datos de envío' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO orders (items, shipping_name, shipping_address, shipping_phone, shipping_zip, shipping_city, subtotal, shipping_cost, total, payment_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending') RETURNING id`,
      [JSON.stringify(items), shipping_name, shipping_address, shipping_phone, shipping_zip, shipping_city || '',
       Number(subtotal), Number(shipping_cost), Number(total), payment_id || null]
    );
    logger.info({ orderId: result.rows[0].id, total, itemsCount: items.length }, 'order_created');
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    logger.error({ error: err.message }, 'order_create_error');
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/orders', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    res.json(rows.map(r => ({ ...r, items: JSON.parse(r.items || '[]') })));
  } catch (err) {
    logger.error({ error: err.message }, 'db_error');
    res.status(500).json({ error: err.message });
  }
});

if (useLocalFallback) {
  app.get('/api/admin/products', adminAuth, async (req, res) => {
    try {
      res.json(localProducts);
    } catch (err) {
      logger.error({ error: err.message }, 'db_error');
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/products', adminAuth, async (req, res) => {
    const { name, category, price, description, emoji, image, badge, stock = 0 } = req.body || {};
    if (!name || !price) return res.status(400).json({ error: 'Nombre y precio son obligatorios' });
    try {
      const product = { id: nextProductId++, name, category: category || 'pulseras', price: Number(price), description: description || '', emoji: emoji || '📿', image: image || '', badge: badge || '', stock: Number(stock) };
      localProducts.push(product);
      logger.info({ productId: product.id, name, price }, 'product_created');
      res.status(201).json(product);
    } catch (err) {
      logger.error({ error: err.message }, 'db_insert_error');
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/admin/products/:id', adminAuth, async (req, res) => {
    const id = Number(req.params.id);
    const updates = req.body || {};
    const fields = Object.keys(updates).filter(k => k !== 'id');
    if (!fields.length) return res.status(400).json({ error: 'Sin datos para actualizar' });
    try {
      const idx = localProducts.findIndex(p => p.id === id);
      if (idx === -1) return res.status(404).json({ error: 'Producto no encontrado' });
      const updated = { ...localProducts[idx], ...updates };
      if (updates.price !== undefined) updated.price = Number(updates.price);
      if (updates.stock !== undefined) updated.stock = Number(updates.stock);
      localProducts[idx] = updated;
      logger.info({ productId: id, fields }, 'product_updated');
      res.json(updated);
    } catch (err) {
      logger.error({ error: err.message }, 'db_update_error');
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/admin/products/:id', adminAuth, async (req, res) => {
    const id = Number(req.params.id);
    try {
      const idx = localProducts.findIndex(p => p.id === id);
      if (idx === -1) return res.status(404).json({ error: 'Producto no encontrado' });
      localProducts.splice(idx, 1);
      logger.info({ productId: id }, 'product_deleted');
      res.json({ ok: true });
    } catch (err) {
      logger.error({ error: err.message }, 'db_delete_error');
      res.status(500).json({ error: err.message });
    }
  });
}

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

async function uploadToCloudinary(localPath) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const cloudinaryUrl = process.env.CLOUDINARY_URL;
  if (!cloudName && !cloudinaryUrl) return null;
  try {
    const cloudinary = require('cloudinary').v2;
    if (!cloudinary.config().cloud_name) {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    }
    const result = await cloudinary.uploader.upload(localPath, { folder: 'artesania-gualeguay' });
    logger.info({ publicId: result.public_id }, 'image_uploaded_to_cloudinary');
    return result.secure_url;
  } catch (err) {
    logger.error({ error: err.message }, 'cloudinary_upload_failed');
    return null;
  }
}

app.post('/api/admin/upload', adminAuth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });
  const localUrl = `/uploads/products/${req.file.filename}`;
  try {
    const cloudUrl = await uploadToCloudinary(req.file.path);
    logger.info({ filename: req.file.filename, cloudUrl }, 'upload_success');
    res.json({ url: cloudUrl || localUrl, localUrl, filename: req.file.filename });
  } catch (err) {
    logger.error({ error: err.message }, 'upload_error');
    res.json({ url: localUrl, localUrl, filename: req.file.filename });
  }
});

app.get('/api/site-texts', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM site_texts');
    const map = {};
    rows.forEach(r => { map[r.key] = r.value; });
    res.json(map);
  } catch (err) {
    logger.error({ error: err.message }, 'db_error');
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/site-texts', adminAuth, async (req, res) => {
  const { key, value } = req.body || {};
  if (!key || value === undefined) return res.status(400).json({ error: 'key y value son requeridos' });
  try {
    await pool.query('INSERT INTO site_texts (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP', [key, value]);
    logger.info({ key }, 'site_text_updated');
    res.json({ ok: true });
  } catch (err) {
    logger.error({ error: err.message }, 'db_error');
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/site-texts', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM site_texts');
    const map = {};
    rows.forEach(r => { map[r.key] = r.value; });
    res.json(map);
  } catch (err) {
    logger.error({ error: err.message }, 'db_error');
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/testimonials', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM testimonials WHERE active = TRUE ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    logger.error({ error: err.message }, 'db_error');
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/testimonials', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM testimonials ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    logger.error({ error: err.message }, 'db_error');
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/testimonials', adminAuth, async (req, res) => {
  const { name, comment, rating = 5, image = '', active = true } = req.body || {};
  if (!name || !comment) return res.status(400).json({ error: 'Nombre y comentario son requeridos' });
  try {
    const result = await pool.query('INSERT INTO testimonials (name, comment, rating, image, active) VALUES ($1, $2, $3, $4, $5) RETURNING *', [name, comment, Number(rating), image, active]);
    logger.info({ testimonialId: result.rows[0].id, name }, 'testimonial_created');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error({ error: err.message }, 'db_error');
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/testimonials/:id', adminAuth, async (req, res) => {
  const id = Number(req.params.id);
  const updates = req.body || {};
  const fields = Object.keys(updates).filter(k => k !== 'id');
  if (!fields.length) return res.status(400).json({ error: 'Sin datos para actualizar' });
  const setClause = fields.map((_, i) => `${fields[i]} = $${i + 1}`).join(', ');
  const values = fields.map(f => (['rating'].includes(f) ? Number(updates[f]) : updates[f]));
  values.push(id);
  try {
    const result = await pool.query(`UPDATE testimonials SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length} RETURNING *`, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Testimonio no encontrado' });
    logger.info({ testimonialId: id, fields }, 'testimonial_updated');
    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ error: err.message }, 'db_error');
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/testimonials/:id', adminAuth, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const result = await pool.query('DELETE FROM testimonials WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Testimonio no encontrado' });
    logger.info({ testimonialId: id }, 'testimonial_deleted');
    res.json({ ok: true });
  } catch (err) {
    logger.error({ error: err.message }, 'db_delete_error');
    res.status(500).json({ error: err.message });
  }
});

if (useLocalFallback) {
  app.get('/api/admin/site-texts', adminAuth, async (req, res) => {
    try {
      res.json(localSiteTexts);
    } catch (err) {
      logger.error({ error: err.message }, 'db_error');
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/admin/site-texts', adminAuth, async (req, res) => {
    const { key, value } = req.body || {};
    if (!key || value === undefined) return res.status(400).json({ error: 'key y value son requeridos' });
    try {
      localSiteTexts[key] = value;
      logger.info({ key }, 'site_text_updated');
      res.json({ ok: true });
    } catch (err) {
      logger.error({ error: err.message }, 'db_error');
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/testimonials', async (req, res) => {
    try {
      res.json(localTestimonials.filter(t => t.active).sort((a, b) => b.id - a.id));
    } catch (err) {
      logger.error({ error: err.message }, 'db_error');
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/testimonials', adminAuth, async (req, res) => {
    try {
      res.json(localTestimonials.sort((a, b) => b.id - a.id));
    } catch (err) {
      logger.error({ error: err.message }, 'db_error');
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/testimonials', adminAuth, async (req, res) => {
    const { name, comment, rating = 5, image = '', active = true } = req.body || {};
    if (!name || !comment) return res.status(400).json({ error: 'Nombre y comentario son requeridos' });
    try {
      const testimonial = { id: nextTestimonialId++, name, comment, rating: Number(rating), image, active };
      localTestimonials.push(testimonial);
      logger.info({ testimonialId: testimonial.id, name }, 'testimonial_created');
      res.status(201).json(testimonial);
    } catch (err) {
      logger.error({ error: err.message }, 'db_error');
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/admin/testimonials/:id', adminAuth, async (req, res) => {
    const id = Number(req.params.id);
    const updates = req.body || {};
    const fields = Object.keys(updates).filter(k => k !== 'id');
    if (!fields.length) return res.status(400).json({ error: 'Sin datos para actualizar' });
    try {
      const idx = localTestimonials.findIndex(t => t.id === id);
      if (idx === -1) return res.status(404).json({ error: 'Testimonio no encontrado' });
      localTestimonials[idx] = { ...localTestimonials[idx], ...updates };
      if (updates.rating !== undefined) localTestimonials[idx].rating = Number(updates.rating);
      logger.info({ testimonialId: id, fields }, 'testimonial_updated');
      res.json(localTestimonials[idx]);
    } catch (err) {
      logger.error({ error: err.message }, 'db_update_error');
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/admin/testimonials/:id', adminAuth, async (req, res) => {
    const id = Number(req.params.id);
    try {
      const idx = localTestimonials.findIndex(t => t.id === id);
      if (idx === -1) return res.status(404).json({ error: 'Testimonio no encontrado' });
      localTestimonials.splice(idx, 1);
      logger.info({ testimonialId: id }, 'testimonial_deleted');
      res.json({ ok: true });
    } catch (err) {
      logger.error({ error: err.message }, 'db_delete_error');
      res.status(500).json({ error: err.message });
    }
  });
}

app.get('/api/admin/site-texts', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM site_texts');
    const map = {};
    rows.forEach(r => { map[r.key] = r.value; });
    res.json(map);
  } catch (err) {
    logger.error({ error: err.message }, 'db_error');
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/testimonials', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM testimonials WHERE active = TRUE ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    logger.error({ error: err.message }, 'db_error');
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/testimonials', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM testimonials ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    logger.error({ error: err.message }, 'db_error');
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/testimonials', adminAuth, async (req, res) => {
  const { name, comment, rating = 5, image = '', active = true } = req.body || {};
  if (!name || !comment) return res.status(400).json({ error: 'Nombre y comentario son requeridos' });
  try {
    const result = await pool.query('INSERT INTO testimonials (name, comment, rating, image, active) VALUES ($1, $2, $3, $4, $5) RETURNING *', [name, comment, Number(rating), image, active]);
    logger.info({ testimonialId: result.rows[0].id, name }, 'testimonial_created');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error({ error: err.message }, 'db_error');
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/testimonials/:id', adminAuth, async (req, res) => {
  const id = Number(req.params.id);
  const updates = req.body || {};
  const fields = Object.keys(updates).filter(k => k !== 'id');
  if (!fields.length) return res.status(400).json({ error: 'Sin datos para actualizar' });
  const setClause = fields.map((_, i) => `${fields[i]} = $${i + 1}`).join(', ');
  const values = fields.map(f => (['rating'].includes(f) ? Number(updates[f]) : updates[f]));
  values.push(id);
  try {
    const result = await pool.query(`UPDATE testimonials SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length} RETURNING *`, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Testimonio no encontrado' });
    logger.info({ testimonialId: id, fields }, 'testimonial_updated');
    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ error: err.message }, 'db_error');
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/testimonials/:id', adminAuth, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const result = await pool.query('DELETE FROM testimonials WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Testimonio no encontrado' });
    logger.info({ testimonialId: id }, 'testimonial_deleted');
    res.json({ ok: true });
  } catch (err) {
    logger.error({ error: err.message }, 'db_error');
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/create-preference', rateLimitMiddleware, async (req, res) => {
  try {
    const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    if (!MP_ACCESS_TOKEN) return res.status(500).json({ error: 'Falta MP_ACCESS_TOKEN en .env' });
    const { items = [], payer = {}, back_urls = {}, external_reference, auto_return, shipment } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'El carrito está vacío' });
    const placeholders = items.map((_item, idx) => '$' + (idx + 1));
    const names = items.map(i => i.title);
    const { rows } = await pool.query(`SELECT name, price FROM products WHERE name IN (${placeholders.join(',')})`, names);
    const priceMap = {};
    rows.forEach(p => { priceMap[p.name] = p.price; });
    for (const it of items) {
      const expected = priceMap[it.title];
      if (expected === undefined || Number(it.unit_price) !== expected) {
        logger.warn({ title: it.title, unitPrice: it.unit_price }, 'invalid_price_attempt');
        return res.status(400).json({ error: 'Precio inválido para ' + it.title });
      }
    }
    createMercadoPagoPreference(req, res, { MP_ACCESS_TOKEN, items, payer, back_urls, external_reference, auto_return, shipment });
  } catch (err) {
    logger.error({ error: err.message }, 'create_preference_error');
    res.status(500).json({ error: err.message || 'Error interno' });
  }
});

async function createMercadoPagoPreference(req, res, ctx) {
  try {
    const MercadoPago = require('mercadopago');
    const client = new MercadoPago({ accessToken: ctx.MP_ACCESS_TOKEN });
    const preference = {
      items: ctx.items.map((it) => ({
        title: it.title,
        unit_price: Number(it.unit_price),
        quantity: Number(it.quantity),
        currency_id: it.currency_id || 'ARS',
        description: it.description
      })),
      payer: { name: ctx.payer.name, email: ctx.payer.email },
      external_reference: ctx.external_reference,
      back_urls: ctx.back_urls,
      auto_return: ctx.auto_return || 'approved',
      shipment: ctx.shipment
    };
    const response = await client.preferences.create(preference);
    const body = response && response.body ? response.body : response;
    if (!body || !body.init_point) {
      logger.error('mp_preference_failed', 'No se pudo crear la preferencia');
      return res.status(500).json({ error: 'No se pudo crear la preferencia' });
    }
    logger.info({ preferenceId: body.id }, 'mp_preference_created');
    res.json({ init_point: body.init_point, id: body.id });
  } catch (err) {
    logger.error({ error: err.message }, 'mp_error');
    res.status(500).json({ error: err.message || 'Error interno' });
  }
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use((req, res) => {
  logger.warn({ path: req.path, method: req.method }, 'not_found');
  res.status(404).send('Not Found');
});

app.use((err, req, res, next) => {
  logger.error({ error: err.message, stack: err.stack }, 'unhandled_error');
  res.status(500).json({ error: 'Error interno del servidor' });
});

server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'backend_started');
  console.log(`Backend escuchando en http://localhost:${PORT}`);
});

if (process.env.VERCEL) {
  module.exports = app;
}

module.exports = { app, close: () => server && server.close() };
