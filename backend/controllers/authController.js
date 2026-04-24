const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { writeAuditLog } = require('../utils/audit');

const resolveTenantContext = async (client, tenantCode, siteCode) => {
  const organizationResult = await client.query(
    'SELECT tenant_id FROM organization WHERE code = $1 AND is_active = TRUE',
    [tenantCode || 'default-org']
  );

  if (organizationResult.rows.length === 0) {
    return null;
  }

  const tenantId = organizationResult.rows[0].tenant_id;
  let siteId = null;

  if (siteCode) {
    const siteResult = await client.query(
      'SELECT site_id FROM site WHERE tenant_id = $1 AND code = $2 AND is_active = TRUE',
      [tenantId, siteCode]
    );
    if (siteResult.rows.length === 0) {
      return { error: 'Invalid site for tenant' };
    }
    siteId = siteResult.rows[0].site_id;
  }

  return { tenantId, siteId };
};

const register = async (req, res) => {
  const client = await pool.connect();
  let transactionActive = false;
  try {
    const {
      username,
      password,
      role,
      name,
      age,
      blood_group,
      phone,
      email,
      city,
      blood_group_needed,
      hospital,
      contact,
      urgency_level,
      tenant_code,
      site_code
    } = req.body;

    await client.query('BEGIN');
    transactionActive = true;

    const tenantContext = await resolveTenantContext(client, tenant_code, site_code);
    if (!tenantContext) {
      await client.query('ROLLBACK');
      transactionActive = false;
      return res.status(400).json({ error: 'Invalid tenant' });
    }
    if (tenantContext.error) {
      await client.query('ROLLBACK');
      transactionActive = false;
      return res.status(400).json({ error: tenantContext.error });
    }

    await client.query(
      `SELECT
         set_config('app.current_tenant', $1, false),
         set_config('app.current_user_id', $2, false),
         set_config('app.current_role', $3, false)`,
      [String(tenantContext.tenantId), '0', String(role || '')]
    );

    // Check if user already exists
    const userExists = await client.query('SELECT * FROM "user" WHERE username = $1', [username]);
    if (userExists.rows.length > 0) {
      await client.query('ROLLBACK');
      transactionActive = false;
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userResult = await client.query(
      `INSERT INTO "user" (username, password, role, primary_tenant_id, primary_site_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id, username, role, primary_tenant_id, primary_site_id`,
      [username, hashedPassword, role, tenantContext.tenantId, tenantContext.siteId]
    );

    const userId = userResult.rows[0].user_id;

    await client.query(
      `SELECT set_config('app.current_user_id', $1, false)`,
      [String(userId)]
    );

    // Create profile based on role
    if (role === 'donor') {
      await client.query(
        `INSERT INTO donor (user_id, tenant_id, site_id, name, age, blood_group, phone, email, city)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [userId, tenantContext.tenantId, tenantContext.siteId, name, age, blood_group, phone, email, city || null]
      );
    } else if (role === 'recipient') {
      await client.query(
        `INSERT INTO recipient (user_id, tenant_id, site_id, name, blood_group_needed, hospital, contact, urgency_level)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [userId, tenantContext.tenantId, tenantContext.siteId, name, blood_group_needed, hospital, contact, urgency_level]
      );
    }

    await client.query(
      `INSERT INTO user_membership (user_id, tenant_id, site_id, membership_role, is_primary)
       SELECT $1, $2, $3, $4, TRUE
       WHERE NOT EXISTS (
         SELECT 1
         FROM user_membership
         WHERE user_id = $1
           AND tenant_id = $2
           AND site_id IS NOT DISTINCT FROM $3
       )`,
      [userId, tenantContext.tenantId, tenantContext.siteId, role]
    );

    await client.query('COMMIT');
    transactionActive = false;

    // Generate token
    const jwtExpiry = process.env.JWT_EXPIRY || '7d';
    const token = jwt.sign(
      {
        user_id: userId,
        username,
        role,
        tenant_id: tenantContext.tenantId,
        site_id: tenantContext.siteId
      },
      process.env.JWT_SECRET,
      { expiresIn: jwtExpiry }
    );

    await writeAuditLog(req, {
      action: 'USER_REGISTERED',
      entityType: 'user',
      entityId: userId,
      tenantId: tenantContext.tenantId,
      siteId: tenantContext.siteId,
      actorUserId: userId,
      details: { role, username }
    });

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        user_id: userId,
        username,
        role,
        tenant_id: tenantContext.tenantId,
        site_id: tenantContext.siteId
      }
    });
  } catch (error) {
    if (transactionActive) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError.message);
      }
    }
    console.error(error);

    if (error.code === '23505') {
      if (error.constraint === 'donor_phone_key') {
        return res.status(400).json({ error: 'Phone number is already registered' });
      }
      if (error.constraint === 'donor_email_key') {
        return res.status(400).json({ error: 'Email is already registered' });
      }
      if (error.constraint === 'recipient_contact_key') {
        return res.status(400).json({ error: 'Contact number is already registered' });
      }
      if (error.constraint === 'user_username_key') {
        return res.status(400).json({ error: 'Username already exists' });
      }
      return res.status(400).json({ error: 'Duplicate value found in registration data' });
    }

    res.status(500).json({ error: 'Registration failed' });
  } finally {
    client.release();
  }
};

