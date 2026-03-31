"use strict";
// middleware/userSync.js
const { verifyToken } = require('../controllers/authController');
const UserSyncService = require('../services/userSyncService');
const User = require('../models/User');
const mongoose = require('mongoose');
// Utility function to sanitize email
const sanitizeEmail = (email) => {
    if (typeof email !== 'string')
        return '';
    // Basic email sanitization
    return email.trim().toLowerCase();
};
// Check if MongoDB is connected
function isDatabaseConnected() {
    return mongoose.connection.readyState === 1; // 1 = connected
}
/**
 * Middleware to sync Firebase user with MongoDB user
 * Ensures user data is up-to-date before processing requests
 */
async function syncUser(req, res, next) {
    try {
        // Check database connection first
        if (!isDatabaseConnected()) {
            console.error('Database not connected - cannot sync user');
            return res.status(503).json({
                error: 'Database connection unavailable',
                message: 'The database is not connected. Please check your MongoDB connection and try again.'
            });
        }
        // If devAuth has already attached a user, skip token verification
        if (req.user && req.firebaseUser) {
            return next();
        }
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }
        const idToken = authHeader.split(' ')[1];
        // Verify and decode the token
        const decoded = await verifyToken(idToken, null);
        // Validate decoded token data
        if (!decoded || !decoded.email) {
            return res.status(401).json({ error: 'Invalid token data' });
        }
        // Sanitize email
        const sanitizedEmail = sanitizeEmail(decoded.email);
        if (!sanitizedEmail) {
            return res.status(401).json({ error: 'Invalid email in token' });
        }
        // Update decoded token with sanitized email
        decoded.email = sanitizedEmail;
        // Sync user data with Firebase using the service
        let user = await UserSyncService.syncUser(decoded);
        const validationResult = UserSyncService.validateUserSession(user);
        if (!validationResult.isValid) {
            return res.status(401).json({ error: validationResult.reason });
        }
        // Attach user to request object
        req.user = user;
        req.firebaseUser = decoded;
        next();
    }
    catch (err) {
        // Check if it's a database connection error
        if (err.name === 'MongooseError' && err.message.includes('buffering')) {
            console.error('Database operation timed out - MongoDB not connected');
            return res.status(503).json({
                error: 'Database connection unavailable',
                message: 'The database is not connected. Please check your MongoDB connection and try again.'
            });
        }
        console.error('syncUser error:', err);
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}
/**
 * Middleware to validate user session without syncing
 * Useful for frequent checks where full sync is not needed
 */
async function validateUserSession(req, res, next) {
    try {
        console.log('validateUserSession called');
        console.log('NODE_ENV:', process.env.NODE_ENV);
        console.log('req.user:', req.user);
        console.log('req.firebaseUser:', req.firebaseUser);
        // Check database connection first
        if (!isDatabaseConnected()) {
            console.error('Database not connected - cannot validate user session');
            // In development mode, allow requests to proceed without DB (for testing)
            const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
            if (isDev) {
                console.log('Development mode: Allowing request without DB connection');
                return next();
            }
            return res.status(503).json({
                error: 'Database connection unavailable',
                message: 'The database is not connected. Please check your MongoDB connection and try again.'
            });
        }
        // Check if we're in development mode
        const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
        console.log('isDev:', isDev);
        // If devAuth has already attached a user, skip token verification
        if (req.user && req.firebaseUser) {
            console.log('Skipping token verification - user already attached');
            return next();
        }
        // In development mode, allow requests without token to proceed to devAuth middleware
        if (isDev) {
            console.log('In development mode, allowing request to proceed to devAuth');
            return next();
        }
        console.log('Not in development mode, checking for token');
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }
        const idToken = authHeader.split(' ')[1];
        console.log('Token found, verifying...');
        // Verify and decode the token
        const decoded = await verifyToken(idToken, null);
        // Validate decoded token data
        if (!decoded || !decoded.email) {
            return res.status(401).json({ error: 'Invalid token data' });
        }
        // Sanitize email
        const sanitizedEmail = sanitizeEmail(decoded.email);
        if (!sanitizedEmail) {
            return res.status(401).json({ error: 'Invalid email in token' });
        }
        // Update decoded token with sanitized email
        decoded.email = sanitizedEmail;
        // Just validate the existing user without syncing
        let user = await User.findOne({ email: sanitizedEmail });
        // If user doesn't exist, try to create them (for Google sign-in flow)
        if (!user) {
            try {
                user = await UserSyncService.syncUser(decoded);
            }
            catch (syncError) {
                console.error('Failed to sync user:', syncError);
                // Check if it's a database connection error
                if (syncError.name === 'MongooseError' && syncError.message.includes('buffering')) {
                    return res.status(503).json({
                        error: 'Database connection unavailable',
                        message: 'The database is not connected. Please check your MongoDB connection and try again.'
                    });
                }
                return res.status(401).json({ error: 'User not found and could not be created' });
            }
        }
        const validationResult = UserSyncService.validateUserSession(user);
        if (!validationResult.isValid) {
            return res.status(401).json({ error: validationResult.reason });
        }
        // Attach user to request object
        req.user = user;
        req.firebaseUser = decoded;
        next();
    }
    catch (err) {
        console.error('validateUserSession error:', err);
        // Check if it's a database connection error
        if (err.name === 'MongooseError' && err.message.includes('buffering')) {
            console.error('Database operation timed out - MongoDB not connected');
            const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
            if (isDev) {
                console.log('Development mode: Allowing request without DB connection');
                return next();
            }
            return res.status(503).json({
                error: 'Database connection unavailable',
                message: 'The database is not connected. Please check your MongoDB connection and try again.'
            });
        }
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}
module.exports = { syncUser, validateUserSession };
