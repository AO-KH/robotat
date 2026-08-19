import { analyticsEvents, type AnalyticsSummary } from "@shared/schema";
import { db } from "../../lib/db";
import { eq, count, countDistinct, desc, inArray } from "drizzle-orm";

export async function recordEvent(input: {
  type: string;
  path?: string;
  source?: string;
  visitorId?: string;
  userId?: number | null;
}): Promise<void> {
  await db.insert(analyticsEvents).values({
    type: input.type,
    path: input.path ?? null,
    source: input.source ?? null,
    visitorId: input.visitorId ?? null,
    userId: input.userId ?? null,
  });
}

const FUNNEL_TYPES = ["booking_open", "booking_whatsapp", "booking_email", "booking_submitted"] as const;

export async function getSummary(): Promise<AnalyticsSummary> {
  const [totals] = await db
    .select({ total: count(), visitors: countDistinct(analyticsEvents.visitorId) })
    .from(analyticsEvents)
    .where(eq(analyticsEvents.type, "page_view"));

  const topPaths = await db
    .select({ path: analyticsEvents.path, views: count() })
    .from(analyticsEvents)
    .where(eq(analyticsEvents.type, "page_view"))
    .groupBy(analyticsEvents.path)
    .orderBy(desc(count()))
    .limit(8);

  const funnelRows = await db
    .select({ type: analyticsEvents.type, n: count() })
    .from(analyticsEvents)
    .where(inArray(analyticsEvents.type, [...FUNNEL_TYPES]))
    .groupBy(analyticsEvents.type);

  const at = (t: string) => Number(funnelRows.find((r) => r.type === t)?.n ?? 0);

  // Which door people came through. Not limited, because the whole set is twelve rows and
  // the one worth looking at may well be the smallest. Deliberately no WHERE on source:
  // events recorded before migration 0015 have none, and silently excluding them would
  // make this panel disagree with the "opened" figure in the funnel next to it.
  const sourceRows = await db
    .select({ source: analyticsEvents.source, opens: count() })
    .from(analyticsEvents)
    .where(eq(analyticsEvents.type, "booking_open"))
    .groupBy(analyticsEvents.source)
    .orderBy(desc(count()));

  return {
    totalPageViews: Number(totals?.total ?? 0),
    uniqueVisitors: Number(totals?.visitors ?? 0),
    topPaths: topPaths.map((p) => ({ path: p.path ?? "(unknown)", views: Number(p.views) })),
    funnel: {
      opened: at("booking_open"),
      whatsapp: at("booking_whatsapp"),
      email: at("booking_email"),
      submitted: at("booking_submitted"),
    },
    bookingSources: sourceRows.map((r) => ({
      source: r.source ?? "(unknown)",
      opens: Number(r.opens),
    })),
  };
}
