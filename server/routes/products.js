const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// ==========================================
// 1. GET ALL PRODUCTS (WITH VARIANTS AND PLANS)
// ==========================================
router.get('/', (req, res) => {
    try {
        const products = db.query('SELECT * FROM products ORDER BY id DESC').rows;
        const variants = db.query('SELECT * FROM product_variants ORDER BY id ASC').rows;
        const plans = db.query('SELECT * FROM plans ORDER BY id ASC').rows;

        // Group variants and plans by product_id
        const productMap = products.map(p => {
            return {
                ...p,
                variants: variants.filter(v => v.product_id === p.id),
                plans: plans.filter(pl => pl.product_id === p.id)
            };
        });

        res.json(productMap);
    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).json({ error: 'Server error fetching products.' });
    }
});

// ==========================================
// 2. GET SINGLE PRODUCT BY ID
// ==========================================
router.get('/:id', (req, res) => {
    try {
        const productRes = db.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
        if (productRes.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }
        const product = productRes.rows[0];
        const variants = db.query('SELECT * FROM product_variants WHERE product_id = ?', [product.id]).rows;
        const plans = db.query('SELECT * FROM plans WHERE product_id = ?', [product.id]).rows;

        res.json({
            ...product,
            variants,
            plans
        });
    } catch (err) {
        console.error('Error fetching product:', err);
        res.status(500).json({ error: 'Server error fetching product.' });
    }
});

// ==========================================
// 3. CREATE PRODUCT (ADMIN ONLY)
// ==========================================
// PDF requirement: "The admin adds it with its name, type, sales price, cost price and notes"
router.post('/', authenticateToken, requireRole('admin'), (req, res) => {
    try {
        const { name, type, sales_price, cost_price, notes } = req.body;

        if (!name || sales_price === undefined || cost_price === undefined) {
            return res.status(400).json({ error: 'Product name, sales price, and cost price are required.' });
        }

        const result = db.query(`
            INSERT INTO products (name, type, sales_price, cost_price, notes)
            VALUES (?, ?, ?, ?, ?)
            RETURNING *
        `, [
            name.trim(),
            type ? type.trim() : 'Software',
            parseFloat(sales_price),
            parseFloat(cost_price),
            notes ? notes.trim() : ''
        ]);

        res.status(201).json({
            message: 'Product created successfully.',
            product: result.rows[0]
        });
    } catch (err) {
        console.error('Error creating product:', err);
        res.status(500).json({ error: 'Server error creating product.' });
    }
});

// ==========================================
// 4. UPDATE PRODUCT (ADMIN ONLY)
// ==========================================
router.put('/:id', authenticateToken, requireRole('admin'), (req, res) => {
    try {
        const { name, type, sales_price, cost_price, notes } = req.body;
        const { id } = req.params;

        const existing = db.query('SELECT * FROM products WHERE id = ?', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        const current = existing.rows[0];
        const updated = db.query(`
            UPDATE products 
            SET name = ?, type = ?, sales_price = ?, cost_price = ?, notes = ?
            WHERE id = ?
            RETURNING *
        `, [
            name !== undefined ? name.trim() : current.name,
            type !== undefined ? type.trim() : current.type,
            sales_price !== undefined ? parseFloat(sales_price) : current.sales_price,
            cost_price !== undefined ? parseFloat(cost_price) : current.cost_price,
            notes !== undefined ? notes.trim() : current.notes,
            id
        ]);

        res.json({
            message: 'Product updated successfully.',
            product: updated.rows[0]
        });
    } catch (err) {
        console.error('Error updating product:', err);
        res.status(500).json({ error: 'Server error updating product.' });
    }
});

// ==========================================
// 5. DELETE PRODUCT (ADMIN ONLY)
// ==========================================
router.delete('/:id', authenticateToken, requireRole('admin'), (req, res) => {
    try {
        const { id } = req.params;
        const result = db.query('DELETE FROM products WHERE id = ?', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }
        res.json({ message: 'Product deleted successfully.' });
    } catch (err) {
        console.error('Error deleting product:', err);
        res.status(500).json({ error: 'Server error deleting product.' });
    }
});

// ==========================================
// 6. ADD VARIANT TO PRODUCT (ADMIN ONLY)
// ==========================================
// PDF requirement: "and offers it in variants, for example by brand, where choosing the Odoo brand adds 560 to the price"
router.post('/:id/variants', authenticateToken, requireRole('admin'), (req, res) => {
    try {
        const { id } = req.params;
        const { variant_name, price_modifier } = req.body;

        if (!variant_name) {
            return res.status(400).json({ error: 'Variant name is required.' });
        }

        const product = db.query('SELECT id FROM products WHERE id = ?', [id]);
        if (product.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        const result = db.query(`
            INSERT INTO product_variants (product_id, variant_name, price_modifier)
            VALUES (?, ?, ?)
            RETURNING *
        `, [
            id,
            variant_name.trim(),
            parseFloat(price_modifier) || 0.00
        ]);

        res.status(201).json({
            message: 'Variant added successfully.',
            variant: result.rows[0]
        });
    } catch (err) {
        console.error('Error adding variant:', err);
        res.status(500).json({ error: 'Server error adding variant.' });
    }
});

// ==========================================
// 7. DELETE VARIANT (ADMIN ONLY)
// ==========================================
router.delete('/:id/variants/:variantId', authenticateToken, requireRole('admin'), (req, res) => {
    try {
        const { variantId } = req.params;
        const result = db.query('DELETE FROM product_variants WHERE id = ?', [variantId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Variant not found.' });
        }
        res.json({ message: 'Variant deleted successfully.' });
    } catch (err) {
        console.error('Error deleting variant:', err);
        res.status(500).json({ error: 'Server error deleting variant.' });
    }
});

module.exports = router;
