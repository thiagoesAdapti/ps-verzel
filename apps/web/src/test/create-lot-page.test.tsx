import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../app/toast-provider.tsx";

const mocks = vi.hoisted(() => ({ api: vi.fn(), apiPage: vi.fn() }));

vi.mock("../services/api.ts", () => ({ api: mocks.api, apiPage: mocks.apiPage }));

import { CreateLotPage } from "../features/pages.tsx";

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
    expect(screen.getByRole("button", { name: "Configure o agendamento" })).toBeDisabled();
  });
});
