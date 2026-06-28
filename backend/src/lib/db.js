const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL;
const isLocal = !connectionString;
let db = null;
let pool = null;

if (isLocal) {
  const dbDir = path.join(__dirname, '..', '..', 'data');
  const dbPath = path.join(dbDir, 'iara.db');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  db = new sqlite3.Database(dbPath);
} else {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000
  });

  pool.on('error', (err) => {
    console.error('Pool error:', err.message);
  });
}

function toSqlite(sql) {
  return sql
    .replace(/\$\d+/g, '?')
    .replace(/SERIAL PRIMARY KEY/g, 'INTEGER PRIMARY KEY AUTOINCREMENT')
    .replace(/JSONB/g, 'TEXT')
    .replace(/TIMESTAMP DEFAULT CURRENT_TIMESTAMP/g, 'DATETIME DEFAULT CURRENT_TIMESTAMP')
    .replace(/ON CONFLICT \((.+?)\) DO UPDATE SET/gi, (match, col) => `ON CONFLICT(${col}) DO UPDATE SET`);
}

async function query(text, params) {
  if (isLocal) {
    return new Promise((resolve, reject) => {
      const sql = toSqlite(text);
      const values = params || [];
      db.all(sql, values, (err, rows) => {
        if (err) return reject(err);
        resolve({ rows, rowCount: rows.length });
      });
    });
  }

  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  console.debug('Query executed', { text, duration, rows: result.rowCount });
  return result;
}

