const jwt = require('jsonwebtoken');

const login = (req, res) => {
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
    const JWT_SECRET = process.env.JWT_SECRET || 'change_me_in_production';
    const token = jwt.sign({ role: 'admin', user: ADMIN_USER }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, user: ADMIN_USER });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = { login };
