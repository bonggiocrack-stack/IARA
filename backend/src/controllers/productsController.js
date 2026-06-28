const { query } = require('../../lib/db');
const { productSchema } = require('../../lib/validators');

const getPublicProducts = async (req, res) => {
  try {
    const result = await query('SELECT * FROM products ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error obteniendo productos:', err);
    res.status(500).json({ error: err.message });
  }
};

const getAdminProducts = async (req, res) => {
  try {
    const result = await query('SELECT * FROM products ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error obteniendo productos (admin):', err);
    res.status(500).json({ error: err.message });
  }
};

const createProduct = async (req, res) => {
  try {
    const data = productSchema.parse(req.body);
    const result = await query(
      'INSERT INTO products (name, category, price, description, emoji, image, badge, stock) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [data.name, data.category, Number(data.price), data.description || '', data.emoji || '📿', data.image || '', data.badge || '', Number(data.stock)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: err.errors[0]?.message || 'Datos inválidos' });
    }
    console.error('Error creando producto:', err);
    res.status(500).json({ error: err.message });
  }
};

const updateProduct = async (req, res) => {
  const id = Number(req.params.id);
  try {
    const data = productSchema.partial().parse(req.body);
    const fields = Object.keys(data);
    if (!fields.length) return res.status(400).json({ error: 'Sin datos para actualizar' });
    const setClause = fields.map((_, i) => `${fields[i]} = $${i + 1}`).join(', ');
    const values = fields.map(f => (['price', 'stock'].includes(f) ? Number(data[f]) : data[f]));
    values.push(id);
    const result = await query(`UPDATE products SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length} RETURNING *`, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: err.errors[0]?.message || 'Datos inválidos' });
    }
    console.error('Error actualizando producto:', err);
    res.status(500).json({ error: err.message });
  }
};

const deleteProduct = async (req, res) => {
  const id = Number(req.params.id);
  try {
    const result = await query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error eliminando producto:', err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getPublicProducts, getAdminProducts, createProduct, updateProduct, deleteProduct };
