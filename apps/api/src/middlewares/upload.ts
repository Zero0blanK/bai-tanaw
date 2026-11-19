import type { RequestHandler } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { AppError, BadRequestError } from '../utils/errors.js';

/**
 * Single in-memory file upload in field "file", capped at MAX_IMPORT_SIZE_MB. Other multipart fields land in req.body.
 * With required: false the request may be JSON or multipart without a file.
 */
export function singleFile(field = 'file', options: { required?: boolean } = {}): RequestHandler {
  const required = options.required ?? true;
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.MAX_IMPORT_SIZE_MB * 1024 * 1024, files: 1, fields: 5 },
  }).single(field);

  return (req, res, next) => {
    upload(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          next(new AppError(`File is larger than ${env.MAX_IMPORT_SIZE_MB} MB`, 413));
          return;
        }
        next(new BadRequestError(`Upload error: ${error.message}`));
        return;
      }
      if (error) {
        next(error);
        return;
      }
      if (required && !req.file) {
        next(new BadRequestError(`Attach the file as multipart field "${field}"`));
        return;
      }
      next();
    });
  };
}
