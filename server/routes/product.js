const express = require('express');
const router = express.Router();

// Import your database pool provided by your team lead
const pool = require('../db'); 

// ==========================================
// 1. CREATE A NEW BASE PRODUCT
// ==========================================
router.post('/products', async (req, res) => {
  try {
    const { name, description, base_price } = req.body;

    if (!name || !base_price) {
      return res.status(400).json({ error: "Product name and base price are required." });
    }

    const query = `
      INSERT INTO products (name, description, base_price) 
      VALUES ($1, $2, $3) 
      RETURNING *;
    `;
    const values = [name, description, base_price];
    
    const newProduct = await pool.query(query, values);

    res.status(201).json({
      message: "Product created successfully",
      product: newProduct.rows[0]
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Server error while creating product" });
  }
});

// ==========================================
// 2. ADD A VARIANT TO A PRODUCT
// ==========================================
router.post('/products/:id/variants', async (req, res) => {
  try {
    const { id } = req.params; 
    const { brand_name, modifier_type, modifier_value } = req.body; 

    if (!brand_name) {
      return res.status(400).json({ error: "Brand name or variant name is required." });
    }

    const query = `
      INSERT INTO product_variants (product_id, brand_name, modifier_type, modifier_value) 
      VALUES ($1, $2, $3, $4) 
      RETURNING *;
    `;
    const values = [id, brand_name, modifier_type || 'fixed', modifier_value || 0];

    const newVariant = await pool.query(query, values);

    res.status(201).json({
      message: "Variant added successfully",
      variant: newVariant.rows[0]
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Server error while adding variant" });
  }
});

// ==========================================
// 3. CREATE A RECURRING PRICING PLAN
// ==========================================
router.post('/plans', async (req, res) => {
  try {
    const { product_id, billing_frequency, amount } = req.body; 
    
    const validFrequencies = ['daily', 'weekly', 'monthly', 'yearly'];
    if (!validFrequencies.includes(billing_frequency)) {
      return res.status(400).json({ error: "Invalid billing frequency. Choose daily, weekly, monthly, or yearly." });
    }

    const query = `
      INSERT INTO pricing_plans (product_id, billing_frequency, amount) 
      VALUES ($1, $2, $3) 
      RETURNING *;
    `;
    const values = [product_id, billing_frequency, amount];

    const newPlan = await pool.query(query, values);

    res.status(201).json({
      message: "Pricing plan created successfully",
      plan: newPlan.rows[0]
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Server error while creating pricing plan" });
  }
});

// ==========================================
// 4. GET ALL PRODUCTS
// ==========================================
router.get('/products', async (req, res) => {
  try {
    const query = `
      SELECT p.*, 
             json_agg(DISTINCT v.*) AS variants, 
             json_agg(DISTINCT pl.*) AS pricing_plans
      FROM products p
      LEFT JOIN product_variants v ON p.id = v.product_id
      LEFT JOIN pricing_plans pl ON p.id = pl.product_id
      GROUP BY p.id;
    `;
    
    const allProducts = await pool.query(query);
    res.json(allProducts.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Server error while fetching products" });
  }
});

// ==========================================
// 5. UPDATE A PRODUCT
// ==========================================
router.put('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, base_price } = req.body;

    const query = `
      UPDATE products 
      SET name = $1, description = $2, base_price = $3 
      WHERE id = $4 
      RETURNING *;
    `;
    const values = [name, description, base_price, id];
    const updatedProduct = await pool.query(query, values);

    if (updatedProduct.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({
      message: "Product updated successfully",
      product: updatedProduct.rows[0]
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Server error while updating product" });
  }
});

// ==========================================
// 6. DELETE A PRODUCT
// ==========================================
router.delete('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `DELETE FROM products WHERE id = $1 RETURNING *;`;
    const deletedProduct = await pool.query(query, [id]);

    if (deletedProduct.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Server error while deleting product" });
  }
});

module.exports = router;
// Import your product routes
const productRoutes = require('./routes/product');

// Register them with Express
app.use('/api', productRoutes);
