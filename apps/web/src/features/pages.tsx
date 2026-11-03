import { ShieldCheck } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Page } from "../app/app-layout.tsx";
import { useAuth } from "../app/auth-provider.tsx";
import { useToast } from "../app/toast-provider.tsx";
import { LotCard, type Lot } from "../components/domain/index.tsx";
import { Button, Card, EmptyState, ErrorState, FormField, Input, LoadingState, Pagination } from "../components/ui/index.tsx";
import { api, apiPage } from "../services/api.ts";

function useData<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setError("");
    try {
      setData(await load());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha inesperada.");
    }
  }, deps);
  useEffect(() => {
    setData(null);
    void refresh();
  }, [refresh]);
  return { data, error, refresh };
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a operação.";

export function HomePage() {
  const [filter, setFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ page: String(page), limit: "12" });
  if (filter !== "ALL") query.set("status", filter);
  const lots = useData(() => apiPage<Lot[]>(`/lots?${query}`), [filter, page]);

  useEffect(() => {
    if (lots.data && page > Math.max(1, lots.data.meta.totalPages)) {
      setPage(Math.max(1, lots.data.meta.totalPages));
    }
  }, [lots.data, page]);

  const filters = [
    ["ALL", "Todos"],
    ["LIVE", "Ao vivo"],
    ["SCHEDULED", "Agendados"],
    ["ENDED", "Encerrados"]
  ] as const;

  return <div className="page home">
    <section className="home-intro">
      <span className="eyebrow">Catálogo de livros</span>
      <h1>Livros em leilão.</h1>
      <p>Explore os lotes disponíveis e acompanhe as disputas em andamento.</p>
      <a className="btn btn-primary btn-md" href="#catalog">Explorar lotes</a>
    </section>
    <section id="catalog">
      <div className="section-heading">
        <div>
          <h2>Lotes disponíveis</h2>
          <p>Acompanhe os leilões em andamento e descubra os próximos lotes.</p>
        </div>
        {lots.data && <span>{lots.data.meta.total} lotes</span>}
      </div>
      <div className="tabs" role="tablist">
        {filters.map(([value, label]) => <button
          key={value}
          className={filter === value ? "active" : ""}
          onClick={() => { setFilter(value); setPage(1); }}
        >{label}</button>)}
      </div>
      {lots.error
        ? <ErrorState message={lots.error} retry={lots.refresh} />
        : !lots.data
          ? <LoadingState label="Carregando lotes…" />
          : lots.data.data.length
            ? <>
                <div className="lot-grid">
                  {lots.data.data.map((lot) => <LotCard key={lot.id} lot={lot} />)}
                </div>
                <Pagination
                  page={lots.data.meta.page}
                  totalPages={lots.data.meta.totalPages}
                  total={lots.data.meta.total}
                  onPageChange={setPage}
                  label="Paginação dos lotes"
                />
              </>
            : <EmptyState title="Nenhum lote encontrado" description="Ainda não existem lotes nesta categoria." />}
    </section>
    <Card className="audit-note">
      <ShieldCheck />
      <div>
        <h3>Histórico público</h3>
        <p>Cada lote possui uma página de auditoria com o resultado real da verificação criptográfica.</p>
      </div>
    </Card>
  </div>;
}

function AuthPage({ register = false }: { register?: boolean }) {
  const { user, login } = useAuth(); const { showToast } = useToast(); const navigate = useNavigate(); const [busy, setBusy] = useState(false), [role, setRole] = useState<"BIDDER" | "AUCTIONEER">("BIDDER");
  if (user) return <Navigate to={user.role === "AUCTIONEER" ? "/auctioneer" : "/"} replace />;
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget); try { const email = String(form.get("email")), password = String(form.get("password")); if (register) await api("/auth/register", { method: "POST", body: JSON.stringify({ name: form.get("name"), email, password, role }) }); await login(email, password); showToast({ kind: "success", title: register ? "Conta criada" : "Login realizado", message: register ? "Seu cadastro foi concluído com sucesso." : "Bem-vindo de volta." }); navigate(role === "AUCTIONEER" ? "/auctioneer" : "/"); } catch (e) { showToast({ kind: "error", title: register ? "Não foi possível criar a conta" : "Não foi possível entrar", message: errorMessage(e) }); } finally { setBusy(false); } };
  return <div className="auth-page"><Link className="wordmark auth-wordmark" to="/">Casa de Leilões<span>.</span></Link><div className="auth-title"><h1>{register ? "Crie sua conta" : "Acesse sua conta"}</h1><p>{register ? "Cadastre-se para ofertar lances ou publicar lotes." : "Entre para acompanhar suas atividades."}</p></div><Card><form onSubmit={submit}>{register && <FormField label="Nome completo" htmlFor="name"><Input id="name" name="name" minLength={2} required autoComplete="name" /></FormField>}<FormField label="E-mail" htmlFor="email"><Input id="email" name="email" type="email" required autoComplete="email" /></FormField><FormField label="Senha" htmlFor="password" hint={register ? "Use no mínimo oito caracteres." : undefined}><Input id="password" name="password" type="password" minLength={register ? 8 : 1} required autoComplete={register ? "new-password" : "current-password"} /></FormField>{register && <div className="field"><label>Quero participar como</label><div className="role-grid"><button type="button" className={role === "BIDDER" ? "role active" : "role"} onClick={() => setRole("BIDDER")}><strong>Licitante</strong><small>Dar lances e arrematar livros</small></button><button type="button" className={role === "AUCTIONEER" ? "role active" : "role"} onClick={() => setRole("AUCTIONEER")}><strong>Leiloeiro</strong><small>Criar e gerenciar lotes</small></button></div></div>}<Button className="full" size="lg" loading={busy}>{register ? "Criar conta" : "Entrar"}</Button></form><p className="auth-switch">{register ? "Já tem uma conta?" : "Ainda não tem conta?"} <Link to={register ? "/login" : "/register"}>{register ? "Entrar" : "Cadastre-se"}</Link></p></Card></div>;
}
export const LoginPage = () => <AuthPage />; export const RegisterPage = () => <AuthPage register />;
