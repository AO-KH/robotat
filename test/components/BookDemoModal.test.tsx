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
