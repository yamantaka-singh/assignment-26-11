import { describe, expect, it } from 'vite-plus/test';
import { CATALOG, ITEM_IDS } from '../src/domain/catalog';
import { PROMO_SEED } from '../src/domain/promo';

const files = import.meta.glob<string>('../db/migrations/*_seed_stock_and_promos.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const seedFile = Object.keys(files)[0];
const sqlText = seedFile ? (files[seedFile] ?? '') : '';
const compact = sqlText.replace(/\s+/g, ' ');
const sqlValue = (v: string | number | null): string => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v}'`);

describe('seed migration', () => {
  it('exists', () => {
    expect(seedFile).toBeDefined();
  });

  it.each(ITEM_IDS)('seeds inventory for %s with the catalog stock', (id) => {
    expect(compact).toContain(`('${id}', ${CATALOG[id].initialStock})`);
  });

  it.each(PROMO_SEED)('seeds promo $code with the same terms as PROMO_SEED', (p) => {
    const row = [p.code, p.kind, p.value, p.expiresAt, p.maxUses, p.uses].map(sqlValue).join(', ');
    expect(compact).toContain(`(${row})`);
  });
});
