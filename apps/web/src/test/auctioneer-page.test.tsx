import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../app/toast-provider.tsx";

const mocks = vi.hoisted(() => ({ api: vi.fn(), apiPage: vi.fn() }));

vi.mock("../services/api.ts", () => ({
  api: mocks.api,
  apiPage: mocks.apiPage
}));

import { AuctioneerPage, isLotCancellable } from "../features/pages.tsx";

const baseLot = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Lote cancelável",
  authors: ["Autoria"],
  coverUrl: null,
  status: "LIVE",
  auditState: "READY",
  currentBidCents: null,
  startingBidCents: "10000",
  effectiveEndsAt: "2026-11-01T18:00:00.000Z",
  serverNow: "2026-11-01T17:00:00.000Z",
  bidCount: 0,
  minimumIncrementCents: "2000",
  nextMinimumCents: "10000",
  description: "Exemplar",
  condition: "GOOD",
  publicationYear: 2026,
  version: 1
};

beforeEach(() => {
  mocks.api.mockReset();
  mocks.apiPage.mockReset();
  mocks.api.mockResolvedValue({});
  mocks.apiPage.mockResolvedValue({
    data: [baseLot, { ...baseLot, id: "22222222-2222-4222-8222-222222222222", title: "Lote com lance", bidCount: 1, currentBidCents: "12000" }],
    summary: { total: 2, live: 2, receivedCents: "0" },
    meta: { page: 1, limit: 12, total: 2, totalPages: 1 }
  });
});

describe("auctioneer dashboard", () => {
  it("uses snapshot rules and confirms cancellation before refreshing", async () => {
    expect(isLotCancellable(baseLot)).toBe(true);
    expect(isLotCancellable({ ...baseLot, bidCount: 1 })).toBe(false);

    const user = userEvent.setup();
    render(<MemoryRouter><ToastProvider><AuctioneerPage /></ToastProvider></MemoryRouter>);

    expect(await screen.findByText("Total de lotes")).toBeInTheDocument();
    expect(screen.getAllByText("2", { selector: ".metric strong" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Cancelar" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("dialog", { name: "Cancelar lote?" })).toHaveTextContent("Lote cancelável");
    await user.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));

    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith(
      `/lots/${baseLot.id}/cancel`,
      { method: "POST" }
    ));
    await waitFor(() => expect(mocks.apiPage).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("status")).toHaveTextContent("Lote cancelado");
  });
});
