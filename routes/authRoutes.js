    const express = require('express');
    const { register, login } = require('../controllers/authController');
    const registerLimiter = require('../middleware/registerLimiting');
    const loginLimiter = require('../middleware/loginLimiting');

    const router = express.Router();

    router.post('/register', registerLimiter, register);
    router.post('/login', loginLimiter, login);

    module.exports = router;