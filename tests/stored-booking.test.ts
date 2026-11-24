// The D1 row mapper: stored JSON is parsed, never cast, so a corrupt row fails loudly instead of flowing on with wrong types.
import { describe, expect, it } from 'vite-plus/test';
import { createBooking } from '../src/server/booking';
import { parseStoredBooking, type StoredBookingRow } from '../src/server/stored';
import { APPROVED, booking, NOW } from './helpers/fixtures';
import { memoryRepo } from './helpers/memory-repo';

async function savedRow(): Promise<StoredBookingRow> {
  const repo = memoryRepo();
  const out = await createBooking(repo, { idempotencyKey: 'stored-key-0001', body: { booking: booking(), payment: APPROVED } }, NOW);
  if (!out.ok) throw new Error('setup failed');
  const [record] = [...repo.bookings.values()];
  if (!record) throw new Error('setup failed');
  return {
    bookerJson: JSON.stringify(record.booker),
    attendeesJson: JSON.stringify(record.attendees),
    quoteJson: JSON.stringify(record.quote),
  };
}

describe('parseStoredBooking', () => {
  it('round-trips what commitBooking stores', async () => {
    const row = await savedRow();
    const parsed = parseStoredBooking(row);
    expect(parsed.booker.email).toBe('meera@example.com');
    expect(parsed.attendees).toHaveLength(1);
    expect(parsed.quote.totalCents).toBe(1500);
    expect(JSON.stringify(parsed.quote)).toBe(row.quoteJson);
  });

  it.each<[keyof StoredBookingRow, string]>([
    ['bookerJson', '{not json'],
    ['attendeesJson', 'null'],
    ['quoteJson', '{"lines":"nope"}'],
  ])('throws a named error for a corrupt %s', async (field, bad) => {
    const row = { ...(await savedRow()), [field]: bad };
    expect(() => parseStoredBooking(row)).toThrow(new RegExp(`stored ${field} is corrupt`));
  });

  it('rejects a booker whose age is the wrong type, not a silent cast', async () => {
    const row = { ...(await savedRow()), bookerJson: JSON.stringify({ name: 'A', email: 'a@example.com', phone: '2145550101', age: '38', attending: true }) };
    expect(() => parseStoredBooking(row)).toThrow(/bookerJson is corrupt/);
  });
});
