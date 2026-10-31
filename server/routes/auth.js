const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');

/**
 * Validate password complexity based on PDF requirements:
 * "the password must be more than eight characters, with an uppercase letter, a lowercase letter and a special character."
 */
function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return 'Password is required.';
    }
    if (password.length <= 8) {
        return 'Password must be more than 8 characters in length.';
    }
    if (!/[A-Z]/.test(password)) {
        return 'Password must contain at least one uppercase letter (A-Z).';
    }
    if (!/[a-z]/.test(password)) {
        return 'Password must contain at least one lowercase letter (a-z).';
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
        return 'Password must contain at least one special character (e.g. !@#$%^&*).';
    }
    return null;
}

// ==========================================
// 1. REGISTER NEW CUSTOMER
// ==========================================
router.post('/register', async (req, res) => {
    try {
        const { email, password, name, company } = req.body;

        if (!email || !name) {
            return res.status(400).json({ error: 'Email and full name are required.' });
        }

        const passwordErr = validatePassword(password);
        if (passwordErr) {
            return res.status(400).json({ error: passwordErr });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Check unique email
        const existing = db.query('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        const passwordHash = bcrypt.hashSync(password, 10);

        const result = db.query(`
            INSERT INTO users (email, password_hash, role, name, company)
            VALUES (?, ?, 'customer', ?, ?)
            RETURNING id, email, role, name, company, created_at
        `, [normalizedEmail, passwordHash, name.trim(), company ? company.trim() : '']);

        const newUser = result.rows[0];

        const token = jwt.sign(
            { id: newUser.id, email: newUser.email, role: newUser.role, name: newUser.name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'Account registered successfully.',
            user: newUser,
            token
        });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Server error during registration.' });
    }
});

// ==========================================
// 2. USER LOGIN
// ==========================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const userRes = db.query('SELECT * FROM users WHERE email = ?', [normalizedEmail]);

        if (userRes.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = userRes.rows[0];
        const match = bcrypt.compareSync(password, user.password_hash);

        if (!match) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, name: user.name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful.',
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                name: user.name,
                company: user.company
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// ==========================================
// 3. FORGOT PASSWORD (REQUEST RESET LINK)
// ==========================================
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email is required.' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const userRes = db.query('SELECT id, email, name FROM users WHERE email = ?', [normalizedEmail]);

        if (userRes.rows.length === 0) {
            // Standard security: do not leak whether account exists
            return res.json({ 
                message: 'If that email is registered, a password reset link has been dispatched to it.' 
            });
        }

        const user = userRes.rows[0];
        const resetToken = crypto.randomBytes(24).toString('hex');
        // Valid for 1 hour
        const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();

        db.query('UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?', [
            resetToken,
            expiry,
            user.id
        ]);

        // Simulating the email dispatch per requirement:
        // "If they forget it later, a reset link should arrive at their registered email."
        const resetLink = `http://localhost:5000/?action=reset&token=${resetToken}`;
        console.log(`[SIMULATED EMAIL TO: ${user.email}] Password reset link: ${resetLink}`);

        res.json({
            message: `A password reset link has been dispatched to ${user.email}.`,
            simulatedResetLink: resetLink,
            resetToken: resetToken
        });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Server error processing password reset.' });
    }
});

// ==========================================
// 4. RESET PASSWORD WITH TOKEN
// ==========================================
router.post('/reset-password', async (req, res) => {
    try {
        const { token, new_password } = req.body;

        if (!token || !new_password) {
            return res.status(400).json({ error: 'Reset token and new password are required.' });
        }

        const passwordErr = validatePassword(new_password);
        if (passwordErr) {
            return res.status(400).json({ error: passwordErr });
        }

        const now = new Date().toISOString();
        const userRes = db.query(
            'SELECT id, email FROM users WHERE reset_token = ? AND reset_token_expiry > ?',
            [token, now]
        );

        if (userRes.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired password reset token.' });
        }

        const user = userRes.rows[0];
        const newHash = bcrypt.hashSync(new_password, 10);

        db.query('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?', [
            newHash,
            user.id
        ]);

        res.json({ message: 'Password has been reset successfully. You can now log in.' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'Server error during password reset.' });
    }
});

// ==========================================
// 5. CURRENT AUTHENTICATED USER
// ==========================================
router.get('/me', authenticateToken, (req, res) => {
    const userRes = db.query('SELECT id, email, role, name, company, created_at FROM users WHERE id = ?', [req.user.id]);
    if (userRes.rows.length === 0) {
        return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ user: userRes.rows[0] });
});

module.exports = router;
