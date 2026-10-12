import {appendFileSync, readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const API = 'https://api.cloudflare.com/client/v4';
const ACCOUNT_ID = /^[0-9a-f]{32}$/;

// Only fixed labels, booleans, HTTP statuses and numeric error codes are returned.
// Credentials, token IDs, hashes, API payloads and exception messages stay private.
export async function diagnosePagesAuth({token, accountId, expectedAccountId, fetchImpl = fetch}) {
  const configuration = {
    tokenPresent: typeof token === 'string' && token.length > 0,
    tokenHasWhitespace: typeof token === 'string' && /\s/.test(token),
    tokenHasBearerPrefix: typeof token === 'string' && /^Bearer\s/i.test(token),
    accountIdPresent: typeof accountId === 'string' && accountId.length > 0,
    accountIdFormatValid: typeof accountId === 'string' && ACCOUNT_ID.test(accountId),
    accountIdMatchesTarget: accountId === expectedAccountId,
  };
  const report = {configuration, verification: {}, pages: {}, finding: 'configuration_missing', ok: false};
  if (!ACCOUNT_ID.test(expectedAccountId)) {
    report.finding = 'invalid_expected_account';
    return report;
  }
  if (!configuration.tokenPresent || !configuration.accountIdPresent) return report;
  if (configuration.tokenHasWhitespace || configuration.tokenHasBearerPrefix) {
    report.finding = 'invalid_token_format';
    return report;
  }
  if (!configuration.accountIdFormatValid) {
    report.finding = 'invalid_account_id_format';
    return report;
  }

  async function probe(path, kind) {
    try {
      const response = await fetchImpl(API + path, {
        headers: {Authorization: 'Bearer ' + token, Accept: 'application/json'},
        redirect: 'error', signal: AbortSignal.timeout(15000),
      });
      let payload;
      try { payload = await response.json(); } catch { /* Do not print non-JSON bodies either. */ }
      const result = {
        httpStatus: response.status,
        success: response.ok && payload?.success === true,
        errorCodes: Array.isArray(payload?.errors)
          ? payload.errors.map(error => error?.code).filter(Number.isSafeInteger).slice(0, 5) : [],
      };
      if (kind === 'token') {
        result.state = result.success && ['active', 'disabled', 'expired'].includes(payload?.result?.status)
          ? payload.result.status : 'unverified';
        const dateFlag = (value, compare) => typeof value === 'string' && Number.isFinite(Date.parse(value))
          ? compare(Date.parse(value), Date.now()) : null;
        result.expired = dateFlag(payload?.result?.expires_on, (date, now) => date <= now);
        result.notYetValid = dateFlag(payload?.result?.not_before, (date, now) => date > now);
      } else {
        result.projectMatchesTarget = result.success && payload?.result?.name === 'sorane';
      }
      return result;
    } catch {
      return {transportError: true, success: false};
    }
  }

  report.verification.user = await probe('/user/tokens/verify', 'token');
  if (report.verification.user.state !== 'active') {
    report.verification.configuredAccount = await probe('/accounts/' + accountId + '/tokens/verify', 'token');
    if (!configuration.accountIdMatchesTarget) {
      report.verification.expectedAccount = await probe('/accounts/' + expectedAccountId + '/tokens/verify', 'token');
    }
  }
  report.pages.configuredAccount = await probe('/accounts/' + accountId + '/pages/projects/sorane', 'pages');
  if (!configuration.accountIdMatchesTarget) {
    report.pages.expectedAccount = await probe('/accounts/' + expectedAccountId + '/pages/projects/sorane', 'pages');
    report.finding = 'configured_account_mismatch';
    return report;
  }
  const verifications = Object.values(report.verification);
  if (verifications.some(value => value.expired || value.notYetValid)) {
    report.finding = 'token_outside_validity_window';
  } else if (report.pages.configuredAccount.projectMatchesTarget) {
    report.finding = 'pages_read_access_confirmed';
    report.ok = true;
  } else if (report.pages.configuredAccount.transportError) {
    report.finding = 'pages_transport_error';
  } else if (verifications.some(value => value.state === 'active')) {
    report.finding = 'active_token_pages_access_denied';
  } else {
    report.finding = 'token_verification_and_pages_access_failed';
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = JSON.parse(readFileSync(new URL('../deployment/production/contact.jsonc', import.meta.url), 'utf8'));
    const report = await diagnosePagesAuth({
      token: process.env.CLOUDFLARE_API_TOKEN,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      expectedAccountId: config.account_id,
    });
    const output = JSON.stringify(report, null, 2);
    console.log(output);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        '### Cloudflare Pages authentication\n\nRead-only checks; no deployments or credential changes.\n\n```json\n' + output + '\n```\n');
    }
    process.exitCode = report.ok ? 0 : 1;
  } catch {
    console.error('Cloudflare authentication diagnostic could not complete. No credentials were logged.');
    process.exitCode = 1;
  }
}
