import { createContext, useContext, useRef, useState, ReactNode } from "react";

/**
 * Which control opened the booking modal.
 *
 * The modal is the only conversion path on the site and it has twelve doors. The funnel
 * could say how many people opened it and how many finished, but not which door any of
 * them came through, so questions like "is the bottom tab bar's Contact button feeding
 * the funnel or misdirecting people who wanted support?" had no answer in the data.
 *
 * A closed union rather than a free string for two reasons. Typos would silently split
 * one door's count in two, and — because the type has no overlap with a React event —
 * `onClick={openModal}` stops compiling, so a new call site cannot be added without
 * choosing a label. Naming is `<surface>-<place>`, and these strings are written into
 * the database: renaming one splits its history, so treat them as fixed.
 */
export type BookingSource =
  | "home-hero"
  | "home-cta"
  | "services-card"
  | "services-cta"
  | "fleet-product"
  | "fleet-platform"
  | "dashboard-header"
  | "dashboard-empty"
  | "dashboard-quick-action"
  | "nav-header"
  | "nav-menu"
  | "tabbar-contact";

interface DemoModalContextType {
  isOpen: boolean;
  openModal: (source: BookingSource) => void;
  closeModal: () => void;
  /** The control that opened the modal, for the `booking_open` event. */
  source: BookingSource | null;
  /**
   * Put focus back on whatever opened the modal. Returns false if there is nothing
   * to return to, so the caller can fall back to Radix's own behaviour.
   */
  restoreTriggerFocus: () => boolean;
}

const DemoModalContext = createContext<DemoModalContextType | undefined>(undefined);

export function DemoModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  /**
   * State rather than a ref, because the modal reads it from an effect keyed on `isOpen`
   * and a ref would not have re-rendered it into that effect's closure. Both setters run
   * in the same click handler, so React batches them into one commit and the effect sees
   * a matching pair. It is deliberately not cleared on close: nothing reads it while the
   * modal is shut, and clearing would mean a second state update on every close.
   */
  const [source, setSource] = useState<BookingSource | null>(null);

  /**
   * The element that opened the modal, so focus can go back to it on close.
   *
   * Radix restores focus to its own `Dialog.Trigger`, but this modal is opened from
   * several places through `openModal()` — the hero, the nav, the bottom tab bar —
   * and never through a Trigger, so Radix has no idea what to return focus to and
   * drops it on `<body>`. A keyboard or VoiceOver user closing the modal would land
   * back at the top of the document instead of on the button they just pressed.
   *
   * Captured here rather than in the modal because `openModal` runs synchronously
   * inside the click handler, which is the one moment `document.activeElement` is
   * reliably the trigger — by the time the modal has rendered, focus has already
   * moved inside it.
   */
  const trigger = useRef<HTMLElement | null>(null);

  return (
    <DemoModalContext.Provider
      value={{
        isOpen,
        source,
        openModal: (from: BookingSource) => {
          // `document.activeElement` first, before anything else in this handler — see
          // the `trigger` docblock above for why it is read here at all. Two call sites
          // close something else before calling this (the fleet lightbox, the nav menu),
          // which is safe only because React defers those commits: the DOM still holds
          // the button that was clicked at the moment this line runs.
          const active = document.activeElement;
          trigger.current = active instanceof HTMLElement ? active : null;
          setSource(from);
          setIsOpen(true);
        },
        closeModal: () => setIsOpen(false),
        restoreTriggerFocus: () => {
          const el = trigger.current;
          // isConnected guards the case where the trigger was unmounted while the
          // modal was open — a route change behind it, say. Focusing a detached node
          // silently does nothing and would leave focus stranded on <body>.
          if (!el || !el.isConnected) return false;
          el.focus();
          return true;
        },
      }}
    >
      {children}
    </DemoModalContext.Provider>
  );
}

export const useDemoModal = () => {
  const context = useContext(DemoModalContext);
  if (!context) {
    throw new Error("useDemoModal must be used within a DemoModalProvider");
  }
  return context;
};
