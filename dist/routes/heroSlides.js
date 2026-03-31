"use strict";
const express = require('express');
const router = express.Router();
const { getHeroSlides, getHeroSlideById, createHeroSlide, updateHeroSlide, deleteHeroSlide, toggleHeroSlideStatus, updateHeroSlidePriority } = require('../controllers/heroSlideController');
const { syncUser } = require('../middleware/userSync');
const { requireDatabase } = require('../middleware/dbCheck');
const mongoose = require('mongoose');
// Public routes
router.get('/', requireDatabase, (req, res) => {
    console.log('GET /api/hero-slides/ called');
    return getHeroSlides(req, res);
});
// Get hero slide by ID - only match valid MongoDB ObjectIds
router.get('/:id', (req, res, next) => {
    console.log(`GET /api/hero-slides/${req.params.id} called`);
    // Check if ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        console.log(`Invalid ObjectId: ${req.params.id}`);
        return next(); // Pass to next middleware/route
    }
    return getHeroSlideById(req, res);
});
// Protected routes (require authentication)
router.post('/', syncUser, createHeroSlide);
router.put('/:id', syncUser, updateHeroSlide);
router.delete('/:id', syncUser, deleteHeroSlide);
router.patch('/:id/toggle-status', syncUser, (req, res) => {
    console.log(`PATCH /api/hero-slides/${req.params.id}/toggle-status called`);
    // Check if ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        console.log(`Invalid ObjectId for toggle-status: ${req.params.id}`);
        return res.status(400).json({ error: 'Invalid hero slide ID' });
    }
    return toggleHeroSlideStatus(req, res);
});
router.patch('/:id/priority', syncUser, updateHeroSlidePriority);
module.exports = router;
