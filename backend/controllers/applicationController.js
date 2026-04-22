const pool = require('../config/database');
const { REQUEST_STATUSES, ensureWorkflowSchema } = require('../utils/workflow');

const applyToRequest = async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureWorkflowSchema();

    const { request_id, message } = req.body;

    await client.query('BEGIN');

    const donorResult = await client.query(
      'SELECT donor_id, blood_group, last_donation_date FROM donor WHERE user_id = $1 AND tenant_id = $2',
      [req.user.user_id, req.user.tenant_id]
    );
    if (donorResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Donor profile not found' });
    }

    const donor = donorResult.rows[0];

    if (donor.last_donation_date) {
      const lastDonation = new Date(donor.last_donation_date);
      const daysSinceLastDonation = Math.floor((Date.now() - lastDonation.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSinceLastDonation < 90) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `You can apply only after 90 days since your last donation (${daysSinceLastDonation} days elapsed).`
        });
      }
    }

    const requestResult = await client.query(
      `SELECT br.request_id, br.status, COALESCE(br.blood_group_needed, r.blood_group_needed) AS blood_group_needed
       FROM blood_request br
        JOIN recipient r ON br.recipient_id = r.recipient_id
       WHERE br.request_id = $1 AND br.tenant_id = $2`,
      [request_id, req.user.tenant_id]
    );

    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Blood request not found' });
    }

    const bloodRequest = requestResult.rows[0];

    if (bloodRequest.status !== REQUEST_STATUSES.OPEN_FOR_DONORS) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Can only apply to requests that are open for donors' });
    }

    if (bloodRequest.blood_group_needed !== donor.blood_group) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'You can only apply to requests matching your blood group' });
    }

    const insertResult = await client.query(
      `INSERT INTO donation_application (request_id, donor_id, tenant_id, message)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [request_id, donor.donor_id, req.user.tenant_id, message || null]
    );

    await client.query(
      'UPDATE blood_request SET status = $1 WHERE request_id = $2 AND tenant_id = $3',
      [REQUEST_STATUSES.DONOR_APPLIED, request_id, req.user.tenant_id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Application submitted successfully',
      application: insertResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(400).json({ error: 'You have already applied for this request' });
    }
    console.error(error);
    res.status(500).json({ error: 'Failed to submit application' });
  } finally {
    client.release();
  }
};

const getMyApplications = async (req, res) => {
  try {
    await ensureWorkflowSchema();

    const donorResult = await pool.query(
      'SELECT donor_id FROM donor WHERE user_id = $1 AND tenant_id = $2',
      [req.user.user_id, req.user.tenant_id]
    );
    if (donorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Donor profile not found' });
    }

    const { donor_id } = donorResult.rows[0];

    const result = await pool.query(
      `SELECT da.*, br.urgency_flag, br.units_requested, br.request_date, br.status AS request_status,
              r.name AS recipient_name, r.hospital, r.blood_group_needed
       FROM donation_application da
       JOIN blood_request br ON da.request_id = br.request_id
       JOIN recipient r ON br.recipient_id = r.recipient_id
       WHERE da.donor_id = $1 AND da.tenant_id = $2
        ORDER BY da.applied_at DESC`,
      [donor_id, req.user.tenant_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
};

const getApplicationsForRequest = async (req, res) => {
  try {
    await ensureWorkflowSchema();

    const { request_id } = req.params;

    const requestResult = await pool.query(
      'SELECT recipient_id FROM blood_request WHERE request_id = $1 AND tenant_id = $2',
      [request_id, req.user.tenant_id]
    );
    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Blood request not found' });
    }

    const { recipient_id } = requestResult.rows[0];

    if (req.user.role === 'recipient') {
      const recipientResult = await pool.query(
        'SELECT recipient_id FROM recipient WHERE user_id = $1 AND tenant_id = $2',
        [req.user.user_id, req.user.tenant_id]
      );
      if (recipientResult.rows.length === 0 || recipientResult.rows[0].recipient_id !== recipient_id) {
        return res.status(403).json({ error: 'Not authorized to view applications for this request' });
      }
    }

    const result = await pool.query(
      `SELECT da.*, d.name AS donor_name, d.age, d.blood_group, d.phone, d.email, d.city, d.last_donation_date
       FROM donation_application da
       JOIN donor d ON da.donor_id = d.donor_id
       WHERE da.request_id = $1 AND da.tenant_id = $2
        ORDER BY da.applied_at DESC`,
      [request_id, req.user.tenant_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch applications for request' });
  }
};

const updateApplicationStatus = async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureWorkflowSchema();

    const { id } = req.params;
    const { status } = req.body;

    if (!['Accepted', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be Accepted or Rejected' });
    }

    await client.query('BEGIN');

    const appResult = await client.query(
      `SELECT da.application_id, da.request_id, da.donor_id, br.recipient_id
       FROM donation_application da
        JOIN blood_request br ON da.request_id = br.request_id
       WHERE da.application_id = $1 AND br.tenant_id = $2`,
      [id, req.user.tenant_id]
    );

    if (appResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Application not found' });
    }

    const appData = appResult.rows[0];

    const donorEligibilityResult = await client.query(
      'SELECT last_donation_date FROM donor WHERE donor_id = $1 AND tenant_id = $2',
      [appData.donor_id, req.user.tenant_id]
    );

    if (status === 'Accepted' && donorEligibilityResult.rows[0]?.last_donation_date) {
      const lastDonation = new Date(donorEligibilityResult.rows[0].last_donation_date);
      const daysSinceLastDonation = Math.floor((Date.now() - lastDonation.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceLastDonation < 90) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Donor is not eligible yet. Minimum 90 days required since last donation (${daysSinceLastDonation} days elapsed).`
        });
      }
    }

    const result = await client.query(
       `UPDATE donation_application
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE application_id = $2 AND tenant_id = $3
        RETURNING *`,
      [status, id, req.user.tenant_id]
    );

    if (status === 'Accepted') {
      await client.query(
        'UPDATE blood_request SET status = $1 WHERE request_id = $2 AND tenant_id = $3',
        [REQUEST_STATUSES.MATCH_APPROVED, appData.request_id, req.user.tenant_id]
      );

      await client.query(
         `UPDATE donation_application
          SET status = 'Rejected', updated_at = CURRENT_TIMESTAMP
          WHERE request_id = $1 AND application_id != $2 AND status = 'Pending' AND tenant_id = $3`,
         [appData.request_id, id, req.user.tenant_id]
       );
    } else {
      await client.query(
        'UPDATE blood_request SET status = $1 WHERE request_id = $2 AND tenant_id = $3',
        [REQUEST_STATUSES.OPEN_FOR_DONORS, appData.request_id, req.user.tenant_id]
      );
    }

    await client.query('COMMIT');

    res.json({
      message: 'Application status updated successfully',
      application: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Failed to update application status' });
  } finally {
    client.release();
  }
};

module.exports = {
  applyToRequest,
  getMyApplications,
  getApplicationsForRequest,
  updateApplicationStatus
};
