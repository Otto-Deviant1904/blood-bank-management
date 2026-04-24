const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateDonorRegistration, validateRecipientRegistration, handleValidationErrors } = require('../middleware/validation');
const { authRateLimiter } = require('../middleware/rateLimit');

const setRoleFromRoute = (role) => (req, res, next) => {
	req.body.role = role;
	next();
};

router.post('/register/donor', authRateLimiter, setRoleFromRoute('donor'), validateDonorRegistration, handleValidationErrors, authController.register);
router.post('/register/recipient', authRateLimiter, setRoleFromRoute('recipient'), validateRecipientRegistration, handleValidationErrors, authController.register);
router.post('/register/admin', authRateLimiter, setRoleFromRoute('admin'), authController.register);
router.post('/login', authRateLimiter, authController.login);

module.exports = router;
