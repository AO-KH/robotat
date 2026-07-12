import { Router } from "express";
import { api } from "@shared/routes";
import type { User } from "@shared/schema";
import { handleZodError } from "../../lib/errors";
import { requireAuth } from "../auth/auth.service";
import { deliverAssessment, buildWhatsappLink, buildMailtoLink } from "../../lib/notify";
import { createAssessment, listAssessmentsByUser, getAssessmentForUser } from "./assessments.storage";

export const assessmentRoutes = Router();

assessmentRoutes.post(api.assessments.create.path, requireAuth, async (req, res, next) => {
  try {
    const input = api.assessments.create.input.parse(req.body);
    const user = req.user as User;
    const assessment = await createAssessment({ userId: user.id, ...input });

    // Deliver to the business by email + WhatsApp (never blocks/fails the booking).
    deliverAssessment(assessment).catch(() => {});

    res.status(201).json({
      assessment,
      whatsappUrl: buildWhatsappLink(assessment),
      mailtoUrl: buildMailtoLink(assessment),
    });
  } catch (err) {
    if (handleZodError(err, res)) return;
    next(err);
  }
});

assessmentRoutes.get(api.assessments.list.path, requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User;
    const list = await listAssessmentsByUser(user.id);
    res.status(200).json(list);
  } catch (err) {
    next(err);
  }
});

// GET /api/assessments/:id — the signed-in user's own booking (404 if not theirs).
assessmentRoutes.get(api.assessments.get.path, requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ message: "Assessment not found" });
    const assessment = await getAssessmentForUser(id, user.id);
    if (!assessment) return res.status(404).json({ message: "Assessment not found" });
    res.status(200).json(assessment);
  } catch (err) {
    next(err);
  }
});
