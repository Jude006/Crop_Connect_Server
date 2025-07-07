    const express = require('express');
    const { register, login } = require('../controllers/authController');
    const registerLimiter = require('../middleware/registerLimiting');
    const loginLimiter = require('../middleware/loginLimiting');
    const requireAuth = require('../middleware/authMiddleware')
    const router = express.Router();

    router.post('/register', registerLimiter, register);
    router.post('/login', loginLimiter, login);
    // Add this to authRoutes.js
router.get('/verify', requireAuth, (req, res) => {
  res.json({ 
    verified: true,
    user: {
      id: req.user._id,
      role: req.user.role
    }
  });
});

    module.exports = router;