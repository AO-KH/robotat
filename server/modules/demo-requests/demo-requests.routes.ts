import { Router } from "express";
import { api } from "@shared/routes";
import { handleZodError } from "../../lib/errors";
import { createDemoRequest } from "./demo-requests.storage";

export const demoRequestRoutes = Router();

// Legacy public lead-capture endpoint.
demoRequestRoutes.post(api.demoRequests.create.path, async (req, res, next) => {
  try {
    const input = api.demoRequests.create.input.parse(req.body);
    const request = await createDemoRequest(input);
    res.status(201).json(request);
  } catch (err) {
    if (handleZodError(err, res)) return;
    next(err);
  }
});
