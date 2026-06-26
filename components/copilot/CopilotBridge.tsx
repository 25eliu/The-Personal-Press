'use client';
import type { Dispatch, RefObject } from 'react';
import { CopilotSidebar, useChatContext } from '@copilotkit/react-ui';
import { useEditionCopilot } from '@/lib/edition/useEditionCopilot';
import { HOUSE_STYLE } from '@/lib/edition/instructions';
import type { EditionAction, EditionState } from '@/lib/edition/state';

/**
 * The open/close control. Replaces CopilotKit's round launcher (which floats in the
 * bottom-right corner and overlaps the panel) with an industry-standard right-rail
 * handle: a vertical ink tab pinned to the viewport's right edge. Its chevron points
 * left to pull the desk open; once open the tab rides to the panel's outer edge and
 * the chevron flips right to push it closed. It slides on the same easing as the
 * panel, so handle and card move as one piece.
 */
function DeskHandle() {
  const { open, setOpen } = useChatContext();
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      className={`copydesk-handle ${open ? 'is-open' : ''}`}
      aria-label={open ? 'Close the Copy Desk' : 'Open the Copy Desk'}
      aria-expanded={open}
    >
      <span className="copydesk-handle-chevron" aria-hidden>
        {open ? '‹' : '›'}
      </span>
      <span className="copydesk-handle-label" aria-hidden>
        Copy Desk
      </span>
    </button>
  );
}

/**
 * Bridges the newspaper's reducer state to CopilotKit. Rendered INSIDE <CopilotKit>
 * so the copilot hooks always have their provider — calling them outside it throws
 * (and breaks SSR/prerender). The sidebar only shows once the paper is finished.
 */
export function CopilotBridge({
  edition,
  dispatch,
  abortRef,
  showSidebar,
  onOpenChange,
}: {
  edition: EditionState;
  dispatch: Dispatch<EditionAction>;
  abortRef: RefObject<AbortController | null>;
  showSidebar: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  useEditionCopilot(edition, dispatch, abortRef);
  // The sidebar mounts only once the paper has finished printing (showSidebar =
  // phase 'reading'), so defaultOpen makes it slide in exactly when the edition is
  // ready — no separate timer needed. The mount itself IS the "done loading" signal.
  if (!showSidebar) return null;
  return (
    <CopilotSidebar
      instructions={HOUSE_STYLE}
      defaultOpen
      clickOutsideToClose={false}
      Button={DeskHandle}
      onSetOpen={onOpenChange}
      labels={{
        title: 'The Copy Desk',
        initial:
          'Edition’s off the press. I’m your copy desk — say the word and I’ll rewrite a story, ' +
          'reorder the pages, add a section, refresh a chart, or look something up live with Tako (both Tako data and the web).',
      }}
    />
  );
}
