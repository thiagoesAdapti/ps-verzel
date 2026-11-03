import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../app/toast-provider.tsx";

const mocks = vi.hoisted(() => ({ api: vi.fn(), apiPage: vi.fn() }));

vi.mock("../services/api.ts", () => ({ api: mocks.api, apiPage: mocks.apiPage }));

import {
  auctionDateAndTimeToIso,
  auctionDateTimeToIso,
  CreateLotPage,
  dateTimeInAuctionZone,
  validateLotSchedule
} from "../features/pages.tsx";

const book = {
  key: "/works/OL1W",
  title: "Dom Casmurro",
  authors: ["Machado de Assis"],
  publicationYear: 1899,
  publisher: "Editora",
  coverId: null,
  catalogToken: "signed-selection"
};

beforeEach(() => {
  mocks.api.mockReset();
  mocks.api.mockResolvedValue([book]);
});

describe("create lot catalog form", () => {
  it("converts and validates auction dates in the Sao Paulo timezone", () => {
    expect(auctionDateTimeToIso("2026-11-01T13:00")).toBe("2026-11-01T16:00:00.000Z");
    expect(auctionDateAndTimeToIso("2026-11-01", "13:00")).toBe("2026-11-01T16:00:00.000Z");
    expect(auctionDateAndTimeToIso("2026-02-30", "13:00")).toBeNull();
    expect(dateTimeInAuctionZone(new Date("2026-11-01T16:00:00.000Z"))).toBe("2026-11-01T13:00");

    const now = Date.parse("2026-11-01T15:00:00.000Z");
    expect(validateLotSchedule({
      startsImmediately: false,
      startsAt: "2026-11-01T13:00",
      endsAt: "2026-11-01T14:00",
      now
    })).toMatchObject({ valid: true, startError: undefined, endError: undefined });
    expect(validateLotSchedule({
      startsImmediately: false,
      startsAt: "2026-11-01T14:00",
      endsAt: "2026-11-01T13:00",
      now
    })).toMatchObject({ valid: false, endError: expect.stringContaining("posterior") });
  });

  it("searches the real API contract, selects a signed result, and updates the preview", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ToastProvider><CreateLotPage /></ToastProvider></MemoryRouter>);

    await user.type(screen.getByLabelText("Título ou autor"), "dom");
    await user.click(screen.getByRole("button", { name: /buscar/i }));
    expect(mocks.api).toHaveBeenCalledWith("/catalog/search?q=dom");
    await user.click(await screen.findByRole("button", { name: /Dom Casmurro/i }));
    expect(screen.getAllByText("Dom Casmurro").length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText("Descrição do exemplar"), "Exemplar bem conservado");
    await user.type(screen.getByLabelText("Lance inicial"), "10000");
    await user.type(screen.getByLabelText("Incremento mínimo"), "2000");
    expect(screen.getByText(/Mínimo de 10 caracteres atingido/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publicar lote" })).toBeDisabled();
  });

  it("freezes duplicate publication and sends the server contract once", async () => {
    const user = userEvent.setup();
    mocks.api.mockImplementation((path: string) => {
      if (path.startsWith("/catalog/search")) return Promise.resolve([book]);
      return new Promise(() => undefined);
    });
    render(<MemoryRouter><ToastProvider><CreateLotPage /></ToastProvider></MemoryRouter>);

    await user.type(screen.getByLabelText("Título ou autor"), "dom");
    await user.click(screen.getByRole("button", { name: /buscar/i }));
    await user.click(await screen.findByRole("button", { name: /Dom Casmurro/i }));
    await user.type(screen.getByLabelText("Descrição do exemplar"), "Exemplar bem conservado");
    await user.type(screen.getByLabelText("Lance inicial"), "10000");
    await user.type(screen.getByLabelText("Incremento mínimo"), "2000");
    fireEvent.change(screen.getByLabelText("Data de término"), { target: { value: "2099-01-01" } });
    fireEvent.change(screen.getByLabelText("Horário de término"), { target: { value: "13:00" } });

    const publish = screen.getByRole("button", { name: "Publicar lote" });
    await waitFor(() => expect(publish).toBeEnabled());
    fireEvent.click(publish);
    fireEvent.click(publish);

    await waitFor(() => expect(mocks.api.mock.calls.filter(([path]) => path === "/lots")).toHaveLength(1));
    const [, request] = mocks.api.mock.calls.find(([path]) => path === "/lots")!;
    expect(JSON.parse(String(request.body))).toMatchObject({
      catalogToken: "signed-selection",
      startingBidCents: "10000",
      minimumIncrementCents: "2000",
      startsImmediately: true,
      endsAt: "2099-01-01T16:00:00.000Z"
    });
    expect(screen.getByRole("button", { name: /Publicando lote/i })).toBeDisabled();
  });
});
