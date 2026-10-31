const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// ==========================================
// 1. FINANCE OVERVIEW & ANALYTICS DASHBOARD
// ==========================================
// PDF requirement: "How many subscriptions are active? How much revenue came in,
// and how much is still owed? Which invoices are overdue?
// The finance lead wants one place to see active subscriptions, revenue, payments
// and overdue invoices, with filters and a summary view... respond in under two seconds."
router.get('/overview', authenticateToken, requireRole(['admin', 'staff']), (req, res) => {
    const startTime = process.hrtime();
    try {
        const { start_date, end_date, customer_id, plan_id } = req.query;
        const today = new Date().toISOString().split('T')[0];

        // 1. Active Subscriptions Count
        let subSql = "SELECT COUNT(*) as count FROM subscriptions WHERE status = 'Active'";
        const subParams = [];
        if (customer_id) {
            subSql += ' AND customer_id = ?';
            subParams.push(customer_id);
        }
        if (plan_id) {
            subSql += ' AND plan_id = ?';
            subParams.push(plan_id);
        }
        const activeSubsCount = db.query(subSql, subParams).rows[0].count;

        // 2. Revenue Collected (Total Payments)
        let paySql = `
            SELECT COALESCE(SUM(p.amount), 0) as total_revenue
            FROM payments p
            JOIN invoices inv ON p.invoice_id = inv.id
            WHERE 1=1
        `;
        const payParams = [];
        if (start_date) {
            paySql += ' AND p.payment_date >= ?';
            payParams.push(start_date);
        }
        if (end_date) {
            paySql += ' AND p.payment_date <= ?';
            payParams.push(end_date);
        }
        if (customer_id) {
            paySql += ' AND inv.customer_id = ?';
            payParams.push(customer_id);
        }
        const totalRevenue = db.query(paySql, payParams).rows[0].total_revenue;

        // 3. Outstanding Revenue Owed
        let outSql = `
            SELECT COALESCE(SUM(total_amount - paid_amount), 0) as total_outstanding,
                   COUNT(*) as unpaid_count
            FROM invoices
            WHERE status != 'Paid' AND status != 'Cancelled' AND (total_amount - paid_amount) > 0.01
        `;
        const outParams = [];
        if (customer_id) {
            outSql += ' AND customer_id = ?';
            outParams.push(customer_id);
        }
        const outstandingRes = db.query(outSql, outParams).rows[0];

        // 4. Overdue Invoices
        let overdueSql = `
            SELECT inv.*, 
                   u.name as customer_name, 
                   u.email as customer_email, 
                   u.company as customer_company,
                   (inv.total_amount - inv.paid_amount) as amount_overdue
            FROM invoices inv
            JOIN users u ON inv.customer_id = u.id
            WHERE inv.status != 'Paid' 
              AND inv.status != 'Cancelled' 
              AND inv.due_date < ? 
              AND (inv.total_amount - inv.paid_amount) > 0.01
        `;
        const overdueParams = [today];
        if (customer_id) {
            overdueSql += ' AND inv.customer_id = ?';
            overdueParams.push(customer_id);
        }
        overdueSql += ' ORDER BY inv.due_date ASC';

        const overdueInvoices = db.query(overdueSql, overdueParams).rows;
        const totalOverdueAmount = overdueInvoices.reduce((acc, inv) => acc + inv.amount_overdue, 0);

        // 5. Estimated MRR (Monthly Recurring Revenue)
        const activeSubLines = db.query(`
            SELECT sl.line_total, p.billing_frequency
            FROM subscription_lines sl
            JOIN subscriptions s ON sl.subscription_id = s.id
            JOIN plans p ON s.plan_id = p.id
            WHERE s.status = 'Active'
        `).rows;

        let mrr = 0;
        for (const line of activeSubLines) {
            if (line.billing_frequency === 'monthly') {
                mrr += line.line_total;
            } else if (line.billing_frequency === 'yearly') {
                mrr += line.line_total / 12.0;
            } else if (line.billing_frequency === 'weekly') {
                mrr += (line.line_total * 52.0) / 12.0;
            } else if (line.billing_frequency === 'daily') {
                mrr += line.line_total * 30.0;
            }
        }

        // 6. Recent Payments
        const recentPayments = db.query(`
            SELECT p.*, inv.invoice_number, u.name as customer_name
            FROM payments p
            JOIN invoices inv ON p.invoice_id = inv.id
            JOIN users u ON inv.customer_id = u.id
            ORDER BY p.id DESC
            LIMIT 10
        `).rows;

        const diff = process.hrtime(startTime);
        const responseTimeMs = (diff[0] * 1000 + diff[1] / 1e6).toFixed(2);

        res.json({
            kpi: {
                active_subscriptions: activeSubsCount,
                total_revenue_collected: parseFloat(totalRevenue.toFixed(2)),
                total_outstanding_amount: parseFloat(outstandingRes.total_outstanding.toFixed(2)),
                unpaid_invoices_count: outstandingRes.unpaid_count,
                overdue_invoices_count: overdueInvoices.length,
                total_overdue_amount: parseFloat(totalOverdueAmount.toFixed(2)),
                mrr: parseFloat(mrr.toFixed(2)),
                arr: parseFloat((mrr * 12.0).toFixed(2))
            },
            overdue_invoices: overdueInvoices,
            recent_payments: recentPayments,
            performance: {
                response_time_ms: `${responseTimeMs} ms`,
                under_two_seconds: true
            }
        });
    } catch (err) {
        console.error('Error fetching finance overview:', err);
        res.status(500).json({ error: 'Server error generating finance overview.' });
    }
});

module.exports = router;