const login = async (req, res) => {
  const client = await pool.connect();
  try {
    const { username, password, tenant_code } = req.body;

    const result = await client.query(
      'SELECT * FROM "user" WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    let tenantId = user.primary_tenant_id;
    let siteId = user.primary_site_id || null;
    let membershipRole = user.role;

    if (tenant_code) {
      const tenantLookup = await client.query(
        'SELECT tenant_id FROM organization WHERE code = $1 AND is_active = TRUE LIMIT 1',
        [tenant_code]
      );

      if (tenantLookup.rows.length === 0) {
        return res.status(403).json({ error: 'No membership found for requested tenant' });
      }

      tenantId = tenantLookup.rows[0].tenant_id;
      await client.query(
        `SELECT
           set_config('app.current_tenant', $1, false),
           set_config('app.current_user_id', $2, false),
           set_config('app.current_role', $3, false)`,
        [String(tenantId), String(user.user_id), String(user.role || '')]
      );

      const membershipResult = await client.query(
        `SELECT um.tenant_id, um.site_id, um.membership_role
         FROM user_membership um
         JOIN organization o ON o.tenant_id = um.tenant_id
         WHERE um.user_id = $1 AND o.code = $2 AND o.is_active = TRUE
         ORDER BY um.is_primary DESC, um.membership_id ASC
         LIMIT 1`,
        [user.user_id, tenant_code]
      );

      if (membershipResult.rows.length === 0) {
        return res.status(403).json({ error: 'No membership found for requested tenant' });
      }

      tenantId = membershipResult.rows[0].tenant_id;
      siteId = membershipResult.rows[0].site_id;
      membershipRole = membershipResult.rows[0].membership_role;
    } else {
      await client.query(
        `SELECT
           set_config('app.current_tenant', $1, false),
           set_config('app.current_user_id', $2, false),
           set_config('app.current_role', $3, false)`,
        [String(tenantId), String(user.user_id), String(user.role || '')]
      );

      const membershipResult = await client.query(
        `SELECT membership_role, site_id
         FROM user_membership
         WHERE user_id = $1 AND tenant_id = $2
         ORDER BY is_primary DESC, membership_id ASC
         LIMIT 1`,
        [user.user_id, tenantId]
      );

      if (membershipResult.rows.length > 0) {
        membershipRole = membershipResult.rows[0].membership_role;
        siteId = membershipResult.rows[0].site_id;
      }
    }

    const jwtExpiry = process.env.JWT_EXPIRY || '7d';
    const token = jwt.sign(
      {
        user_id: user.user_id,
        username: user.username,
        role: membershipRole,
        tenant_id: tenantId,
        site_id: siteId
      },
      process.env.JWT_SECRET,
      { expiresIn: jwtExpiry }
    );

    await writeAuditLog(req, {
      action: 'USER_LOGGED_IN',
      entityType: 'user',
      entityId: user.user_id,
      tenantId,
      siteId,
      actorUserId: user.user_id,
      details: { username: user.username, role: membershipRole }
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        role: membershipRole,
        tenant_id: tenantId,
        site_id: siteId
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed' });
  } finally {
    client.release();
  }
};

module.exports = {
  register,
  login
};
