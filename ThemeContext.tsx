import type { PropsWithChildren } from "react";

export function ThemeProvider({ children }: PropsWithChildren<{ defaultTheme?: "light" | "dark" }>) {
  return <div data-theme="light">{children}</div>;
}
