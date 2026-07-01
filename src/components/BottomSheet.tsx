import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * BottomSheet — Airbnb / Apple Maps style modal sheet that slides up from the
 * bottom. Used across AddPlace for field-picker interactions ("Change" chip
 * opens a sheet with the option chips).
 *
 * Behaviour follows the iOS / Material mobile sheet standard:
 * - Backdrop-tap and Cancel / drag-down all dismiss without committing.
 * - Escape key dismisses (keyboard fallback).
 * - Body scroll is locked while open.
 * - Focus moves into the sheet on open and restores on close.
 * - Single-select variant has no `onDone`; caller closes on option pick.
 * - Multi-select variant sets `onDone` to render a Done affordance in the
 *   header — the caller keeps a draft state and commits inside `onDone`.
 */
interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  helpText?: string;
  /** When provided, renders a Done button in the header (multi-select mode). */
  onDone?: () => void;
  children: React.ReactNode;
}

export default function BottomSheet({ open, onClose, title, helpText, onDone, children }: BottomSheetProps) {
  // Two-phase mount so we can play both enter and exit CSS transitions.
  // `mounted` controls presence in the DOM; `visible` controls the transform
  // + opacity classes. Order: open=true → mounted=true → next frame visible=true.
  //          open=false → visible=false → after transition mounted=false.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      setMounted(true);
      // Wait a frame so the initial transform can transition to the resting state.
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    } else if (mounted) {
      setVisible(false);
      const t = window.setTimeout(() => {
        setMounted(false);
        setDragY(0);
        // Restore focus to the element that opened the sheet.
        previouslyFocused.current?.focus?.();
      }, 220);
      return () => window.clearTimeout(t);
    }
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return;
    // Lock body scroll while the sheet is up so the page doesn't peek-scroll.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    // Move focus into the sheet so screen readers announce its title next.
    // Delay a tick so the sheet element exists.
    const id = window.setTimeout(() => sheetRef.current?.focus(), 30);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(id);
    };
  }, [mounted, onClose]);

  const onTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    // Only follow downward drags — upward drags don't affect the sheet.
    if (dy > 0) setDragY(dy);
  };
  const onTouchEnd = () => {
    // Threshold: 90px drag = intent to dismiss. Anything less snaps back.
    if (dragY > 90) {
      onClose();
    } else {
      setDragY(0);
    }
    dragStartY.current = null;
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bottom-sheet-title"
    >
      {/* Backdrop — tap to dismiss, using a real <button> so it's keyboard-
          reachable and announces correctly to screen readers. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 bg-sand-900 transition-opacity duration-200 ${visible ? 'opacity-40' : 'opacity-0'}`}
      />

      <div
        ref={sheetRef}
        tabIndex={-1}
        className={`absolute left-0 right-0 bottom-0 bg-sand-50 rounded-t-[24px] px-5 pt-2 outline-none transition-transform duration-200 ease-out ${visible ? '' : 'translate-y-full'}`}
        style={{
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          boxShadow: '0 -8px 24px rgba(45,27,14,0.15)',
          transform: visible ? `translateY(${dragY}px)` : undefined,
          transition: dragStartY.current !== null ? 'none' : undefined,
          maxHeight: 'calc(100dvh - env(safe-area-inset-top) - 40px)',
          overflowY: 'auto',
        }}
      >
        {/* Drag handle — narrow touch target on the handle only, not the whole
            sheet, so users can still scroll long option lists inside. */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="py-2 flex justify-center cursor-grab active:cursor-grabbing"
          aria-hidden="true"
        >
          <div className="w-10 h-1 bg-sand-300 rounded-full" />
        </div>

        <div className="flex items-center justify-between mb-2 min-h-[44px]">
          <h3 id="bottom-sheet-title" className="text-base font-semibold text-sand-900">
            {title}
          </h3>
          {onDone ? (
            <button
              onClick={onDone}
              className="min-h-[44px] px-3 text-sm font-semibold text-sand-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50 rounded-full"
            >
              Done
            </button>
          ) : (
            <button
              onClick={onClose}
              aria-label="Cancel"
              className="min-h-[44px] w-11 flex items-center justify-center text-sand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50 rounded-full"
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>

        {helpText && <p className="text-xs text-sand-700 mb-4">{helpText}</p>}

        <div className="pb-2">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
