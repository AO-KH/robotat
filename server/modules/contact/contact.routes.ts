import { Router } from "express";
import { api } from "@shared/routes";
import type { User } from "@shared/schema";
import { handleZodError } from "../../lib/errors";
import { buildWhatsappLink, buildMailtoLink } from "../../lib/notify";

export const contactRoutes = Router();

// Contact links, personalized when signed in (no record saved).
contactRoutes.get(api.contact.get.path, (req, res) => {
  const u = (req.user as User) || undefined;
  const lead = { name: u?.name, email: u?.email };
  res.status(200).json({
    whatsappUrl: buildWhatsappLink(lead),
    mailtoUrl: buildMailtoLink(lead),
  });
});

// Build contact links from a submitted form (no account required, no record saved).
contactRoutes.post(api.contact.submit.path, (req, res, next) => {
  try {
    const input = api.contact.submit.input.parse(req.body);
    res.status(200).json({
      whatsappUrl: buildWhatsappLink(input),
      mailtoUrl: buildMailtoLink(input),
    });
  } catch (err) {
    if (handleZodError(err, res)) return;
    next(err);
  }
});
