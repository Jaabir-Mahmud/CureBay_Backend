const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const path = require('path');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const medicineRoutes = require('./routes/medicines');
const categoryRoutes = require('./routes/categories');
const heroSlideRoutes = require('./routes/heroSlides');
const bannerRoutes = require('./routes/banners');
const orderRoutes = require('./routes/orders');
const couponRoutes = require('./routes/coupons');
const paymentRoutes = require('./routes/payments');
const reviewsRoutes = require('./routes/reviews');
const statsRoutes = require('./routes/stats');
const { devAuth } = require('./middleware/devAuth');

const Medicine = require('./models/Medicine');
const User = require('./models/User');
const Order = require('./models/Order');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://cure-bay-client.vercel.app'
  ],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply devAuth middleware only in development mode
console.log('Checking NODE_ENV:', process.env.NODE_ENV);
if (process.env.NODE_ENV === 'development') {
    console.log('Applying devAuth middleware');
    app.use(devAuth);
} else {
    console.log('Not applying devAuth middleware, NODE_ENV:', process.env.NODE_ENV);
}

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Register routes
console.log('Registering routes...');
app.use('/api/auth', authRoutes);
console.log('Registered /api/auth');
app.use('/api/users', userRoutes);
console.log('Registered /api/users');
app.use('/api/admin', adminRoutes);
console.log('Registered /api/admin');
app.use('/api/medicines', medicineRoutes);
console.log('Registered /api/medicines');
app.use('/api/categories', categoryRoutes);
console.log('Registered /api/categories');
app.use('/api/hero-slides', heroSlideRoutes);
console.log('Registered /api/hero-slides');
app.use('/api/banners', bannerRoutes);
console.log('Registered /api/banners');
app.use('/api/orders', orderRoutes);
console.log('Registered /api/orders');
app.use('/api/coupons', couponRoutes);
console.log('Registered /api/coupons');
app.use('/api/payments', paymentRoutes);
console.log('Registered /api/payments');
app.use('/api/reviews', reviewsRoutes);
console.log('Registered /api/reviews');
app.use('/api/stats', statsRoutes);
console.log('Registered /api/stats');

// Root route
app.get('/', (req, res) => {
    res.json({ message: 'CureBay API Server is running!' });
});

// Health check endpoint for UptimeRobot
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
    console.log('404 handler hit for URL:', req.url);
    console.log('Request method:', req.method);
    res.status(404).json({ message: 'Route not found' });
});

// Helper function to convert SRV to direct connection string
function convertSrvToDirect(srvUri) {
    // Extract credentials and database from SRV URI
    const match = srvUri.match(/mongodb\+srv:\/\/([^:]+):([^@]+)@([^/]+)\/(.+)/);
    if (!match) return null;
    
    const [, username, password, host, dbPath] = match;
    const [dbName, ...queryParams] = dbPath.split('?');
    
    // For Atlas, try common shard hostnames
    // This is a fallback - user should get direct connection string from Atlas
    const directHost = host.replace('.mongodb.net', '-shard-00-00.xxxxx.mongodb.net:27017');
    
    const query = queryParams.length > 0 ? '?' + queryParams.join('?') : '';
    return `mongodb://${username}:${password}@${directHost}/${dbName}${query}`;
}

