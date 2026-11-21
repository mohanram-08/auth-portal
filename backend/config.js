const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const DEFAULT_DEV_SECRET_PLACEHOLDER = 'replace-this-with-a-long-random-secret-key';

function parsePort(rawPort) {
  const parsed = Number.parseInt(rawPort || '3000', 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PORT value: "${rawPort}". Expected a number between 1 and 65535.`);
  }
  return parsed;
}

function validateRedirectUrl(rawUrl) {
  const candidate = (rawUrl || 'https://example.com/dashboard').trim();
  let parsed;

  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(
      `Invalid REDIRECT_URL "${candidate}". Provide a full http:// or https:// URL.`
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Unsafe REDIRECT_URL protocol "${parsed.protocol}". Only http: and https: are allowed.`
    );
  }

  return parsed.toString();
}

function validateDatabaseUrl(rawUrl) {
  const url = (rawUrl || '').trim();
  if (!url) {
    throw new Error(
      'DATABASE_URL is missing. Add your Supabase PostgreSQL connection string to .env (locally) or Render Environment Variables (online).'
    );
  }
  return url;
}

function resolveSessionSecret(rawSecret, isProduction) {
  const secret = (rawSecret || '').trim();
  const isWeakOrMissing = !secret || secret === DEFAULT_DEV_SECRET_PLACEHOLDER || secret.length < 16;

  if (isWeakOrMissing) {
    if (isProduction) {
      throw new Error(
        'SESSION_SECRET must be set to a strong random string (at least 16 characters) in production.'
      );
    }
    console.warn(
      '[config] Warning: Using a temporary random SESSION_SECRET for local development.'
    );
    return crypto.randomBytes(32).toString('hex');
  }

  return secret;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const config = Object.freeze({
  port: parsePort(process.env.PORT),
  nodeEnv,
  isProduction,
  sessionSecret: resolveSessionSecret(process.env.SESSION_SECRET, isProduction),
  redirectUrl: validateRedirectUrl(process.env.REDIRECT_URL),
  databaseUrl: validateDatabaseUrl(process.env.DATABASE_URL),
});

module.exports = config;