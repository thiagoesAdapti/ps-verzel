import { BookOpen, Check, Search, ShieldCheck } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Page } from "../app/app-layout.tsx";
import { useAuth } from "../app/auth-provider.tsx";
import { useToast } from "../app/toast-provider.tsx";
import { Badge, BookCover, conditionLabel, formatAuctionDateTime, LotCard, Metric, MoneyDisplay, money, openLibraryCoverUrl, type Lot } from "../components/domain/index.tsx";
import { Button, Card, ConfirmationModal, EmptyState, ErrorState, FormField, Input, LoadingState, MoneyInput, Pagination, Select, Textarea } from "../components/ui/index.tsx";
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

type AuctioneerSummary = { total: number; live: number; receivedCents: string };

export function isLotCancellable(
  lot: Pick<Lot, "status" | "bidCount" | "currentBidCents" | "effectiveEndsAt" | "serverNow">
) {
  return (lot.status === "SCHEDULED" || lot.status === "LIVE")
    && lot.bidCount === 0
    && lot.currentBidCents == null
    && new Date(lot.effectiveEndsAt).getTime() > new Date(lot.serverNow).getTime();
}

export function AuctioneerPage() {
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Lot | null>(null);
  const lots = useData(
    () => apiPage<(Lot & { finalAmountCents?: string | null })[], AuctioneerSummary>(
      `/auctioneer/lots?page=${page}&limit=12`
    ),
    [page]
  );

  useEffect(() => {
    if (lots.data && page > Math.max(1, lots.data.meta.totalPages)) {
      setPage(Math.max(1, lots.data.meta.totalPages));
    }
  }, [lots.data, page]);

  const cancel = async () => {
    if (!cancelTarget) return;
    const id = cancelTarget.id;
    setCancelling(id);
    try {
      await api(`/lots/${id}/cancel`, { method: "POST" });
      setCancelTarget(null);
      showToast({ kind: "success", title: "Lote cancelado", message: "O lote foi cancelado com sucesso." });
      await lots.refresh();
    } catch (caught) {
      showToast({ kind: "error", title: "Não foi possível cancelar o lote", message: errorMessage(caught) });
    } finally {
      setCancelling(null);
    }
  };

  if (lots.error) return <Page title="Seus leilões"><ErrorState message={lots.error} retry={lots.refresh} /></Page>;
  if (!lots.data) return <LoadingState />;
  const summary = lots.data.summary ?? { total: lots.data.meta.total, live: 0, receivedCents: "0" };

  return <>
    <Page
      eyebrow="Gestão de lotes"
      title="Seus leilões"
      description="Gerencie lotes, acompanhe disputas e consulte resultados."
      actions={<Link className="btn btn-primary btn-md" to="/auctioneer/lots/new">Criar novo lote</Link>}
    >
      <div className="metrics">
        <Metric label="Total de lotes" value={summary.total} note="Incluindo cancelados" />
        <Metric label="Ao vivo agora" value={summary.live} note="Recebendo lances" />
        <Metric label="Total recebido" value={<MoneyDisplay value={summary.receivedCents} />} note="Lotes vendidos e liquidados" />
      </div>
      <Card className="table-card">
        <div className="card-heading"><h3>Meus lotes</h3><span>{lots.data.meta.total} registros</span></div>
        {lots.data.data.length ? <>
          <div className="table-wrap auctioneer-table-wrap">
            <table className="auctioneer-table">
              <thead><tr><th>Lote</th><th>Estado</th><th>Lances</th><th>Maior lance</th><th>Encerramento</th><th>Ação</th></tr></thead>
              <tbody>{lots.data.data.map((lot) => <tr key={lot.id}>
                <td data-label="Lote"><div><strong>{lot.title}</strong><small>{lot.id.slice(0, 8)}</small></div></td>
                <td data-label="Estado"><Badge status={lot.status} /></td>
                <td data-label="Lances">{lot.bidCount}</td>
                <td data-label="Maior lance"><MoneyDisplay value={lot.currentBidCents} /></td>
                <td data-label="Encerramento">{lot.status === "CANCELLED" ? "—" : <time dateTime={lot.effectiveEndsAt}>{formatAuctionDateTime(lot.effectiveEndsAt)}</time>}</td>
                <td data-label="Ação"><div className="row-actions">
                  <Link to={`/lots/${lot.id}`}>Visualizar →</Link>
                  {isLotCancellable(lot) && <Button type="button" variant="danger" size="sm" onClick={() => setCancelTarget(lot)}>Cancelar</Button>}
                </div></td>
              </tr>)}</tbody>
            </table>
          </div>
          <Pagination
            page={lots.data.meta.page}
            totalPages={lots.data.meta.totalPages}
            total={lots.data.meta.total}
            onPageChange={setPage}
            label="Paginação dos lotes do leiloeiro"
          />
        </> : <EmptyState title="Nenhum lote publicado" description="Crie o seu primeiro lote para começar." />}
      </Card>
    </Page>
    <ConfirmationModal
      open={Boolean(cancelTarget)}
      title="Cancelar lote?"
      description={cancelTarget ? `Tem certeza de que deseja cancelar “${cancelTarget.title}”? Esta ação não poderá ser desfeita.` : ""}
      confirmLabel="Confirmar cancelamento"
      cancelLabel="Voltar"
      loading={Boolean(cancelling)}
      onConfirm={() => void cancel()}
      onClose={() => setCancelTarget(null)}
    />
  </>;
}

