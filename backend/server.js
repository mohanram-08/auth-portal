const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');

const config = require('./config');
const {
  pool,
  initDb,
  findUserByUsername,
  findUserById,
  createUser,
} = require('./db');

const BCRYPT_ROUNDS = 12;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;
const SESSION_COOKIE_NAME = 'auth_sid';

// Used when a login username is not found so response times remain consistent
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('timing-protection-placeholder', BCRYPT_ROUNDS);

const app = express();

// Security headers (with CSP configured to allow Google Fonts and local assets)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);

if (config.isProduction) {
  // Trust Render's reverse proxy so secure HTTPS cookies work properly
  app.set('trust proxy', 1);
}

app.use(express.json({ limit: '10kb' }));

app.use(
  session({
    store: new pgSession({
      pool,
      tableName: 'user_sessions',
      createTableIfMissing: true,
    }),
    name: SESSION_COOKIE_NAME,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
    },
  })
);

// Rate limiter for auth endpoints to slow brute-force attempts
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

function validateRegistrationInput(rawUsername, rawPassword) {
  if (typeof rawUsername !== 'string' || typeof rawPassword !== 'string') {
    return { error: 'Username and password are required.' };
  }

  const username = rawUsername.trim();
  const password = rawPassword;

  if (!USERNAME_PATTERN.test(username)) {
    return {
      error:
        'Username must be 3–32 characters and use only letters, numbers, dots, underscores, or hyphens.',
    };
  }

  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters long.' };
  }

  // bcrypt silently truncates inputs longer than 72 bytes
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return { error: 'Password must be 72 characters or fewer.' };
  }

  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { error: 'Password must include at least one letter and one number.' };
  }

  return { username, password };
}

// Health check endpoint (handy for Render)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Check current session state
app.get('/api/auth/me', async (req, res, next) => {
  try {
    if (!req.session.userId) {
      return res.json({ authenticated: false });
    }

    const user = await findUserById(req.session.userId);
    if (!user) {
      return req.session.destroy(() => {
        res.clearCookie(SESSION_COOKIE_NAME);
        res.json({ authenticated: false });
      });
    }

    return res.json({
      authenticated: true,
      user: { id: user.id, username: user.username },
      redirectUrl: config.redirectUrl,
    });
  } catch (err) {
    return next(err);
  }
});

// Register a new account
app.post('/api/auth/register', authLimiter, async (req, res, next) => {
  try {
    const { username: rawUsername, password: rawPassword } = req.body || {};
    const validation = validateRegistrationInput(rawUsername, rawPassword);

    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }

    const { username, password } = validation;
    const existingUser = await findUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const createdUser = await createUser(username, passwordHash);

    return res.status(201).json({
      message: 'Account created. Sign in to continue.',
      user: createdUser,
    });
  } catch (err) {
    // PostgreSQL unique violation error code
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'That username is already taken.' });
    }
    return next(err);
  }
});

// Sign in and return the server-configured redirect destination
app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const { username: rawUsername, password } = req.body || {};

    if (
      typeof rawUsername !== 'string' ||
      typeof password !== 'string' ||
      !rawUsername.trim() ||
      !password
    ) {
      return res.status(400).json({ error: 'Enter both your username and password.' });
    }

    const username = rawUsername.trim();
    const user = await findUserByUsername(username);
    const hashToCompare = user ? user.password_hash : DUMMY_PASSWORD_HASH;
    const passwordMatches = await bcrypt.compare(password, hashToCompare);

    if (!user || !passwordMatches) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Regenerate session ID on login to prevent session fixation
    return req.session.regenerate((regenErr) => {
      if (regenErr) {
        return next(regenErr);
      }

      req.session.userId = user.id;
      req.session.username = user.username;

      return req.session.save((saveErr) => {
        if (saveErr) {
          return next(saveErr);
        }

        // Redirect URL always comes from trusted server config, never client input
        return res.json({
          message: 'Signed in successfully.',
          user: { id: user.id, username: user.username },
          redirectUrl: config.redirectUrl,
        });
      });
    });
  } catch (err) {
    return next(err);
  }
});

// Sign out and clear session cookie
app.post('/api/auth/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) {
      return next(err);
    }

    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      path: '/',
    });

    return res.json({ message: 'You have been signed out.' });
  });
});

// Return JSON 404 for unknown API routes
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

// Serve static frontend files
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// Global error handler — never leak stack traces or internal details to clients
app.use((err, _req, res, _next) => {
  console.error('[server error]', err);
  res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
});

async function startServer() {
  try {
    await initDb();
    app.listen(config.port, () => {
      console.log(`Auth portal running on port ${config.port}`);
      console.log(`Post-login REDIRECT_URL is set to: ${config.redirectUrl}`);
    });
  } catch (err) {
    console.error('[startup error] Could not connect to PostgreSQL:', err.message);
    process.exit(1);
  }
}

startServer();