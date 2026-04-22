const pool = require('../config/database');

const ALLOWED_CONSTRAINTS = new Set([
  'user|fk_user_primary_tenant|FOREIGN KEY (primary_tenant_id) REFERENCES organization(tenant_id) ON DELETE RESTRICT',
  'user|fk_user_primary_site|FOREIGN KEY (primary_site_id) REFERENCES site(site_id) ON DELETE SET NULL',
  'donor|fk_donor_tenant|FOREIGN KEY (tenant_id) REFERENCES organization(tenant_id) ON DELETE RESTRICT',
  'donor|fk_donor_site|FOREIGN KEY (site_id) REFERENCES site(site_id) ON DELETE SET NULL',
  'recipient|fk_recipient_tenant|FOREIGN KEY (tenant_id) REFERENCES organization(tenant_id) ON DELETE RESTRICT',
  'recipient|fk_recipient_site|FOREIGN KEY (site_id) REFERENCES site(site_id) ON DELETE SET NULL',
  'blood_request|fk_blood_request_tenant|FOREIGN KEY (tenant_id) REFERENCES organization(tenant_id) ON DELETE RESTRICT',
  'blood_request|fk_blood_request_site|FOREIGN KEY (site_id) REFERENCES site(site_id) ON DELETE SET NULL',
  'blood_stock|fk_blood_stock_tenant|FOREIGN KEY (tenant_id) REFERENCES organization(tenant_id) ON DELETE RESTRICT',
  'blood_stock|fk_blood_stock_site|FOREIGN KEY (site_id) REFERENCES site(site_id) ON DELETE SET NULL',
  'approval|fk_approval_tenant|FOREIGN KEY (tenant_id) REFERENCES organization(tenant_id) ON DELETE RESTRICT',
  'blood_issue|fk_blood_issue_tenant|FOREIGN KEY (tenant_id) REFERENCES organization(tenant_id) ON DELETE RESTRICT',
  'donation_application|fk_donation_application_tenant|FOREIGN KEY (tenant_id) REFERENCES organization(tenant_id) ON DELETE RESTRICT'
]);

const addConstraintIfMissing = async (tableName, constraintName, constraintSql) => {
  const allowKey = `${tableName}|${constraintName}|${constraintSql}`;
  if (!ALLOWED_CONSTRAINTS.has(allowKey)) {
    throw new Error(`Constraint declaration not allowed: ${tableName}.${constraintName}`);
  }

  const resolvedTableName = tableName === 'user' ? '"user"' : tableName;
  const { rows } = await pool.query(
    `
      SELECT 1
      FROM pg_constraint
      WHERE conname = $1
        AND conrelid = $2::regclass
      LIMIT 1
    `,
    [constraintName, resolvedTableName]
  );

  if (rows.length === 0) {
    await pool.query(`ALTER TABLE ${resolvedTableName} ADD CONSTRAINT ${constraintName} ${constraintSql}`);
  }
};

const ensureTenantSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organization (
      tenant_id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      code VARCHAR(80) UNIQUE NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS site (
      site_id SERIAL PRIMARY KEY,
      tenant_id INT NOT NULL REFERENCES organization(tenant_id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
      code VARCHAR(80) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, code)
    )
  `);

  await pool.query(`
    INSERT INTO organization (name, code)
    VALUES ('Default Organization', 'default-org')
    ON CONFLICT (code) DO NOTHING
  `);

  await pool.query(`
    ALTER TABLE "user"
    ADD COLUMN IF NOT EXISTS primary_tenant_id INT,
    ADD COLUMN IF NOT EXISTS primary_site_id INT
  `);

  await pool.query(`
    ALTER TABLE donor
    ADD COLUMN IF NOT EXISTS tenant_id INT,
    ADD COLUMN IF NOT EXISTS site_id INT
  `);

  await pool.query(`
    ALTER TABLE recipient
    ADD COLUMN IF NOT EXISTS tenant_id INT,
    ADD COLUMN IF NOT EXISTS site_id INT
  `);

  await pool.query(`
    ALTER TABLE blood_request
    ADD COLUMN IF NOT EXISTS tenant_id INT,
    ADD COLUMN IF NOT EXISTS site_id INT
  `);

  await pool.query(`
    ALTER TABLE blood_stock
    ADD COLUMN IF NOT EXISTS tenant_id INT,
    ADD COLUMN IF NOT EXISTS site_id INT
  `);

  await pool.query(`
    ALTER TABLE approval
    ADD COLUMN IF NOT EXISTS tenant_id INT
  `);

  await pool.query(`
    ALTER TABLE blood_issue
    ADD COLUMN IF NOT EXISTS tenant_id INT
  `);

  await pool.query(`
    ALTER TABLE donation_application
    ADD COLUMN IF NOT EXISTS tenant_id INT
  `);

  await pool.query(`
    WITH default_tenant AS (
      SELECT tenant_id FROM organization WHERE code = 'default-org'
    )
    UPDATE "user" u
    SET primary_tenant_id = dt.tenant_id
    FROM default_tenant dt
    WHERE u.primary_tenant_id IS NULL
  `);

  await pool.query(`
    UPDATE donor d
    SET tenant_id = u.primary_tenant_id
    FROM "user" u
    WHERE d.user_id = u.user_id
      AND d.tenant_id IS NULL
  `);

  await pool.query(`
    UPDATE recipient r
    SET tenant_id = u.primary_tenant_id
    FROM "user" u
    WHERE r.user_id = u.user_id
      AND r.tenant_id IS NULL
  `);

  await pool.query(`
    WITH default_tenant AS (
      SELECT tenant_id FROM organization WHERE code = 'default-org'
    )
    UPDATE blood_stock bs
    SET tenant_id = dt.tenant_id
    FROM default_tenant dt
    WHERE bs.tenant_id IS NULL
  `);

  await pool.query(`
    UPDATE blood_request br
    SET tenant_id = r.tenant_id,
        site_id = r.site_id
    FROM recipient r
    WHERE br.recipient_id = r.recipient_id
      AND br.tenant_id IS NULL
  `);

  await pool.query(`
    UPDATE approval a
    SET tenant_id = br.tenant_id
    FROM blood_request br
    WHERE a.blood_request_id = br.request_id
      AND a.tenant_id IS NULL
  `);

  await pool.query(`
    UPDATE blood_issue bi
    SET tenant_id = br.tenant_id
    FROM blood_request br
    WHERE bi.blood_request_id = br.request_id
      AND bi.tenant_id IS NULL
  `);

  await pool.query(`
    UPDATE donation_application da
    SET tenant_id = br.tenant_id
    FROM blood_request br
    WHERE da.request_id = br.request_id
      AND da.tenant_id IS NULL
  `);

  await pool.query(`
    ALTER TABLE "user"
    ALTER COLUMN primary_tenant_id SET NOT NULL
  `);

  await pool.query(`
    ALTER TABLE donor
    ALTER COLUMN tenant_id SET NOT NULL
  `);

  await pool.query(`
    ALTER TABLE recipient
    ALTER COLUMN tenant_id SET NOT NULL
  `);

  await pool.query(`
    ALTER TABLE blood_request
    ALTER COLUMN tenant_id SET NOT NULL
  `);

  await pool.query(`
    ALTER TABLE blood_stock
    ALTER COLUMN tenant_id SET NOT NULL
  `);

  await pool.query(`
    ALTER TABLE approval
    ALTER COLUMN tenant_id SET NOT NULL
  `);

  await pool.query(`
    ALTER TABLE blood_issue
    ALTER COLUMN tenant_id SET NOT NULL
  `);

  await pool.query(`
    ALTER TABLE donation_application
    ALTER COLUMN tenant_id SET NOT NULL
  `);

  await addConstraintIfMissing(
    'user',
    'fk_user_primary_tenant',
    'FOREIGN KEY (primary_tenant_id) REFERENCES organization(tenant_id) ON DELETE RESTRICT'
  );
  await addConstraintIfMissing(
    'user',
    'fk_user_primary_site',
    'FOREIGN KEY (primary_site_id) REFERENCES site(site_id) ON DELETE SET NULL'
  );
  await addConstraintIfMissing(
    'donor',
    'fk_donor_tenant',
    'FOREIGN KEY (tenant_id) REFERENCES organization(tenant_id) ON DELETE RESTRICT'
  );
  await addConstraintIfMissing(
    'donor',
    'fk_donor_site',
    'FOREIGN KEY (site_id) REFERENCES site(site_id) ON DELETE SET NULL'
  );
  await addConstraintIfMissing(
    'recipient',
    'fk_recipient_tenant',
    'FOREIGN KEY (tenant_id) REFERENCES organization(tenant_id) ON DELETE RESTRICT'
  );
  await addConstraintIfMissing(
    'recipient',
    'fk_recipient_site',
    'FOREIGN KEY (site_id) REFERENCES site(site_id) ON DELETE SET NULL'
  );
  await addConstraintIfMissing(
    'blood_request',
    'fk_blood_request_tenant',
    'FOREIGN KEY (tenant_id) REFERENCES organization(tenant_id) ON DELETE RESTRICT'
  );
  await addConstraintIfMissing(
    'blood_request',
    'fk_blood_request_site',
    'FOREIGN KEY (site_id) REFERENCES site(site_id) ON DELETE SET NULL'
  );
  await addConstraintIfMissing(
    'blood_stock',
    'fk_blood_stock_tenant',
    'FOREIGN KEY (tenant_id) REFERENCES organization(tenant_id) ON DELETE RESTRICT'
  );
  await addConstraintIfMissing(
    'blood_stock',
    'fk_blood_stock_site',
    'FOREIGN KEY (site_id) REFERENCES site(site_id) ON DELETE SET NULL'
  );
  await addConstraintIfMissing(
    'approval',
    'fk_approval_tenant',
    'FOREIGN KEY (tenant_id) REFERENCES organization(tenant_id) ON DELETE RESTRICT'
  );
  await addConstraintIfMissing(
    'blood_issue',
    'fk_blood_issue_tenant',
    'FOREIGN KEY (tenant_id) REFERENCES organization(tenant_id) ON DELETE RESTRICT'
  );
  await addConstraintIfMissing(
    'donation_application',
    'fk_donation_application_tenant',
    'FOREIGN KEY (tenant_id) REFERENCES organization(tenant_id) ON DELETE RESTRICT'
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_membership (
      membership_id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES "user"(user_id) ON DELETE CASCADE,
      tenant_id INT NOT NULL REFERENCES organization(tenant_id) ON DELETE CASCADE,
      site_id INT REFERENCES site(site_id) ON DELETE SET NULL,
      membership_role VARCHAR(50) NOT NULL CHECK (membership_role IN ('admin', 'donor', 'recipient')),
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_membership_user_tenant_site
    ON user_membership(user_id, tenant_id, site_id)
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_membership_primary
    ON user_membership(user_id)
    WHERE is_primary = TRUE
  `);

  await pool.query(`
    INSERT INTO user_membership (user_id, tenant_id, site_id, membership_role, is_primary)
    SELECT u.user_id, u.primary_tenant_id, u.primary_site_id, u.role, TRUE
    FROM "user" u
    WHERE NOT EXISTS (
      SELECT 1
      FROM user_membership um
      WHERE um.user_id = u.user_id
        AND um.tenant_id = u.primary_tenant_id
        AND um.site_id IS NOT DISTINCT FROM u.primary_site_id
        AND um.is_primary = TRUE
    )
  `);

  const tenantIndexes = [
    'CREATE INDEX IF NOT EXISTS idx_donor_tenant ON donor(tenant_id)',
    'CREATE INDEX IF NOT EXISTS idx_recipient_tenant ON recipient(tenant_id)',
    'CREATE INDEX IF NOT EXISTS idx_blood_request_tenant_status ON blood_request(tenant_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_blood_stock_tenant_group ON blood_stock(tenant_id, blood_group)',
    'CREATE INDEX IF NOT EXISTS idx_approval_tenant ON approval(tenant_id)',
    'CREATE INDEX IF NOT EXISTS idx_blood_issue_tenant ON blood_issue(tenant_id)',
    'CREATE INDEX IF NOT EXISTS idx_donation_application_tenant ON donation_application(tenant_id)'
  ];

  for (const statement of tenantIndexes) {
    await pool.query(statement);
  }
};

module.exports = { ensureTenantSchema };
