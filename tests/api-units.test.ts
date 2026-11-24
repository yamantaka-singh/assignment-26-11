import { describe, expect, it } from 'vite-plus/test';
import { canonicalJson, hashRequest } from '../src/server/hash';
import { errorResponse, readJson } from '../src/server/http';
import { simulatePayment } from '../src/server/payment';
import { newReference } from '../src/server/reference';
import { stockMessage } from '../src/server/stock';

describe('simulatePayment', () => {
  it('approves the test card, with or without spaces and dashes', () => {
    expect(simulatePayment('4242424242424242').status).toBe('approved');
    expect(simulatePayment('4242 4242 4242 4242').status).toBe('approved');
    expect(simulatePayment('4242-4242-4242-4242').status).toBe('approved');
  });
  it('declines the decline card with the agreed message', () => {
    expect(simulatePayment('4000 0000 0000 0002')).toEqual({
      status: 'declined',
      message: 'Your card was declined. No money was taken and nothing was booked.',
    });
  });
  it.each(['', 'abc', '4242', '4242 4242 4242 4243'])('marks %j invalid', (card) => {
    expect(simulatePayment(card).status).toBe('invalid');
  });
  it('never repeats the card number in its messages', () => {
    const out = simulatePayment('1111 2222 3333 4444');
    expect(JSON.stringify(out)).not.toContain('1111');
  });
});

describe('hashing', () => {
  it('canonicalises key order and hashes equal values equally', async () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
    expect(await hashRequest({ a: 1, b: 2 })).toBe(await hashRequest({ b: 2, a: 1 }));
    expect(await hashRequest({ a: 1 })).not.toBe(await hashRequest({ a: 2 }));
    expect(await hashRequest({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('newReference', () => {
  it('uses the SU26- prefix and an unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) expect(newReference()).toMatch(/^SU26-[A-HJKMNP-Z2-9]{6}$/);
  });
  it('rarely repeats', () => {
    expect(new Set(Array.from({ length: 500 }, newReference)).size).toBe(500);
  });
});

describe('stockMessage', () => {
  it('says sold out at zero and counts plurals correctly', () => {
    expect(stockMessage('garba', 0)).toBe('Garba Workshop is sold out.');
    expect(stockMessage('garba', 2)).toBe('Only 2 Garba Workshop places are left.');
    expect(stockMessage('garba', 1)).toBe('Only 1 Garba Workshop place is left.');
  });
});

describe('http helpers', () => {
  it('wraps errors in the one envelope', async () => {
    const res = errorResponse(409, { code: 'X', message: 'm' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: 'X', message: 'm' } });
  });
  it('reports bad JSON as 400 INVALID_JSON', async () => {
    const out = await readJson(new Request('http://x/', { method: 'POST', body: '{nope' }));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.response.status).toBe(400);
      expect(await out.response.json()).toMatchObject({ error: { code: 'INVALID_JSON' } });
    }
  });
  it('rejects oversized bodies with 413', async () => {
    const out = await readJson(new Request('http://x/', { method: 'POST', body: JSON.stringify({ pad: 'x'.repeat(200_000) }) }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.response.status).toBe(413);
  });
  it('measures the size cap in bytes, not characters', async () => {
    // 60,000 characters but 120,000 bytes in UTF-8.
    const tooBig = await readJson(new Request('http://x/', { method: 'POST', body: JSON.stringify({ pad: 'é'.repeat(60_000) }) }));
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) expect(tooBig.response.status).toBe(413);
    // 49,000 characters is 98,000 bytes: under the cap, so it parses.
    const fits = await readJson(new Request('http://x/', { method: 'POST', body: JSON.stringify({ pad: 'é'.repeat(49_000) }) }));
    expect(fits.ok).toBe(true);
  });
});
