import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ api: vi.fn(), writeText: vi.fn() }));

vi.mock("../services/api.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/api.ts")>();
  return { ...original, api: mocks.api };
});

import { ToastProvider } from "../app/toast-provider.tsx";
import { ReceiptPage } from "../features/pages.tsx";

const receipt = {
  token: "Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE",
  lotId: "11111111-1111-4111-8111-111111111111",
  title: "Livro arrematado",
  authors: ["Autora Publica"],
  coverUrl: null,
  finalAmountCents: "12000",
  winner: "Licitante 02",
  settledAt: "2026-11-02T18:00:00.000Z",
  result: "SOLD"
};

function renderReceipt() {
  return render(
    <MemoryRouter initialEntries={[`/receipts/${receipt.token}`]}>
      <ToastProvider>
        <Routes><Route path="/receipts/:token" element={<ReceiptPage />} /></Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mocks.api.mockReset();
  mocks.writeText.mockReset();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: mocks.writeText }
  });
});

describe("comprovante publico", () => {
  it("renderiza somente os dados publicos do arremate", async () => {
    mocks.api.mockResolvedValue(receipt);
    renderReceipt();
    expect(await screen.findByRole("heading", { name: "Lote arrematado" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Livro arrematado" })).toBeInTheDocument();
    expect(screen.getByText("Licitante 02")).toBeInTheDocument();
    expect(document.querySelector(".receipt-total .money")).toHaveTextContent("120,00");
    expect(document.body.textContent).not.toMatch(/@|winnerId|userId/i);
  });

  it("copia o link e confirma a operacao", async () => {
    mocks.api.mockResolvedValue(receipt);
    mocks.writeText.mockResolvedValue(undefined);
    renderReceipt();
    await userEvent.click(await screen.findByRole("button", { name: /Copiar link/ }));
    expect(mocks.writeText).toHaveBeenCalledWith(location.href);
    expect(await screen.findByText("O link do comprovante esta na area de transferencia."))
      .toBeInTheDocument();
  });

  it("apresenta erro para token rejeitado pela API", async () => {
    mocks.api.mockRejectedValue(new Error("Comprovante nao encontrado."));
    renderReceipt();
    expect(await screen.findByText("Comprovante nao encontrado.")).toBeInTheDocument();
  });
});
