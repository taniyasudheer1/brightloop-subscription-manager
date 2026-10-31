const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// ==========================================
// 1. GET ALL INVOICES (ROLE-AWARE & FILTERABLE)
// ==========================================
// PDF requirement: "At any moment, the team should be able to see which invoices are paid
// and which are still outstanding, so overdue ones can be chased before they turn into lost revenue."
router.get('/', authenticateToken, (req, res) => {
    try {
        const { status, filter } = req.query;
        const today = new Date().toISOString().split('T')[0];

        let sql = `
            SELECT inv.*,
                   u.name as customer_name,
                   u.email as customer_email,
                   u.company as customer_company,
                   sub.subscription_number,
                   (inv.total_amount - inv.paid_amount) as balance_due,
                   CASE 
                     WHEN inv.status = 'Paid' THEN 'Paid'
                     WHEN inv.status = 'Cancelled' THEN 'Cancelled'
                     WHEN inv.due_date < ? AND (inv.total_amount - inv.paid_amount) > 0.01 THEN 'Overdue'
                     ELSE inv.status
                   END as effective_status
            FROM invoices inv
            JOIN users u ON inv.customer_id = u.id
            LEFT JOIN subscriptions sub ON inv.subscription_id = sub.id
            WHERE 1=1
        `;
        const params = [today];

        // Customer portal isolation
        if (req.user.role === 'customer') {
            sql += ' AND inv.customer_id = ?';
            params.push(req.user.id);
        }

        if (status) {
            sql += ' AND inv.status = ?';
            params.push(status);
        }

        // Filter: outstanding, overdue, paid
        if (filter === 'outstanding') {
            sql += " AND inv.status != 'Paid' AND inv.status != 'Cancelled' AND (inv.total_amount - inv.paid_amount) > 0.01";
        } else if (filter === 'overdue') {
            sql += " AND inv.status != 'Paid' AND inv.status != 'Cancelled' AND inv.due_date < ? AND (inv.total_amount - inv.paid_amount) > 0.01";
            params.push(today);
        } else if (filter === 'paid') {
            sql += " AND inv.status = 'Paid'";
        }

        sql += ' ORDER BY inv.id DESC';

        const result = db.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching invoices:', err);
        res.status(500).json({ error: 'Server error fetching invoices.' });
    }
});

// ==========================================
// 2. GET SINGLE INVOICE WITH LINES & PAYMENTS
// ==========================================
router.get('/:id', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const today = new Date().toISOString().split('T')[0];

        const invRes = db.query(`
            SELECT inv.*,
                   u.name as customer_name,
                   u.email as customer_email,
                   u.company as customer_company,
                   sub.subscription_number,
                   (inv.total_amount - inv.paid_amount) as balance_due,
                   CASE 
                     WHEN inv.status = 'Paid' THEN 'Paid'
                     WHEN inv.status = 'Cancelled' THEN 'Cancelled'
                     WHEN inv.due_date < ? AND (inv.total_amount - inv.paid_amount) > 0.01 THEN 'Overdue'
                     ELSE inv.status
                   END as effective_status
            FROM invoices inv
            JOIN users u ON inv.customer_id = u.id
            LEFT JOIN subscriptions sub ON inv.subscription_id = sub.id
            WHERE inv.id = ?
        `, [today, id]);

        if (invRes.rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found.' });
        }

        const invoice = invRes.rows[0];

        // Customer access check
        if (req.user.role === 'customer' && invoice.customer_id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const lines = db.query(`
            SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY id ASC
        `, [id]).rows;

        const payments = db.query(`
            SELECT * FROM payments WHERE invoice_id = ? ORDER BY id DESC
        `, [id]).rows;

        res.json({
            ...invoice,
            lines,
            payments
        });
    } catch (err) {
        console.error('Error fetching invoice details:', err);
        res.status(500).json({ error: 'Server error fetching invoice details.' });
    }
});

// ==========================================
// 3. CONFIRM INVOICE (STAFF/ADMIN)
// ==========================================
// PDF requirement: "The team can confirm, cancel, send or print any invoice,
// and each invoice moves from Draft to Confirmed to Paid."
router.post('/:id/confirm', authenticateToken, requireRole(['admin', 'staff']), (req, res) => {
    try {
        const { id } = req.params;
        const result = db.query(`
            UPDATE invoices 
            SET status = 'Confirmed'
            WHERE id = ? AND status = 'Draft'
            RETURNING *
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Only Draft invoices can be confirmed.' });
        }

        res.json({
            message: `Invoice ${result.rows[0].invoice_number} confirmed.`,
            invoice: result.rows[0]
        });
    } catch (err) {
        console.error('Error confirming invoice:', err);
        res.status(500).json({ error: 'Server error confirming invoice.' });
    }
});

// ==========================================
// 4. CANCEL INVOICE (STAFF/ADMIN)
// ==========================================
router.post('/:id/cancel', authenticateToken, requireRole(['admin', 'staff']), (req, res) => {
    try {
        const { id } = req.params;
        const result = db.query(`
            UPDATE invoices 
            SET status = 'Cancelled'
            WHERE id = ? AND status != 'Paid'
            RETURNING *
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Paid invoices cannot be cancelled.' });
        }

        res.json({
            message: `Invoice ${result.rows[0].invoice_number} cancelled.`,
            invoice: result.rows[0]
        });
    } catch (err) {
        console.error('Error cancelling invoice:', err);
        res.status(500).json({ error: 'Server error cancelling invoice.' });
    }
});

// ==========================================
// 5. SEND INVOICE (SIMULATE EMAIL TO CUSTOMER)
// ==========================================
// PDF requirement: "The team can confirm, cancel, send or print any invoice"
router.post('/:id/send', authenticateToken, requireRole(['admin', 'staff']), (req, res) => {
    try {
        const { id } = req.params;
        const invRes = db.query(`
            SELECT inv.*, u.email as customer_email, u.name as customer_name
            FROM invoices inv
            JOIN users u ON inv.customer_id = u.id
            WHERE inv.id = ?
        `, [id]);

        if (invRes.rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found.' });
        }

        const inv = invRes.rows[0];
        const now = new Date().toISOString();

        db.query("UPDATE invoices SET sent_at = ? WHERE id = ?", [now, id]);

        console.log(`[SIMULATED EMAIL] Sent invoice ${inv.invoice_number} ($${inv.total_amount}) to ${inv.customer_email}`);

        res.json({
            message: `Invoice ${inv.invoice_number} successfully sent to ${inv.customer_email}.`,
            sent_at: now
        });
    } catch (err) {
        console.error('Error sending invoice:', err);
        res.status(500).json({ error: 'Server error sending invoice.' });
    }
});

module.exports = router;
