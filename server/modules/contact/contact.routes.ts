import { Router } from "express";
import { api } from "@shared/routes";
import type { User } from "@shared/schema";
import { handleZodError } from "../../lib/errors";
import { buildWhatsappLink, buildMailtoLink, buildSupportLinks } from "../../lib/notify";

export const contactRoutes = Router();

// Help channels for the /support page. Registered before the bare /api/contact
// handler only for readability — Express matches these paths exactly, so the order
// of the two does not actually decide anything.
contactRoutes.get(api.contact.support.path, (req, res) => {
  const u = (req.user as User) || undefined;
  res.status(200).json(buildSupportLinks({ name: u?.name, email: u?.email }));
});

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
