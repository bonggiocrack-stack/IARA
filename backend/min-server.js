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
} catch (e) { console.error('pg:', e.message); }

if (process.env.VERCEL) {
  module.exports = app;
} else {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
}
