import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Badge, BookCover, conditionLabel, money, openLibraryCoverUrl } from "../components/domain/index.tsx";
import { Button, ConfirmationModal, FormField, Input, Pagination, StatusMessage } from "../components/ui/index.tsx";
import { ToastProvider, useToast } from "../app/toast-provider.tsx";

describe("accessible design system", () => {
  it("formats domain values without losing bigint precision", () => {
    expect(money("900719925474099312").replace(/\s/g, " ")).toBe("R$ 9.007.199.254.740.993,12");
    expect(["EXCELLENT", "GOOD", "FAIR", "POOR"].map(conditionLabel)).toEqual([
      "Excelente", "Bom", "Regular", "Ruim"
    ]);
  });

  it("connects labels and exposes busy and error states", () => {
    render(
      <>
        <FormField label="Campo" htmlFor="required-field" required>
          <Input id="required-field" required />
        </FormField>
        <Button loading>Salvar</Button>
        <StatusMessage kind="error">Falha controlada</StatusMessage>
      </>
    );
    expect(screen.getByLabelText("Campo")).toBeRequired();
    expect(screen.getByRole("button", { name: /salvar/i })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Falha controlada");
  });

  it("restores focus when a modal closes", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Cancelar lote</button>
          <ConfirmationModal
            open={open}
            title="Cancelar lote?"
            description="Esta acao nao podera ser desfeita."
            onConfirm={() => setOpen(false)}
            onClose={() => setOpen(false)}
          />
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Cancelar lote" });
    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Voltar" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("announces and dismisses toast feedback", async () => {
    const user = userEvent.setup();
    function Harness() {
      const { showToast } = useToast();
      return <button onClick={() => showToast({ kind: "error", title: "Operacao falhou" })}>Mostrar</button>;
    }
    render(<ToastProvider><Harness /></ToastProvider>);
    await user.click(screen.getByRole("button", { name: "Mostrar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Operacao falhou");
    await user.click(screen.getByRole("button", { name: /fechar/i }));
    expect(screen.queryByText("Operacao falhou")).not.toBeInTheDocument();
  });

  it("falls back from an unavailable book cover", () => {
    const source = openLibraryCoverUrl(12345);
    render(<MemoryRouter><><Badge status="LIVE" /><BookCover src={source} title="Livro com capa" /></></MemoryRouter>);
    const image = screen.getByRole("img", { name: "Capa de Livro com capa" });
    fireEvent.error(image);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Livro com capa")).toBeInTheDocument();
  });

  it("marks the current page and requests navigation", async () => {
    const user = userEvent.setup();
    const changePage = vi.fn();
    render(<Pagination page={2} totalPages={3} total={30} onPageChange={changePage} />);
    expect(screen.getByRole("button", { name: /p.gina 2/i })).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("button", { name: /pr.xima p.gina/i }));
    expect(changePage).toHaveBeenCalledWith(3);
  });
});
