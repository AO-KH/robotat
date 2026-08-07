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

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/auth/me")) {
        return new Response(JSON.stringify({ message: "Not signed in" }), { status: 401 });
      }
      return new Response(
        JSON.stringify({ whatsappUrl: "https://wa.me/1?text=x", mailtoUrl: "mailto:x" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
});

describe("BookDemoModal", () => {
  it("asks for the farm details on the WhatsApp branch too", async () => {
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
