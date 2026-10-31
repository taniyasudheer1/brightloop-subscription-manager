const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// ==========================================
// 1. GET ALL PLANS (WITH PRODUCT DETAILS)
// ==========================================
router.get('/', (req, res) => {
    try {
        const result = db.query(`
            SELECT pl.*, 
                   p.name as product_name, 
                   p.type as product_type,
                   p.sales_price as base_product_price
            FROM plans pl
            LEFT JOIN products p ON pl.product_id = p.id
            ORDER BY pl.id DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching plans:', err);
        res.status(500).json({ error: 'Server error fetching plans.' });
    }
});

// ==========================================
// 2. CREATE PRICING PLAN (ADMIN ONLY)
// ==========================================
// PDF requirement: "what it costs and how often it bills (daily, weekly, monthly or yearly),
// the minimum quantity, and the dates it is available. Some plans should close on their own
// when they end, and others can be closed early, paused or renewed. The admin decides which, plan by plan."
router.post('/', authenticateToken, requireRole('admin'), (req, res) => {
    try {
        const {
            product_id,
            name,
            billing_frequency,
            price,
            min_quantity,
            start_date,
            end_date,
            auto_close,
            can_close_early,
            can_pause,
            can_renew
        } = req.body;

        const validFrequencies = ['daily', 'weekly', 'monthly', 'yearly'];
        if (!validFrequencies.includes(billing_frequency)) {
            return res.status(400).json({ 
                error: 'Invalid billing frequency. Must be one of: daily, weekly, monthly, yearly.' 
            });
        }

        if (!product_id || !name || price === undefined || !start_date) {
            return res.status(400).json({ 
                error: 'Product, plan name, price, and start date are required.' 
            });
        }

        const result = db.query(`
            INSERT INTO plans (
                product_id, name, billing_frequency, price, min_quantity,
                start_date, end_date, auto_close, can_close_early, can_pause, can_renew
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *
        `, [
            parseInt(product_id, 10),
            name.trim(),
            billing_frequency,
            parseFloat(price),
            parseInt(min_quantity, 10) || 1,
            start_date,
            end_date || null,
            auto_close ? 1 : 0,
            can_close_early !== undefined ? (can_close_early ? 1 : 0) : 1,
            can_pause !== undefined ? (can_pause ? 1 : 0) : 1,
            can_renew !== undefined ? (can_renew ? 1 : 0) : 1
        ]);

        res.status(201).json({
            message: 'Pricing plan created successfully.',
            plan: result.rows[0]
        });
    } catch (err) {
        console.error('Error creating plan:', err);
        res.status(500).json({ error: 'Server error creating plan.' });
    }
});

// ==========================================
// 3. UPDATE PLAN (ADMIN ONLY)
// ==========================================
router.put('/:id', authenticateToken, requireRole('admin'), (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            billing_frequency,
            price,
            min_quantity,
            start_date,
            end_date,
            auto_close,
            can_close_early,
            can_pause,
            can_renew
        } = req.body;

        const existing = db.query('SELECT * FROM plans WHERE id = ?', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Plan not found.' });
        }
        const cur = existing.rows[0];

        const updated = db.query(`
            UPDATE plans SET
                name = ?,
                billing_frequency = ?,
                price = ?,
                min_quantity = ?,
                start_date = ?,
                end_date = ?,
                auto_close = ?,
                can_close_early = ?,
                can_pause = ?,
                can_renew = ?
            WHERE id = ?
            RETURNING *
        `, [
            name !== undefined ? name.trim() : cur.name,
            billing_frequency || cur.billing_frequency,
            price !== undefined ? parseFloat(price) : cur.price,
            min_quantity !== undefined ? parseInt(min_quantity, 10) : cur.min_quantity,
            start_date || cur.start_date,
            end_date !== undefined ? end_date : cur.end_date,
            auto_close !== undefined ? (auto_close ? 1 : 0) : cur.auto_close,
            can_close_early !== undefined ? (can_close_early ? 1 : 0) : cur.can_close_early,
            can_pause !== undefined ? (can_pause ? 1 : 0) : cur.can_pause,
            can_renew !== undefined ? (can_renew ? 1 : 0) : cur.can_renew,
            id
        ]);

        res.json({
            message: 'Plan updated successfully.',
            plan: updated.rows[0]
        });
    } catch (err) {
        console.error('Error updating plan:', err);
        res.status(500).json({ error: 'Server error updating plan.' });
    }
});

// ==========================================
// 4. DELETE PLAN (ADMIN ONLY)
// ==========================================
router.delete('/:id', authenticateToken, requireRole('admin'), (req, res) => {
    try {
        const { id } = req.params;
        const result = db.query('DELETE FROM plans WHERE id = ?', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Plan not found.' });
        }
        res.json({ message: 'Plan deleted successfully.' });
    } catch (err) {
        console.error('Error deleting plan:', err);
        res.status(500).json({ error: 'Server error deleting plan.' });
    }
});

module.exports = router;
