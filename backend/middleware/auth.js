const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { runWithDbContext } = require('../utils/dbContext');

const authenticateToken = async (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token missing' });
  }

  let releaseClient = null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    let tenantId = decoded.tenant_id;
    let siteId = decoded.site_id || null;

    if (!tenantId) {
      const userResult = await pool.query(
        'SELECT primary_tenant_id, primary_site_id FROM "user" WHERE user_id = $1',
        [decoded.user_id]
      );

      if (userResult.rows.length === 0) {
        return res.status(401).json({ error: 'User account not found' });
      }

      tenantId = userResult.rows[0].primary_tenant_id;
      siteId = userResult.rows[0].primary_site_id;
    }

    const client = await pool.connect();
    let released = false;
    releaseClient = () => {
      if (!released) {
        released = true;
        client.release();
      }
    };

    await client.query(
      `SELECT
         set_config('app.current_tenant', $1, false),
         set_config('app.current_user_id', $2, false),
         set_config('app.current_role', $3, false)`,
      [String(tenantId), String(decoded.user_id), String(decoded.role || '')]
    );

    const membershipResult = await client.query(
      `SELECT membership_role, site_id
       FROM user_membership
       WHERE user_id = $1 AND tenant_id = $2
       ORDER BY is_primary DESC, membership_id ASC
       LIMIT 1`,
      [decoded.user_id, tenantId]
    );

    if (membershipResult.rows.length === 0) {
      releaseClient();
      return res.status(403).json({ error: 'No active membership for this tenant' });
    }

    const membership = membershipResult.rows[0];
    req.user = {
      ...decoded,
      tenant_id: tenantId,
      site_id: siteId || membership.site_id || null,
      role: membership.membership_role
    };

    req.dbClient = client;
    res.once('finish', releaseClient);
    res.once('close', releaseClient);

    runWithDbContext(
      {
        client,
        tenantId: req.user.tenant_id,
        userId: req.user.user_id,
        role: req.user.role
      },
      () => next()
    );
  } catch (err) {
    if (releaseClient) {
      releaseClient();
    }
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

const authorizeRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

module.exports = {
  authenticateToken,
  authorizeRole
};
