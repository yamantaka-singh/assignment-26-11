import { defineHandler } from 'void';
import { toConfirmation } from '../../../src/server/confirmation';
import { d1Repo } from '../../../src/server/d1-repo';
import { errorResponse, internalError, json } from '../../../src/server/http';

export const GET = defineHandler(async (c) => {
  try {
    const id = c.req.param('id');
    const booking = id === undefined ? undefined : await d1Repo.getBooking(id);
    if (!booking) return errorResponse(404, { code: 'NOT_FOUND', message: 'We could not find that booking.' });
    return json(toConfirmation(booking));
  } catch (err) {
    return internalError(err);
  }
});
