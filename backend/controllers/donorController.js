const pool = require('../config/database');
const { REQUEST_STATUSES, ensureWorkflowSchema } = require('../utils/workflow');

// Register Donor (handled in auth controller)
// Get Donor Profile
const getDonorProfile = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM donor WHERE donor_id = $1 AND tenant_id = $2',
      [id, req.user.tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Donor not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch donor profile' });
  }
};

// Get Donor Profile by User ID
const getDonorProfileByUserId = async (req, res) => {
  try {
    const { user_id } = req.params;

    const result = await pool.query(
      'SELECT * FROM donor WHERE user_id = $1 AND tenant_id = $2',
      [user_id, req.user.tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Donor profile not found for this user' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch donor profile' });
  }
};

// Update Donor Profile
const updateDonorProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, age, blood_group, phone, email, city } = req.body;

    const result = await pool.query(
      'UPDATE donor SET name = $1, age = $2, blood_group = $3, phone = $4, email = $5, city = $6 WHERE donor_id = $7 AND tenant_id = $8 RETURNING *',
      [name, age, blood_group, phone, email, city, id, req.user.tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Donor not found' });
    }

    res.json({ message: 'Profile updated successfully', donor: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// Search Donors
const searchDonors = async (req, res) => {
  try {
    const { blood_group, city } = req.query;
    let query = 'SELECT * FROM donor WHERE tenant_id = $1';
    const values = [req.user.tenant_id];

    if (blood_group) {
      query += ' AND blood_group = $' + (values.length + 1);
      values.push(blood_group);
    }

    if (city) {
      query += ' AND city ILIKE $' + (values.length + 1);
      values.push(`%${city}%`);
    }

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Search failed' });
  }
};

// Record Donation
const recordDonation = async (req, res) => {
  try {
    const { donor_id } = req.params;
    const { units_donated } = req.body;

    // Check donor eligibility (56 days since last donation)
    const donorResult = await pool.query(
      'SELECT last_donation_date FROM donor WHERE donor_id = $1 AND tenant_id = $2',
      [donor_id, req.user.tenant_id]
    );

    if (donorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Donor not found' });
    }

    const lastDonation = donorResult.rows[0].last_donation_date;
    if (lastDonation) {
      const daysSinceLastDonation = Math.floor(
        (new Date() - new Date(lastDonation)) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceLastDonation < 56) {
        return res.status(400).json({
          error: `Donor must wait ${56 - daysSinceLastDonation} more days before next donation`
        });
      }
    }

    // Update last donation date
    const updateResult = await pool.query(
      'UPDATE donor SET last_donation_date = CURRENT_DATE WHERE donor_id = $1 AND tenant_id = $2 RETURNING *',
      [donor_id, req.user.tenant_id]
    );

    // Add units to blood stock
    const bloodGroup = updateResult.rows[0].blood_group;
    await pool.query(
      'UPDATE blood_stock SET units_available = units_available + $1 WHERE blood_group = $2 AND tenant_id = $3',
      [units_donated, bloodGroup, req.user.tenant_id]
    );

    res.json({
      message: 'Donation recorded successfully',
      donor: updateResult.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to record donation' });
  }
};

// Get Donation History
const getDonationHistory = async (req, res) => {
  try {
    await ensureWorkflowSchema();

    const { id } = req.params;

    const donorResult = await pool.query(
      'SELECT donor_id, last_donation_date FROM donor WHERE donor_id = $1 AND tenant_id = $2',
      [id, req.user.tenant_id]
    );

    if (donorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Donor not found' });
    }

    const donationsResult = await pool.query(
      `SELECT
         br.request_id,
         br.request_date AS donation_date,
         br.units_requested AS units_donated,
         r.name AS recipient_name,
         COALESCE(br.hospital_location, r.hospital) AS hospital_location,
         COALESCE(br.blood_group_needed, r.blood_group_needed) AS recipient_blood_group,
         da.updated_at AS match_updated_at
       FROM donation_application da
       JOIN blood_request br ON da.request_id = br.request_id
       JOIN recipient r ON br.recipient_id = r.recipient_id
        WHERE da.donor_id = $1
          AND da.status = 'Accepted'
          AND br.status = $2
          AND br.tenant_id = $3
        ORDER BY br.request_date DESC, da.updated_at DESC`,
      [id, REQUEST_STATUSES.COMPLETED, req.user.tenant_id]
    );

    res.json({
      donor_id: id,
      last_donation_date: donorResult.rows[0].last_donation_date,
      total_donations: donationsResult.rows.length,
      donations: donationsResult.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch donation history' });
  }
};

// Get Donation History by User ID
const getDonationHistoryByUserId = async (req, res) => {
  try {
    await ensureWorkflowSchema();

    const { user_id } = req.params;

    const donorResult = await pool.query(
      'SELECT donor_id, last_donation_date FROM donor WHERE user_id = $1 AND tenant_id = $2',
      [user_id, req.user.tenant_id]
    );

    if (donorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Donor profile not found for this user' });
    }

    const donorId = donorResult.rows[0].donor_id;

    const donationsResult = await pool.query(
      `SELECT
         br.request_id,
         br.request_date AS donation_date,
         br.units_requested AS units_donated,
         r.name AS recipient_name,
         COALESCE(br.hospital_location, r.hospital) AS hospital_location,
         COALESCE(br.blood_group_needed, r.blood_group_needed) AS recipient_blood_group,
         da.updated_at AS match_updated_at
       FROM donation_application da
       JOIN blood_request br ON da.request_id = br.request_id
       JOIN recipient r ON br.recipient_id = r.recipient_id
        WHERE da.donor_id = $1
          AND da.status = 'Accepted'
          AND br.status = $2
          AND br.tenant_id = $3
        ORDER BY br.request_date DESC, da.updated_at DESC`,
      [donorId, REQUEST_STATUSES.COMPLETED, req.user.tenant_id]
    );

    res.json({
      donor_id: donorId,
      last_donation_date: donorResult.rows[0].last_donation_date,
      total_donations: donationsResult.rows.length,
      donations: donationsResult.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch donation history' });
  }
};

module.exports = {
  getDonorProfile,
  getDonorProfileByUserId,
  updateDonorProfile,
  searchDonors,
  recordDonation,
  getDonationHistory,
  getDonationHistoryByUserId
};
