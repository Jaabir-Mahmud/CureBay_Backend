"use strict";
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyToken, syncFirebaseUser } = require('../controllers/authController');
const { syncUser, validateUserSession } = require('../middleware/userSync');
// Utility function to sanitize user inputs
const sanitizeInput = (input) => {
    if (typeof input !== 'string')
        return input;
    // Remove potentially dangerous characters
    return input
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;")
        .replace(/\//g, "&#x2F;");
};
// Utility function to validate email format
const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};
// Utility function to validate URL
const isValidUrl = (string) => {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    }
    catch (_) {
        return false;
    }
};
// POST /api/users/google - handle Google sign-in (no middleware needed)
router.post('/google', async (req, res) => {
    try {
        // Check database connection first
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                error: 'Database connection unavailable',
                message: 'The database is not connected. Please check your MongoDB connection and try again.'
            });
        }
        const { uid, email, name, profilePicture } = req.body;
        // Validate inputs
        if (!email || !isValidEmail(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ error: 'Name is required' });
        }
        // Sanitize inputs
        const sanitizedEmail = sanitizeInput(email);
        const sanitizedName = sanitizeInput(name);
        let sanitizedProfilePicture = null;
        if (profilePicture) {
            // Validate and sanitize profile picture URL
            if (typeof profilePicture === 'string' && profilePicture.startsWith('/uploads/')) {
                sanitizedProfilePicture = profilePicture; // Relative path is safe
            }
            else if (typeof profilePicture === 'string' && isValidUrl(profilePicture)) {
                sanitizedProfilePicture = profilePicture; // Valid external URL
            }
            // Invalid URLs are ignored
        }
        // Find or create user in MongoDB
        let user = await User.findOne({ email: sanitizedEmail });
        if (!user) {
            // Create new user
            user = await User.create({
                name: sanitizedName,
                username: sanitizedName,
                email: sanitizedEmail,
                password: 'google-auth', // Placeholder, not used with Google auth
                role: 'user',
                profilePicture: sanitizedProfilePicture,
                isActive: true
            });
        }
        else {
            // Update existing user with latest Google data
            const updateFields = {};
            let needsUpdate = false;
            // Update fields if they're missing or different
            if (user.name !== sanitizedName) {
                updateFields.name = sanitizedName;
                needsUpdate = true;
            }
            if (user.username !== sanitizedName) {
                updateFields.username = sanitizedName;
                needsUpdate = true;
            }
            if (profilePicture && user.profilePicture !== sanitizedProfilePicture) {
                updateFields.profilePicture = sanitizedProfilePicture;
                needsUpdate = true;
            }
            if (needsUpdate) {
                await User.updateOne({ _id: user._id }, { $set: updateFields });
                user = await User.findById(user._id); // Refresh user data
            }
        }
        res.json({
            message: 'User signed in successfully',
            user: {
                _id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
                role: user.role,
                profilePicture: user.profilePicture,
                isActive: user.isActive
            }
        });
    }
    catch (error) {
        console.error('Google sign-in error:', error);
        // Check if it's a database connection error
        if (error.name === 'MongooseError' && error.message.includes('buffering')) {
            return res.status(503).json({
                error: 'Database connection unavailable',
                message: 'The database is not connected. Please check your MongoDB connection and try again.'
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Apply sync middleware to all other routes in this file
// Use validateUserSession for frequent checks where full sync is not needed
router.use(validateUserSession);
// PATCH /api/users/update-profile - update current user profile
router.patch('/update-profile', async (req, res) => {
    try {
        // User is attached to req by middleware
        const userId = req.user._id;
        // Get the fields to update from request body
        const { name, username, phone, address, profilePicture, ...otherFields } = req.body;
        // Build update object with only provided fields
        const updateFields = {};
        // Validate and sanitize inputs
        if (name !== undefined) {
            if (typeof name !== 'string' || name.trim().length === 0) {
                return res.status(400).json({ error: 'Invalid name format' });
            }
            updateFields.name = sanitizeInput(name);
        }
        if (username !== undefined) {
            if (typeof username !== 'string' || username.trim().length === 0) {
                return res.status(400).json({ error: 'Invalid username format' });
            }
            updateFields.username = sanitizeInput(username);
        }
        if (phone !== undefined) {
            if (phone !== null && (typeof phone !== 'string' || phone.trim().length === 0)) {
                return res.status(400).json({ error: 'Invalid phone format' });
            }
            updateFields.phone = phone ? sanitizeInput(phone) : null;
        }
        if (address !== undefined) {
            if (address !== null && (typeof address !== 'string' || address.trim().length === 0)) {
                return res.status(400).json({ error: 'Invalid address format' });
            }
            updateFields.address = address ? sanitizeInput(address) : null;
        }
        if (profilePicture !== undefined) {
            if (profilePicture === null) {
                updateFields.profilePicture = null;
            }
            else if (typeof profilePicture === 'string') {
                // Validate and sanitize profile picture URL
                if (profilePicture.startsWith('/uploads/')) {
                    updateFields.profilePicture = profilePicture; // Relative path is safe
                }
                else if (isValidUrl(profilePicture)) {
                    updateFields.profilePicture = profilePicture; // Valid external URL
                }
                else {
                    return res.status(400).json({ error: 'Invalid profile picture URL' });
                }
            }
            else {
                return res.status(400).json({ error: 'Invalid profile picture format' });
            }
        }
        // Add any other fields that might be provided (with sanitization)
        Object.keys(otherFields).forEach(key => {
            if (typeof otherFields[key] === 'string') {
                updateFields[key] = sanitizeInput(otherFields[key]);
            }
            else {
                updateFields[key] = otherFields[key];
            }
        });
        // Update user in database
        const updatedUser = await User.findByIdAndUpdate(userId, { $set: updateFields }, { new: true, runValidators: true });
        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({
            message: 'Profile updated successfully',
            user: {
                _id: updatedUser._id,
                name: updatedUser.name,
                username: updatedUser.username,
                email: updatedUser.email,
                phone: updatedUser.phone,
                address: updatedUser.address,
                profilePicture: updatedUser.profilePicture,
                role: updatedUser.role,
                isActive: updatedUser.isActive
            }
        });
    }
    catch (err) {
        console.error('Profile update error:', err);
        // Handle validation errors
        if (err.name === 'ValidationError') {
            return res.status(400).json({ error: 'Invalid data provided', details: err.message });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/users - get all users (protected - admin only in production)
router.get('/', async (req, res) => {
    try {
        // Check if a role filter is provided
        const { role } = req.query;
        // Build filter object
        const filter = {};
        if (role) {
            filter.role = role;
        }
        // In production, add admin check here
        const users = await User.find(filter, { password: 0 }); // Exclude password field
        res.json(users);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/users/me - get current user profile (now using middleware)
router.get('/me', async (req, res) => {
    try {
        // User is already synced and attached to req by middleware
        const user = req.user;
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            username: user.username,
            phone: user.phone,
            address: user.address,
            profilePicture: user.profilePicture,
            role: user.role || 'user',
            isActive: user.isActive
        });
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PATCH /api/users/:id/role - update user role (admin only)
router.patch('/:id/role', async (req, res) => {
    try {
        const { role } = req.body;
        if (!['user', 'seller', 'admin'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }
        const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        res.json(user);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /api/users/:id - delete a user
router.delete('/:id', async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        res.json({ message: 'User deleted' });
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PATCH /api/users/:id/active - toggle isActive status
router.patch('/:id/active', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        user.isActive = !user.isActive;
        await user.save();
        res.json({ message: 'User status updated', isActive: user.isActive });
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
module.exports = router;
