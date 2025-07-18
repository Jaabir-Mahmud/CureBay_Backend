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
    const name = decoded.name || decoded.email.split('@')[0];
    const username = name;
    const profilePicture = decoded.picture || null;
    const role = 'user';
    const isActive = true;
    if (!user) {
      user = await User.create({
        name,
        username,
        email: decoded.email,
        password: 'firebase-auth', // Placeholder, not used
        role,
        profilePicture,
        isActive
      });
    } else {
      // Patch missing fields
      let needsUpdate = false;
      const updateFields = {};
      if (!user.name) { updateFields.name = name; needsUpdate = true; }
      if (!user.username) { updateFields.username = username; needsUpdate = true; }
      if (!user.role) { updateFields.role = role; needsUpdate = true; }
      if (user.profilePicture === undefined) { updateFields.profilePicture = profilePicture; needsUpdate = true; }
      if (user.isActive === undefined) { updateFields.isActive = isActive; needsUpdate = true; }
      if (needsUpdate) {
        await User.updateOne({ _id: user._id }, { $set: updateFields });
        user = await User.findById(user._id); // Refresh user
      }
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
