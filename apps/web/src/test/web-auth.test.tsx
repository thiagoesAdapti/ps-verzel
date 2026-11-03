import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App.tsx";
import { AuthProvider, useAuth } from "../app/auth-provider.tsx";
import { ToastProvider } from "../app/toast-provider.tsx";

const fetchMock = vi.fn();

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function Providers({ path }: { path: string }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <AuthProvider><App /></AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("web authentication", () => {
  it("restores a session and redirects an incompatible role", async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(url === "/api/auth/me"
      ? response({ data: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Licitante",
          email: "bidder@example.com",
          role: "BIDDER"
        } })
      : response({ data: [], meta: { page: 1, limit: 12, total: 0, totalPages: 0 } })));
    render(<Providers path="/auctioneer" />);
    expect(await screen.findByRole("heading", { name: "Livros em leilão." })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", expect.objectContaining({ credentials: "include" }));
  });

  it("redirects an anonymous protected route to login", async () => {
    fetchMock.mockResolvedValue(response({ error: { code: "AUTHENTICATION_REQUIRED", message: "Entre." } }, 401));
    render(<Providers path="/wallet" />);
    expect(await screen.findByRole("heading", { name: /acesse sua conta/i })).toBeInTheDocument();
  });

  it("shows a busy state while login is pending", async () => {
    let resolveLogin!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => { resolveLogin = resolve; });
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/auth/me") {
        return Promise.resolve(response({ error: { code: "AUTHENTICATION_REQUIRED", message: "Entre." } }, 401));
      }
      if (url === "/api/auth/login") return pending;
      return Promise.resolve(response({ data: [], meta: { page: 1, limit: 12, total: 0, totalPages: 0 } }));
    });
    const user = userEvent.setup();
    render(<Providers path="/login" />);
    await user.type(await screen.findByLabelText(/e-mail/i), "bidder@example.com");
    await user.type(screen.getByLabelText(/senha/i), "SenhaSegura123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();
    resolveLogin(response({ data: { id: "1", name: "Licitante", email: "bidder@example.com", role: "BIDDER" } }));
    expect(await screen.findByRole("heading", { name: "Livros em leilão." })).toBeInTheDocument();
  });

  it("shows error feedback when login fails", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(
      response({ error: { code: "INVALID_CREDENTIALS", message: "Credenciais invalidas" } }, 401)
    ));
    const user = userEvent.setup();
    render(<Providers path="/login" />);
    await user.type(await screen.findByLabelText(/e-mail/i), "bidder@example.com");
    await user.type(screen.getByLabelText(/senha/i), "SenhaSegura123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Credenciais invalidas");
  });

  it("clears the provider state after logout", async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(url === "/api/auth/me"
      ? response({ data: { id: "1", name: "Leiloeira", email: "seller@example.com", role: "AUCTIONEER" } })
      : response({ data: { success: true } })));
    const user = userEvent.setup();
    function Harness() {
      const auth = useAuth();
      if (auth.loading) return <span>loading</span>;
      return <button onClick={() => void auth.logout()}>{auth.user ? "Sair" : "Sem sessao"}</button>;
    }
    render(<AuthProvider><Harness /></AuthProvider>);
    await user.click(await screen.findByRole("button", { name: "Sair" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sem sessao" })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
  });
});
