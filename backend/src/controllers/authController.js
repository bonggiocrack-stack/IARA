const jwt = require('jsonwebtoken');

const login = (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const ADMIN_USER = process.env.ADMIN_USER;
    const ADMIN_PASS = process.env.ADMIN_PASS;
    const EDITOR_USER = process.env.EDITOR_USER;
    const EDITOR_PASS = process.env.EDITOR_PASS;

    if (!ADMIN_USER || !ADMIN_PASS) {
      return res.status(500).json({ error: 'Credenciales de administrador no configuradas en el servidor' });
    }

    let role = null;
    let user = null;

    if (username === ADMIN_USER && password === ADMIN_PASS) {
      role = 'admin';
      user = ADMIN_USER;
    } else if (EDITOR_USER && username === EDITOR_USER && password === EDITOR_PASS) {
      role = 'editor';
      user = EDITOR_USER;
    }

    if (!role) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      return res.status(500).json({ error: 'JWT_SECRET no configurado en el servidor' });
    }
    const token = jwt.sign({ role, user }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, user, role });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = { login };
