const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const { initDB } = require('./lib/db');
const { handleUploadError, saveFile } = require('./lib/upload');

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

dotenv.config();

const app = express();
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || '').split(',').filter(Boolean);
const normalize = (o) => o.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, origin);
    const normalized = normalize(origin);
    const allowed = allowedOrigins.find(o => normalized === normalize(o) || normalized.endsWith('.' + normalize(o)));
    if (allowed) return callback(null, origin);
    return callback(new Error('Origin not allowed'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
};
app.use(cors(corsOptions));

// Health check & keep-alive
app.get('/api/health', (req, res) => res.json({ ok: true, timestamp: Date.now() }));
app.get('/api/ping', (req, res) => res.json({ ok: true, timestamp: Date.now() }));

// Routes (MVC)
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/products'));
app.use('/api', require('./routes/orders'));
app.use('/api', require('./routes/payments'));
app.use('/api', require('./routes/siteTexts'));
app.use('/api', require('./routes/testimonials'));

// Upload con multer
app.post('/api/admin/upload', require('./middleware/auth').adminAuth, handleUploadError, saveFile);

// Static files
app.use('/uploads', express.static(path.join(__dirname, '..', '..', 'uploads')));
const staticDir = path.join(__dirname, '..', '..', 'frontend');

app.use('/css', express.static(path.join(staticDir, 'css')));
app.use('/js', express.static(path.join(staticDir, 'js')));
app.use('/uploads', express.static(path.join(staticDir, 'uploads')));
app.use('/pages', express.static(path.join(staticDir, 'pages')));
app.use(express.static(staticDir));

app.get('/favicon.ico', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.sendFile(path.join(staticDir, 'favicon.svg'));
});

app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(staticDir, 'index.html'));
});

app.get('/*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not Found' });
  }
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(staticDir, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message });
});

// Init DB y start
initDB().catch(err => {
  console.error('Error inicializando DB:', err.message);
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Backend escuchando en http://localhost:${PORT}`));
} else {
  module.exports = app;
}