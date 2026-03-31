"use strict";
const admin = require('../utils/firebase');
const User = require('../models/User');
// Utility function to sanitize email
const sanitizeEmail = (email) => {
    if (typeof email !== 'string')
        return '';
    // Basic email sanitization
    return email.trim().toLowerCase();
};
// Utility function to sanitize name
const sanitizeName = (name) => {
    if (typeof name !== 'string')
        return '';
    // Basic name sanitization
    return name.trim();
};
// Example: Verify a Firebase ID token
async function verifyToken(idToken, userData = null) {
    try {
        // Validate input
        if (!idToken || typeof idToken !== 'string') {
            throw new Error('Invalid token provided');
        }
        // Check if we're in development mode and should use mock verification
        const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
        if (isDevelopment && admin.isDevelopmentMode && admin.isDevelopmentMode()) {
            // In development mode, use the user data sent from frontend if available
            if (userData && userData.email) {
                const sanitizedEmail = sanitizeEmail(userData.email);
                if (!sanitizedEmail) {
                    throw new Error('Invalid email in user data');
                }
                return {
                    uid: userData.uid || 'dev-user-' + Date.now(),
                    email: sanitizedEmail,
                    name: userData.name ? sanitizeName(userData.name) : sanitizedEmail.split('@')[0],
                    picture: userData.profilePicture || null
                };
            }
            // Fallback to mock data if no user data provided
            return {
                uid: 'dev-user-' + Date.now(),
                email: 'dev@example.com',
                name: 'Development User',
                picture: null
            };
        }
        // In production mode, verify the actual token
        try {
            // Check if auth is available
            const auth = admin.auth();
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            // Validate decoded token data
            if (!decodedToken || !decodedToken.email) {
                throw new Error('Invalid token data');
            }
            // Sanitize email and name
            const sanitizedEmail = sanitizeEmail(decodedToken.email);
            if (!sanitizedEmail) {
                throw new Error('Invalid email in token');
            }
            decodedToken.email = sanitizedEmail;
            if (decodedToken.name) {
                decodedToken.name = sanitizeName(decodedToken.name);
            }
            return decodedToken;
        }
        catch (verificationError) {
            throw verificationError;
        }
    }
    catch (error) {
        throw new Error('Invalid or expired token');
    }
}
// Sync Firebase user with MongoDB user
async function syncFirebaseUser(decodedToken) {
    try {
        // Check database connection first
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) {
            const error = new Error('Database connection unavailable');
            error.code = 'DATABASE_NOT_CONNECTED';
            throw error;
        }
        // Validate decoded token
        if (!decodedToken || !decodedToken.email) {
            throw new Error('Invalid token data');
        }
        const email = sanitizeEmail(decodedToken.email);
        const name = decodedToken.name ? sanitizeName(decodedToken.name) : email.split('@')[0];
        const username = name;
        const profilePicture = decodedToken.picture || null;
        // Validate email
        if (!email) {
            throw new Error('Invalid email');
        }
        // Find or create user in MongoDB
        let user = await User.findOne({ email });
        if (!user) {
            // Create new user
            user = await User.create({
                name,
                username,
                email,
                password: 'firebase-auth', // Placeholder, not used with Firebase auth
                role: 'user',
                profilePicture,
                isActive: true
            });
        }
        else {
            // Update existing user with latest Firebase data
            const updateFields = {};
            let needsUpdate = false;
            // Update fields if they're missing or different
            if (user.name !== name) {
                updateFields.name = name;
                needsUpdate = true;
            }
            if (user.username !== username) {
                updateFields.username = username;
                needsUpdate = true;
            }
            if (user.profilePicture !== profilePicture) {
                updateFields.profilePicture = profilePicture;
                needsUpdate = true;
            }
            if (needsUpdate) {
                await User.updateOne({ _id: user._id }, { $set: updateFields });
                user = await User.findById(user._id); // Refresh user data
            }
        }
        return user;
    }
    catch (error) {
        // Check if it's a database connection error
        if (error.code === 'DATABASE_NOT_CONNECTED' ||
            (error.name === 'MongooseError' && error.message.includes('buffering'))) {
            const dbError = new Error('Database connection unavailable');
            dbError.code = 'DATABASE_NOT_CONNECTED';
            throw dbError;
        }
        console.error('syncFirebaseUser error:', error);
        throw new Error('Failed to sync user data');
    }
}
module.exports = { verifyToken, syncFirebaseUser };
