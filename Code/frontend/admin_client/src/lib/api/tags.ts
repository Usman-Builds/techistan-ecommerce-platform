/** Typed tag API bindings (script 07). */
import { apiClient } from "./client";

export type AdminTag = {
  id: string;
  name: string;
  slug: string;
  _count: { productTags: number };
};

export function listTags(): Promise<AdminTag[]> {
  return apiClient.get<AdminTag[]>("/tags");
}

export function createTag(input: {
  name: string;
  slug?: string;
}): Promise<{ id: string; name: string; slug: string }> {
  return apiClient.post("/admin/tags", input);
}

export function attachTag(payload: {
  productId: string;
  tagId: string;
}): Promise<{ attached: boolean }> {
  return apiClient.post("/admin/tags/attach", payload);
}

export function detachTag(payload: {
  productId: string;
  tagId: string;
}): Promise<{ detached: boolean }> {
  return apiClient.post("/admin/tags/detach", payload);
}
