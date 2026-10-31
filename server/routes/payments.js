const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// ==========================================
// 1. GET ALL PAYMENTS (ROLE-AWARE)
// ==========================================
router.get('/', authenticateToken, (req, res) => {
    try {
        let sql = `
            SELECT p.*,
                   inv.invoice_number,
                   inv.total_amount as invoice_total,
                   u.id as customer_id,
                   u.name as customer_name,
                   u.email as customer_email,
                   u.company as customer_company
            FROM payments p
            JOIN invoices inv ON p.invoice_id = inv.id
            JOIN users u ON inv.customer_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (req.user.role === 'customer') {
            sql += ' AND inv.customer_id = ?';
            params.push(req.user.id);
        }

        sql += ' ORDER BY p.id DESC';

        const result = db.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching payments:', err);
        res.status(500).json({ error: 'Server error fetching payments.' });
    }
});

// ==========================================
// 2. RECORD A NEW PAYMENT
// ==========================================
// PDF requirement: "Payments arrive by different methods and on different days.
// Each one needs to be recorded with its method, amount, date and a note, against the right invoice."
router.post('/', authenticateToken, (req, res) => {
    try {
        const { invoice_id, method, amount, payment_date, notes } = req.body;

        if (!invoice_id || !method || amount === undefined) {
            return res.status(400).json({ error: 'Invoice ID, payment method, and amount are required.' });
        }

        const payAmount = parseFloat(amount);
        if (isNaN(payAmount) || payAmount <= 0) {
            return res.status(400).json({ error: 'Payment amount must be greater than zero.' });
        }

        const invRes = db.query('SELECT * FROM invoices WHERE id = ?', [invoice_id]);
        if (invRes.rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found.' });
        }

        const invoice = invRes.rows[0];

        // Customer can only pay their own invoices
        if (req.user.role === 'customer' && invoice.customer_id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        if (invoice.status === 'Cancelled') {
            return res.status(400).json({ error: 'Cannot record payment against a cancelled invoice.' });
        }

        const pCount = db.query('SELECT count(*) as count FROM payments').rows[0].count;
        const pNumber = `PAY-${new Date().getFullYear()}-${(pCount + 1).toString().padStart(4, '0')}`;
        const pDate = payment_date || new Date().toISOString().split('T')[0];

        // Record payment
        const newPayment = db.query(`
            INSERT INTO payments (payment_number, invoice_id, method, amount, payment_date, notes)
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING *
        `, [
            pNumber,
            invoice.id,
            method,
            payAmount,
            pDate,
            notes ? notes.trim() : ''
        ]).rows[0];

        // Update invoice paid_amount and status
        const updatedPaid = invoice.paid_amount + payAmount;
        const isFullyPaid = (invoice.total_amount - updatedPaid) <= 0.01;
        const newStatus = isFullyPaid ? 'Paid' : (invoice.status === 'Draft' ? 'Confirmed' : invoice.status);

        const updatedInvoice = db.query(`
            UPDATE invoices 
            SET paid_amount = ?, status = ?
            WHERE id = ?
            RETURNING *
        `, [updatedPaid, newStatus, invoice.id]).rows[0];

        res.status(201).json({
            message: `Payment of $${payAmount.toFixed(2)} recorded successfully.`,
            payment: newPayment,
            invoice: updatedInvoice
        });
    } catch (err) {
        console.error('Error recording payment:', err);
        res.status(500).json({ error: 'Server error recording payment.' });
    }
});

module.exports = router;
