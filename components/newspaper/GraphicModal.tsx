'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TGraphic, TTableData } from '@/lib/schema';
import { GraphicView } from './GraphicView';
import { DataTable } from './DataTable';
import { MODAL_CHART_H, MODAL_CHART_W, modalShowsGraphic } from '@/lib/newspaper/graphicModal';

/**
 * Wraps a printed graphic with a small "⊕ Full" trigger pinned to the top-right corner. The
 * trigger is ABSOLUTELY positioned, so it adds no layout height — the paginator measures the
 * same height it always did. Clicking it opens GraphicModal over the newspaper.
 */
export function ExpandableGraphic({
  graphic,
  table,
  caption,
  children,
}: {
  graphic: TGraphic;
  table: TTableData;
  caption: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      {children}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="See the full graphic and data"
        className="font-mono-news absolute right-1 top-1 z-10 border border-black/70 bg-[var(--paper,#f4efe4)] px-1 text-[9px] font-bold uppercase tracking-wide text-black/80 hover:bg-black hover:text-[var(--paper,#f4efe4)]"
      >
        ⊕ Full
      </button>
      {open && (
        <GraphicModal graphic={graphic} table={table} caption={caption} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

/**
 * The overlay: a dimmed backdrop that shadows the whole newspaper, with the graphic rendered on
 * top. Visual kinds (chart/scatter/composition) show a LARGE graphic above the complete table;
 * already-tabular kinds show the full uncapped table alone. Closes on Esc, backdrop click, or ✕.
 */
export function GraphicModal({
  graphic,
  table,
  caption,
  onClose,
}: {
  graphic: TGraphic;
  table: TTableData;
  caption: string;
  onClose: () => void;
}) {
  // Portals need the DOM; guard the first (server/SSR) render where document.body is absent.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Esc closes, matching backdrop-click and the ✕ button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!mounted) return null;

  const showGraphic = modalShowsGraphic(graphic.kind);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
    >
      {/* stopPropagation so clicks INSIDE the panel don't close it */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="paper relative max-h-[88vh] w-full max-w-[760px] overflow-auto p-5"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="font-mono-news absolute right-2 top-2 z-10 border border-black/70 px-1.5 text-xs font-bold leading-none hover:bg-black hover:text-[var(--paper,#f4efe4)]"
        >
          ✕
        </button>
        {showGraphic && (
          <div className="mb-4 flex justify-center">
            <GraphicView
              graphic={graphic}
              table={table}
              caption={caption}
              width={MODAL_CHART_W}
              height={MODAL_CHART_H}
            />
          </div>
        )}
        <DataTable table={table} maxRows={Infinity} />
      </div>
    </div>,
    document.body,
  );
}
