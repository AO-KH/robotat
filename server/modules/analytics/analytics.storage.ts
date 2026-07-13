import { analyticsEvents, type AnalyticsSummary } from "@shared/schema";
import { db } from "../../lib/db";
import { eq, count, countDistinct, desc, inArray } from "drizzle-orm";

export async function recordEvent(input: {
  type: string;
  path?: string;
  visitorId?: string;
  userId?: number | null;
}): Promise<void> {
  await db.insert(analyticsEvents).values({
    type: input.type,
    path: input.path ?? null,
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
  };
}