async function initDB() {
  if (isLocal) {
    await query(`CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'pulseras',
      price REAL NOT NULL,
      description TEXT DEFAULT '',
      emoji TEXT DEFAULT '📿',
      image TEXT DEFAULT '',
      badge TEXT DEFAULT '',
      stock INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await query(`CREATE TABLE IF NOT EXISTS site_texts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await query(`CREATE TABLE IF NOT EXISTS testimonials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      comment TEXT NOT NULL,
      rating INTEGER DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
      image TEXT DEFAULT '',
      active BOOLEAN DEFAULT TRUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await query(`CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      items TEXT NOT NULL,
      total REAL NOT NULL,
      customer TEXT,
      status TEXT DEFAULT 'pending',
      mercadopago_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await query(`CREATE TABLE IF NOT EXISTS subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await query(`CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log('Tablas de base de datos inicializadas (SQLite)');
    await query(`INSERT OR IGNORE INTO site_texts (key, value) VALUES ('about_text', 'Cada pieza es artesanal y única, hecha con amor y dedicación en Gualeguay, Entre Ríos.')`);
    await query(`INSERT OR IGNORE INTO site_texts (key, value) VALUES ('feature_1_title', 'Hecho a mano')`);
    await query(`INSERT OR IGNORE INTO site_texts (key, value) VALUES ('feature_1_desc', 'Cada pieza es artesanal y única')`);
    await query(`INSERT OR IGNORE INTO site_texts (key, value) VALUES ('feature_2_title', 'Envío gratis')`);
    await query(`INSERT OR IGNORE INTO site_texts (key, value) VALUES ('feature_2_desc', 'En compras mayores a ARS 60.000')`);
    await query(`INSERT OR IGNORE INTO site_texts (key, value) VALUES ('feature_3_title', 'Materiales premium')`);
    await query(`INSERT OR IGNORE INTO site_texts (key, value) VALUES ('feature_3_desc', 'Seleccionados con cuidado')`);
    await query(`INSERT OR IGNORE INTO site_texts (key, value) VALUES ('feature_4_title', 'Para regalar')`);
    await query(`INSERT OR IGNORE INTO site_texts (key, value) VALUES ('feature_4_desc', 'Empaques especiales disponibles')`);
    await query(`INSERT OR IGNORE INTO site_texts (key, value) VALUES ('process_subtitle', 'Cinco pasos simples para comprar tu artesanía')`);
    await query(`INSERT OR IGNORE INTO site_texts (key, value) VALUES ('process_step_1_title', '1) Elegí productos')`);
    await query(`INSERT OR IGNORE INTO site_texts (key, value) VALUES ('process_step_1_desc', 'Filtrá por categoría y elegí tu pieza del catálogo.')`);
    await query(`INSERT OR IGNORE INTO site_texts (key, value) VALUES ('process_step_2_title', '2) Sumá al carrito')`);
    await query(`INSERT OR IGNORE INTO site_texts (key, value) VALUES ('process_step_2_desc', 'Presioná "Agregar" para guardar tu selección.')`);
    await query(`INSERT OR IGNORE INTO site_texts (key, value) VALUES ('process_step_3_title', '3) Revisá el carrito')`);
    await query(`INSERT OR IGNORE INTO site_texts (key, value) VALUES ('process_step_3_desc', 'Verificá cantidad, subtotal y total antes de pagar.')`);
    await query(`INSERT OR IGNORE INTO site_texts (key, value) VALUES ('process_step_4_title', '4) Pagá con MercadoPago')`);
    await query(`INSERT OR IGNORE INTO site_texts (key, value) VALUES ('process_step_4_desc', 'Ingresás al checkout para completar el pago de forma segura.')`);
    await query(`INSERT OR IGNORE INTO site_texts (key, value) VALUES ('process_step_5_title', '5) Confirmación')`);
    await query(`INSERT OR IGNORE INTO site_texts (key, value) VALUES ('process_step_5_desc', 'Al finalizar, vas a ver el comprobante en pantalla.')`);
    return;
  }

  const statements = [
    `CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT DEFAULT 'pulseras', price REAL NOT NULL, description TEXT DEFAULT '', emoji TEXT DEFAULT '📿', image TEXT DEFAULT '', badge TEXT DEFAULT '', stock INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS site_texts (id SERIAL PRIMARY KEY, key TEXT UNIQUE NOT NULL, value TEXT DEFAULT '', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS testimonials (id SERIAL PRIMARY KEY, name TEXT NOT NULL, comment TEXT NOT NULL, rating INTEGER DEFAULT 5 CHECK (rating >= 1 AND rating <= 5), image TEXT DEFAULT '', active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, items JSONB NOT NULL, total REAL NOT NULL, customer JSONB, status TEXT DEFAULT 'pending', mercadopago_id TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS subscribers (id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS reviews (id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5), comment TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
  ];

  for (const sql of statements) {
    try {
      await query(sql);
    } catch (err) {
      console.error('Error ejecutando SQL:', err.message);
    }
  }

  console.log('Tablas de base de datos inicializadas (PostgreSQL)');
  const seeds = [
    ['about_text', 'Cada pieza es artesanal y única, hecha con amor y dedicación en Gualeguay, Entre Ríos.'],
    ['feature_1_title', 'Hecho a mano'],
    ['feature_1_desc', 'Cada pieza es artesanal y única'],
    ['feature_2_title', 'Envío gratis'],
    ['feature_2_desc', 'En compras mayores a ARS 60.000'],
    ['feature_3_title', 'Materiales premium'],
    ['feature_3_desc', 'Seleccionados con cuidado'],
    ['feature_4_title', 'Para regalar'],
    ['feature_4_desc', 'Empaques especiales disponibles'],
    ['process_subtitle', 'Cinco pasos simples para comprar tu artesanía'],
    ['process_step_1_title', '1) Elegí productos'],
    ['process_step_1_desc', 'Filtrá por categoría y elegí tu pieza del catálogo.'],
    ['process_step_2_title', '2) Sumá al carrito'],
    ['process_step_2_desc', 'Presioná "Agregar" para guardar tu selección.'],
    ['process_step_3_title', '3) Revisá el carrito'],
    ['process_step_3_desc', 'Verificá cantidad, subtotal y total antes de pagar.'],
    ['process_step_4_title', '4) Pagá con MercadoPago'],
    ['process_step_4_desc', 'Ingresás al checkout para completar el pago de forma segura.'],
    ['process_step_5_title', '5) Confirmación'],
    ['process_step_5_desc', 'Al finalizar, vas a ver el comprobante en pantalla.']
  ];
  for (const [key, value] of seeds) {
    try {
      await query('INSERT INTO site_texts (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, value]);
    } catch (err) {
      console.error('Error seed site_texts:', err.message);
    }
  }
}

module.exports = { query, initDB, pool, connectionString: !!connectionString };