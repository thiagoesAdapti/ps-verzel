import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    connected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
      return socket;
    }),
    off: vi.fn((event: string) => {
      handlers.delete(event);
      return socket;
    })
  };
  return {
    api: vi.fn(),
    apiPage: vi.fn(),
    idempotencyKey: vi.fn(() => "11111111-1111-4111-8111-111111111111"),
    handlers,
    socket
  };
});

vi.mock("../services/socket.ts", () => ({ socket: mocks.socket }));
vi.mock("../app/auth-provider.tsx", () => ({
  useAuth: () => ({
    user: { id: "bidder", name: "Pessoa", email: "pessoa@example.com", role: "BIDDER" }
  })
}));
vi.mock("../services/api.ts", () => ({
  api: mocks.api,
  apiPage: mocks.apiPage,
  idempotencyKey: mocks.idempotencyKey,
  ApiError: class ApiError extends Error {
    constructor(public code: string, message: string, public status: number) {
      super(message);
    }
  }
}));

import { ToastProvider } from "../app/toast-provider.tsx";
import { countdownParts, remainingSeconds, RoomPage, serverClockOffset } from "../features/pages.tsx";
import { ApiError } from "../services/api.ts";

const lot = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Sala Teste",
  authors: ["Autora"],
  coverUrl: null,
  status: "LIVE",
  auditState: "READY",
  currentBidCents: null,
  startingBidCents: "10000",
  effectiveEndsAt: "2026-10-29T20:00:00.000Z",
  serverNow: "2026-10-29T19:00:00.000Z",
  bidCount: 0,
  minimumIncrementCents: "2000",
  nextMinimumCents: "10000",
  description: "Exemplar da sala",
  condition: "GOOD",
  publicationYear: 2026,
  isLeading: false,
  position: null,
  version: 0
};

function renderRoom() {
  return render(
    <MemoryRouter initialEntries={[`/lots/${lot.id}`]}>
      <ToastProvider>
        <Routes><Route path="/lots/:id" element={<RoomPage />} /></Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mocks.handlers.clear();
  mocks.api.mockReset();
  mocks.apiPage.mockReset();
  mocks.idempotencyKey.mockClear();
  mocks.socket.connect.mockClear();
  mocks.socket.disconnect.mockClear();
  mocks.socket.emit.mockClear();
  mocks.socket.on.mockClear();
  mocks.socket.off.mockClear();
  mocks.socket.connected = false;
  mocks.api.mockResolvedValue(lot);
  mocks.apiPage.mockResolvedValue({
    data: [],
    meta: { page: 1, limit: 20, total: 0, totalPages: 0 }
  });
});

describe("sala de leilao", () => {
  it("corrige o relogio local a partir do horario autoritativo do servidor", () => {
    const localAtSync = Date.parse("2026-10-29T18:59:30.000Z");
    const offset = serverClockOffset(lot.serverNow, localAtSync);
    expect(offset).toBe(30_000);
    expect(remainingSeconds(lot.effectiveEndsAt, localAtSync, offset)).toBe(3_600);
    expect(countdownParts(3_600)).toEqual([
      { value: 1, label: "HORAS" },
      { value: 0, label: "MIN" },
      { value: 0, label: "SEG" }
    ]);
  });

  it("sincroniza lote, historico e carteira por HTTP depois da reconexao", async () => {
    renderRoom();
    expect(await screen.findByRole("heading", { name: "Sala Teste" })).toBeInTheDocument();
    expect(screen.getByText("Bom")).toBeInTheDocument();
    expect(screen.queryByText("GOOD")).not.toBeInTheDocument();
    expect(screen.getByText("Lance inicial").closest(".bid-panel")?.parentElement)
      .toHaveClass("room-sidebar");
    const initialApiCalls = mocks.api.mock.calls.length;
    const initialBidCalls = mocks.apiPage.mock.calls.length;
    expect(mocks.socket.connect).toHaveBeenCalledOnce();

    await act(async () => {
      mocks.handlers.get("connect")?.();
    });
    await waitFor(() => expect(mocks.api.mock.calls.length).toBeGreaterThan(initialApiCalls));
    expect(mocks.apiPage.mock.calls.length).toBeGreaterThan(initialBidCalls);
    expect(mocks.socket.emit).toHaveBeenCalledWith("lot:join", { lotId: lot.id });
  });

  it("reutiliza a chave idempotente quando o resultado permanece pendente", async () => {
    const bidHeaders: string[] = [];
    let attempts = 0;
    mocks.api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.endsWith("/bids") && init?.method === "POST") {
        bidHeaders.push(String((init.headers as Record<string, string>)["Idempotency-Key"]));
        attempts += 1;
        if (attempts === 1) throw new ApiError("AUDIT_PENDING", "Pendente", 423);
        return { bidId: "bid" };
      }
      return lot;
    });
    renderRoom();
    const input = await screen.findByLabelText("Seu lance");
    await userEvent.type(input, "100,00");
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByText("Estamos verificando o resultado desta operacao."))
      .toBeInTheDocument();

    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByText("Seu lance foi registrado com sucesso."))
      .toBeInTheDocument();
    expect(bidHeaders).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "11111111-1111-4111-8111-111111111111"
    ]);
    expect(mocks.idempotencyKey).toHaveBeenCalledOnce();
  });
});
