# Auth Portal (Express + SQLite)

## Quick Start

1. Install dependencies:
   npm install

2. Create your environment file from the template:
   copy .env.example .env   (Windows)
   cp .env.example .env     (macOS/Linux)

3. Generate a strong SESSION_SECRET and paste it into .env:
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

4. Update REDIRECT_URL in .env to your destination website.

5. Initialize the SQLite database:
   npm run init-db

6. Start the server:
   npm start

Open http://localhost:3000 in your browser.
