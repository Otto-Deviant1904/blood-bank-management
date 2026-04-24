const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

router.get('/summary', authenticateToken, authorizeRole('admin'), reportController.getSummary);
router.get('/blood-usage', authenticateToken, authorizeRole('admin'), reportController.getBloodUsage);
router.get('/donor-stats', authenticateToken, authorizeRole('admin'), reportController.getDonorStats);
router.get('/recipient-stats', authenticateToken, authorizeRole('admin'), reportController.getRecipientStats);
router.get('/filtered', authenticateToken, authorizeRole('admin'), reportController.getFilteredReports);
router.get('/status-distribution', authenticateToken, authorizeRole('admin'), reportController.getRequestStatusDistribution);
router.get('/audit-logs', authenticateToken, authorizeRole('admin'), reportController.getAuditLogs);

module.exports = router;
