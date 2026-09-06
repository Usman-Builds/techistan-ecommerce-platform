/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import Joi, { ObjectSchema } from 'joi';

export const validationSchema: ObjectSchema<Record<string, unknown>> =
  Joi.object({
    NODE_ENV: Joi.string()
      .valid('development', 'production', 'test')
      .default('development'),

    APP_NAME: Joi.string().default('Nest App'),

    PORT: Joi.number().default(3000),

    // Comma-separated list of allowed client origins for CORS.
    CLIENT_ORIGINS: Joi.string().default(
      'http://localhost:3001,http://localhost:3002',
    ),

    DATABASE_URL: Joi.string().uri().required().messages({
      'string.empty': 'DATABASE_URL cannot be empty',
      'any.required': 'DATABASE_URL is required',
    }),

    JWT_SECRET: Joi.string().required().messages({
      'string.empty': 'JWT_SECRET cannot be empty',
      'any.required': 'JWT_SECRET is required',
    }),

    JWT_EXPIRES_IN: Joi.string().default('86400'),

    // Refresh-token config (rotation, script 04) — now required.
    JWT_REFRESH_SECRET: Joi.string().required().messages({
      'string.empty': 'JWT_REFRESH_SECRET cannot be empty',
      'any.required': 'JWT_REFRESH_SECRET is required',
    }),
    JWT_REFRESH_EXPIRES_IN: Joi.string().default('2592000'),

    // Storefront base URL — used for verification/reset links + OAuth redirect.
    USER_APP_URL: Joi.string().uri().required().messages({
      'any.required': 'USER_APP_URL is required',
    }),

    // Admin preseed + admin app URL (script 05). seedAdmin() reads
    // ADMIN_EMAIL/ADMIN_PASSWORD to upsert the SUPER_ADMIN account.
    ADMIN_EMAIL: Joi.string().email().required().messages({
      'any.required': 'ADMIN_EMAIL is required',
    }),
    ADMIN_PASSWORD: Joi.string().min(8).required().messages({
      'string.min': 'ADMIN_PASSWORD must be at least 8 characters',
      'any.required': 'ADMIN_PASSWORD is required',
    }),
    ADMIN_APP_URL: Joi.string().uri().required().messages({
      'any.required': 'ADMIN_APP_URL is required',
    }),

    // Cloudinary (script 06). Required in production; optional in dev/test so the
    // backend still boots before an account is wired up (the media module will
    // fail loudly at call time if the secret is missing). The API secret stays
    // server-side only — it is never sent to any client.
    CLOUDINARY_CLOUD_NAME: Joi.string().when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional().allow(''),
    }),
    CLOUDINARY_API_KEY: Joi.string().when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional().allow(''),
    }),
    CLOUDINARY_API_SECRET: Joi.string().when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional().allow(''),
    }),

    // Search driver (script 08). Only the Postgres FTS provider ships today; a
    // future external engine would add its value here (e.g. 'meilisearch').
    SEARCH_DRIVER: Joi.string().valid('pg').default('pg'),

    // Cart cookie signing secret (script 09). Optional — falls back to JWT_SECRET
    // when unset (see configuration.ts). Provide a distinct value in production.
    CART_COOKIE_SECRET: Joi.string().optional().allow(''),

    // Stripe (script 10). Required in production; optional in dev/test so the
    // backend boots before real keys are wired (checkout errors at call time
    // until set). The secret key never leaves the server.
    STRIPE_SECRET_KEY: Joi.string().when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional().allow(''),
    }),
    STRIPE_WEBHOOK_SECRET: Joi.string().when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional().allow(''),
    }),

    // Transactional email (script 16). Required in production; optional in dev/
    // test so the backend boots before a Resend account is wired (EmailService
    // logs instead of sending until the key is set). EMAIL_FROM always has a
    // sensible default.
    RESEND_API_KEY: Joi.string().when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional().allow(''),
    }),
    EMAIL_FROM: Joi.string().default('Techistan <noreply@techistan.dev>'),
    // Gate the optional admin alert emails; the in-app bell is unconditional.
    ADMIN_EMAIL_ALERTS: Joi.boolean().truthy('true').falsy('false').default(false),

    // Scheduled-job trigger secret (script 16). Required in production so the
    // guarded POST /cron/* routes cannot be invoked anonymously; optional in dev.
    CRON_SECRET: Joi.string().when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional().allow(''),
    }),

    // SMS (script 16, FR-905 — optional). Inert by default.
    SMS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
    TWILIO_ACCOUNT_SID: Joi.string().optional().allow(''),
    TWILIO_AUTH_TOKEN: Joi.string().optional().allow(''),
    TWILIO_FROM: Joi.string().optional().allow(''),
  });
