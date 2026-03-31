"use strict";
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Medicine = require('../models/Medicine');
const Order = require('../models/Order');
const { syncUser, validateUserSession } = require('../middleware/userSync');
// Apply sync middleware to all routes in this file to ensure authentication
// Use validateUserSession for frequent checks where full sync is not needed
router.use(validateUserSession);
// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admins only.' });
    }
    next();
};
// Apply admin check to all routes
router.use(requireAdmin);
// GET /api/admin/overview
router.get('/overview', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalSellers = await User.countDocuments({ role: 'seller' });
        const totalMedicines = await Medicine.countDocuments();
        const totalOrders = await Order.countDocuments();
        // Orders as payments
        const orders = await Order.find();
        const totalRevenue = orders.filter(o => o.paymentStatus === 'paid').reduce((sum, o) => sum + o.totalAmount, 0);
        const paidTotal = totalRevenue;
        const pendingTotal = orders.filter(o => o.paymentStatus === 'pending').reduce((sum, o) => sum + o.totalAmount, 0);
        res.json({
            totalUsers,
            totalSellers,
            totalMedicines,
            totalOrders,
            totalRevenue,
            paidTotal,
            pendingTotal
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// GET /api/admin/test
router.get('/test', async (req, res) => {
    console.log('Test endpoint hit');
    res.json({ message: 'Test endpoint working' });
});
// GET /api/admin/reports/sales
router.get('/reports/sales', async (req, res) => {
    console.log('Reports sales endpoint hit');
    console.log('Query parameters:', req.query);
    try {
        const { start, end, type } = req.query;
        // Parse dates
        const startDate = new Date(start);
        const endDate = new Date(end);
        // Validate dates
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json({ error: 'Invalid date parameters' });
        }
        // Build date query
        const dateQuery = {
            createdAt: {
                $gte: startDate,
                $lte: endDate
            }
        };
        // Get orders within date range and populate necessary fields
        const orders = await Order.find(dateQuery)
            .populate('user', 'name email')
            .populate('items.medicine', 'name category company seller')
            .populate('items.medicine.category', 'name')
            .exec();
        // Calculate sales data based on report type
        switch (type) {
            case 'overview':
                // Calculate overview data
                const totalSales = orders.filter(o => o.paymentStatus === 'paid').reduce((sum, o) => sum + o.totalAmount, 0);
                const totalOrders = orders.length;
                const paidOrders = orders.filter(o => o.paymentStatus === 'paid').length;
                const totalCustomers = [...new Set(orders.map(o => o.user?._id))].length;
                const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
                // Calculate growth (simplified - comparing to previous period)
                const previousPeriodStart = new Date(startDate);
                previousPeriodStart.setDate(previousPeriodStart.getDate() - Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)));
                const previousPeriodEnd = new Date(startDate);
                const previousOrders = await Order.find({
                    createdAt: {
                        $gte: previousPeriodStart,
                        $lte: previousPeriodEnd
                    }
                });
                const previousSales = previousOrders.filter(o => o.paymentStatus === 'paid').reduce((sum, o) => sum + o.totalAmount, 0);
                const previousTotalOrders = previousOrders.length;
                const previousCustomers = [...new Set(previousOrders.map(o => o.user?._id))].length;
                const salesGrowth = previousSales > 0 ? ((totalSales - previousSales) / previousSales) * 100 : 0;
                const ordersGrowth = previousTotalOrders > 0 ? ((totalOrders - previousTotalOrders) / previousTotalOrders) * 100 : 0;
                const customersGrowth = previousCustomers > 0 ? ((totalCustomers - previousCustomers) / previousCustomers) * 100 : 0;
                res.json({
                    overview: {
                        period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
                        totalSales,
                        totalOrders,
                        paidOrders,
                        totalCustomers,
                        averageOrderValue,
                        growth: {
                            sales: salesGrowth.toFixed(2),
                            orders: ordersGrowth.toFixed(2),
                            customers: customersGrowth.toFixed(2)
                        }
                    }
                });
                break;
            case 'medicines':
                // Get medicine sales data
                const medicineSales = {};
                orders.forEach(order => {
                    if (order.paymentStatus === 'paid' && order.items) {
                        order.items.forEach(item => {
                            if (item.medicine) {
                                const medicineId = item.medicine._id.toString();
                                if (!medicineSales[medicineId]) {
                                    medicineSales[medicineId] = {
                                        name: item.medicine.name,
                                        category: item.medicine.category?.name || 'Unknown',
                                        seller: item.medicine.seller || 'Unknown',
                                        quantitySold: 0,
                                        revenue: 0,
                                        avgPrice: item.medicine.price
                                    };
                                }
                                medicineSales[medicineId].quantitySold += item.quantity;
                                medicineSales[medicineId].revenue += item.price * item.quantity;
                            }
                        });
                    }
                });
                // Convert to array and sort by revenue
                const medicines = Object.entries(medicineSales)
                    .map(([id, data]) => ({ id, ...data }))
                    .sort((a, b) => b.revenue - a.revenue)
                    .slice(0, 20); // Top 20 medicines
                res.json({ medicines });
                break;
            case 'sellers':
                // Get seller performance data (assuming sellers are users with role 'seller')
                const sellersMap = {};
                orders.forEach(order => {
                    if (order.paymentStatus === 'paid' && order.items) {
                        order.items.forEach(item => {
                            if (item.medicine && item.medicine.seller) {
                                const sellerId = item.medicine.seller.toString();
                                if (!sellersMap[sellerId]) {
                                    sellersMap[sellerId] = {
                                        id: sellerId,
                                        name: 'Unknown Seller',
                                        email: '',
                                        totalSales: 0,
                                        totalOrders: 0,
                                        totalMedicines: 0,
                                        orderSet: new Set(), // To count unique orders
                                        commission: 0
                                    };
                                }
                                sellersMap[sellerId].totalSales += item.price * item.quantity;
                                sellersMap[sellerId].totalMedicines += item.quantity;
                                sellersMap[sellerId].orderSet.add(order._id.toString());
                            }
                        });
                    }
                });
                // Get seller details
                const sellerIds = Object.keys(sellersMap);
                if (sellerIds.length > 0) {
                    const sellers = await User.find({ _id: { $in: sellerIds }, role: 'seller' });
                    sellers.forEach(seller => {
                        const sellerId = seller._id.toString();
                        if (sellersMap[sellerId]) {
                            sellersMap[sellerId].name = seller.name;
                            sellersMap[sellerId].email = seller.email;
                        }
                    });
                }
                // Convert order sets to counts and calculate commission
                const sellerPerformance = Object.values(sellersMap).map(seller => {
                    const totalOrders = seller.orderSet.size;
                    const averageOrderValue = totalOrders > 0 ? seller.totalSales / totalOrders : 0;
                    const commission = seller.totalSales * 0.1; // 10% commission
                    // Remove the orderSet as it's not serializable
                    const { orderSet, ...rest } = seller;
                    return {
                        ...rest,
                        totalOrders,
                        averageOrderValue,
                        commission
                    };
                });
                // Sort by total sales
                sellerPerformance.sort((a, b) => b.totalSales - a.totalSales);
                res.json({ sellers: sellerPerformance });
                break;
            case 'customers':
                // Get customer analytics
                const customerMap = {};
                orders.forEach(order => {
                    if (order.user) {
                        const userId = order.user._id.toString();
                        if (!customerMap[userId]) {
                            customerMap[userId] = {
                                id: userId,
                                name: order.user.name,
                                email: order.user.email,
                                totalSpent: 0,
                                totalOrders: 0,
                                orderDates: []
                            };
                        }
                        if (order.paymentStatus === 'paid') {
                            customerMap[userId].totalSpent += order.totalAmount;
                        }
                        customerMap[userId].totalOrders += 1;
                        customerMap[userId].orderDates.push(order.createdAt);
                    }
                });
                // Calculate average order value and find last order date
                const customers = Object.values(customerMap).map(customer => {
                    const averageOrderValue = customer.totalOrders > 0 ? customer.totalSpent / customer.totalOrders : 0;
                    const lastOrderDate = customer.orderDates.length > 0
                        ? new Date(Math.max(...customer.orderDates.map(date => new Date(date))))
                        : null;
                    return {
                        ...customer,
                        averageOrderValue,
                        lastOrderDate
                    };
                });
                // Sort by total spent
                customers.sort((a, b) => b.totalSpent - a.totalSpent);
                res.json({ customers });
                break;
            default:
                res.json({});
        }
    }
    catch (err) {
        console.error('Error generating sales report:', err);
        res.status(500).json({ error: 'Failed to generate sales report' });
    }
});
// POST /api/admin/reports/export
router.post('/reports/export', async (req, res) => {
    try {
        const { format, type } = req.query;
        const { reportData, dateRange } = req.body;
        // In a real implementation, you would generate the actual file here
        // For now, we'll just send a placeholder response
        if (format === 'csv') {
            // Generate CSV content
            let csvContent = 'Report Data\n';
            switch (type) {
                case 'overview':
                    csvContent += 'Metric,Value\n';
                    csvContent += `Total Sales,${reportData?.overview?.totalSales || 0}\n`;
                    csvContent += `Total Orders,${reportData?.overview?.totalOrders || 0}\n`;
                    csvContent += `Total Customers,${reportData?.overview?.totalCustomers || 0}\n`;
                    csvContent += `Average Order Value,${reportData?.overview?.averageOrderValue || 0}\n`;
                    break;
                case 'medicines':
                    csvContent += 'Medicine,Category,Quantity Sold,Revenue,Avg. Price,Seller\n';
                    if (reportData?.medicines) {
                        reportData.medicines.forEach(medicine => {
                            csvContent += `${medicine.name || ''},${medicine.category || ''},${medicine.quantitySold || 0},${medicine.revenue || 0},${medicine.avgPrice || 0},${medicine.seller || ''}\n`;
                        });
                    }
                    break;
                case 'sellers':
                    csvContent += 'Seller,Total Sales,Orders,Medicines,Avg. Order Value,Commission\n';
                    if (reportData?.sellers) {
                        reportData.sellers.forEach(seller => {
                            csvContent += `${seller.name || ''},${seller.totalSales || 0},${seller.totalOrders || 0},${seller.totalMedicines || 0},${seller.averageOrderValue || 0},${seller.commission || 0}\n`;
                        });
                    }
                    break;
                case 'customers':
                    csvContent += 'Customer,Email,Total Spent,Orders,Avg. Order Value,Last Order\n';
                    if (reportData?.customers) {
                        reportData.customers.forEach(customer => {
                            csvContent += `${customer.name || ''},${customer.email || ''},${customer.totalSpent || 0},${customer.totalOrders || 0},${customer.averageOrderValue || 0},${customer.lastOrderDate || ''}\n`;
                        });
                    }
                    break;
            }
            res.header('Content-Type', 'text/csv');
            res.attachment(`sales-report-${type}-${new Date().toISOString().split('T')[0]}.csv`);
            return res.send(csvContent);
        }
        else if (format === 'pdf') {
            // For PDF, we would typically generate a PDF file
            // Here we'll send a simple text response indicating it's a PDF
            res.header('Content-Type', 'application/pdf');
            res.attachment(`sales-report-${type}-${new Date().toISOString().split('T')[0]}.pdf`);
            return res.send(`PDF Report for ${type} - This is a placeholder PDF content`);
        }
        else {
            return res.status(400).json({ error: 'Unsupported format' });
        }
    }
    catch (err) {
        console.error('Error exporting report:', err);
        res.status(500).json({ error: 'Failed to export report' });
    }
});
// GET /api/admin/recent-users
router.get('/recent-users', async (req, res) => {
    try {
        const users = await User.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select('name email role isActive createdAt');
        res.json(users);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// GET /api/admin/pending-payments
router.get('/pending-payments', async (req, res) => {
    try {
        // Find all orders with paymentStatus 'pending'
        const orders = await Order.find({ paymentStatus: 'pending' })
            .populate('user', 'name email')
            .sort({ createdAt: -1 })
            .limit(10);
        // Map to required fields
        const payments = orders.map(order => ({
            id: order._id,
            amount: order.totalAmount,
            customer: order.user ? (order.user.name || order.user.email) : 'Unknown',
            email: order.user ? order.user.email : '',
            date: order.createdAt,
        }));
        res.json(payments);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// GET /api/admin/payments
router.get('/payments', async (req, res) => {
    try {
        // Find all orders and populate user and medicine details
        const orders = await Order.find()
            .populate('user', 'name email')
            .populate('items.medicine')
            .sort({ createdAt: -1 });
        // Map orders to payment format expected by frontend
        const payments = orders.map(order => ({
            id: order._id,
            orderId: `ORD-${order._id.toString().substring(0, 8).toUpperCase()}`,
            customerName: order.user ? (order.user.name || order.user.email) : 'Unknown Customer',
            customerEmail: order.user ? order.user.email : '',
            amount: order.totalAmount,
            paymentMethod: 'Credit Card', // Default for now
            status: order.paymentStatus,
            createdAt: order.createdAt,
            acceptedAt: order.paymentStatus === 'paid' ? order.updatedAt : null,
            rejectedAt: order.paymentStatus === 'failed' ? order.updatedAt : null,
            medicines: order.items.map(item => ({
                name: item.medicine ? item.medicine.name : 'Unknown Medicine',
                quantity: item.quantity,
                price: item.price
            })),
            paymentDetails: {
                cardLast4: '1234', // Default for now
                transactionId: `TXN-${order._id.toString().substring(0, 8).toUpperCase()}`
            }
        }));
        res.json(payments);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// PATCH /api/admin/accept-payment/:orderId
router.patch('/accept-payment/:orderId', async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);
        if (!order)
            return res.status(404).json({ error: 'Order not found' });
        order.paymentStatus = 'paid';
        await order.save();
        res.json({ message: 'Payment accepted', order });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// PATCH /api/admin/payments/:paymentId/accept
router.patch('/payments/:paymentId/accept', async (req, res) => {
    try {
        const order = await Order.findById(req.params.paymentId);
        if (!order)
            return res.status(404).json({ error: 'Order not found' });
        order.paymentStatus = 'paid';
        await order.save();
        res.json({ message: 'Payment accepted', order });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// PATCH /api/admin/payments/:paymentId/reject
router.patch('/payments/:paymentId/reject', async (req, res) => {
    try {
        const order = await Order.findById(req.params.paymentId);
        if (!order)
            return res.status(404).json({ error: 'Order not found' });
        order.paymentStatus = 'failed';
        await order.save();
        res.json({ message: 'Payment rejected', order });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
module.exports = router;
