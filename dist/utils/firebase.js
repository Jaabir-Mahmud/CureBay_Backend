"use strict";
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
// Check if we're in development mode
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
try {
    // In development mode, we can initialize Firebase Admin without service account
    if (isDevelopment) {
        if (!admin.apps.length) {
            const app = admin.initializeApp({
                projectId: 'curebay-21207'
            });
            app.isDevelopmentMode = true;
        }
    }
    else {
        // In production, we need the service account
        // Determine the correct path for the service account file
        let serviceAccountPath;
        // When running from dist, the service account file is still in src/config
        // We need to find the correct path relative to where we're running from
        const isRunningFromDist = __dirname.includes(path.join('dist', 'utils'));
        if (isRunningFromDist) {
            // Running from dist/utils, need to go up 3 levels to project root, then to backend/src/config
            serviceAccountPath = path.resolve(__dirname, '../../../backend/src/config/firebase-service-account.json');
        }
        else {
            // Running from src/utils, need to go up 1 level to src, then to config
            serviceAccountPath = path.resolve(__dirname, '../config/firebase-service-account.json');
        }
        // Check if file exists
        if (!fs.existsSync(serviceAccountPath)) {
            throw new Error(`Firebase service account file not found at: ${serviceAccountPath}`);
        }
        const serviceAccount = require(serviceAccountPath);
        if (!admin.apps.length) {
            const app = admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://curebay-21207-default-rtdb.firebaseio.com'
            });
        }
    }
}
catch (error) {
    // Fallback for development
    if (!admin.apps.length) {
        const app = admin.initializeApp({
            projectId: 'curebay-21207'
        });
        // Only set development mode if we're actually in development
        if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
            app.isDevelopmentMode = true;
        }
        else {
            app.isDevelopmentMode = false;
        }
    }
}
// Add a helper function to check if we're in development mode
admin.isDevelopmentMode = () => {
    return admin.apps.length > 0 && admin.app().isDevelopmentMode;
};
module.exports = admin;
