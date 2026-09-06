/** Catalog domain limits (script 07), shared by DTOs and the service. */

/** Maximum option dimensions per product (e.g. Size, Color, Material). */
export const MAX_AXES = 3;

/** Maximum total variant combinations (Cartesian product) per product. */
export const MAX_VARIANTS = 100;

/** Maximum images per product (FR-203; mirrors the MediaUploader cap). */
export const MAX_IMAGES = 10;

/** Maximum category tree depth (root = level 1). */
export const MAX_CATEGORY_DEPTH = 3;
