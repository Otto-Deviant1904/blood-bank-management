const pool = require('../config/database');
const { REQUEST_STATUSES } = require('../utils/workflow');
const { writeAuditLog } = require('../utils/audit');
const logger = require('../utils/logger');

// Create Approval
const createApproval = async (req, res) => {
  res.status(400).json({ error: 'Use request verification and match endpoints instead' });
};

// Update Approval Status
const updateApprovalStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const mappedStatus = status === 'Approved' ? REQUEST_STATUSES.OPEN_FOR_DONORS : status;
    const finalStatus = mappedStatus === 'Rejected' ? REQUEST_STATUSES.REJECTED : mappedStatus;

    if (![REQUEST_STATUSES.OPEN_FOR_DONORS, REQUEST_STATUSES.REJECTED].includes(finalStatus)) {
      return res.status(400).json({ error: 'Status must be OPEN_FOR_DONORS or REJECTED' });
    }

    const existing = await pool.query(
      'SELECT request_id, status FROM blood_request WHERE request_id = $1 AND tenant_id = $2',
      [id, req.user.tenant_id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (existing.rows[0].status !== REQUEST_STATUSES.PENDING_VERIFICATION) {
      return res.status(400).json({ error: 'Only PENDING_VERIFICATION requests can be moderated here' });
    }

    const result = await pool.query(
      'UPDATE blood_request SET status = $1 WHERE request_id = $2 AND tenant_id = $3 RETURNING *',
      [finalStatus, id, req.user.tenant_id]
    );

    await writeAuditLog(req, {
      action: 'REQUEST_VERIFICATION_UPDATED',
      entityType: 'blood_request',
      entityId: id,
      details: { status: finalStatus }
    });

    res.json({
      message: 'Request verification updated successfully',
      request: result.rows[0]
    });
  } catch (error) {
    logger.error('Failed to update approval status', error);
    res.status(500).json({ error: 'Failed to update approval status' });
  }
};

// Get Approval History
const getApprovalHistory = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         br.request_id AS approval_id,
         br.request_id AS blood_request_id,
         br.status,
         br.urgency_flag,
         br.units_requested,
         br.request_date,
         COALESCE(br.blood_group_needed, r.blood_group_needed) AS blood_group_needed,
         COALESCE(br.hospital_location, r.hospital) AS hospital_location,
         r.name AS recipient_name,
         da_latest.application_id,
         da_latest.application_status,
         d.name AS donor_name,
         d.blood_group AS donor_blood_group,
         d.last_donation_date
       FROM blood_request br
       JOIN recipient r ON br.recipient_id = r.recipient_id
       LEFT JOIN LATERAL (
         SELECT
           da.application_id,
           da.donor_id,
           da.status AS application_status,
           da.updated_at
         FROM donation_application da
         WHERE da.request_id = br.request_id
         ORDER BY
           CASE
             WHEN da.status = 'Accepted' THEN 0
             WHEN da.status = 'Pending' THEN 1
             ELSE 2
           END,
           da.updated_at DESC
         LIMIT 1
       ) da_latest ON TRUE
        LEFT JOIN donor d ON da_latest.donor_id = d.donor_id
        WHERE br.tenant_id = $1
        ORDER BY br.created_at DESC`,
      [req.user.tenant_id]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Failed to fetch approval history', error);
    res.status(500).json({ error: 'Failed to fetch approval history' });
  }
};

// Issue Blood
const issueBlood = async (req, res) => {
  const client = await pool.connect();
  try {
    const { blood_request_id } = req.body;

    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT request_id, status FROM blood_request WHERE request_id = $1 AND tenant_id = $2',
      [blood_request_id, req.user.tenant_id]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Request not found' });
    }

    if (existing.rows[0].status !== REQUEST_STATUSES.MATCH_APPROVED) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only MATCH_APPROVED requests can be marked as fulfilled' });
    }

    await client.query(
      'UPDATE blood_request SET status = $1 WHERE request_id = $2 AND tenant_id = $3',
      [REQUEST_STATUSES.COMPLETED, blood_request_id, req.user.tenant_id]
    );

    // Update donor's last donation date based on accepted match for this request.
    const acceptedApplication = await client.query(
      `SELECT donor_id
       FROM donation_application
       WHERE request_id = $1 AND status = 'Accepted' AND tenant_id = $2
       ORDER BY updated_at DESC
       LIMIT 1`,
      [blood_request_id, req.user.tenant_id]
    );

    if (acceptedApplication.rows.length > 0) {
      await client.query(
        'UPDATE donor SET last_donation_date = CURRENT_DATE WHERE donor_id = $1 AND tenant_id = $2',
        [acceptedApplication.rows[0].donor_id, req.user.tenant_id]
      );
    }

    await client.query('COMMIT');

    await writeAuditLog(req, {
      action: 'REQUEST_COMPLETED',
      entityType: 'blood_request',
      entityId: blood_request_id,
      details: { status: REQUEST_STATUSES.COMPLETED }
    });

    res.status(201).json({
      message: 'Request marked as fulfilled',
      request_id: blood_request_id,
      status: REQUEST_STATUSES.COMPLETED
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to issue blood', error);
    res.status(500).json({ error: 'Failed to mark request as fulfilled' });
  } finally {
    client.release();
  }
};

// Get Issue History
const getIssueHistory = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT bi.*, br.urgency_flag, r.name as recipient_name, bs.blood_group
       FROM blood_issue bi
       JOIN blood_request br ON bi.blood_request_id = br.request_id
       JOIN recipient r ON br.recipient_id = r.recipient_id
       JOIN blood_stock bs ON bi.stock_id = bs.stock_id
       WHERE br.tenant_id = $1
       ORDER BY bi.issue_date DESC`,
      [req.user.tenant_id]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Failed to fetch issue history', error);
    res.status(500).json({ error: 'Failed to fetch issue history' });
  }
};

module.exports = {
  createApproval,
  updateApprovalStatus,
  getApprovalHistory,
  issueBlood,
  getIssueHistory
};
