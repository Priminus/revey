if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = require('crypto').randomBytes(32).toString('base64');
}
