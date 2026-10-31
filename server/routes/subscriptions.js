const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// ==========================================
// 1. GET ALL SUBSCRIPTIONS (ROLE-AWARE)
// ==========================================
// Customers see only their own subscriptions; Staff/Admin see all.
router.get('/', authenticateToken, (req, res) => {
    try {
        const { status, customer_id } = req.query;
        let sql = `
            SELECT s.*, 
                   u.name as customer_name, 
                   u.email as customer_email, 
                   u.company as customer_company,
                   p.name as plan_name, 
                   p.billing_frequency,
                   p.can_pause,
                   p.can_close_early,
                   p.can_renew,
                   d.name as discount_name,
                   d.code as discount_code,
                   (SELECT COUNT(*) FROM subscription_lines sl WHERE sl.subscription_id = s.id) as line_count,
                   (SELECT COALESCE(SUM(sl.line_total), 0) FROM subscription_lines sl WHERE sl.subscription_id = s.id) as total_recurring_amount
            FROM subscriptions s
            JOIN users u ON s.customer_id = u.id
            LEFT JOIN plans p ON s.plan_id = p.id
            LEFT JOIN discounts d ON s.discount_id = d.id
            WHERE 1=1
        `;
        const params = [];

        // Customer portal isolation
        if (req.user.role === 'customer') {
            sql += ' AND s.customer_id = ?';
            params.push(req.user.id);
        } else if (customer_id) {
            sql += ' AND s.customer_id = ?';
            params.push(customer_id);
        }

        if (status) {
            sql += ' AND s.status = ?';
            params.push(status);
        }

        sql += ' ORDER BY s.id DESC';

        const result = db.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching subscriptions:', err);
        res.status(500).json({ error: 'Server error fetching subscriptions.' });
    }
});

// ==========================================
// 2. GET SINGLE SUBSCRIPTION DETAILS (WITH LINES & INVOICES)
// ==========================================
router.get('/:id', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        let subRes = db.query(`
            SELECT s.*, 
                   u.name as customer_name, 
                   u.email as customer_email, 
                   u.company as customer_company,
                   p.name as plan_name, 
                   p.billing_frequency,
                   p.can_pause,
                   p.can_close_early,
                   p.can_renew,
                   d.name as discount_name,
                   d.code as discount_code,
                   d.rule_type as discount_type,
                   d.value as discount_value
            FROM subscriptions s
            JOIN users u ON s.customer_id = u.id
            LEFT JOIN plans p ON s.plan_id = p.id
            LEFT JOIN discounts d ON s.discount_id = d.id
            WHERE s.id = ?
        `, [id]);

        if (subRes.rows.length === 0) {
            return res.status(404).json({ error: 'Subscription not found.' });
        }

        const sub = subRes.rows[0];

        // Ensure customer can only view their own
        if (req.user.role === 'customer' && sub.customer_id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        // Fetch lines
        const lines = db.query(`
            SELECT sl.*, 
                   pr.name as product_name, 
                   pr.type as product_type,
                   pv.variant_name,
                   pv.price_modifier,
                   tr.name as tax_name,
                   tr.rate as tax_rate
            FROM subscription_lines sl
            LEFT JOIN products pr ON sl.product_id = pr.id
            LEFT JOIN product_variants pv ON sl.variant_id = pv.id
            LEFT JOIN tax_rules tr ON sl.tax_id = tr.id
            WHERE sl.subscription_id = ?
        `, [id]).rows;

        // Fetch invoices
        const invoices = db.query(`
            SELECT * FROM invoices WHERE subscription_id = ? ORDER BY id DESC
        `, [id]).rows;

        res.json({
            ...sub,
            lines,
            invoices
        });
    } catch (err) {
        console.error('Error fetching subscription details:', err);
        res.status(500).json({ error: 'Server error fetching subscription details.' });
    }
});

