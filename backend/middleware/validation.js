const { body, validationResult } = require('express-validator');

const validateDonorRegistration = [
  body('username')
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 3, max: 50 }).withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username may only contain letters, numbers, and underscores'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/).withMessage('Password must contain at least one number or special character'),
  body('name').notEmpty().withMessage('Name is required'),
  body('age').isInt({ min: 18, max: 65 }).withMessage('Age must be between 18 and 65'),
  body('blood_group').isIn(['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']).withMessage('Invalid blood group'),
  body('phone').isMobilePhone().withMessage('Invalid phone number'),
  body('email').isEmail().withMessage('Invalid email'),
  body('city').optional().isString(),
];

const validateRecipientRegistration = [
  body('username')
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 3, max: 50 }).withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username may only contain letters, numbers, and underscores'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/).withMessage('Password must contain at least one number or special character'),
  body('name').notEmpty().withMessage('Name is required'),
  body('blood_group_needed').isIn(['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']).withMessage('Invalid blood group'),
  body('hospital').notEmpty().withMessage('Hospital name is required'),
  body('contact').notEmpty().withMessage('Contact is required'),
  body('urgency_level').isIn(['Low', 'Medium', 'High', 'Critical']).withMessage('Invalid urgency level'),
];

const validateBloodRequest = [
  body('units_requested').isInt({ min: 1 }).withMessage('Units requested must be at least 1'),
  body('urgency_flag').isIn(['Low', 'Medium', 'High', 'Critical']).withMessage('Invalid urgency flag'),
];

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

module.exports = {
  validateDonorRegistration,
  validateRecipientRegistration,
  validateBloodRequest,
  handleValidationErrors
};
