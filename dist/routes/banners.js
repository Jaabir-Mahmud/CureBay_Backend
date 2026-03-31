"use strict";
const express = require('express');
const router = express.Router();
const { getBanners, getBannerById, createBanner, updateBanner, deleteBanner, toggleBannerStatus, updateBannerPriority } = require('../controllers/bannerController');
const { syncUser } = require('../middleware/userSync');
const { requireDatabase } = require('../middleware/dbCheck');
const mongoose = require('mongoose');
// Public routes
router.get('/', requireDatabase, (req, res) => {
    console.log('GET /api/banners called');
    return getBanners(req, res);
});
// Get banner by ID - only match valid MongoDB ObjectIds
router.get('/:id', (req, res, next) => {
    console.log(`GET /api/banners/${req.params.id} called`);
    // Check if ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        console.log(`Invalid ObjectId: ${req.params.id}`);
        return next(); // Pass to next middleware/route
    }
    return getBannerById(req, res);
});
// Protected routes (require authentication)
router.post('/', syncUser, createBanner);
router.put('/:id', syncUser, updateBanner);
router.delete('/:id', syncUser, deleteBanner);
router.patch('/:id/toggle-status', syncUser, (req, res) => {
    console.log(`PATCH /api/banners/${req.params.id}/toggle-status called`);
    // Check if ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        console.log(`Invalid ObjectId for toggle-status: ${req.params.id}`);
        return res.status(400).json({ error: 'Invalid banner ID' });
    }
    return toggleBannerStatus(req, res);
});
router.patch('/:id/priority', syncUser, updateBannerPriority);
module.exports = router;
