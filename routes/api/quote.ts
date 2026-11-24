import { defineHandler } from 'void';
import { d1Repo } from '../../src/server/d1-repo';
import { errorResponse, internalError, json, readJson } from '../../src/server/http';
import { buildQuote } from '../../src/server/quote';

export const POST = defineHandler(async (c) => {
  const body = await readJson(c.req.raw);
  if (!body.ok) return body.response;
  try {
    const outcome = await buildQuote(d1Repo, body.value, new Date());
    if (outcome.kind === 'ok') return json({ quote: outcome.quote });
    return errorResponse(422, {
      code: 'INVALID_BOOKING',
      message: 'Some booking details need fixing before we can continue.',
      fields: outcome.errors,
    });
  } catch (err) {
    return internalError(err);
  }
});
