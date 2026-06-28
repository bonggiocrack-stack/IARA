const jwt = require('jsonwebtoken');

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.headers['x-admin-token'];
  if (!token) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  try {
    const JWT_SECRET = process.env.JWT_SECRET || 'change_me_in_production';
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!['admin', 'editor'].includes(decoded.role)) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Solo administradores' });
  }
  next();
}

module.exports = { adminAuth, adminOnly };
