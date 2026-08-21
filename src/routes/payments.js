const express = require('express');
const router = express.Router();
const { getSellerPayments, getAllPayments, createPaymentIntent, confirmPayment, getUserPayments } = require('../controllers/paymentController');
const { requireSellerOrAdmin } = require('../middleware/sellerAuth');
const { syncUser } = require('../middleware/userSync');

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admins only.' });
  }
  next();
};

// POST /api/payments/create-payment-intent - Create a Stripe payment intent (authenticated users)
router.post('/create-payment-intent', syncUser, createPaymentIntent);

// POST /api/payments/confirm - Confirm a payment (authenticated users)
router.post('/confirm', syncUser, confirmPayment);

// GET /api/payments - Get all payments (admin only)
router.get('/', syncUser, requireAdmin, getAllPayments);

// GET /api/payments/user/:userId - Get payments for a specific user (authenticated user/admin)
router.get('/user/:userId', syncUser, getUserPayments);

// GET /api/payments/seller/:sellerId - Get payments for a specific seller (seller/admin only)
router.get('/seller/:sellerId', requireSellerOrAdmin, getSellerPayments);

module.exports = router;