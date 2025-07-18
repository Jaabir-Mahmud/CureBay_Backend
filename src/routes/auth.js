"use strict";

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../controllers/authController');
const User = require('../models/User');


// POST /api/auth/firebase-login
router.post('/firebase-login', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: 'No ID token provided' });
  try {
    // Verify Firebase ID token
    const decoded = await verifyToken(idToken);
    // Find or create user in MongoDB
    let user = await User.findOne({ email: decoded.email });
    if (!user) {
      user = await User.create({
        username: decoded.name || decoded.email.split('@')[0],
        email: decoded.email,
        password: 'firebase-auth', // Placeholder, not used
        role: 'user',
        profilePicture: decoded.picture || null,
        isActive: true
      });
    }
    res.json({
      message: 'Login successful',
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture
      }
    });
  } catch (err) {
    console.error(err); // Log the error for debugging
    res.status(401).json({ error: 'Invalid or expired token', details: err.message });
  }
});

module.exports = router;
