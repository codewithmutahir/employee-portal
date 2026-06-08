/**
 * Playwright global setup — runs ONCE before the browser opens.
 *
 * Only verifies that required env vars are present so tests fail fast
 * with a clear message instead of cryptic auth errors later.
 */
import { FullConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import * as path from 'path';

loadEnv({ path: path.resolve(__dirname, '../../.env.test') });

export default async function globalSetup(_config: FullConfig) {
  const required = [
    'TEST_ADMIN_EMAIL',
    'TEST_ADMIN_PASSWORD',
    'TEST_EMPLOYEE_EMAIL',
    'TEST_EMPLOYEE_PASSWORD',
  ];

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Missing env vars in .env.test: ${missing.join(', ')}\n` +
      'Copy .env.test.example → .env.test and fill in values.'
    );
  }

  console.log('\n✅ Env vars present — tests will UI-login once per role, then reuse the session.\n');
}
