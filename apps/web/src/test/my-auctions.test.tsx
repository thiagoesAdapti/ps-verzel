import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ apiPage: vi.fn() }));

vi.mock("../services/api.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/api.ts")>();
  return { ...original, apiPage: mocks.apiPage };
});

import { MyAuctionsPage, participationBadgeStatus } from "../features/pages.tsx";

beforeEach(() => mocks.apiPage.mockReset());

describe("meus arremates", () => {
  it("prioriza os estados de resultado e lideranca", () => {
    expect(participationBadgeStatus({ won: true, isLeading: false, status: "ENDED" })).toBe("WON");
    expect(participationBadgeStatus({ won: false, isLeading: true, status: "LIVE" })).toBe("LEADING");
    expect(participationBadgeStatus({ won: false, isLeading: false, status: "LIVE" })).toBe("OUTBID");
    expect(participationBadgeStatus({ won: false, isLeading: false, status: "ENDED" })).toBe("ENDED");
  });

  it("renderiza metricas e escolhe a acao contextual", async () => {
    mocks.apiPage.mockResolvedValue({
      data: [
        {
          lotId: "11111111-1111-4111-8111-111111111111",
          title: "Lote vencido",
          coverUrl: null,
          status: "ENDED",
          highestBidCents: "12000",
          isLeading: true,
          won: true,
          finalAmountCents: "12000",
          receiptToken: "token-publico"
        },
        {
          lotId: "22222222-2222-4222-8222-222222222222",
          title: "Lote em disputa",
          coverUrl: null,
          status: "LIVE",
          highestBidCents: "10000",
          isLeading: false,
          won: false,
          finalAmountCents: null,
          receiptToken: null
        }
      ],
      summary: { total: 2, leading: 0, won: 1 },
      meta: { page: 1, limit: 12, total: 2, totalPages: 1 }
    });
    render(<MemoryRouter><MyAuctionsPage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Meus arremates" })).toBeInTheDocument();
    expect(screen.getByText("Participacoes").parentElement).toHaveTextContent("2");
    expect(screen.getByText("Arrematados").parentElement).toHaveTextContent("1");
    expect(screen.getByRole("link", { name: /Comprovante/ })).toHaveAttribute(
      "href",
      "/receipts/token-publico"
    );
    expect(screen.getByRole("link", { name: /Ver lote/ })).toHaveAttribute(
      "href",
      "/lots/22222222-2222-4222-8222-222222222222"
    );
  });

  it("mostra o estado vazio", async () => {
    mocks.apiPage.mockResolvedValue({
      data: [],
      summary: { total: 0, leading: 0, won: 0 },
      meta: { page: 1, limit: 12, total: 0, totalPages: 0 }
    });
    render(<MemoryRouter><MyAuctionsPage /></MemoryRouter>);
    expect(await screen.findByText("Nenhuma participacao")).toBeInTheDocument();
  });
});
