const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
windowMs: 15 * 60 * 1000,
  max: 7,
  message: { error: "Too many login attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    console.log("Rate limit hit");
    res.status(options.statusCode).json(options.message);
  },
});


module.exports = loginLimiter;