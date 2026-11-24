// Structural parsing of untrusted JSON: shape only. Business rules live in eligibility.ts.
// Every object is strict, so a client cannot smuggle in a price, a total or an age band.
import { z } from 'zod';
import { FESTIVAL_DAYS, GARBA_DAYS, MAX_AGE, MAX_ATTENDEES, MAX_DANDIYA, MIN_AGE } from './catalog';
import type { RuleError } from './types';

export const MAX_NAME_LENGTH = 80;
export const MAX_FAMILY_PASSES = 10;
export const MAX_PROMO_LENGTH = 32;

const MSG = {
  body: 'The booking needs to be a JSON object.',
  name: `Please enter a name between 1 and ${MAX_NAME_LENGTH} characters.`,
  age: `Age must be a whole number between ${MIN_AGE} and ${MAX_AGE}.`,
  email: 'Please enter a valid email address.',
  phone: 'Enter a valid phone number.',
  id: 'Ids can use letters, numbers, - and _ (1 to 40 characters).',
  day: 'Please pick a festival day between Nov 10 and Nov 14.',
  garbaDay: 'Garba workshops run on Nov 11 and Nov 13 only.',
  duplicateDay: 'Each day can only be listed once.',
  ticket: 'Please choose a ticket type for this person.',
  attending: 'Please say whether you are attending.',
  attendees: `Add between 1 and ${MAX_ATTENDEES} people.`,
  passes: `A booking can include up to ${MAX_FAMILY_PASSES} Family Passes.`,
  dandiya: `Dandiya sticks must be a whole number between 0 and ${MAX_DANDIYA}.`,
  promo: `Promo codes are at most ${MAX_PROMO_LENGTH} characters.`,
  unexpected: "We don't accept this field. Prices and totals are always worked out by the server.",
} as const;

const name = z.string({ error: MSG.name }).trim().min(1, MSG.name).max(MAX_NAME_LENGTH, MSG.name);
const age = z.number({ error: MSG.age }).int(MSG.age).min(MIN_AGE, MSG.age).max(MAX_AGE, MSG.age);
const id = z.string({ error: MSG.id }).regex(/^[A-Za-z0-9_-]{1,40}$/, MSG.id);
const email = z.string({ error: MSG.email }).trim().max(254, MSG.email).pipe(z.email({ error: MSG.email }));
const PHONE_CHARS = /^[0-9 +\-()]{7,20}$/;
const MIN_PHONE_DIGITS = 7;
// One check, so a bad phone yields one error: allowed characters only, and enough real digits.
const phone = z
  .string({ error: MSG.phone })
  .trim()
  .refine((v) => PHONE_CHARS.test(v) && (v.match(/\d/g) ?? []).length >= MIN_PHONE_DIGITS, MSG.phone);

const festivalDay = z.enum(FESTIVAL_DAYS, { error: MSG.day });
const garbaDay = z.enum(GARBA_DAYS, { error: MSG.garbaDay });

/** A list that may not repeat an entry. Items are strings, so Set equality is exact. */
const uniqueList = <T extends z.ZodType<string>>(item: T) =>
  z
    .array(item, { error: MSG.day })
    .refine((list) => new Set(list).size === list.length, { error: MSG.duplicateDay });

const ticket = z.discriminatedUnion(
  'kind',
  [
    z.strictObject({ kind: z.literal('day'), days: uniqueList(festivalDay) }),
    z.strictObject({ kind: z.literal('allDay') }),
    z.strictObject({ kind: z.literal('family'), passId: id }),
    z.strictObject({ kind: z.literal('none') }),
  ],
  { error: MSG.ticket },
);

export const attendeeSchema = z.strictObject({
  id,
  name,
  age,
  ticket,
  dinnerDays: uniqueList(festivalDay),
  garbaDays: uniqueList(garbaDay),
});

export const bookerSchema = z.strictObject({
  name,
  email,
  phone,
  age,
  attending: z.boolean({ error: MSG.attending }),
});

export const bookingRequestSchema = z.strictObject(
  {
    booker: bookerSchema,
    attendees: z.array(attendeeSchema, { error: MSG.attendees }).min(1, MSG.attendees).max(MAX_ATTENDEES, MSG.attendees),
    familyPasses: z
      .array(z.strictObject({ id, day: festivalDay }), { error: MSG.passes })
      .max(MAX_FAMILY_PASSES, MSG.passes),
    dandiyaQty: z.number({ error: MSG.dandiya }).int(MSG.dandiya).min(0, MSG.dandiya).max(MAX_DANDIYA, MSG.dandiya),
    promoCode: z.string({ error: MSG.promo }).max(MAX_PROMO_LENGTH, MSG.promo).optional(),
  },
  { error: (issue) => (issue.code === 'invalid_type' ? MSG.body : undefined) },
);

const MAX_ECHOED_KEY = 40;

/** Turn a ZodError into RuleErrors with dot paths ("attendees.2.age") the UI can attach to fields. */
export function zodErrorToRuleErrors(error: z.ZodError): RuleError[] {
  return error.issues.flatMap((issue): RuleError[] => {
    const parent = issue.path.map(String);
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        code: 'unexpected_field',
        path: [...parent, key.slice(0, MAX_ECHOED_KEY)].join('.'),
        message: MSG.unexpected,
      }));
    }
    return [{ code: issue.code, path: parent.join('.'), message: issue.message }];
  });
}
