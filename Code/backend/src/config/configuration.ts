export default () => ({
  app: {
    name: process.env.APP_NAME || 'Techistan',
    environment: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
  },

  clientOrigins:
    process.env.CLIENT_ORIGINS ||
    'http://localhost:3001,http://localhost:3002',

  // Storefront base URL (verification and password-reset links).
  userAppUrl: process.env.USER_APP_URL || 'http://localhost:3001',

  // Admin app base URL (script 05).
  adminAppUrl: process.env.ADMIN_APP_URL || 'http://localhost:3002',

  database: {
    url: process.env.DATABASE_URL,
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'default_secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default_refresh_secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '2592000',
  },

  // Cloudinary (script 06). cloudName is public (also exposed to clients as
  // NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME); apiKey is public; apiSecret is
  // server-side ONLY and must never be returned to any client.
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },

  // Search (script 08). The provider is chosen at wiring time by `driver`; `pg`
  // (Postgres FTS) is the zero-infra default. Swapping to a future Meilisearch/
  // Typesense provider is a one-line token-binding change (see SearchModule).
  search: {
    driver: process.env.SEARCH_DRIVER || 'pg',
  },

  // Cart (script 09). The guest cart is tracked by a SIGNED httpOnly cookie so a
  // tampered/forged sessionId is rejected by cookie-parser. Falls back to the JWT
  // secret when a dedicated CART_COOKIE_SECRET is not provided.
  cart: {
    cookieSecret:
      process.env.CART_COOKIE_SECRET ||
      process.env.JWT_SECRET ||
      'default_cart_secret',
  },

  // Stripe (script 10). The secret key is server-side ONLY — the client uses the
  // publishable key (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, set in the user_client).
  // The webhook secret verifies the raw-body signature on POST /payments/webhook.
  // Both are optional in dev so the backend boots before keys are wired; the
  // payment module fails loudly at call time when the secret is missing.
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },

  // Transactional email (script 16). RESEND_API_KEY drives the Resend transport;
  // when unset the EmailService no-ops (logs the intended send) so dev/test flows
  // never block on a provider. EMAIL_FROM is the verified sender identity.
  email: {
    resendApiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM || 'Techistan <noreply@techistan.dev>',
    // Optional admin alert emails (new order / low stock / new review). Gated OFF
    // by default so a dev inbox is not spammed; the in-app admin bell always fires.
    adminAlerts:
      (process.env.ADMIN_EMAIL_ALERTS || 'false').toLowerCase() === 'true',
    adminEmail: process.env.ADMIN_EMAIL,
  },

  // Scheduled jobs (script 16). CRON_SECRET authorizes the externally-invokable
  // POST /cron/* routes (bearer / x-cron-secret header) in addition to the
  // in-process @Cron schedule.
  cron: {
    secret: process.env.CRON_SECRET,
  },

  // SMS (script 16, FR-905 — Could). Inert unless SMS_ENABLED=true and Twilio
  // credentials are provided; the SmsService only logs otherwise.
  sms: {
    enabled: (process.env.SMS_ENABLED || 'false').toLowerCase() === 'true',
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    from: process.env.TWILIO_FROM,
  },
});
