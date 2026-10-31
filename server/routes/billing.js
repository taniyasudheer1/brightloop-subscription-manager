const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

/**
 * Advance billing date by frequency
 */
function getNextBillingDate(currentDateStr, frequency) {
    const d = new Date(currentDateStr || Date.now());
    switch (frequency) {
        case 'daily':
            d.setDate(d.getDate() + 1);
            break;
        case 'weekly':
            d.setDate(d.getDate() + 7);
            break;
        case 'yearly':
            d.setFullYear(d.getFullYear() + 1);
            break;
        case 'monthly':
        default:
            d.setMonth(d.getMonth() + 1);
            break;
    }
    return d.toISOString().split('T')[0];
}

/**
 * Calculate invoice due date based on payment terms
 */
function calculateDueDate(issueDateStr, terms) {
    const d = new Date(issueDateStr);
    if (!terms || terms === 'Immediate') {
        return issueDateStr;
    }
    const match = terms.match(/Net\s*(\d+)/i);
    if (match) {
        const days = parseInt(match[1], 10);
        d.setDate(d.getDate() + days);
        return d.toISOString().split('T')[0];
    }
    // Default 30 days
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
}

// ==========================================
// 1. RUN BILLING RUN (AUTOMATED INVOICE GENERATION)
// ==========================================
// PDF requirement: "It is billing day, and hundreds of subscriptions are due at once.
// Nobody should be typing invoices by hand. Each one should be created from its subscription,
// with customer details, product lines, taxes and totals already filled in...
// Nothing should be billed twice or skipped."
router.post('/run', authenticateToken, requireRole(['admin', 'staff']), (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Find all active subscriptions
        const activeSubs = db.query(`
            SELECT s.*, 
                   u.email as customer_email, 
                   u.name as customer_name,
                   p.billing_frequency,
                   p.auto_close,
                   d.id as disc_id,
                   d.code as disc_code,
                   d.rule_type as disc_rule_type,
                   d.value as disc_value,
                   d.start_date as disc_start,
                   d.end_date as disc_end,
                   d.usage_limit as disc_limit,
                   d.usage_count as disc_count,
                   d.scope as disc_scope,
                   d.product_id as disc_product_id
            FROM subscriptions s
            JOIN users u ON s.customer_id = u.id
            JOIN plans p ON s.plan_id = p.id
            LEFT JOIN discounts d ON s.discount_id = d.id
            WHERE s.status = 'Active'
        `).rows;

        const generatedInvoices = [];
        const autoClosedSubs = [];

        for (const sub of activeSubs) {
            // Check auto-close rule for ending plans:
            // "Some plans should close on their own when they end"
            if (sub.auto_close === 1 && sub.expiry_date && sub.expiry_date < today) {
                db.query("UPDATE subscriptions SET status = 'Closed', updated_at = datetime('now') WHERE id = ?", [sub.id]);
                autoClosedSubs.push(sub.subscription_number);
                continue;
            }

            // Check if due for billing:
            // Due if next_billing_date <= today OR last_billed_at is null
            const isDue = !sub.last_billed_at || (sub.next_billing_date && sub.next_billing_date <= today);
            if (!isDue) {
                continue;
            }

            // Guard against duplicate billing for the same billing date
            const existingInv = db.query(`
                SELECT id FROM invoices 
                WHERE subscription_id = ? AND issue_date = ?
            `, [sub.id, today]);

            if (existingInv.rows.length > 0) {
                continue; // Already billed today
            }

            // Fetch subscription lines
            const subLines = db.query(`
                SELECT sl.*, pr.name as product_name, pv.variant_name, tr.rate as tax_rate
                FROM subscription_lines sl
                JOIN products pr ON sl.product_id = pr.id
                LEFT JOIN product_variants pv ON sl.variant_id = pv.id
                LEFT JOIN tax_rules tr ON sl.tax_id = tr.id
                WHERE sl.subscription_id = ?
            `, [sub.id]).rows;

            if (subLines.length === 0) {
                continue;
            }

            // Check discount validity:
            // "stop when it expires or runs out."
            let discountValid = false;
            if (sub.disc_id) {
                const isWithinDates = today >= sub.disc_start && today <= sub.disc_end;
                const hasUsageLeft = !sub.disc_limit || sub.disc_count < sub.disc_limit;
                if (isWithinDates && hasUsageLeft) {
                    discountValid = true;
                }
            }

            let subtotal = 0;
            let totalTax = 0;
            let totalDiscount = 0;

            const preparedLines = [];

            for (const line of subLines) {
                const lineBase = line.quantity * line.unit_price;
                subtotal += lineBase;

                // Discount on line
                let lineDisc = 0;
                if (discountValid) {
                    if (sub.disc_scope === 'all' || sub.disc_scope === 'subscription' || (sub.disc_scope === 'product' && sub.disc_product_id === line.product_id)) {
                        if (sub.disc_rule_type === 'percentage') {
                            lineDisc = (lineBase * sub.disc_value) / 100.0;
                        } else if (sub.disc_rule_type === 'fixed') {
                            lineDisc = Math.min(lineBase, sub.disc_value);
                        }
                    }
                }
                totalDiscount += lineDisc;

                // Tax calculation
                const taxableAmount = Math.max(0, lineBase - lineDisc);
                const taxRate = line.tax_rate || 0.0;
                const lineTax = (taxableAmount * taxRate) / 100.0;
                totalTax += lineTax;

                const lineTotal = taxableAmount + lineTax;
                const desc = line.variant_name 
                    ? `${line.product_name} (${line.variant_name})`
                    : line.product_name;

                preparedLines.push({
                    product_id: line.product_id,
                    variant_id: line.variant_id,
                    description: desc,
                    quantity: line.quantity,
                    unit_price: line.unit_price,
                    tax_rate: taxRate,
                    tax_amount: lineTax,
                    discount_amount: lineDisc,
                    line_total: lineTotal
                });
            }

            const invoiceTotal = subtotal + totalTax - totalDiscount;

            // Generate invoice number
            const invCount = db.query('SELECT count(*) as count FROM invoices').rows[0].count;
            const invNumber = `INV-${new Date().getFullYear()}-${(invCount + 1).toString().padStart(4, '0')}`;
            const dueDate = calculateDueDate(today, sub.payment_terms);

            // Create invoice (moves from Draft to Confirmed per PDF workflow)
            const newInvoice = db.query(`
                INSERT INTO invoices (
                    invoice_number, subscription_id, customer_id, status,
                    subtotal, tax_amount, discount_amount, total_amount, paid_amount,
                    issue_date, due_date, payment_terms, notes
                ) VALUES (?, ?, ?, 'Confirmed', ?, ?, ?, ?, 0.00, ?, ?, ?, ?)
                RETURNING *
            `, [
                invNumber,
                sub.id,
                sub.customer_id,
                subtotal,
                totalTax,
                totalDiscount,
                invoiceTotal,
                today,
                dueDate,
                sub.payment_terms || 'Net 30',
                `Automated recurring invoice for subscription ${sub.subscription_number}`
            ]).rows[0];

            // Insert invoice lines
            for (const pl of preparedLines) {
                db.query(`
                    INSERT INTO invoice_lines (
                        invoice_id, product_id, variant_id, description,
                        quantity, unit_price, tax_rate, tax_amount, discount_amount, line_total
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    newInvoice.id,
                    pl.product_id,
                    pl.variant_id,
                    pl.description,
                    pl.quantity,
                    pl.unit_price,
                    pl.tax_rate,
                    pl.tax_amount,
                    pl.discount_amount,
                    pl.line_total
                ]);
            }

            // Increment discount usage if applied
            if (discountValid) {
                db.query('UPDATE discounts SET usage_count = usage_count + 1 WHERE id = ?', [sub.disc_id]);
            }

            // Advance next billing date and set last_billed_at
            const nextDate = getNextBillingDate(today, sub.billing_frequency);
            db.query(`
                UPDATE subscriptions 
                SET last_billed_at = ?, next_billing_date = ?, updated_at = datetime('now')
                WHERE id = ?
            `, [today, nextDate, sub.id]);

            generatedInvoices.push({
                invoice_number: newInvoice.invoice_number,
                customer_name: sub.customer_name,
                total_amount: newInvoice.total_amount,
                subscription_number: sub.subscription_number
            });
        }

        res.json({
            message: `Billing run complete. Generated ${generatedInvoices.length} invoice(s).`,
            generated_count: generatedInvoices.length,
            invoices: generatedInvoices,
            auto_closed_subscriptions: autoClosedSubs
        });
    } catch (err) {
        console.error('Error in billing run:', err);
        res.status(500).json({ error: 'Server error executing billing run.' });
    }
});

// ==========================================
// 2. GET DUE SUBSCRIPTIONS PREVIEW
// ==========================================
router.get('/preview', authenticateToken, requireRole(['admin', 'staff']), (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const dueSubs = db.query(`
            SELECT s.*, 
                   u.name as customer_name, 
                   p.name as plan_name, 
                   p.billing_frequency,
                   (SELECT COALESCE(SUM(sl.line_total), 0) FROM subscription_lines sl WHERE sl.subscription_id = s.id) as estimated_amount
            FROM subscriptions s
            JOIN users u ON s.customer_id = u.id
            JOIN plans p ON s.plan_id = p.id
            WHERE s.status = 'Active'
              AND (s.last_billed_at IS NULL OR s.next_billing_date <= ?)
        `, [today]).rows;

        res.json({
            today,
            due_count: dueSubs.length,
            due_subscriptions: dueSubs
        });
    } catch (err) {
        console.error('Error previewing billing run:', err);
        res.status(500).json({ error: 'Server error previewing billing run.' });
    }
});

module.exports = router;
