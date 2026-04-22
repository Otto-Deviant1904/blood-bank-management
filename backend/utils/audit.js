const pool = require('../config/database');
const { getDbContext } = require('./dbContext');

const writeAuditLog = async (
  req,
  { action, entityType, entityId = null, details = {}, tenantId, siteId, actorUserId }
) => {
  const resolvedTenantId = tenantId || req?.user?.tenant_id;
  const resolvedSiteId = siteId ?? req?.user?.site_id ?? null;
  const resolvedActorUserId = actorUserId ?? req?.user?.user_id ?? null;

  if (!resolvedTenantId || !action || !entityType) {
    return;
  }

  if (req?.user?.tenant_id && tenantId && Number(req.user.tenant_id) !== Number(tenantId)) {
    throw new Error('Audit tenant mismatch with authenticated request context');
  }

  const context = getDbContext();
  if (context?.client) {
    await context.client.query(
      `INSERT INTO audit_log (tenant_id, site_id, actor_user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        resolvedTenantId,
        resolvedSiteId,
        resolvedActorUserId,
        action,
        entityType,
        entityId ? String(entityId) : null,
        JSON.stringify(details || {})
      ]
    );
    return;
  }

  const client = await pool.connect();
  try {
    await client.query(
      `SELECT
         set_config('app.current_tenant', $1, false),
         set_config('app.current_user_id', $2, false),
         set_config('app.current_role', $3, false)`,
      [String(resolvedTenantId), String(resolvedActorUserId || 0), 'system']
    );

    await client.query(
      `INSERT INTO audit_log (tenant_id, site_id, actor_user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        resolvedTenantId,
        resolvedSiteId,
        resolvedActorUserId,
        action,
        entityType,
        entityId ? String(entityId) : null,
        JSON.stringify(details || {})
      ]
    );
  } finally {
    client.release();
  }
};

module.exports = {
  writeAuditLog
};
