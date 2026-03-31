"use strict";
const express = require('express');
const router = express.Router();
const { getMedicines, getMedicineById, getDiscountedMedicines, createMedicine, updateMedicine, deleteMedicine } = require('../controllers/medicineController');
const { syncUser } = require('../middleware/userSync');
const { requireDatabase } = require('../middleware/dbCheck');
// Public routes
router.get('/', requireDatabase, (req, res) => {
    console.log('GET /api/medicines called');
    return getMedicines(req, res);
});
router.get('/discounted', requireDatabase, (req, res) => {
    console.log('GET /api/medicines/discounted called');
    return getDiscountedMedicines(req, res);
});
router.get('/:id', (req, res) => {
    console.log(`GET /api/medicines/${req.params.id} called`);
    return getMedicineById(req, res);
});
// Protected routes (require authentication)
router.post('/', syncUser, createMedicine);
router.put('/:id', syncUser, updateMedicine);
router.delete('/:id', syncUser, deleteMedicine);
module.exports = router;