// ==========================================
// 3. CREATE SUBSCRIPTION / QUOTATION
// ==========================================
router.post('/', authenticateToken, requireRole(['admin', 'staff']), (req, res) => {
    try {
        const {
            customer_id,
            plan_id,
            status,
            start_date,
            expiry_date,
            payment_terms,
            discount_id,
            notes,
            lines
        } = req.body;

        if (!customer_id || !start_date || !lines || lines.length === 0) {
            return res.status(400).json({ error: 'Customer, start date, and at least one product line are required.' });
        }

        const countRes = db.query('SELECT count(*) as count FROM subscriptions');
        const nextNum = (countRes.rows[0].count + 1).toString().padStart(4, '0');
        const subNumber = `SUB-${new Date().getFullYear()}-${nextNum}`;

        const subStatus = status || 'Draft';

        const sub = db.query(`
            INSERT INTO subscriptions (
                subscription_number, customer_id, plan_id, status,
                start_date, expiry_date, next_billing_date, payment_terms,
                discount_id, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *
        `, [
            subNumber,
            parseInt(customer_id, 10),
            plan_id ? parseInt(plan_id, 10) : null,
            subStatus,
            start_date,
            expiry_date || null,
            start_date, // next billing starts on start date
            payment_terms || 'Net 30',
            discount_id ? parseInt(discount_id, 10) : null,
            notes ? notes.trim() : ''
        ]).rows[0];

        // Insert lines
        for (const line of lines) {
            const qty = parseInt(line.quantity, 10) || 1;
            const price = parseFloat(line.unit_price) || 0;
            const taxAmount = parseFloat(line.tax_amount) || 0;
            const discAmount = parseFloat(line.discount_amount) || 0;
            const total = (qty * price) + taxAmount - discAmount;

            db.query(`
                INSERT INTO subscription_lines (
                    subscription_id, product_id, variant_id, quantity, unit_price,
                    tax_id, tax_amount, discount_amount, line_total
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                sub.id,
                parseInt(line.product_id, 10),
                line.variant_id ? parseInt(line.variant_id, 10) : null,
                qty,
                price,
                line.tax_id ? parseInt(line.tax_id, 10) : null,
                taxAmount,
                discAmount,
                total
            ]);
        }

        res.status(201).json({
            message: `Subscription ${subNumber} created successfully.`,
            subscription: sub
        });
    } catch (err) {
        console.error('Error creating subscription:', err);
        res.status(500).json({ error: 'Server error creating subscription.' });
    }
});

// ==========================================
// 4. TRANSITION SUBSCRIPTION STATUS (LIFECYCLE)
// ==========================================
// PDF requirement: "It moves from Draft to Quotation to Confirmed to Active and finally to Closed...
// Some plans should close on their own when they end, and others can be closed early, paused or renewed."
router.post('/:id/status', authenticateToken, requireRole(['admin', 'staff']), (req, res) => {
    try {
        const { id } = req.params;
        const { target_status } = req.body;

        const validStatuses = ['Draft', 'Quotation', 'Confirmed', 'Active', 'Paused', 'Closed'];
        if (!validStatuses.includes(target_status)) {
            return res.status(400).json({ error: `Invalid status. Choose one of: ${validStatuses.join(', ')}` });
        }

        const subRes = db.query(`
            SELECT s.*, p.can_pause, p.can_close_early, p.can_renew 
            FROM subscriptions s 
            LEFT JOIN plans p ON s.plan_id = p.id 
            WHERE s.id = ?
        `, [id]);

        if (subRes.rows.length === 0) {
            return res.status(404).json({ error: 'Subscription not found.' });
        }

        const sub = subRes.rows[0];

        // Check plan-level rules
        if (target_status === 'Paused' && sub.can_pause === 0) {
            return res.status(400).json({ error: 'This plan configuration does not allow pausing.' });
        }
        if (target_status === 'Closed' && sub.status !== 'Closed' && sub.can_close_early === 0) {
            // If expiry date has not passed yet
            const now = new Date().toISOString().split('T')[0];
            if (sub.expiry_date && sub.expiry_date > now) {
                return res.status(400).json({ error: 'This plan cannot be closed early before its expiry date.' });
            }
        }

        const updated = db.query(`
            UPDATE subscriptions 
            SET status = ?, updated_at = datetime('now')
            WHERE id = ?
            RETURNING *
        `, [target_status, id]).rows[0];

        res.json({
            message: `Subscription status transitioned to ${target_status}.`,
            subscription: updated
        });
    } catch (err) {
        console.error('Error changing subscription status:', err);
        res.status(500).json({ error: 'Server error transitioning status.' });
    }
});

// ==========================================
// 5. RENEW SUBSCRIPTION
// ==========================================
router.post('/:id/renew', authenticateToken, requireRole(['admin', 'staff']), (req, res) => {
    try {
        const { id } = req.params;
        const subRes = db.query(`
            SELECT s.*, p.billing_frequency, p.can_renew 
            FROM subscriptions s 
            LEFT JOIN plans p ON s.plan_id = p.id 
            WHERE s.id = ?
        `, [id]);

        if (subRes.rows.length === 0) {
            return res.status(404).json({ error: 'Subscription not found.' });
        }

        const sub = subRes.rows[0];
        if (sub.can_renew === 0) {
            return res.status(400).json({ error: 'This plan is not configured to allow renewals.' });
        }

        const now = new Date();
        const startIso = now.toISOString().split('T')[0];
        // Calculate new expiry date (+1 year or +1 month)
        const expDate = new Date(now);
        if (sub.billing_frequency === 'yearly') {
            expDate.setFullYear(expDate.getFullYear() + 1);
        } else {
            expDate.setMonth(expDate.getMonth() + 1);
        }
        const expIso = expDate.toISOString().split('T')[0];

        const updated = db.query(`
            UPDATE subscriptions 
            SET status = 'Active', 
                start_date = ?, 
                expiry_date = ?, 
                next_billing_date = ?,
                updated_at = datetime('now')
            WHERE id = ?
            RETURNING *
        `, [startIso, expIso, startIso, id]).rows[0];

        res.json({
            message: `Subscription ${sub.subscription_number} renewed successfully until ${expIso}.`,
            subscription: updated
        });
    } catch (err) {
        console.error('Error renewing subscription:', err);
        res.status(500).json({ error: 'Server error renewing subscription.' });
    }
});

module.exports = router;
