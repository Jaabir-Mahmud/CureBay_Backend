const express = require('express');
const router = express.Router();
const { createOrder, getOrders, getOrderById } = require('../controllers/orderController');
const { syncUser } = require('../middleware/userSync');

// Apply sync middleware to all routes in this file to ensure authentication
router.use(syncUser);

// POST /api/orders - Create a new order
router.post('/', createOrder);

// GET /api/orders - Get orders (admin gets all, user gets their own)
router.get('/', getOrders);

// GET /api/orders/:id - Get specific order (admin or order owner)
router.get('/:id', getOrderById);

module.exports = router;