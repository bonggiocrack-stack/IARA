const express = require('express');
const path = require('path');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true, timestamp: Date.now() }));

// Admin login
app.post('/api/admin/login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }
    const ADMIN_USER = process.env.ADMIN_USER || 'iara';
    const ADMIN_PASS = process.env.ADMIN_PASS || 'pulseras2026';
    if (username !== ADMIN_USER || password !== ADMIN_PASS) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'change_me_in_production';
    const token = jwt.sign({ role: 'admin', user: ADMIN_USER }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, user: ADMIN_USER });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Auth middleware
function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.headers['x-admin-token'];
  if (!token) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  try {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'change_me_in_production';
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

// Products CRUD (in-memory para Vercel)
let products = [
  { id: 1, name: 'Pulsera Minimalista Rosa', category: 'pulseras', price: 450, description: 'Diseño minimalista con cuentas de cerámica', emoji: '📿', image: '', badge: 'Nuevo' },
  { id: 2, name: 'Pulsera Menta Orgánica', category: 'pulseras', price: 520, description: 'Pulsera tejida con materiales ecológicos', emoji: '📿', image: '', badge: '' },
  { id: 3, name: 'Aretes Luna Creciente', category: 'accesorios', price: 380, description: 'Aretes artesanales en plata', emoji: '🌙', image: '', badge: '' },
];
let nextProductId = 4;

app.get('/api/products', (req, res) => res.json(products));
app.get('/api/admin/products', adminAuth, (req, res) => res.json(products));
app.post('/api/admin/products', adminAuth, (req, res) => {
  const { name, category, price, description, emoji, image, badge } = req.body || {};
  if (!name || !price) return res.status(400).json({ error: 'Nombre y precio son obligatorios' });
  const product = {
    id: nextProductId++,
    name,
    category: category || 'pulseras',
    price: Number(price),
    description: description || '',
    emoji: emoji || '📿',
    image: image || '',
    badge: badge || ''
  };
  products.push(product);
  res.status(201).json(product);
});
app.put('/api/admin/products/:id', adminAuth, (req, res) => {
  const id = Number(req.params.id);
  const idx = products.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Producto no encontrado' });
  products[idx] = { ...products[idx], ...req.body, price: Number(req.body.price || products[idx].price) };
  res.json(products[idx]);
});
app.delete('/api/admin/products/:id', adminAuth, (req, res) => {
  const id = Number(req.params.id);
  products = products.filter(p => p.id !== id);
  res.json({ ok: true });
});

// Site texts (in-memory)
let siteTexts = {
  hero_title: 'Regalos artesanales que cuentan historias',
  hero_subtitle: 'Hecho a mano con amor en Gualeguay',
  about_text: 'En Artesanía Gualeguay creamos piezas únicas que reflejan la riqueza cultural de nuestra región. Cada pulsera, llavero y souvenir es hecho con dedicación y cuidado artesanal. Nuestro compromiso es ofrecer productos de calidad, con un toque personal que hace cada compra especial. Creemos que los regalos artesanales son más significativos porque llevan una historia.'
};
app.get('/api/site-texts', (req, res) => res.json(siteTexts));
app.get('/api/admin/site-texts', adminAuth, (req, res) => res.json(siteTexts));
app.put('/api/admin/site-texts', adminAuth, (req, res) => {
  const { key, value } = req.body || {};
  if (!key || value === undefined) return res.status(400).json({ error: 'key y value son requeridos' });
  siteTexts[key] = value;
  res.json({ ok: true });
});

// Testimonials (in-memory)
let testimonials = [
  { id: 1, name: 'María', comment: 'Increíble calidad!', rating: 5, active: true },
  { id: 2, name: 'Laura', comment: 'Me encanta mi pulsera', rating: 5, active: true }
];
let nextTestimonialId = 3;
app.get('/api/testimonials', (req, res) => res.json(testimonials.filter(t => t.active)));
app.get('/api/admin/testimonials', adminAuth, (req, res) => res.json(testimonials));
app.post('/api/admin/testimonials', adminAuth, (req, res) => {
  const { name, comment, rating = 5, image = '', active = true } = req.body || {};
  if (!name || !comment) return res.status(400).json({ error: 'Nombre y comentario son requeridos' });
  const testimonial = { id: nextTestimonialId++, name, comment, rating: Number(rating), image, active };
  testimonials.push(testimonial);
  res.status(201).json(testimonial);
});
app.put('/api/admin/testimonials/:id', adminAuth, (req, res) => {
  const id = Number(req.params.id);
  const idx = testimonials.findIndex(t => t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Testimonio no encontrado' });
  testimonials[idx] = { ...testimonials[idx], ...req.body };
  res.json(testimonials[idx]);
});
app.delete('/api/admin/testimonials/:id', adminAuth, (req, res) => {
  const id = Number(req.params.id);
  testimonials = testimonials.filter(t => t.id !== id);
  res.json({ ok: true });
});

// Upload (simulado para Vercel - en producción usar Cloudinary)
app.post('/api/admin/upload', adminAuth, (req, res) => {
  res.json({ url: '', message: 'Upload simulado en Vercel' });
});

// Static files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
const staticDir = path.join(__dirname, '..', '..', 'frontend');

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

// Serve all other static files from frontend
app.use(express.static(staticDir));

// SPA fallback: serve index.html for any non-API route
app.get('/*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not Found' });
  }
  res.sendFile(path.join(staticDir, 'index.html'));
});

// Error handler
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
