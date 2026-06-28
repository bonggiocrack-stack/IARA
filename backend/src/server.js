const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');

process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));

dotenv.config();

const app = express();
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
const corsOptions = allowedOrigins.length
  ? { origin: allowedOrigins, credentials: true, methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }
  : { origin: '*', credentials: true };
app.use(cors(corsOptions));

app.get('/api/health', (req, res) => res.json({ ok: true, timestamp: Date.now() }));
app.get('/api/ping', (req, res) => res.json({ ok: true, timestamp: Date.now() }));

const staticDir = path.join(__dirname, '..', '..', 'frontend');

app.get('/', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

app.use(express.static(staticDir));

app.get('/*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not Found' });
  }
  res.sendFile(path.join(staticDir, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message });
});

if (process.env.VERCEL) {
  module.exports = app;
} else {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Backend escuchando en http://localhost:${PORT}`));
}