type CatalogBook = {
  key: string;
  title: string;
  authors: string[];
  publicationYear: number | null;
  publisher: string | null;
  coverId: number | null;
  catalogToken: string;
};

export function CreateLotPage() {
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogBook[]>([]);
  const [selected, setSelected] = useState<CatalogBook | null>(null);
  const [choosingBook, setChoosingBook] = useState(true);
  const [showAllResults, setShowAllResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const [description, setDescription] = useState("");
  const [condition, setCondition] = useState<"EXCELLENT" | "GOOD" | "FAIR" | "POOR">("GOOD");
  const [startingCents, setStartingCents] = useState("");
  const [incrementCents, setIncrementCents] = useState("");

  const descriptionContentLength = description.trim().length;
  const missingDescriptionCharacters = Math.max(0, 10 - descriptionContentLength);
  const descriptionTooShort = description.length > 0 && descriptionContentLength < 10;
  const descriptionAtLimit = description.length >= 2000;
  const descriptionFeedback = description.length === 0
    ? "Mínimo de 10 caracteres."
    : descriptionTooShort
      ? `Falta${missingDescriptionCharacters === 1 ? "" : "m"} ${missingDescriptionCharacters} caractere${missingDescriptionCharacters === 1 ? "" : "s"} para o mínimo.`
      : descriptionAtLimit ? "Limite máximo atingido." : "Mínimo de 10 caracteres atingido.";
  const descriptionCounterClass = descriptionTooShort
    ? "character-counter-invalid"
    : descriptionAtLimit ? "character-counter-limit" : descriptionContentLength >= 10 ? "character-counter-valid" : "";
  const visibleResults = showAllResults ? results : results.slice(0, 5);
  const selectedCoverUrl = openLibraryCoverUrl(selected?.coverId);

  const search = async () => {
    if (query.trim().length < 2 || searching) return;
    setSearching(true);
    try {
      const books = await api<CatalogBook[]>(`/catalog/search?q=${encodeURIComponent(query)}`);
      setResults(books);
      setShowAllResults(false);
      if (!books.length) {
        showToast({ kind: "warning", title: "Nenhum livro encontrado", message: "Tente pesquisar por outro título ou autor." });
      }
    } catch (caught) {
      showToast({ kind: "error", title: "Não foi possível buscar livros", message: errorMessage(caught) });
    } finally {
      setSearching(false);
    }
  };

  return <Page eyebrow="Gestão de lotes" title="Criar novo lote" description="Selecione um livro do catálogo e defina as condições do leilão.">
    <form className="create-grid" onSubmit={(event) => event.preventDefault()}>
      <div className="stack">
        <Card>
          <div className="card-heading">
            <div><span className="eyebrow">Livro<span className="required-mark" aria-hidden="true"> *</span></span><h3>Buscar na Open Library</h3></div>
            {selected && !choosingBook && <Button type="button" variant="ghost" size="sm" onClick={() => setChoosingBook(true)}>Trocar livro</Button>}
          </div>
          {selected && !choosingBook
            ? <div className="selected-book-summary"><BookOpen aria-hidden="true" /><span><strong>{selected.title}</strong><small>{selected.authors.join(", ")} · {selected.publicationYear ?? "Ano não informado"}</small></span><Check aria-hidden="true" /></div>
            : <>
                <div className="search-row">
                  <Input
                    aria-label="Título ou autor"
                    value={query}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }}
                    placeholder="Título ou autor"
                  />
                  <Button type="button" loading={searching} disabled={query.trim().length < 2} onClick={() => void search()}><Search size={17} /> Buscar</Button>
                </div>
                {visibleResults.length > 0 && <div className={`catalog-results ${showAllResults ? "expanded" : ""}`}>
                  {visibleResults.map((book) => <button
                    type="button"
                    className={`catalog-item ${selected?.key === book.key ? "selected" : ""}`}
                    key={book.key}
                    onClick={() => { setSelected(book); setChoosingBook(false); }}
                  ><BookOpen aria-hidden="true" /><span><strong>{book.title}</strong><small>{book.authors.join(", ")} · {book.publicationYear ?? "Ano não informado"}</small></span>{selected?.key === book.key && <Check aria-hidden="true" />}</button>)}
                </div>}
                {results.length > 5 && <Button className="catalog-results-toggle" type="button" variant="ghost" size="sm" onClick={() => setShowAllResults((current) => !current)}>{showAllResults ? "Mostrar menos" : `Ver mais ${results.length - 5} resultados`}</Button>}
              </>}
        </Card>
        <Card>
          <span className="eyebrow">Condições</span><h3>Condições do exemplar</h3>
          <FormField label="Descrição do exemplar" htmlFor="description" required>
            <Textarea id="description" rows={4} minLength={10} maxLength={2000} value={description} onChange={(event) => setDescription(event.currentTarget.value)} aria-describedby="description-counter" aria-invalid={descriptionTooShort} required />
            <small id="description-counter" className={`character-counter ${descriptionCounterClass}`} aria-live="polite"><span>{descriptionFeedback}</span><span>{description.length.toLocaleString("pt-BR")}/2.000</span></small>
          </FormField>
          <FormField label="Estado de conservação" htmlFor="condition">
            <Select id="condition" value={condition} onChange={(event) => setCondition(event.currentTarget.value as typeof condition)} required>
              <option value="EXCELLENT">Excelente</option><option value="GOOD">Bom</option><option value="FAIR">Regular</option><option value="POOR">Ruim</option>
            </Select>
          </FormField>
          <div className="form-grid">
            <FormField label="Lance inicial" htmlFor="starting"><MoneyInput id="starting" valueCents={startingCents} onValueChange={setStartingCents} required /></FormField>
            <FormField label="Incremento mínimo" htmlFor="increment"><MoneyInput id="increment" valueCents={incrementCents} onValueChange={setIncrementCents} required /></FormField>
          </div>
        </Card>
      </div>
      <aside className="preview-column"><Card className="preview">
        <h3>Prévia do lote</h3>
        <div className="preview-book-summary">
          <BookCover src={selectedCoverUrl} title={selected?.title ?? "Nenhum livro selecionado"} className="preview-cover" />
          <div className="preview-book-copy"><strong>{selected?.title ?? "Selecione um livro"}</strong><span>{selected?.authors.join(", ") ?? "Pesquise e selecione um item para continuar."}</span>{selected && <Badge status={conditionLabel(condition)} />}</div>
        </div>
        <div className="preview-facts"><div><span>Lance inicial</span><strong>{startingCents ? money(startingCents) : "—"}</strong></div><div><span>Incremento</span><strong>{incrementCents ? money(incrementCents) : "—"}</strong></div></div>
        <Button className="full" size="lg" disabled>Configure o agendamento</Button>
      </Card></aside>
    </form>
  </Page>;
}
