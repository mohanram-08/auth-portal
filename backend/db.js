const { Pool } = require('pg');
const config = require('./config');

const isLocalDb =
  config.databaseUrl.includes('localhost') ||
  config.databaseUrl.includes('127.0.0.1');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx
    ON users (LOWER(username));
  `);
}

async function findUserByUsername(username) {
  const result = await pool.query(
    'SELECT id, username, password_hash, created_at FROM users WHERE LOWER(username) = LOWER($1)',
    [username]
  );
  return result.rows[0] || null;
}

async function findUserById(id) {
  const result = await pool.query(
    'SELECT id, username, created_at FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

async function createUser(username, passwordHash) {
  const result = await pool.query(
    'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
    [username, passwordHash]
  );
  return result.rows[0];
}

// Allow running `npm run init-db` directly from the CLI
if (require.main === module) {
  initDb()
    .then(() => {
      console.log('PostgreSQL database tables initialized successfully.');
      return pool.end();
    })
    .catch((err) => {
      console.error('Failed to initialize PostgreSQL database:', err.message);
      process.exit(1);
    });
}

module.exports = {
  pool,
  initDb,
  findUserByUsername,
  findUserById,
  createUser,
};