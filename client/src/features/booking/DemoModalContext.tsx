import { createContext, useContext, useRef, useState, ReactNode } from "react";

interface DemoModalContextType {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
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
        openModal: () => {
          const active = document.activeElement;
          trigger.current = active instanceof HTMLElement ? active : null;
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
