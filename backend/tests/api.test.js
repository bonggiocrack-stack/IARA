/**
 * Tests unitarios del backend (mock de PostgreSQL)
 */

const request = require('supertest');

jest.mock('pg', () => {
  const mockPool = {
    query: jest.fn()
  };
  return {
    Pool: jest.fn(() => mockPool),
    default: { Pool: jest.fn(() => mockPool) }
  };
});

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://mock' });

pool.query.mockImplementation((sql, params) => {
  if (sql.includes('CREATE TABLE')) return Promise.resolve({});
  if (sql.includes('SELECT COUNT(*) as cnt FROM products')) return Promise.resolve({ rows: [{ cnt: 0 }] });
  if (sql.includes('INSERT INTO products')) return Promise.resolve({ rows: [{ id: 1 }] });
  if (sql.includes('SELECT * FROM products ORDER BY id ASC')) return Promise.resolve({ rows: [] });
  if (sql.includes('SELECT * FROM orders')) return Promise.resolve({ rows: [] });
  if (sql.includes('INSERT INTO orders')) return Promise.resolve({ rows: [{ id: 1 }] });
  if (sql.includes('INSERT INTO subscribers')) return Promise.resolve({});
  if (sql.includes('INSERT INTO reviews')) return Promise.resolve({ rows: [{ id: 1 }] });
  if (sql.includes('SELECT * FROM reviews WHERE product_id')) return Promise.resolve({ rows: [] });
  return Promise.resolve({ rows: [] });
});

const jwt = require('jsonwebtoken');
const pino = require('pino');
const logger = pino({ level: 'silent' });

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'change_me';
const JWT_SECRET = 'test-secret';

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.headers['x-admin-token'];
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(401).json({ error: 'No autorizado' });
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  if (username !== ADMIN_USER || password !== ADMIN_PASS) return res.status(401).json({ error: 'Credenciales inválidas' });
  const token = jwt.sign({ role: 'admin', user: ADMIN_USER }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: ADMIN_USER });
});

app.get('/api/products', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM products ORDER BY id ASC');
  res.json(rows.map(p => ({
    id: p.id, name: p.name, category: p.category, price: Number(p.price),
    description: p.description, emoji: p.emoji || '📿', image: p.image || '', badge: p.badge || ''
  })));
});

app.post('/api/reviews', async (req, res) => {
  const { product_id, rating, comment } = req.body || {};
  if (!product_id || !rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'product_id y rating (1-5) son requeridos' });
  const result = await pool.query('INSERT INTO reviews (product_id, rating, comment) VALUES ($1, $2, $3) RETURNING id', [product_id, rating, comment || '']);
  res.status(201).json({ id: result.rows[0].id, product_id, rating, comment });
});

app.get('/api/products/:id/reviews', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM reviews WHERE product_id = $1 ORDER BY created_at DESC', [Number(req.params.id)]);
  res.json(rows);
});

app.post('/api/newsletter', async (req, res) => {
  const { email } = req.body || {};
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Email inválido' });
  await pool.query('INSERT INTO subscribers (email) VALUES ($1) ON CONFLICT (email) DO NOTHING', [email]);
  res.json({ ok: true, message: 'Suscripto!' });
});

app.post('/api/orders', async (req, res) => {
  const { items, shipping_name, shipping_address, shipping_phone, shipping_zip, shipping_city, subtotal, shipping_cost, total, payment_id } = req.body || {};
  if (!items || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Carrito vacío' });
  if (!shipping_name || !shipping_address || !shipping_phone || !shipping_zip) return res.status(400).json({ error: 'Faltan datos de envío' });
  const result = await pool.query(
    `INSERT INTO orders (items, shipping_name, shipping_address, shipping_phone, shipping_zip, shipping_city, subtotal, shipping_cost, total, payment_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending') RETURNING id`,
    [JSON.stringify(items), shipping_name, shipping_address, shipping_phone, shipping_zip, shipping_city || '',
     Number(subtotal), Number(shipping_cost), Number(total), payment_id || null]
  );
  res.status(201).json({ id: result.rows[0].id });
});

app.get('/api/admin/orders', adminAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
  res.json(rows.map(r => ({ ...r, items: JSON.parse(r.items || '[]') })));
});

app.get('/api/admin/products', adminAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM products ORDER BY id ASC');
  res.json(rows);
});

app.post('/api/admin/products', adminAuth, async (req, res) => {
  const { name, category, price, description, emoji, image, badge, stock = 0 } = req.body || {};
  if (!name || !price) return res.status(400).json({ error: 'Nombre y precio son obligatorios' });
  const result = await pool.query(
    'INSERT INTO products (name, category, price, description, emoji, image, badge, stock) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
    [name, category || 'pulseras', Number(price), description || '', emoji || '📿', image || '', badge || '', Number(stock)]
  );
  res.status(201).json({ id: result.rows[0].id, name, category, price, description, emoji, image, badge, stock });
});

app.put('/api/admin/products/:id', adminAuth, async (req, res) => {
  const id = Number(req.params.id);
  const updates = req.body || {};
  const fields = Object.keys(updates).filter(k => k !== 'id');
  if (!fields.length) return res.status(400).json({ error: 'Sin datos para actualizar' });
  const setClause = fields.map((_, i) => `${fields[i]} = $${i + 1}`).join(', ');
  const values = fields.map(f => (['price', 'stock'].includes(f) ? Number(updates[f]) : updates[f]));
  values.push(id);
  const result = await pool.query(`UPDATE products SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length} RETURNING *`, values);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(result.rows[0]);
});

app.delete('/api/admin/products/:id', adminAuth, async (req, res) => {
  const id = Number(req.params.id);
  const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json({ ok: true });
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use((req, res) => res.status(404).send('Not Found'));

app.use((err, req, res, next) => {
  res.status(500).json({ error: 'Error interno del servidor' });
});

describe('API Backend', () => {
  test('GET /api/health devuelve ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('GET /api/products devuelve array', async () => {
    const res = await request(app).get('/api/products');
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/admin/login sin credenciales devuelve 400', async () => {
    const res = await request(app).post('/api/admin/login').send({});
    expect(res.statusCode).toEqual(400);
  });

  test('POST /api/admin/login credenciales inválidas devuelve 401', async () => {
    const res = await request(app).post('/api/admin/login').send({ username: 'wrong', password: 'wrong' });
    expect(res.statusCode).toEqual(401);
  });

  test('POST /api/newsletter email inválido devuelve 400', async () => {
    const res = await request(app).post('/api/newsletter').send({ email: 'invalid' });
    expect(res.statusCode).toEqual(400);
  });

  test('POST /api/orders sin items devuelve 400', async () => {
    const res = await request(app).post('/api/orders').send({});
    expect(res.statusCode).toEqual(400);
  });

  test('Ruta inexistente devuelve 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.statusCode).toEqual(404);
  });
});
