import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateLicensePin } from '../src/server/crypto.js';

test('generates a four-digit numeric PIN within the existing range', () => {
  for (let i = 0; i < 1_000; i++) {
    const pin = generateLicensePin();
    assert.match(pin, /^\d{4}$/);
    assert.ok(Number(pin) >= 1000 && Number(pin) <= 9999);
  }
});

test('does not rely on Math.random to generate license PINs', () => {
  const originalRandom = Math.random;
  Math.random = () => {
    throw new Error('Math.random must not be used for license PIN generation');
  };

  try {
    assert.match(generateLicensePin(), /^\d{4}$/);
  } finally {
    Math.random = originalRandom;
  }
});
