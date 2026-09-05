import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@/i18n";
import { DemoModalProvider, useDemoModal } from "@/features/booking/DemoModalContext";
import { BookDemoModal } from "@/features/booking/BookDemoModal";

function Opener() {
  const { openModal } = useDemoModal();
  return (
    <button onClick={openModal} data-testid="open">
      open
    </button>
  );
}

function renderModal() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <DemoModalProvider>
          <Opener />
          <BookDemoModal />
        </DemoModalProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

/** Stub the API: `/api/auth/me` answers as a guest or a signed-in customer. */
function stubAuth(signedIn: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/auth/me")) {
        return signedIn
          ? new Response(
              JSON.stringify({ id: 1, name: "Test User", email: "t@example.com", role: "customer" }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            )
          : new Response(JSON.stringify({ message: "Not signed in" }), { status: 401 });
      }
      return new Response(
        JSON.stringify({ whatsappUrl: "https://wa.me/1?text=x", mailtoUrl: "mailto:x" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
}

/**
 * Stub `/api/auth/me` with an arbitrary response, for the states stubAuth cannot express.
 *
 * `useCurrentUser` returns `undefined` while the request is in flight AND after it fails,
 * and `null` only for an explicit 401. The gate used to branch on `!user`, which folded
 * all three together and told signed-in customers to sign in. These let each state be
 * asserted separately.
 */
function stubMe(respond: () => Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/auth/me")) return respond();
      return new Response(
        JSON.stringify({ whatsappUrl: "https://wa.me/1?text=x", mailtoUrl: "mailto:x" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
}

const GATE = /sign in or create an account/i;

beforeEach(() => {
  stubAuth(false);
});

describe("BookDemoModal", () => {
  it("asks for the farm details on the WhatsApp branch too", async () => {
    stubAuth(true);
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByTestId("open"));
    await user.click(await screen.findByRole("button", { name: /WhatsApp/i }));

    await waitFor(() => {
      expect(document.querySelector('[name="name"]')).not.toBeNull();
    });
    for (const field of ["name", "phone", "email", "landSize", "location", "message"]) {
      expect(document.querySelector(`[name="${field}"]`)).not.toBeNull();
    }
  });

  it("gates a signed-out visitor behind sign-in instead of the channel cards", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByTestId("open"));

    // The gate, with its way in — and no channel to book through without an account.
    expect(await screen.findByRole("link", { name: /sign in or create an account/i })).toHaveAttribute(
      "href",
      "/auth",
    );
    expect(screen.queryByRole("button", { name: /WhatsApp/i })).toBeNull();
  });

  it("does not gate a customer who is signed in, not even for a moment", async () => {
    /*
      The regression this file exists to catch, and it is a transient one: `!user` was true
      while /api/auth/me was still in flight, so a signed-in customer saw the gate flash
      before their session landed.

      Waiting for the cards and then checking the gate is gone does NOT catch it — by the
      time the cards render the session has resolved and the gate has already left. The
      response is held open deliberately so the in-flight window is a fact of the test
      rather than a race, the gate is asserted absent inside it, and only then is the
      session allowed to land.
    */
    let release!: (r: Response) => void;
    stubMe(() => new Promise<Response>((resolve) => (release = resolve)));

    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByTestId("open"));

    // In flight: a signed-in customer must not be told to sign in.
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: GATE })).toBeNull();

    release(
      new Response(JSON.stringify({ id: 1, name: "Test User", email: "t@example.com", role: "customer" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(await screen.findByRole("button", { name: /WhatsApp/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: GATE })).toBeNull();
  });

  it("shows neither the gate nor the cards while the session is still loading", async () => {
    // A request that never settles: the modal must wait rather than guess. Guessing
    // "signed out" is what locked signed-in customers out of booking.
    stubMe(() => new Promise<Response>(() => {}));
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByTestId("open"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    expect(screen.queryByRole("link", { name: GATE })).toBeNull();
    expect(screen.queryByRole("button", { name: /WhatsApp/i })).toBeNull();
  });

  it("falls through to the form when the session lookup fails, rather than gating forever", async () => {
    // An error leaves `data` undefined for good, so branching on `!user` gated the user
    // permanently. requireAuth on the server is the real gate: being wrong here is safe,
    // and blocking someone who is actually signed in is not.
    stubMe(async () => new Response(JSON.stringify({ message: "boom" }), { status: 500 }));
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByTestId("open"));

    expect(await screen.findByRole("button", { name: /WhatsApp/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: GATE })).toBeNull();
  });

  it("is a real dialog that Escape closes", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByTestId("open"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
