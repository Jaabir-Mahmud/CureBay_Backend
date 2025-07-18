const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Medicine = require('../models/Medicine');
const Order = require('../models/Order');

// GET /api/admin/overview
router.get('/overview', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalSellers = await User.countDocuments({ role: 'seller' });
    const totalMedicines = await Medicine.countDocuments();
    const totalOrders = await Order.countDocuments();

    // Orders as payments
    const orders = await Order.find();
    const totalRevenue = orders.filter(o => o.paymentStatus === 'paid').reduce((sum, o) => sum + o.totalAmount, 0);
    const paidTotal = totalRevenue;
    const pendingTotal = orders.filter(o => o.paymentStatus === 'pending').reduce((sum, o) => sum + o.totalAmount, 0);

    res.json({
      totalUsers,
      totalSellers,
      totalMedicines,
      totalOrders,
      totalRevenue,
      paidTotal,
      pendingTotal
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/recent-users
router.get('/recent-users', async (req, res) => {
  try {
    const users = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name email role isActive createdAt');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/pending-payments
router.get('/pending-payments', async (req, res) => {
  try {
    // Find all orders with paymentStatus 'pending'
    const orders = await Order.find({ paymentStatus: 'pending' })
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(10);
    // Map to required fields
    const payments = orders.map(order => ({
      id: order._id,
      amount: order.totalAmount,
      customer: order.user ? (order.user.name || order.user.email) : 'Unknown',
      email: order.user ? order.user.email : '',
      date: order.createdAt,
    }));
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/accept-payment/:orderId
router.patch('/accept-payment/:orderId', async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    order.paymentStatus = 'paid';
    await order.save();
    res.json({ message: 'Payment accepted', order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router; 