const { query } = require('../lib/db');

const getOrders = async (req, res) => {
  try {
    const result = await query('SELECT * FROM orders ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error obteniendo pedidos:', err);
    res.status(500).json({ error: err.message });
  }
};

const createOrder = async (req, res) => {
  const { items, total, customer } = req.body || {};
  if (!items || !total) return res.status(400).json({ error: 'Items y total son requeridos' });
  try {
    const result = await query(
      'INSERT INTO orders (items, total, customer, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [JSON.stringify(items), Number(total), JSON.stringify(customer || {}), 'pending']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creando pedido:', err);
    res.status(500).json({ error: err.message });
  }
};

const updateOrderStatus = async (req, res) => {
  const id = Number(req.params.id);
  const { status, mercadopago_id } = req.body || {};
  try {
    const result = await query(
      'UPDATE orders SET status = $1, mercadopago_id = $2 WHERE id = $3 RETURNING *',
      [status, mercadopago_id || null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error actualizando pedido:', err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getOrders, createOrder, updateOrderStatus };
