const pool = require('../config/database');
const DEFAULT_AUDIT_LIMIT = 100;
const MAX_AUDIT_LIMIT = 500;

// Get System Summary Statistics
const getSummary = async (req, res) => {
  try {
    const stats = {};

    // Total donors
    const donorCount = await pool.query('SELECT COUNT(*) FROM donor WHERE tenant_id = $1', [req.user.tenant_id]);
    stats.total_donors = parseInt(donorCount.rows[0].count);

    // Total recipients
    const recipientCount = await pool.query('SELECT COUNT(*) FROM recipient WHERE tenant_id = $1', [req.user.tenant_id]);
    stats.total_recipients = parseInt(recipientCount.rows[0].count);

    // Total blood requests
    const requestCount = await pool.query('SELECT COUNT(*) FROM blood_request WHERE tenant_id = $1', [req.user.tenant_id]);
    stats.total_requests = parseInt(requestCount.rows[0].count);

    // Completed requests
    const completedCount = await pool.query(
      "SELECT COUNT(*) FROM blood_request WHERE status = 'COMPLETED' AND tenant_id = $1",
      [req.user.tenant_id]
    );
    stats.fulfilled_requests = parseInt(completedCount.rows[0].count);

    // Total units issued
    const unitsIssued = await pool.query('SELECT SUM(units_issued) FROM blood_issue WHERE tenant_id = $1', [req.user.tenant_id]);
    stats.total_units_issued = parseInt(unitsIssued.rows[0].sum) || 0;

    // Total stock available
    const totalStock = await pool.query('SELECT SUM(units_available) FROM blood_stock WHERE tenant_id = $1', [req.user.tenant_id]);
    stats.total_stock_available = parseInt(totalStock.rows[0].sum) || 0;

    res.json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
};

// Get Blood Usage Analytics
const getBloodUsage = async (req, res) => {
  try {
    const result = await pool.query(
       `SELECT bs.blood_group, bs.units_available as current_stock,
               COALESCE(SUM(bi.units_issued), 0) as units_issued
        FROM blood_stock bs
        LEFT JOIN blood_issue bi ON bs.stock_id = bi.stock_id AND bi.tenant_id = $1
        WHERE bs.tenant_id = $1
        GROUP BY bs.blood_group, bs.units_available
        ORDER BY bs.blood_group`,
      [req.user.tenant_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch blood usage data' });
  }
};

// Get Donor Statistics
const getDonorStats = async (req, res) => {
  try {
    const result = await pool.query(
       `SELECT blood_group, COUNT(*) as donor_count, AVG(age) as avg_age
        FROM donor
       WHERE tenant_id = $1
        GROUP BY blood_group
       ORDER BY blood_group`,
      [req.user.tenant_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch donor statistics' });
  }
};

// Get Recipient Statistics
const getRecipientStats = async (req, res) => {
  try {
    const result = await pool.query(
       `SELECT blood_group_needed, urgency_level, COUNT(*) as count
        FROM recipient
       WHERE tenant_id = $1
        GROUP BY blood_group_needed, urgency_level
       ORDER BY blood_group_needed, urgency_level`,
      [req.user.tenant_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch recipient statistics' });
  }
};

// Get Filtered Reports
const getFilteredReports = async (req, res) => {
  try {
    const { from_date, to_date, blood_group, status } = req.query;

    let query = `SELECT br.*, r.name as recipient_name, r.blood_group_needed, a.status as approval_status
                  FROM blood_request br
                  JOIN recipient r ON br.recipient_id = r.recipient_id
                  LEFT JOIN approval a ON br.request_id = a.blood_request_id
                  WHERE br.tenant_id = $1`;
    const values = [req.user.tenant_id];

    if (from_date) {
      query += ' AND br.request_date >= $' + (values.length + 1);
      values.push(from_date);
    }

    if (to_date) {
      query += ' AND br.request_date <= $' + (values.length + 1);
      values.push(to_date);
    }

    if (blood_group) {
      query += ' AND r.blood_group_needed = $' + (values.length + 1);
      values.push(blood_group);
    }

    if (status) {
      query += ' AND br.status = $' + (values.length + 1);
      values.push(status);
    }

    query += ' ORDER BY br.request_date DESC';

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch filtered reports' });
  }
};

// Get Request Status Distribution
const getRequestStatusDistribution = async (req, res) => {
  try {
    const result = await pool.query(
       `SELECT status, COUNT(*) as count
        FROM blood_request
       WHERE tenant_id = $1
        GROUP BY status
       ORDER BY status`,
      [req.user.tenant_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch request status distribution' });
  }
};

const getAuditLogs = async (req, res) => {
  try {
    const { action, entity_type, from_date, to_date, limit } = req.query;

    let query = `SELECT audit_id, tenant_id, site_id, actor_user_id, action, entity_type, entity_id, details, created_at
                 FROM audit_log
                 WHERE tenant_id = $1`;
    const values = [req.user.tenant_id];

    if (action) {
      query += ` AND action = $${values.length + 1}`;
      values.push(action);
    }

    if (entity_type) {
      query += ` AND entity_type = $${values.length + 1}`;
      values.push(entity_type);
    }

    if (from_date) {
      query += ` AND created_at >= $${values.length + 1}`;
      values.push(from_date);
    }

    if (to_date) {
      query += ` AND created_at <= $${values.length + 1}`;
      values.push(to_date);
    }

    const parsedLimit = Number.parseInt(limit, 10);
    const cappedLimit = Number.isNaN(parsedLimit) || parsedLimit <= 0
      ? DEFAULT_AUDIT_LIMIT
      : Math.min(parsedLimit, MAX_AUDIT_LIMIT);
    query += ` ORDER BY created_at DESC LIMIT $${values.length + 1}`;
    values.push(cappedLimit);

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
};

module.exports = {
  getSummary,
  getBloodUsage,
  getDonorStats,
  getRecipientStats,
  getFilteredReports,
  getRequestStatusDistribution,
  getAuditLogs
};
