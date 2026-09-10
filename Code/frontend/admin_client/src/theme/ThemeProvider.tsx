"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * App-wide theme provider (next-themes). Toggles the `.dark` class on <html>
 * and injects a pre-hydration script so the correct theme is applied before
 * first paint (no flash of wrong theme).
 *
 * The default is DARK rather than the OS preference: the identity is pitch
 * black and gold, so that is the face a first-time visitor should meet. Light
 * mode is still a first-class, fully toned theme — `system` and `light` remain
 * selectable from the theme control and are remembered per visitor.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
