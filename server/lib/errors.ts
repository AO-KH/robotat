import type { Response } from "express";
import { z } from "zod";

/** If `err` is a Zod validation error, send a 400 and return true; otherwise return false. */
export function handleZodError(err: unknown, res: Response): boolean {
  if (err instanceof z.ZodError) {
    res.status(400).json({
      message: err.errors[0].message,
      field: err.errors[0].path.join("."),
    });
    return true;
  }
  return false;
}
