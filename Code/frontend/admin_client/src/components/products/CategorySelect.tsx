"use client";

import { CategoryPicker } from "@/components/ui/CategoryPicker";

/**
 * The product editor's category field.
 *
 * Kept as a named component (rather than inlining {@link CategoryPicker} at the
 * call site) so the product form's import stays stable, but the implementation
 * is now the shared themed picker: a real tree with icons and product counts,
 * instead of a native `<select>` whose options simulated hierarchy with a run
 * of em-dashes.
 */
export function CategorySelect({
  value,
  onChange,
  id = "categoryId",
}: {
  value: string | null | undefined;
  onChange: (categoryId: string | null) => void;
  id?: string;
}) {
  return (
    <CategoryPicker
      id={id}
      label="Category"
      value={value}
      onChange={onChange}
      noneLabel="No category"
      placeholder="No category"
    />
  );
}
