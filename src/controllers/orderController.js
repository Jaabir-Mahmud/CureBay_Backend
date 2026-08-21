"use strict";

const Order = require('../models/Order');
const Medicine = require('../models/Medicine');

// Create a new order
async function createOrder(req, res) {
  try {
    const { userId, items, shippingAddress, totalAmount, currency, coupon } = req.body;
    
    // Validate required fields
    if (!items || !shippingAddress || !totalAmount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Validate items
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required and cannot be empty' });
    }
    
    // Validate each item has required fields
    for (const item of items) {
      if (!item.medicineId || !item.quantity) {
        return res.status(400).json({ error: 'Each item must have medicineId and quantity' });
      }
    }
    
    const targetUserId = req.user ? req.user._id : userId;
    if (!targetUserId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Create the order
    const orderData = {
      user: targetUserId,
      items: items.map(item => ({
        medicine: item.medicineId,
        quantity: item.quantity,
        price: item.price || 0 // Price will be populated from medicine data
      })),
      totalAmount,
      shippingAddress,
      coupon: coupon ? {
        code: coupon.code,
        discountAmount: coupon.discountAmount
      } : undefined
    };
    
    const order = new Order(orderData);
    await order.save();
    
    // Populate the order with user and medicine details
    await order.populate('user', 'name email');
    await order.populate('items.medicine', 'name price');
    
    res.status(201).json(order);
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ error: err.message });
  }
}

// Get orders (admin gets all or filtered, regular user gets their own)
async function getOrders(req, res) {
  try {
    let query = {};
    if (req.user.role !== 'admin') {
      query.user = req.user._id;
    } else if (req.query.userId) {
      query.user = req.query.userId;
    }

    const orders = await Order.find(query)
      .populate('user', 'name email')
      .populate('items.medicine', 'name price')
      .sort({ createdAt: -1 });
    
    res.json({ orders });
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ error: err.message });
  }
}

// Get specific order (admin or order owner)
async function getOrderById(req, res) {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email')
      .populate('items.medicine', 'name price');
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (req.user.role !== 'admin' && order.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied. You can only view your own order.' });
    }
    
    res.json(order);
  } catch (err) {
    console.error('Error fetching order:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  createOrder,
  getOrders,
  getOrderById
};