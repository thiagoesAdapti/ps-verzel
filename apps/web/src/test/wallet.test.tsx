import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  apiPage: vi.fn(),
  idempotencyKey: vi.fn(() => "11111111-1111-4111-8111-111111111111")
}));

vi.mock("../services/api.ts", () => ({
  api: mocks.api,
  apiPage: mocks.apiPage,
  idempotencyKey: mocks.idempotencyKey
}));

import { ToastProvider } from "../app/toast-provider.tsx";
import { WalletPage, walletTransactionPresentation } from "../features/pages.tsx";

beforeEach(() => {
  mocks.api.mockReset();
  mocks.apiPage.mockReset();
  mocks.idempotencyKey.mockClear();
  mocks.api.mockImplementation(async (path: string) => {
    if (path === "/wallet/deposits") return { totalCents: "11000" };
    return { totalCents: "10000", reservedCents: "0", availableCents: "10000" };
  });
  mocks.apiPage.mockResolvedValue({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } });
});

describe("wallet UI", () => {
  it("distinguishes credit and debit using bigint-safe amounts and links receipts", async () => {
    expect(walletTransactionPresentation("AUCTION_DEBIT", "-900719925474099312")).toMatchObject({
      direction: "debit",
      absoluteCents: "900719925474099312"
    });
    mocks.apiPage.mockResolvedValue({
      data: [
        { id: "debit", type: "AUCTION_DEBIT", amountCents: "-16000", balanceAfterCents: "90000", lotTitle: "Dom Casmurro", receiptToken: "receipt-public-token", createdAt: "2026-11-01T16:00:00.000Z" },
        { id: "deposit", type: "DEPOSIT", amountCents: "6666", balanceAfterCents: "106666", lotTitle: null, receiptToken: null, createdAt: "2026-11-01T15:04:00.000Z" }
      ],
      meta: { page: 1, limit: 10, total: 2, totalPages: 1 }
    });
    render(<MemoryRouter><ToastProvider><WalletPage /></ToastProvider></MemoryRouter>);

    expect(await screen.findByText("Dom Casmurro · Saldo debitado")).toBeInTheDocument();
    expect(screen.getByLabelText(/Débito de R\$.*160,00/)).toHaveTextContent(/−.*R\$.*160,00/);
    expect(screen.getByLabelText(/Crédito de R\$.*66,66/)).toHaveTextContent(/\+.*R\$.*66,66/);
    expect(screen.getByRole("link", { name: /Ver comprovante/ })).toHaveAttribute("href", "/receipts/receipt-public-token");
  });

  it("submits masked cents with one idempotency key and refreshes balances", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ToastProvider><WalletPage /></ToastProvider></MemoryRouter>);
    const input = await screen.findByLabelText("Valor do depósito");
    await user.click(input);
    await user.paste("10.00");
    expect(input).toHaveValue("10,00");
    await user.click(screen.getByRole("button", { name: "Simular depósito" }));

    expect(await screen.findByText("Seu saldo simulado foi atualizado.")).toBeInTheDocument();
    expect(input).toHaveValue("");
    const [, request] = mocks.api.mock.calls.find(([path]) => path === "/wallet/deposits")!;
    expect(JSON.parse(String(request.body))).toEqual({ amountCents: "1000" });
    expect(request.headers["Idempotency-Key"]).toBe("11111111-1111-4111-8111-111111111111");
    expect(mocks.idempotencyKey).toHaveBeenCalledOnce();
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/wallet"));
  });
});
