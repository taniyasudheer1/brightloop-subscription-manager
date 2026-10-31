const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// ==========================================
// 1. ADMIN ONLY: ADD NEW STAFF MEMBER
// ==========================================
// PDF requirement: "Only the admin can add a new member of staff."
router.post('/staff', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { email, password, name, department } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and staff member name are required.' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const existing = db.query('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'A user with this email already exists.' });
        }

        const passwordHash = bcrypt.hashSync(password, 10);
        const result = db.query(`
            INSERT INTO users (email, password_hash, role, name, company)
            VALUES (?, ?, 'staff', ?, ?)
            RETURNING id, email, role, name, company, created_at
        `, [normalizedEmail, passwordHash, name.trim(), department ? `Brightloop - ${department.trim()}` : 'Brightloop Internal Staff']);

        res.status(201).json({
            message: 'Staff member added successfully.',
            staff: result.rows[0]
        });
    } catch (err) {
        console.error('Error adding staff member:', err);
        res.status(500).json({ error: 'Server error adding staff member.' });
    }
});

// ==========================================
// 2. LIST USERS (STAFF & ADMIN)
// ==========================================
router.get('/', authenticateToken, requireRole(['admin', 'staff']), (req, res) => {
    try {
        const { role } = req.query;
        let sql = 'SELECT id, email, role, name, company, created_at FROM users';
        const params = [];

        if (role) {
            sql += ' WHERE role = ?';
            params.push(role);
        }
        sql += ' ORDER BY id DESC';

        const result = db.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Server error fetching users.' });
    }
});

// ==========================================
// 3. GET CUSTOMERS (FOR QUOTE & SUBSCRIPTION CREATION)
// ==========================================
router.get('/customers', authenticateToken, requireRole(['admin', 'staff']), (req, res) => {
    try {
        const result = db.query(`
            SELECT id, email, name, company, created_at 
            FROM users 
            WHERE role = 'customer' 
            ORDER BY name ASC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching customers:', err);
        res.status(500).json({ error: 'Server error fetching customers.' });
    }
});

module.exports = router;
