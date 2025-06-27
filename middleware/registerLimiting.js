const rateLimit = require('express-rate-limit');

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 7,
  message: { error: "Too many accounts created, please try again later" },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = registerLimiter;