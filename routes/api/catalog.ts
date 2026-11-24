import { defineHandler } from 'void';
import { catalogView } from '../../src/server/catalog';
import { d1Repo } from '../../src/server/d1-repo';
import { internalError, json } from '../../src/server/http';

export const GET = defineHandler(async () => {
  try {
    return json(await catalogView(d1Repo));
  } catch (err) {
    return internalError(err);
  }
});
