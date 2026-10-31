const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'brightloop_super_secret_jwt_key_2026';

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : req.query.token;

    if (!token) {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Session expired or invalid token.' });
        }
        req.user = user;
        next();
    });
}

function requireRole(allowedRoles) {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                error: `Access denied. Requires one of: [${roles.join(', ')}]. You are logged in as ${req.user.role}.` 
            });
        }
        next();
    };
}

module.exports = {
    JWT_SECRET,
    authenticateToken,
    requireRole
};
