import { expect, it } from 'vite-plus/test';
import { CATALOG } from '../src/domain/catalog';

it('catalog prices are integer cents', () => {
  for (const item of Object.values(CATALOG)) expect(Number.isInteger(item.priceCents)).toBe(true);
});
