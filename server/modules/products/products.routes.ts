import { Router } from "express";
import { api } from "@shared/routes";
import { listProducts } from "./products.storage";

export const productRoutes = Router();

// GET /api/products — public fleet catalogue.
productRoutes.get(api.products.list.path, async (_req, res, next) => {
  try {
    res.status(200).json(await listProducts());
  } catch (err) {
    next(err);
  }
});
