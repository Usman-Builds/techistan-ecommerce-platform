import { Transform } from 'class-transformer';

/**
 * Email addresses are case-insensitive in practice (#21): trim and lowercase
 * before validation so "Ada@Example.com " and "ada@example.com" are one account.
 */
export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
