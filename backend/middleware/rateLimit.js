const rateLimit = require('express-rate-limit');

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const maxRequests = Number(process.env.RATE_LIMIT_MAX || 250);
const authMaxRequests = Number(process.env.AUTH_RATE_LIMIT_MAX || 30);

const apiRateLimiter = rateLimit({
  windowMs,
  max: maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
  validate: { xForwardedForHeader: false }
});

const authRateLimiter = rateLimit({
  windowMs,
  max: authMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later' },
  validate: { xForwardedForHeader: false }
});

module.exports = {
  apiRateLimiter,
  authRateLimiter
};
