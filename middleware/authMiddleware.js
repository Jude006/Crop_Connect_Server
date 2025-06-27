const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Make sure to import your User model

const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    // 1. Check Authorization header
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            success: false,
            error: 'Authorization header with Bearer token required' 
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        // 2. Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // 3. Check if user exists in database
        const user = await User.findById(decoded.userId || decoded.user._id).select('-password');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found' 
            });
        }

        // 4. Attach full user object to request
        req.user = user;
        
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        
        let status = 401;
        let errorMessage = 'Invalid token';
        
        if (error.name === 'TokenExpiredError') {
            status = 403; // Forbidden
            errorMessage = 'Token expired. Please login again';
        } else if (error.name === 'JsonWebTokenError') {
            errorMessage = 'Invalid token format';
        } else if (error.name === 'CastError') {
            status = 404;
            errorMessage = 'User not found';
        }

        return res.status(status).json({ 
            success: false,
            error: errorMessage 
        });
    }
};

module.exports = authMiddleware;