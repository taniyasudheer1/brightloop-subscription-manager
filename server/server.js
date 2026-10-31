const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Initialize DB and Seed data
require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Import Route Handlers
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const productRoutes = require('./routes/products');
const planRoutes = require('./routes/plans');
const taxRoutes = require('./routes/taxes');
const discountRoutes = require('./routes/discounts');
const templateRoutes = require('./routes/templates');
const subscriptionRoutes = require('./routes/subscriptions');
const billingRoutes = require('./routes/billing');
const invoiceRoutes = require('./routes/invoices');
const paymentRoutes = require('./routes/payments');
const financeRoutes = require('./routes/finance');

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/taxes', taxRoutes);
app.use('/api/discounts', discountRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/finance', financeRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'Brightloop Subscription Manager API',
        timestamp: new Date().toISOString()
    });
});

// Serve frontend client statically
const clientPath = path.resolve(__dirname, '../client');
app.use(express.static(clientPath));

// Fallback to client/index.html for any SPA routes
app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    const indexPath = path.join(clientPath, 'index.html');
    if (require('fs').existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.send('Brightloop Subscription Manager API is up and running. Client assets loading...');
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({ error: 'Internal server error occurred.' });
});

// Start Server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(` Brightloop Subscription Manager running on port ${PORT}`);
        console.log(` Local web access: http://localhost:${PORT}`);
        console.log(` API Health check: http://localhost:${PORT}/api/health`);
        console.log(`====================================================`);
    });
}

module.exports = app;
