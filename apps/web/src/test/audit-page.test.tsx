import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock("../services/api.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/api.ts")>();
  return { ...original, api: mocks.api };
});

import { AuditPage, auditCheckResults } from "../features/pages.tsx";

const lotId = "11111111-1111-4111-8111-111111111111";

function renderAudit() {
  return render(
    <MemoryRouter initialEntries={[`/lots/${lotId}/audit`]}>
      <Routes><Route path="/lots/:id/audit" element={<AuditPage />} /></Routes>
    </MemoryRouter>
  );
}

function mockAudit(status: "INTEGRO" | "ADULTERADO" | "INCONCLUSIVO") {
  mocks.api.mockImplementation(async (path?: string) => path?.endsWith("/audit")
    ? {
        lotId,
        status,
        bidCount: 1,
        verifiedAt: "2026-11-02T18:00:00.000Z",
        message: status === "ADULTERADO"
          ? "Foram identificadas divergências no histórico de lances."
          : "Não foi possível verificar completamente este histórico.",
        bids: [{
          sequence: 1,
          participant: "Licitante 01",
          amountCents: "10000",
          acceptedAt: "2026-11-02T17:00:00.000Z"
        }]
      }
    : { title: "Livro auditado", authors: ["Autora"] });
}

beforeEach(() => mocks.api.mockReset());

describe("auditoria publica", () => {
  it("mapeia os três estados sem tratar inconclusivo como íntegro", () => {
    expect(auditCheckResults("INTEGRO")).toMatchObject({ tone: "success", integrity: "Validada" });
    expect(auditCheckResults("ADULTERADO")).toMatchObject({ tone: "error", integrity: "Com divergência" });
    expect(auditCheckResults("INCONCLUSIVO")).toMatchObject({ tone: "warning", integrity: "Não concluída" });
  });

  it("apresenta histórico íntegro, pseudônimos e detalhes técnicos", async () => {
    mockAudit("INTEGRO");
    renderAudit();
    expect(await screen.findByText("Histórico íntegro")).toBeInTheDocument();
    expect(screen.getByText("Licitante 01")).toBeInTheDocument();
    expect(screen.getByText("001")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Ver detalhes técnicos"));
    expect(screen.getByText("Integridade dos registros")).toBeInTheDocument();
    expect(screen.getByText("Válidas")).toHaveClass("audit-check-result-success");
  });

  it("preserva a mensagem critica para adulterado e inconclusivo", async () => {
    mockAudit("ADULTERADO");
    const rendered = renderAudit();
    expect(await screen.findByText("Foi identificada uma divergência no histórico"))
      .toBeInTheDocument();
    expect(screen.getByText("Foram identificadas divergências no histórico de lances."))
      .toBeInTheDocument();
    rendered.unmount();

    mockAudit("INCONCLUSIVO");
    renderAudit();
    expect(await screen.findByText("Não foi possível concluir a verificação"))
      .toBeInTheDocument();
    expect(screen.getByText("Não foi possível verificar completamente este histórico."))
      .toBeInTheDocument();
  });
});
