const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/auth');
const { getOrders, createOrder, updateOrderStatus } = require('../controllers/ordersController');

router.get('/orders', adminAuth, getOrders);
router.post('/orders', createOrder);
router.put('/orders/:id', adminAuth, updateOrderStatus);

module.exports = router;
