import { Router } from "express";
import { api } from "@shared/routes";
import { handleZodError } from "../../lib/errors";
import { requireStaff } from "../auth/auth.service";
import { listAllAssessments, getAssessmentById, updateAssessment } from "./admin.storage";

export const adminRoutes = Router();

// GET /api/admin/assessments?status=pending — staff-only, lists all bookings.
adminRoutes.get(api.admin.listAssessments.path, requireStaff, async (req, res, next) => {
  try {
    const { status } = api.admin.listAssessments.query.parse(req.query);
    const list = await listAllAssessments(status);
    res.status(200).json(list);
  } catch (err) {
    if (handleZodError(err, res)) return;
    next(err);
  }
});

// PATCH /api/admin/assessments/:id — staff-only, change status (+ optional scheduled date).
adminRoutes.patch(api.admin.updateAssessment.path, requireStaff, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid assessment id" });
    }
    const input = api.admin.updateAssessment.input.parse(req.body);

    const existing = await getAssessmentById(id);
    if (!existing) return res.status(404).json({ message: "Assessment not found" });

    const scheduledAt =
      input.scheduledAt === undefined ? undefined : input.scheduledAt === null ? null : new Date(input.scheduledAt);

    const updated = await updateAssessment(id, { status: input.status, scheduledAt });
    res.status(200).json(updated);
  } catch (err) {
    if (handleZodError(err, res)) return;
    next(err);
  }
});
