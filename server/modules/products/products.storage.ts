import { products, type Product } from "@shared/schema";
import { db } from "../../lib/db";
import { asc } from "drizzle-orm";

export async function listProducts(): Promise<Product[]> {
  return db.select().from(products).orderBy(asc(products.sortOrder));
}
