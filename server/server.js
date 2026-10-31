const express = require('express');
const router = express.Router();

// Password validation helper based on requirements
const validatePassword = (password) => {
    const minLen = password && password.length > 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    return minLen && hasUpper && hasLower && hasSpecial;
};

// Signup Route
router.post('/signup', async (req, res) => {
    const { email, password, role } = req.body;

    if (!validatePassword(password)) {
        return res.status(400).json({ 
            error: "Password must be more than 8 characters long and contain at least one uppercase letter, one lowercase letter, and a special character." 
        });
    }

    const userRole = role || 'customer';

    try {
        res.status(201).json({ 
            success: true, 
            message: `User account created successfully with role: ${userRole}` 
        });
    } catch (err) {
        res.status(500).json({ error: "Server error during registration." });
    }
});

module.exports = router;