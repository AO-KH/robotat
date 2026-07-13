import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import type { Product } from "@shared/schema";

/** The fleet catalogue, served from the database. */
export function useProducts() {
  return useQuery<Product[]>({
    queryKey: ["/api/products"],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const res = await fetch(api.products.list.path);
      if (!res.ok) throw new Error("Failed to load products");
      return (await res.json()) as Product[];
    },
  });
}
