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

const createPublicOrder = async (req, res) => {
  const { items, total, shipping_name, shipping_address, shipping_phone, shipping_zip, shipping_city, shipping_email, subtotal, shipping_cost } = req.body || {};
  if (!items || !total || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Items y total son requeridos' });
  if (!shipping_name || !shipping_address || !shipping_phone || !shipping_zip) return res.status(400).json({ error: 'Datos de envío incompletos' });

  try {
    for (const item of items) {
      const productId = Number(item.id);
      const qty = Number(item.qty) || 1;
      if (!productId) continue;
      const productResult = await query('SELECT name, stock FROM products WHERE id = $1', [productId]);
      if (productResult.rows.length === 0) return res.status(404).json({ error: `Producto ${productId} no encontrado` });
      if (Number(productResult.rows[0].stock) < qty) {
        return res.status(409).json({ error: `Stock insuficiente para ${item.name || productResult.rows[0].name}. Disponible: ${productResult.rows[0].stock}` });
      }
    }

    for (const item of items) {
      const productId = Number(item.id);
      const qty = Number(item.qty) || 1;
      if (!productId) continue;
      await query('UPDATE products SET stock = stock - $1 WHERE id = $2', [qty, productId]);
    }

    const customer = {
      name: shipping_name,
      address: shipping_address,
      phone: shipping_phone,
      zip: shipping_zip,
      city: shipping_city,
      email: shipping_email || ''
    };

    const result = await query(
      'INSERT INTO orders (items, total, customer, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [JSON.stringify(items), Number(total), JSON.stringify(customer), 'pending']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creando pedido público:', err);
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

module.exports = { getOrders, createOrder, updateOrderStatus, createPublicOrder };
