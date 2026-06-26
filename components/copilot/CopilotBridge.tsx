'use client';
import type { Dispatch, RefObject } from 'react';
import { CopilotSidebar } from '@copilotkit/react-ui';
import { useEditionCopilot } from '@/lib/edition/useEditionCopilot';
import { HOUSE_STYLE } from '@/lib/edition/instructions';
import type { EditionAction, EditionState } from '@/lib/edition/state';

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
}: {
  edition: EditionState;
  dispatch: Dispatch<EditionAction>;
  abortRef: RefObject<AbortController | null>;
  showSidebar: boolean;
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
      labels={{
        title: 'The Copy Desk',
        initial:
          'Edition’s off the press. I’m your copy desk — say the word and I’ll rewrite a story, ' +
          'reorder the pages, add a section, refresh a chart, or look something up live with Tako (both Tako data and the web).',
      }}
    />
  );
}
