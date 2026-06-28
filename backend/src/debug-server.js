const express = require('express');
const app = express();
app.get('/api/health', (req, res) => res.json({ ok: true, timestamp: Date.now() }));

// Test módulos uno por uno
const modules = [
  { name: 'helmet', fn: () => require('helmet') },
  { name: 'cors', fn: () => require('cors') },
  { name: 'dotenv', fn: () => require('dotenv') },
  { name: 'pg', fn: () => require('pg') },
  { name: 'multer', fn: () => require('multer') },
  { name: 'zod', fn: () => require('zod') },
  { name: 'jsonwebtoken', fn: () => require('jsonwebtoken') }
];

let errors = [];
modules.forEach(m => {
  try {
    m.fn();
    console.log(`✓ ${m.name} loaded`);
  } catch (e) {
    console.error(`✗ ${m.name} error:`, e.message);
    errors.push(m.name);
  }
});

if (errors.length) {
  console.error('Módulos con error:', errors.join(', '));
}

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(3000, () => console.log('Minimal server on 3000'));
}
