import { defineHandler } from 'void';
import { createBooking } from '../../../src/server/booking';
import { d1Repo } from '../../../src/server/d1-repo';
import { errorResponse, internalError, json, readJson } from '../../../src/server/http';

const KEY_PATTERN = /^[\x21-\x7E]{8,100}$/;

export const POST = defineHandler(async (c) => {
  const key = c.req.header('Idempotency-Key');
  if (key === undefined || !KEY_PATTERN.test(key)) {
    return errorResponse(400, {
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'Send an Idempotency-Key header of 8 to 100 characters (a UUID works well) so a retry cannot book twice.',
    });
  }
  const body = await readJson(c.req.raw);
  if (!body.ok) return body.response;
  try {
    const outcome = await createBooking(d1Repo, { idempotencyKey: key, body: body.value }, new Date());
    if (!outcome.ok) return errorResponse(outcome.status, outcome.error);
    return json(outcome.result, outcome.replay ? 200 : 201);
  } catch (err) {
    return internalError(err);
  }
});
