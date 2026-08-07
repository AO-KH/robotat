import { Router } from "express";
import { api } from "@shared/routes";
import { DAILY_ASSESSMENT_LIMIT, type User } from "@shared/schema";
import { handleZodError } from "../../lib/errors";
import { track } from "../../lib/background";
import { requireAuth } from "../auth/auth.service";
import { getUserById } from "../auth/auth.storage";
import { deliverAssessment, buildWhatsappLink, buildMailtoLink } from "../../lib/notify";
import {
  createAssessmentWithinLimit,
  listAssessmentsByUser,
  getAssessmentForUser,
} from "./assessments.storage";

/** The rolling window DAILY_ASSESSMENT_LIMIT is counted over. */
const WINDOW_HOURS = 24;

export const assessmentRoutes = Router();

assessmentRoutes.post(api.assessments.create.path, requireAuth, async (req, res, next) => {
  try {
    const input = api.assessments.create.input.parse(req.body);
    const sessionUser = req.user as User;

    /*
      A booking sends an agronomist to a farm, so it is the one action worth holding back
      until the address it will be confirmed to is known to work. Registering, signing in
      and browsing all stay open — the gate is here rather than on the session, because
      locking someone out of the whole app over an unread email loses the customer, while
      losing a wasted site visit is the point.

      Re-read rather than trusting `req.user`: the session copy was serialised at login
      and would still say unverified after the customer entered their code on a phone
      while the laptop session stayed open.
    */
    const user = (await getUserById(sessionUser.id)) ?? sessionUser;
    if (!user.emailVerifiedAt) {
      return res.status(403).json({
        message: "Confirm your email address before booking a site assessment.",
        field: "emailVerified",
      });
    }

    /*
      Bookings are capped per account per rolling 24 hours, and the cap is enforced in
      the same transaction as the insert — see createAssessmentWithinLimit. A null back
      means the account is already at its limit.

      Deliberately not express-rate-limit, which the auth routes use: that counts per
      IP, so one customer on a shared office connection or a carrier NAT would spend
      another's allowance, while the same person on a phone and a laptop would get two.
      What is being protected is an agronomist's diary, which belongs to an account, so
      the account is what gets counted.

      Language falls back through the client's current UI language, then the language
      the account was created in, then the column default. The middle step matters for
      a shipped iOS build that predates `locale` on this endpoint: it sends nothing, and
      without the fallback a customer who registered in Arabic would start receiving
      English the moment they booked.
    */
    const assessment = await createAssessmentWithinLimit(
      { userId: user.id, ...input, locale: input.locale ?? user.locale },
      { windowHours: WINDOW_HOURS, limit: DAILY_ASSESSMENT_LIMIT },
    );

    if (!assessment) {
      // English here, like every other server-side message. The client maps the 429 to
      // translated copy of its own (toast.booking.limitReached); this text is the
      // fallback for anything calling the API directly.
      return res.status(429).json({
        message: `You can book up to ${DAILY_ASSESSMENT_LIMIT} site assessments a day. Please try again tomorrow.`,
      });
    }

    /*
      Deliver to the business by email + WhatsApp (never blocks/fails the booking).

      Tracked, because this is the seconds of SMTP and HTTPS that happen after the 201
      has already gone out: a SIGTERM landing here would otherwise leave the customer
      looking at a success screen for a booking the business never heard about. See
      server/lib/background.ts. The `.catch` stays — swallowing the error is the
      deliberate part, and it is separate from knowing the work is still running.
    */
    track(deliverAssessment(assessment).catch(() => {}));

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
