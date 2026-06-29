const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/auth');
const { getOrders, createOrder, updateOrderStatus, createPublicOrder } = require('../controllers/ordersController');

router.get('/admin/orders', adminAuth, getOrders);
router.post('/admin/orders', adminAuth, createOrder);
router.put('/admin/orders/:id', adminAuth, updateOrderStatus);
router.post('/', createPublicOrder);

module.exports = router;
