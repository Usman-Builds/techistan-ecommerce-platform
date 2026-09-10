import type { ReactNode } from "react";

/**
 * Render a `ts_headline` snippet (script 08). The backend wraps matches in the
 * non-HTML markers `<<<HL>>>…<<</HL>>>` precisely so we can highlight safely:
 * because we split the string and emit React `<mark>` elements (never
 * `dangerouslySetInnerHTML`), any markup in admin-authored titles/descriptions
 * is rendered as inert text — no XSS surface.
 */
const HL_RE = /<<<HL>>>([\s\S]*?)<<<\/HL>>>/g;

export function renderHighlight(text: string | null | undefined): ReactNode {
  if (!text) return null;

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  HL_RE.lastIndex = 0;
  while ((match = HL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <mark
        key={key++}
        className="rounded bg-primary/20 px-0.5 text-foreground"
      >
        {match[1]}
      </mark>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}
