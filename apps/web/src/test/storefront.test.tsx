import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ apiPage: vi.fn() }));

vi.mock("../services/api.ts", () => ({
  api: vi.fn(),
  apiPage: mocks.apiPage
}));

import { HomePage } from "../features/pages.tsx";

const lot = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Dom Casmurro",
  authors: ["Machado de Assis"],
  coverUrl: null,
  status: "LIVE",
  auditState: "READY",
  currentBidCents: "12000",
  startingBidCents: "10000",
  effectiveEndsAt: "2026-10-29T20:00:00.000Z",
  serverNow: "2026-10-29T19:00:00.000Z",
  bidCount: 2,
  minimumIncrementCents: "2000",
  nextMinimumCents: "14000",
  description: "Exemplar",
  condition: "GOOD",
  publicationYear: 1899,
  version: 2
};

beforeEach(() => {
  mocks.apiPage.mockReset();
  mocks.apiPage.mockResolvedValue({
    data: [lot],
    meta: { page: 1, limit: 12, total: 1, totalPages: 1 }
  });
});

describe("auction storefront", () => {
  it("renders keyboard-accessible cards and resets pagination when filtering", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><HomePage /></MemoryRouter>);

    const card = await screen.findByRole("link", { name: /Dom Casmurro/i });
    expect(card).toHaveAttribute("href", `/lots/${lot.id}`);
    await user.tab();
    expect(document.activeElement).not.toBe(document.body);

    await user.click(screen.getByRole("button", { name: "Ao vivo" }));
    await waitFor(() => expect(mocks.apiPage).toHaveBeenLastCalledWith(
      "/lots?page=1&limit=12&status=LIVE"
    ));
    expect(screen.getByText("1 lotes")).toBeInTheDocument();
  });
});
