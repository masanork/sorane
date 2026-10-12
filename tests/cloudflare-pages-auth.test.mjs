import assert from 'node:assert/strict';
import test from 'node:test';
import {diagnosePagesAuth} from '../scripts/cloudflare-pages-auth.mjs';

const target = '4b749427a0c80c547e726a42aff4b6fc';
const other = '0'.repeat(32);
const token = 'private-test-credential-must-not-appear';
const response = (status, payload) => new Response(JSON.stringify(payload), {status});
const active = () => response(200, {success: true, result: {status: 'active', id: token}});
const denied = () => response(403, {success: false, errors: [{code: 10000, message: token}]});
const project = () => response(200, {success: true, result: {name: 'sorane', privateData: token}});

test('active token with denied Pages access is not reported as expired or malformed', async () => {
  const calls = [];
  const report = await diagnosePagesAuth({token, accountId: target, expectedAccountId: target,
    fetchImpl: async (url, options) => {
      calls.push(url);
      assert.equal(options.headers.Authorization, 'Bearer ' + token);
      assert.equal(options.redirect, 'error');
      return url.endsWith('/user/tokens/verify') ? active() : denied();
    }});
  assert.equal(report.finding, 'active_token_pages_access_denied');
  assert.equal(report.verification.user.state, 'active');
  assert.deepEqual(report.pages.configuredAccount.errorCodes, [10000]);
  assert.equal(calls.length, 2);
  assert.ok(!JSON.stringify(report).includes(token));
});

test('same credential identifies a wrong account ID without disclosing it', async () => {
  const report = await diagnosePagesAuth({token, accountId: other, expectedAccountId: target,
    fetchImpl: async url => url.endsWith('/user/tokens/verify') ? active()
      : url.includes('/accounts/' + target + '/') ? project() : denied()});
  assert.equal(report.finding, 'configured_account_mismatch');
  assert.equal(report.configuration.accountIdMatchesTarget, false);
  assert.equal(report.pages.configuredAccount.success, false);
  assert.equal(report.pages.expectedAccount.projectMatchesTarget, true);
  assert.ok(!JSON.stringify(report).includes(token));
  assert.ok(!JSON.stringify(report).includes(other));
});

test('account-owned token uses its verification endpoint and reads Pages', async () => {
  const report = await diagnosePagesAuth({token, accountId: target, expectedAccountId: target,
    fetchImpl: async url => url.endsWith('/user/tokens/verify') ? denied()
      : url.endsWith('/tokens/verify') ? active() : project()});
  assert.equal(report.verification.configuredAccount.state, 'active');
  assert.equal(report.finding, 'pages_read_access_confirmed');
  assert.equal(report.ok, true);
  assert.ok(!JSON.stringify(report).includes(token));
});

test('credential formatting problems and missing configuration make no requests', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw Error(token); };
  for (const credential of ['Bearer ' + token, token + '\n']) {
    const report = await diagnosePagesAuth({token: credential, accountId: target, expectedAccountId: target, fetchImpl});
    assert.equal(report.finding, 'invalid_token_format');
    assert.ok(!JSON.stringify(report).includes(token));
  }
  assert.equal((await diagnosePagesAuth({accountId: target, expectedAccountId: target, fetchImpl})).finding, 'configuration_missing');
  assert.equal((await diagnosePagesAuth({token, accountId: '../other', expectedAccountId: target, fetchImpl})).finding, 'invalid_account_id_format');
  assert.equal(calls, 0);
});

test('network failures, non-JSON bodies and API error messages never leak credentials', async () => {
  const report = await diagnosePagesAuth({token, accountId: target, expectedAccountId: target,
    fetchImpl: async url => {
      if (url.endsWith('/user/tokens/verify')) throw Error(token);
      return new Response('<html>' + token + '</html>', {status: 403});
    }});
  assert.equal(report.finding, 'token_verification_and_pages_access_failed');
  assert.equal(report.pages.configuredAccount.httpStatus, 403);
  assert.ok(!JSON.stringify(report).includes(token));
});

test('token validity window is checked separately from its active status', async () => {
  const report = await diagnosePagesAuth({token, accountId: target, expectedAccountId: target,
    fetchImpl: async url => url.endsWith('/user/tokens/verify')
      ? response(200, {success: true, result: {status: 'active', expires_on: '2000-01-01T00:00:00Z'}}) : denied()});
  assert.equal(report.finding, 'token_outside_validity_window');
  assert.equal(report.verification.user.expired, true);
});
