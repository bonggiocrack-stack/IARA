const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('DATABASE_URL no configurada. Usando modo in-memory.');
}

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.error('Pool error:', err.message);
});

async function query(text, params) {
  if (!connectionString) {
    throw new Error('DATABASE_URL no configurada');
  }
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  console.debug('Query executed', { text, duration, rows: result.rowCount });
  return result;
}

async function initDB() {
  if (!connectionString) return;

  await query(`
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

  await query(`
    CREATE TABLE IF NOT EXISTS site_texts (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT DEFAULT '',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
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

  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      items JSONB NOT NULL,
      total REAL NOT NULL,
      customer JSONB,
      status TEXT DEFAULT 'pending',
      mercadopago_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('Tablas de base de datos inicializadas');
}

module.exports = { query, initDB, pool };
