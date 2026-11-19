import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

export interface RequestSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Rejects invalid requests with 400 before they reach a controller. The parsed body replaces
 * req.body (trimmed, defaults applied). Express 5 makes req.query read-only, so controllers re-parse
 * query/params with the same schema to get typed values.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    if (schemas.params) schemas.params.parse(req.params);
    if (schemas.query) schemas.query.parse(req.query);
    if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
    next();
  };
}
