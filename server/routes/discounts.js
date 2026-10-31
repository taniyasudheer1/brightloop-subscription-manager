const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// ==========================================
// 1. GET ALL DISCOUNTS (ADMIN ONLY)
// ==========================================
router.get('/', authenticateToken, requireRole('admin'), (req, res) => {
    try {
        const result = db.query(`
            SELECT d.*, p.name as product_name
            FROM discounts d
            LEFT JOIN products p ON d.product_id = p.id
            ORDER BY d.id DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching discounts:', err);
        res.status(500).json({ error: 'Server error fetching discounts.' });
    }
});

// ==========================================
// 2. GET ACTIVE DISCOUNTS (FOR SALES STAFF IN QUOTES)
// ==========================================
router.get('/active', authenticateToken, (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const result = db.query(`
            SELECT d.*, p.name as product_name
            FROM discounts d
            LEFT JOIN products p ON d.product_id = p.id
            WHERE d.is_active = 1
              AND d.start_date <= ?
              AND d.end_date >= ?
              AND (d.usage_limit IS NULL OR d.usage_count < d.usage_limit)
            ORDER BY d.name ASC
        `, [today, today]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching active discounts:', err);
        res.status(500).json({ error: 'Server error fetching active discounts.' });
    }
});

// ==========================================
// 3. CREATE DISCOUNT RULE (ADMIN ONLY)
// ==========================================
// PDF requirement: "Only the admin can create discount rules: a fixed amount or a percentage,
// with a minimum purchase or quantity, start and end dates, and a limit on how many times it can be used.
// A discount can apply to specific products or to whole subscriptions."
router.post('/', authenticateToken, requireRole('admin'), (req, res) => {
    try {
        const {
            name,
            code,
            rule_type,
            value,
            min_purchase,
            min_quantity,
            start_date,
            end_date,
            usage_limit,
            scope,
            product_id
        } = req.body;

        if (!name || !code || !rule_type || value === undefined || !start_date || !end_date) {
            return res.status(400).json({ 
                error: 'Name, code, rule type, discount value, start date, and end date are required.' 
            });
        }

        if (!['fixed', 'percentage'].includes(rule_type)) {
            return res.status(400).json({ error: 'Rule type must be either "fixed" or "percentage".' });
        }

        const validScope = ['all', 'product', 'subscription'].includes(scope) ? scope : 'subscription';

        const result = db.query(`
            INSERT INTO discounts (
                name, code, rule_type, value, min_purchase, min_quantity,
                start_date, end_date, usage_limit, usage_count, scope, product_id, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1)
            RETURNING *
        `, [
            name.trim(),
            code.trim().toUpperCase(),
            rule_type,
            parseFloat(value),
            parseFloat(min_purchase) || 0,
            parseInt(min_quantity, 10) || 0,
            start_date,
            end_date,
            usage_limit ? parseInt(usage_limit, 10) : null,
            validScope,
            product_id ? parseInt(product_id, 10) : null
        ]);

        res.status(201).json({
            message: 'Discount rule created successfully.',
            discount: result.rows[0]
        });
    } catch (err) {
        console.error('Error creating discount rule:', err);
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'A discount with this coupon code already exists.' });
        }
        res.status(500).json({ error: 'Server error creating discount rule.' });
    }
});

// ==========================================
// 4. UPDATE DISCOUNT RULE (ADMIN ONLY)
// ==========================================
router.put('/:id', authenticateToken, requireRole('admin'), (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            rule_type,
            value,
            min_purchase,
            min_quantity,
            start_date,
            end_date,
            usage_limit,
            scope,
            product_id,
            is_active
        } = req.body;

        const existing = db.query('SELECT * FROM discounts WHERE id = ?', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Discount not found.' });
        }
        const cur = existing.rows[0];

        const updated = db.query(`
            UPDATE discounts SET
                name = COALESCE(?, name),
                rule_type = COALESCE(?, rule_type),
                value = COALESCE(?, value),
                min_purchase = COALESCE(?, min_purchase),
                min_quantity = COALESCE(?, min_quantity),
                start_date = COALESCE(?, start_date),
                end_date = COALESCE(?, end_date),
                usage_limit = ?,
                scope = COALESCE(?, scope),
                product_id = ?,
                is_active = COALESCE(?, is_active)
            WHERE id = ?
            RETURNING *
        `, [
            name ? name.trim() : null,
            rule_type || null,
            value !== undefined ? parseFloat(value) : null,
            min_purchase !== undefined ? parseFloat(min_purchase) : null,
            min_quantity !== undefined ? parseInt(min_quantity, 10) : null,
            start_date || null,
            end_date || null,
            usage_limit !== undefined ? (usage_limit ? parseInt(usage_limit, 10) : null) : cur.usage_limit,
            scope || null,
            product_id !== undefined ? (product_id ? parseInt(product_id, 10) : null) : cur.product_id,
            is_active !== undefined ? (is_active ? 1 : 0) : null,
            id
        ]);

        res.json({
            message: 'Discount rule updated successfully.',
            discount: updated.rows[0]
        });
    } catch (err) {
        console.error('Error updating discount:', err);
        res.status(500).json({ error: 'Server error updating discount.' });
    }
});

// ==========================================
// 5. DELETE DISCOUNT (ADMIN ONLY)
// ==========================================
router.delete('/:id', authenticateToken, requireRole('admin'), (req, res) => {
    try {
        const { id } = req.params;
        const result = db.query('DELETE FROM discounts WHERE id = ?', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Discount not found.' });
        }
        res.json({ message: 'Discount deleted successfully.' });
    } catch (err) {
        console.error('Error deleting discount:', err);
        res.status(500).json({ error: 'Server error deleting discount.' });
    }
});

module.exports = router;
