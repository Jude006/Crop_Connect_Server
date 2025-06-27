const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 7, // Limit each IP to 7 login requests per windowMs
  message: { 
    error: "Too many login attempts, please try again later" 
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable legacy headers
  keyGenerator: (req) => {
    // Use IP + email to prevent single IP from blocking all users
    return req.ip + req.body.email;
  },
  handler: (req, res, next, options) => {
    console.log(`Rate limit hit for IP: ${req.ip}`);
    res.status(options.statusCode).json(options.message);
  },
});

module.exports = loginLimiter;