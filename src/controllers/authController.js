"use strict";

const admin = require('../utils/firebase');

// Example: Verify a Firebase ID token
async function verifyToken(idToken) {
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    throw error;
  }
}

module.exports = { verifyToken };