// Database connection with retry logic
async function connectDB(retryCount = 0, useDirectFallback = false) {
    const maxRetries = 3;
    const retryDelay = 5000; // 5 seconds
    
    try {
        let mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/curebay';
        
        // If SRV failed and we have a direct connection string fallback, use it
        if (useDirectFallback && mongoUri.startsWith('mongodb+srv://')) {
            const directUri = process.env.MONGODB_URI_DIRECT;
            if (directUri) {
                console.log('🔄 Trying direct connection string (SRV failed)...');
                mongoUri = directUri;
            } else {
                console.log('⚠️  SRV connection failed. Consider adding MONGODB_URI_DIRECT to .env');
                console.log('   Get direct connection string from MongoDB Atlas → Connect → Drivers → Standard connection string');
            }
        }
        
        // Log connection attempt (without sensitive data)
        const uriForLog = mongoUri.includes('@') 
            ? mongoUri.split('@')[1] 
            : mongoUri;
        const connectionType = mongoUri.startsWith('mongodb+srv://') ? 'SRV' : 'Direct';
        console.log(`Attempting to connect to MongoDB (${connectionType}, attempt ${retryCount + 1}/${maxRetries + 1}):`, uriForLog);
        
        const connectionOptions = {
            serverSelectionTimeoutMS: 10000, // 10 seconds timeout
            socketTimeoutMS: 45000, // 45 seconds socket timeout
            connectTimeoutMS: 10000, // 10 seconds connection timeout
            retryWrites: true,
            w: 'majority'
        };
        
        await mongoose.connect(mongoUri, connectionOptions);
        console.log('✅ MongoDB connected successfully');
        
        // Handle connection events
        mongoose.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err);
        });
        
        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️  MongoDB disconnected');
        });
        
        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB reconnected');
        });
        
    } catch (error) {
        console.error('MongoDB connection error:', error.message);
        console.error('Error code:', error.code);
        console.error('Error name:', error.name);
        
        // Provide helpful error messages
        if (error.code === 'ENOTFOUND') {
            console.error('\n⚠️  DNS Resolution Failed!');
            console.error('Possible causes:');
            console.error('  1. Check your internet connection');
            console.error('  2. Verify the MongoDB Atlas cluster is active (not paused)');
            console.error('  3. Check if the MONGODB_URI in .env is correct');
            console.error('  4. Verify network/firewall settings allow MongoDB connections');
            console.error('  5. Try using a different DNS server (e.g., 8.8.8.8)');
            console.error('\n💡 Solution: If using MongoDB Atlas SRV connection string, try:');
            console.error('   - Convert SRV to direct connection string in MongoDB Atlas');
            console.error('   - Or use: mongodb+srv://...?directConnection=false');
        } else if (error.code === 'ETIMEDOUT') {
            console.error('\n⚠️  Connection Timeout!');
            console.error('The MongoDB server did not respond in time.');
        } else if (error.message.includes('authentication')) {
            console.error('\n⚠️  Authentication Failed!');
            console.error('Check your MongoDB username and password in MONGODB_URI');
        }
        
        console.error('\n💡 Tip: If using MongoDB Atlas, ensure:');
        console.error('  - Your IP address is whitelisted in Network Access');
        console.error('  - The database user has proper permissions');
        console.error('  - The cluster is not paused');
        
        // Retry logic for DNS errors
        if (error.code === 'ENOTFOUND') {
            // If SRV failed and we haven't tried direct connection yet, try it
            if (mongoUri.startsWith('mongodb+srv://') && !useDirectFallback) {
                console.error('\n🔄 SRV connection failed. Attempting direct connection fallback...');
                const directUri = process.env.MONGODB_URI_DIRECT;
                if (directUri) {
                    return connectDB(0, true);
                } else {
                    console.error('\n💡 To use direct connection fallback:');
                    console.error('   1. Go to MongoDB Atlas → Your Cluster → Connect');
                    console.error('   2. Choose "Connect your application" → Node.js');
                    console.error('   3. Copy the "Standard connection string" (not SRV)');
                    console.error('   4. Add it to .env as: MONGODB_URI_DIRECT=...');
                }
            }
            
            // Retry with same method
            if (retryCount < maxRetries) {
                console.error(`\n🔄 Retrying connection in ${retryDelay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return connectDB(retryCount + 1, useDirectFallback);
            }
        }
        
        // Don't exit - allow server to start even without DB connection
        // This is useful for development and allows the server to be restarted
        console.error('\n⚠️  Server will start but database operations will fail.');
        console.error('Fix the MongoDB connection issue and the server will reconnect automatically.');
        console.error('You can also restart the server manually once the connection is fixed.');
        
        // Set up automatic reconnection attempts
        const reconnectInterval = setInterval(async () => {
            if (!mongoose.connection.readyState) {
                console.log('\n🔄 Attempting to reconnect to MongoDB...');
                try {
                    await connectDB(0);
                    clearInterval(reconnectInterval);
                } catch (err) {
                    console.error('Reconnection attempt failed:', err.message);
                }
            } else {
                clearInterval(reconnectInterval);
            }
        }, 30000); // Try every 30 seconds
    }
}

// Start server
async function startServer() {
    // Connect to database (non-blocking - server will start even if DB fails)
    connectDB().catch(err => {
        console.error('Initial database connection failed, but server will continue...');
    });
    
    // Start server regardless of database connection status
    const server = app.listen(PORT, () => {
        console.log(`\n🚀 Server running on port ${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        if (!mongoose.connection.readyState) {
            console.log('⚠️  Warning: Database not connected. Some features may not work.');
        }
    });
}

startServer();

module.exports = app;