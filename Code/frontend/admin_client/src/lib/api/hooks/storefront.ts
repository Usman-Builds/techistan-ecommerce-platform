"use client";

/** TanStack Query hooks for storefront content — homepage and navigation. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createHeroSlide,
  createHomepageSection,
  createNavItem,
  deleteHeroSlide,
  deleteHomepageSection,
  deleteNavItem,
  getAdminHomepage,
  listNavItems,
  reorderHeroSlides,
  reorderHomepageSections,
  reorderNavItems,
  seedHomepage,
  seedNavigation,
  updateHeroSlide,
  updateHomepageSection,
  updateNavItem,
  type HeroSlideInput,
  type HomeSectionType,
  type HomepageSectionInput,
  type NavItemInput,
  type NavLocation,
  type NavReorderItem,
  type ReorderItem,
} from "../storefront";

export const HOMEPAGE_KEY = ["admin", "homepage"] as const;
export const NAVIGATION_KEY = ["admin", "navigation"] as const;

// ── Homepage ─────────────────────────────────────────────────────────────────

export function useAdminHomepage() {
  return useQuery({ queryKey: HOMEPAGE_KEY, queryFn: getAdminHomepage });
}

/**
 * Every homepage mutation invalidates the whole homepage query rather than
 * patching the cache: sections and slides are ordered lists whose indices shift
 * on almost every write, and a refetch of one small payload is cheaper than
 * getting that reconciliation subtly wrong.
 */
function useHomepageMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: HOMEPAGE_KEY }),
  });
}

export function useSeedHomepage() {
  return useHomepageMutation((replace: boolean) => seedHomepage(replace));
}

export function useCreateHomepageSection() {
  return useHomepageMutation(
    (input: HomepageSectionInput & { type: HomeSectionType }) =>
      createHomepageSection(input),
  );
}

export function useUpdateHomepageSection() {
  return useHomepageMutation((vars: { id: string; input: HomepageSectionInput }) =>
    updateHomepageSection(vars.id, vars.input),
  );
}

export function useDeleteHomepageSection() {
  return useHomepageMutation((id: string) => deleteHomepageSection(id));
}

export function useReorderHomepageSections() {
  return useHomepageMutation((items: ReorderItem[]) =>
    reorderHomepageSections(items),
  );
}

export function useCreateHeroSlide() {
  return useHomepageMutation((input: HeroSlideInput & { title: string }) =>
    createHeroSlide(input),
  );
}

export function useUpdateHeroSlide() {
  return useHomepageMutation((vars: { id: string; input: HeroSlideInput }) =>
    updateHeroSlide(vars.id, vars.input),
  );
}

export function useDeleteHeroSlide() {
  return useHomepageMutation((id: string) => deleteHeroSlide(id));
}

export function useReorderHeroSlides() {
  return useHomepageMutation((items: ReorderItem[]) => reorderHeroSlides(items));
}

// ── Navigation ───────────────────────────────────────────────────────────────

export function useNavItems(location?: NavLocation) {
  return useQuery({
    queryKey: [...NAVIGATION_KEY, location ?? "all"],
    queryFn: () => listNavItems(location),
  });
}

function useNavMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: NAVIGATION_KEY }),
  });
}

export function useSeedNavigation() {
  return useNavMutation((vars: { location?: NavLocation; replace: boolean }) =>
    seedNavigation(vars.location, vars.replace),
  );
}

export function useCreateNavItem() {
  return useNavMutation(
    (input: NavItemInput & { location: NavLocation; label: string }) =>
      createNavItem(input),
  );
}

export function useUpdateNavItem() {
  return useNavMutation((vars: { id: string; input: NavItemInput }) =>
    updateNavItem(vars.id, vars.input),
  );
}

export function useDeleteNavItem() {
  return useNavMutation((id: string) => deleteNavItem(id));
}

export function useReorderNavItems() {
  return useNavMutation((items: NavReorderItem[]) => reorderNavItems(items));
}
