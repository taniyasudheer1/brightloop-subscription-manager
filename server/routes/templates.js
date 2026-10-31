const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// ==========================================
// 1. GET ALL QUOTATION TEMPLATES
// ==========================================
router.get('/', authenticateToken, (req, res) => {
    try {
        const templates = db.query(`
            SELECT qt.*, p.name as plan_name, p.billing_frequency, p.price as plan_price
            FROM quotation_templates qt
            LEFT JOIN plans p ON qt.plan_id = p.id
            ORDER BY qt.id DESC
        `).rows;

        const lines = db.query(`
            SELECT qtl.*, 
                   pr.name as product_name,
                   pv.variant_name,
                   pv.price_modifier
            FROM quotation_template_lines qtl
            LEFT JOIN products pr ON qtl.product_id = pr.id
            LEFT JOIN product_variants pv ON qtl.variant_id = pv.id
        `).rows;

        const populated = templates.map(t => ({
            ...t,
            lines: lines.filter(l => l.template_id === t.id)
        }));

        res.json(populated);
    } catch (err) {
        console.error('Error fetching quotation templates:', err);
        res.status(500).json({ error: 'Server error fetching quotation templates.' });
    }
});

// ==========================================
// 2. CREATE QUOTATION TEMPLATE (ADMIN / STAFF)
// ==========================================
router.post('/', authenticateToken, requireRole(['admin', 'staff']), (req, res) => {
    try {
        const { name, plan_id, validity_days, payment_terms, notes, lines } = req.body;

        if (!name || !lines || lines.length === 0) {
            return res.status(400).json({ error: 'Template name and at least one line item are required.' });
        }

        const template = db.query(`
            INSERT INTO quotation_templates (name, plan_id, validity_days, payment_terms, notes)
            VALUES (?, ?, ?, ?, ?)
            RETURNING *
        `, [
            name.trim(),
            plan_id ? parseInt(plan_id, 10) : null,
            parseInt(validity_days, 10) || 30,
            payment_terms || 'Net 30',
            notes ? notes.trim() : ''
        ]).rows[0];

        for (const line of lines) {
            db.query(`
                INSERT INTO quotation_template_lines (template_id, product_id, variant_id, quantity, unit_price)
                VALUES (?, ?, ?, ?, ?)
            `, [
                template.id,
                parseInt(line.product_id, 10),
                line.variant_id ? parseInt(line.variant_id, 10) : null,
                parseInt(line.quantity, 10) || 1,
                parseFloat(line.unit_price) || 0.00
            ]);
        }

        res.status(201).json({
            message: 'Quotation template created successfully.',
            template
        });
    } catch (err) {
        console.error('Error creating quotation template:', err);
        res.status(500).json({ error: 'Server error creating quotation template.' });
    }
});

// ==========================================
// 3. CONVERT TEMPLATE INTO A NEW QUOTE FOR A CUSTOMER
// ==========================================
// PDF requirement: "A sales rep is preparing an offer for a large customer. Instead of building it from scratch,
// they start from a quotation template that already has the right plan and product lines, and stays valid for a set number of days."
router.post('/:id/create-quote', authenticateToken, requireRole(['admin', 'staff']), (req, res) => {
    try {
        const { id } = req.params;
        const { customer_id, start_date } = req.body;

        if (!customer_id) {
            return res.status(400).json({ error: 'Customer is required to generate a quotation.' });
        }

        const templateRes = db.query('SELECT * FROM quotation_templates WHERE id = ?', [id]);
        if (templateRes.rows.length === 0) {
            return res.status(404).json({ error: 'Quotation template not found.' });
        }
        const template = templateRes.rows[0];

        const lines = db.query('SELECT * FROM quotation_template_lines WHERE template_id = ?', [id]).rows;
        if (lines.length === 0) {
            return res.status(400).json({ error: 'Template has no product lines configured.' });
        }

        // Get default tax rule (or 0%)
        const defaultTax = db.query('SELECT id, rate FROM tax_rules WHERE is_default = 1 AND is_active = 1 LIMIT 1').rows[0]
            || db.query('SELECT id, rate FROM tax_rules WHERE is_active = 1 LIMIT 1').rows[0]
            || { id: null, rate: 0.0 };

        // Calculate start and expiry date
        const sDate = start_date ? new Date(start_date) : new Date();
        const startIso = sDate.toISOString().split('T')[0];
        const expiryDate = new Date(sDate.getTime() + (template.validity_days || 30) * 24 * 60 * 60 * 1000);
        const expiryIso = expiryDate.toISOString().split('T')[0];

        // Generate unique subscription number
        const countRes = db.query('SELECT count(*) as count FROM subscriptions');
        const nextNum = (countRes.rows[0].count + 1).toString().padStart(4, '0');
        const subNumber = `SUB-${new Date().getFullYear()}-${nextNum}`;

        const newSub = db.query(`
            INSERT INTO subscriptions (
                subscription_number, customer_id, plan_id, status,
                start_date, expiry_date, next_billing_date, payment_terms, notes
            ) VALUES (?, ?, ?, 'Quotation', ?, ?, ?, ?, ?)
            RETURNING *
        `, [
            subNumber,
            parseInt(customer_id, 10),
            template.plan_id,
            startIso,
            expiryIso,
            startIso,
            template.payment_terms || 'Net 30',
            `Generated from template: ${template.name}`
        ]).rows[0];

        for (const line of lines) {
            const qty = line.quantity || 1;
            const price = line.unit_price;
            const subtotal = qty * price;
            const taxAmount = (subtotal * defaultTax.rate) / 100.0;
            const lineTotal = subtotal + taxAmount;

            db.query(`
                INSERT INTO subscription_lines (
                    subscription_id, product_id, variant_id, quantity, unit_price,
                    tax_id, tax_amount, discount_amount, line_total
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 0.00, ?)
            `, [
                newSub.id,
                line.product_id,
                line.variant_id,
                qty,
                price,
                defaultTax.id,
                taxAmount,
                lineTotal
            ]);
        }

        res.status(201).json({
            message: `Quotation ${subNumber} created from template successfully.`,
            subscription: newSub
        });
    } catch (err) {
        console.error('Error generating quote from template:', err);
        res.status(500).json({ error: 'Server error generating quote from template.' });
    }
});

module.exports = router;
