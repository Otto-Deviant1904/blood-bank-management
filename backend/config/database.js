const { Pool } = require('pg');
require('dotenv').config();
const { getDbContext } = require('../utils/dbContext');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const rawQuery = pool.query.bind(pool);
const rawConnect = pool.connect.bind(pool);

const applySessionContext = async (client, context) => {
  if (!context || !context.tenantId || !context.userId) {
    return;
  }

  await client.query(
    `SELECT
       set_config('app.current_tenant', $1, false),
       set_config('app.current_user_id', $2, false),
       set_config('app.current_role', $3, false)`,
    [String(context.tenantId), String(context.userId), String(context.role || '')]
  );
};

pool.query = (...args) => {
  const context = getDbContext();
  if (context?.client) {
    return context.client.query(...args);
  }

  return rawQuery(...args);
};

pool.connect = async (...args) => {
  const client = await rawConnect(...args);
  const context = getDbContext();
  await applySessionContext(client, context);
  return client;
};

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;
