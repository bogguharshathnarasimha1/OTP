const test = require('node:test');
const assert = require('node:assert/strict');

const { generateOTP, verifyOTP } = require('./server.js');

test('generateOTP returns 6 digits', () => {
  const otp = generateOTP();
  assert.equal(typeof otp, 'string');
  assert.equal(otp.length, 6);
  assert.match(otp, /^\d{6}$/);
});

test('verifyOTP accepts the correct code and rejects wrong code', () => {
  const correct = '123456';
  const wrong = '654321';
  assert.equal(verifyOTP(correct, correct), true);
  assert.equal(verifyOTP(correct, wrong), false);
});
