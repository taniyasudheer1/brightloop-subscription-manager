const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// ==========================================
// 1. GET ALL TAX RULES
// ==========================================
router.get('/', (req, res) => {
    try {
        const taxes = db.query('SELECT * FROM tax_rules WHERE is_active = 1 ORDER BY id ASC').rows;
        res.json(taxes);
    } catch (err) {
        console.error('Error fetching tax rules:', err);
        res.status(500).json({ error: 'Server error fetching tax rules.' });
    }
});

// ==========================================
// 2. CREATE TAX RULE (ADMIN ONLY)
// ==========================================
// PDF requirement: "Taxes are calculated automatically from rules the admin has set."
router.post('/', authenticateToken, requireRole('admin'), (req, res) => {
    try {
        const { name, rate, is_default } = req.body;

        if (!name || rate === undefined) {
            return res.status(400).json({ error: 'Tax name and percentage rate are required.' });
        }

        if (is_default) {
            db.query('UPDATE tax_rules SET is_default = 0');
        }

        const result = db.query(`
            INSERT INTO tax_rules (name, rate, is_default, is_active)
            VALUES (?, ?, ?, 1)
            RETURNING *
        `, [
            name.trim(),
            parseFloat(rate),
            is_default ? 1 : 0
        ]);

        res.status(201).json({
            message: 'Tax rule created successfully.',
            tax_rule: result.rows[0]
        });
    } catch (err) {
        console.error('Error creating tax rule:', err);
        res.status(500).json({ error: 'Server error creating tax rule.' });
    }
});

// ==========================================
// 3. UPDATE TAX RULE (ADMIN ONLY)
// ==========================================
router.put('/:id', authenticateToken, requireRole('admin'), (req, res) => {
    try {
        const { id } = req.params;
        const { name, rate, is_default, is_active } = req.body;

        if (is_default) {
            db.query('UPDATE tax_rules SET is_default = 0 WHERE id != ?', [id]);
        }

        const result = db.query(`
            UPDATE tax_rules SET
                name = COALESCE(?, name),
                rate = COALESCE(?, rate),
                is_default = COALESCE(?, is_default),
                is_active = COALESCE(?, is_active)
            WHERE id = ?
            RETURNING *
        `, [
            name ? name.trim() : null,
            rate !== undefined ? parseFloat(rate) : null,
            is_default !== undefined ? (is_default ? 1 : 0) : null,
            is_active !== undefined ? (is_active ? 1 : 0) : null,
            id
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Tax rule not found.' });
        }

        res.json({
            message: 'Tax rule updated successfully.',
            tax_rule: result.rows[0]
        });
    } catch (err) {
        console.error('Error updating tax rule:', err);
        res.status(500).json({ error: 'Server error updating tax rule.' });
    }
});

module.exports = router;
