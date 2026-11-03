import { BookOpen, Check, Copy, Search, ShieldCheck } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Page } from "../app/app-layout.tsx";
import { useAuth } from "../app/auth-provider.tsx";
import { useToast } from "../app/toast-provider.tsx";
import { Badge, BookCover, conditionLabel, formatAuctionDateTime, lotBidLabel, LotCard, Metric, MoneyDisplay, money, openLibraryCoverUrl, type Lot } from "../components/domain/index.tsx";
import { Button, Card, ConfirmationModal, EmptyState, ErrorState, FormField, Input, LoadingState, MoneyInput, Pagination, Select, StatusMessage, Textarea } from "../components/ui/index.tsx";
import { api, apiPage, ApiError, idempotencyKey } from "../services/api.ts";
import { socket } from "../services/socket.ts";

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

type Bid = {
  sequence: number;
  participant: string;
  amountCents: string;
  acceptedAt: string;
  hash: string;
};
type WalletData = { totalCents: string; reservedCents: string; availableCents: string };

export function bidCountLabel(count: number) {
  return `${count} ${count === 1 ? "lance registrado" : "lances registrados"}`;
}

export function minimumBidLabel(isLeading: boolean | undefined) {
  return isLeading ? "Próximo lance mínimo" : "Lance mínimo";
}

export function RoomPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [bidPage, setBidPage] = useState(1);
  const [amountCents, setAmountCents] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(socket.connected);
  const lot = useData(() => api<Lot>(`/lots/${id}`), [id]);
  const bids = useData(
    () => apiPage<Bid[]>(`/lots/${id}/bids?page=${bidPage}&limit=20`),
    [id, bidPage]
  );
  const wallet = useData<WalletData | null>(
    () => user?.role === "BIDDER" ? api<WalletData>("/wallet") : Promise.resolve(null),
    [user?.role]
  );
  const pendingBid = useRef<{ amountCents: string; key: string } | null>(null);

  useEffect(() => {
    const sync = () => {
      void lot.refresh();
      void bids.refresh();
      if (user?.role === "BIDDER") void wallet.refresh();
    };
    const onConnect = () => {
      setConnected(true);
      socket.emit("lot:join", { lotId: id });
      sync();
    };
    const onDisconnect = () => setConnected(false);
    socket
      .on("bid:accepted", sync)
      .on("lot:extended", sync)
      .on("lot:ended", sync)
      .on("lot:started", sync)
      .on("lot:cancelled", sync)
      .on("connect", onConnect)
      .on("disconnect", onDisconnect);
    socket.connect();
    if (socket.connected) onConnect();
    return () => {
      if (socket.connected) socket.emit("lot:leave", { lotId: id });
      socket
        .off("bid:accepted", sync)
        .off("lot:extended", sync)
        .off("lot:ended", sync)
        .off("lot:started", sync)
        .off("lot:cancelled", sync)
        .off("connect", onConnect)
        .off("disconnect", onDisconnect);
      socket.disconnect();
    };
  }, [id, lot.refresh, bids.refresh, wallet.refresh, user?.role]);

  if (lot.error) return <div className="page"><ErrorState message={lot.error} retry={lot.refresh} /></div>;
  if (!lot.data) return <LoadingState />;
  const item = lot.data;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (!amountCents) throw new Error("Informe um valor válido.");
      const operation = pendingBid.current?.amountCents === amountCents
        ? pendingBid.current
        : { amountCents, key: idempotencyKey() };
      pendingBid.current = operation;
      await api(`/lots/${id}/bids`, {
        method: "POST",
        headers: { "Idempotency-Key": operation.key },
        body: JSON.stringify({ amountCents })
      });
      pendingBid.current = null;
      setAmountCents("");
      showToast({
        kind: "success",
        title: "Lance confirmado",
        message: "Seu lance foi registrado com sucesso."
      });
      await Promise.all([lot.refresh(), wallet.refresh()]);
      if (bidPage === 1) await bids.refresh();
      else setBidPage(1);
    } catch (caught) {
      const pending = caught instanceof ApiError && caught.code === "AUDIT_PENDING";
      if (!pending) pendingBid.current = null;
      showToast({
        kind: pending ? "warning" : "error",
        title: pending ? "Lance em verificação" : "Não foi possível registrar o lance",
        message: pending
          ? "Estamos verificando o resultado desta operação."
          : errorMessage(caught)
      });
    } finally {
      setBusy(false);
    }
  };

  return <Page
    eyebrow={`Lote ${item.id.slice(0, 8)}`}
    title={item.title}
    description={item.authors.join(", ")}
    actions={<Badge status={item.status} />}
  >
    <div className="room-grid">
      <div className="stack">
        <Card>
          <BookCover src={item.coverUrl} title={item.title} className="detail-cover" />
          <div className="facts">
            <div><span>Conservacao</span><strong>{conditionLabel(item.condition)}</strong></div>
            <div><span>Publicação</span><strong>{item.publicationYear ?? "Não informada"}</strong></div>
          </div>
          <h3>Sobre este exemplar</h3>
          <p>{item.description}</p>
        </Card>
        <Card>
          <div className="card-heading">
            <h3>Histórico de lances</h3>
            <Link to={`/lots/${id}/audit`}>Auditar histórico -&gt;</Link>
          </div>
          {bids.error
            ? <StatusMessage kind="warning">{bids.error}</StatusMessage>
            : !bids.data
              ? <LoadingState />
              : bids.data.data.length
                ? <>
                    <div className="line-list">
                      {bids.data.data.map((bid) => <div className="line-row" key={bid.sequence}>
                        <div>
                          <strong>{bid.participant}</strong>
                          <small>{new Date(bid.acceptedAt).toLocaleString("pt-BR")}</small>
                        </div>
                        <MoneyDisplay value={bid.amountCents} />
                      </div>)}
                    </div>
                    <Pagination
                      page={bids.data.meta.page}
                      totalPages={bids.data.meta.totalPages}
                      total={bids.data.meta.total}
                      onPageChange={setBidPage}
                      label="Paginação do histórico de lances"
                    />
                  </>
                : <EmptyState title="Nenhum lance" description="Este lote ainda não recebeu lances." />}
        </Card>
      </div>
      <aside className="stack room-sidebar">
        <Card className="bid-panel">
          <div className="card-heading">
            <span>{lotBidLabel(item)}</span>
            {item.status === "LIVE" && <span
              className={`connection-indicator ${connected ? "connected" : "reconnecting"}`}
              role="status"
            >{connected ? "Ao vivo · Conectado" : "Ao vivo · Reconectando…"}</span>}
          </div>
          <MoneyDisplay large value={item.currentBidCents ?? item.startingBidCents} />
          <p>{bidCountLabel(item.bidCount)}</p>
          {item.position && <p>Sua posicao nesta disputa: <strong>{item.position}o</strong></p>}
          <Countdown endsAt={item.effectiveEndsAt} serverNow={item.serverNow} status={item.status} />
          {item.status === "LIVE" && <>
            <div className="divider" />
            {user?.role === "BIDDER" && <div className="bid-context" aria-label="Informações para o lance">
              <div><span>{minimumBidLabel(item.isLeading)}</span><MoneyDisplay value={item.nextMinimumCents} /></div>
              <div>
                <span>Seu saldo disponivel</span>
                <strong>{wallet.data
                  ? <MoneyDisplay value={wallet.data.availableCents} />
                  : wallet.error ? "Indisponível" : "Consultando…"}</strong>
              </div>
            </div>}
            {item.auditState !== "READY"
              ? <StatusMessage kind="info">O lote esta sincronizando com a auditoria.</StatusMessage>
              : user?.role === "AUCTIONEER"
                ? <StatusMessage kind="info">Você está acompanhando este leilão como leiloeiro. Apenas licitantes podem dar lances.</StatusMessage>
                : user?.role === "BIDDER"
                  ? item.isLeading
                    ? <StatusMessage kind="success">Você está liderando este leilão.</StatusMessage>
                    : <form onSubmit={submit}>
                        <FormField label="Seu lance" htmlFor="bid">
                          <MoneyInput id="bid" valueCents={amountCents} onValueChange={setAmountCents} required />
                        </FormField>
                        <Button className="full" size="lg" loading={busy}>Confirmar lance</Button>
                      </form>
                  : <StatusMessage kind="info">Entre ou crie uma conta de licitante para participar.</StatusMessage>}
          </>}
        </Card>
        {user?.role === "BIDDER" && <Card><Link to="/wallet">Abrir minha carteira -&gt;</Link></Card>}
      </aside>
    </div>
  </Page>;
}

export function serverClockOffset(serverNow: string, localAtSync = Date.now()) {
  return new Date(serverNow).getTime() - localAtSync;
}

export function remainingSeconds(endsAt: string, localNow: number, offset: number) {
  return Math.max(0, Math.floor((new Date(endsAt).getTime() - (localNow + offset)) / 1000));
}

export function countdownParts(seconds: number) {
  if (seconds >= 86_400) {
    return [
      { value: Math.floor(seconds / 86_400), label: "DIAS" },
      { value: Math.floor((seconds % 86_400) / 3_600), label: "HORAS" },
      { value: Math.floor((seconds % 3_600) / 60), label: "MIN" }
    ];
  }
  return [
    { value: Math.floor(seconds / 3_600), label: "HORAS" },
    { value: Math.floor((seconds % 3_600) / 60), label: "MIN" },
    { value: seconds % 60, label: "SEG" }
  ];
}

function Countdown({ endsAt, serverNow, status }: { endsAt: string; serverNow: string; status: string }) {
  const [now, setNow] = useState(Date.now());
  const offset = useMemo(() => serverClockOffset(serverNow), [serverNow]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  const seconds = remainingSeconds(endsAt, now, offset);
  if (status === "ENDED") return <p className="ended-label">Este leilão foi encerrado.</p>;
  if (status === "CANCELLED") return <p className="ended-label">Este lote foi cancelado.</p>;
  return <div>
    <span className="count-label">{status === "SCHEDULED" ? "Começa em" : "Encerra em"}</span>
    <div className="countdown">
      {countdownParts(seconds).map(({ value, label }) => <div key={label}>
        <strong>{String(value).padStart(2, "0")}</strong><span>{label}</span>
      </div>)}
    </div>
  </div>;
}

type Transaction = {
  id: string;
  type: "DEPOSIT" | "AUCTION_DEBIT" | "AUCTION_CREDIT";
  amountCents: string;
  balanceAfterCents: string;
  lotTitle: string | null;
  receiptToken: string | null;
  createdAt: string;
};

export function walletTransactionPresentation(type: Transaction["type"], amountCents: string) {
  const amount = BigInt(amountCents);
  const absoluteCents = (amount < 0n ? -amount : amount).toString();
  if (type === "AUCTION_DEBIT") {
    return { label: "Arrematação", detail: "Saldo debitado", direction: "debit", sign: "−", absoluteCents } as const;
  }
  if (type === "AUCTION_CREDIT") {
    return { label: "Venda de lote", detail: "Saldo creditado", direction: "credit", sign: "+", absoluteCents } as const;
  }
  return { label: "Depósito simulado", detail: "Saldo creditado", direction: "credit", sign: "+", absoluteCents } as const;
}

export function WalletPage() {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [depositCents, setDepositCents] = useState("");
  const [transactionPage, setTransactionPage] = useState(1);
  const wallet = useData(() => api<WalletData>("/wallet"), []);
  const transactions = useData(
    () => apiPage<Transaction[]>(`/wallet/transactions?page=${transactionPage}&limit=10`),
    [transactionPage]
  );
  const pendingDeposit = useRef<{ amountCents: string; key: string } | null>(null);

  const deposit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (!depositCents) throw new Error("Informe um valor válido.");
      const operation = pendingDeposit.current?.amountCents === depositCents
        ? pendingDeposit.current
        : { amountCents: depositCents, key: idempotencyKey() };
      pendingDeposit.current = operation;
      await api("/wallet/deposits", {
        method: "POST",
        headers: { "Idempotency-Key": operation.key },
        body: JSON.stringify({ amountCents: operation.amountCents })
      });
      pendingDeposit.current = null;
      setDepositCents("");
      showToast({ kind: "success", title: "Saldo adicionado", message: "Seu saldo simulado foi atualizado." });
      await wallet.refresh();
      if (transactionPage === 1) await transactions.refresh();
      else setTransactionPage(1);
    } catch (caught) {
      showToast({ kind: "error", title: "Não foi possível adicionar saldo", message: errorMessage(caught) });
    } finally {
      setBusy(false);
    }
  };

  if (wallet.error) return <Page title="Minha carteira"><ErrorState message={wallet.error} retry={wallet.refresh} /></Page>;
  if (!wallet.data) return <LoadingState />;

  return <Page eyebrow="Sua conta" title="Minha carteira" description="Consulte seu saldo e os valores reservados para lances.">
    <div className="metrics">
      <Metric label="Saldo total" value={<MoneyDisplay value={wallet.data.totalCents} />} note="Depósitos e movimentações" />
      <Metric label="Saldo comprometido" value={<MoneyDisplay value={wallet.data.reservedCents} />} note="Reservado em lotes ativos" />
      <Metric label="Disponível para lances" value={<MoneyDisplay value={wallet.data.availableCents} />} note="Pode ser utilizado agora" accent />
    </div>
    <div className="content-grid">
      <Card>
        <h3>Movimentações recentes</h3>
        {transactions.error
          ? <StatusMessage kind="warning">{transactions.error}</StatusMessage>
          : !transactions.data
            ? <LoadingState label="Carregando movimentações…" />
            : transactions.data.data.length
              ? <>
                  <div className="line-list">{transactions.data.data.map((row) => {
                    const presentation = walletTransactionPresentation(row.type, row.amountCents);
                    return <div className={`line-row wallet-transaction wallet-transaction-${presentation.direction}`} key={row.id}>
                      <div>
                        <strong>{presentation.label}</strong>
                        <small>{row.lotTitle ? `${row.lotTitle} · ${presentation.detail}` : presentation.detail}</small>
                        <small>{formatAuctionDateTime(row.createdAt)}</small>
                        {row.receiptToken && <Link className="transaction-receipt" to={`/receipts/${row.receiptToken}`}>Ver comprovante →</Link>}
                      </div>
                      <span className="transaction-amount" aria-label={`${presentation.direction === "debit" ? "Débito" : "Crédito"} de ${money(presentation.absoluteCents)}`}>
                        <span aria-hidden="true">{presentation.sign}</span><MoneyDisplay value={presentation.absoluteCents} />
                      </span>
                    </div>;
                  })}</div>
                  <Pagination
                    page={transactions.data.meta.page}
                    totalPages={transactions.data.meta.totalPages}
                    total={transactions.data.meta.total}
                    onPageChange={setTransactionPage}
                    label="Paginação das movimentações"
                  />
                </>
              : <EmptyState title="Sem movimentações" description="Suas operações aparecerão aqui." />}
      </Card>
      <Card className="wallet-deposit-card">
        <h3>Adicionar saldo</h3>
        <p>Esta é uma simulação financeira; nenhum pagamento real será realizado.</p>
        <form onSubmit={deposit}>
          <FormField label="Valor do depósito" htmlFor="amount" hint="Mínimo R$ 1,00 · Máximo R$ 10.000,00">
            <MoneyInput id="amount" valueCents={depositCents} onValueChange={setDepositCents} required />
          </FormField>
          <Button className="full" loading={busy}>Simular depósito</Button>
        </form>
      </Card>
    </div>
  </Page>;
}

type Participation = {
  lotId: string;
  title: string;
  coverUrl: string | null;
  status: string;
  highestBidCents: string | null;
  isLeading: boolean;
  won: boolean;
  finalAmountCents: string | null;
  receiptToken: string | null;
};

type ParticipationSummary = { total: number; leading: number; won: number };

export function participationBadgeStatus(
  item: Pick<Participation, "won" | "isLeading" | "status">
) {
  if (item.won) return "WON";
  if (item.isLeading) return "LEADING";
  return item.status === "LIVE" ? "OUTBID" : "ENDED";
}

export function MyAuctionsPage() {
  const [page, setPage] = useState(1);
  const items = useData(
    () => apiPage<Participation[], ParticipationSummary>(`/my/participations?page=${page}&limit=12`),
    [page]
  );
  useEffect(() => {
    if (items.data && page > Math.max(1, items.data.meta.totalPages)) {
      setPage(Math.max(1, items.data.meta.totalPages));
    }
  }, [items.data, page]);
  if (items.error) {
    return <Page title="Meus arremates"><ErrorState message={items.error} retry={items.refresh} /></Page>;
  }
  if (!items.data) return <LoadingState />;
  const summary = items.data.summary ?? {
    total: items.data.meta.total,
    leading: 0,
    won: 0
  };
  return <Page
    eyebrow="Sua conta"
    title="Meus arremates"
    description="Acompanhe suas disputas, vitórias e comprovantes."
  >
    <div className="metrics">
      <Metric label="Participações" value={summary.total} note="Lotes com lances" />
      <Metric label="Liderando" value={summary.leading} note="Disputas em andamento" />
      <Metric label="Arrematados" value={summary.won} note="Comprovantes disponíveis" />
    </div>
    <Card className="table-card">
      {items.data.data.length
        ? <>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Lote</th><th>Situação</th><th>Meu maior lance</th><th>Próximo passo</th></tr></thead>
                <tbody>{items.data.data.map((item) => <tr key={item.lotId}>
                  <td><strong>{item.title}</strong></td>
                  <td><Badge status={participationBadgeStatus(item)} /></td>
                  <td><MoneyDisplay value={item.highestBidCents} /></td>
                  <td>{item.receiptToken
                    ? <Link to={`/receipts/${item.receiptToken}`}>Comprovante -&gt;</Link>
                    : <Link to={`/lots/${item.lotId}`}>Ver lote -&gt;</Link>}</td>
                </tr>)}</tbody>
              </table>
            </div>
            <Pagination
              page={items.data.meta.page}
              totalPages={items.data.meta.totalPages}
              total={items.data.meta.total}
              onPageChange={setPage}
              label="Paginação das participações"
            />
          </>
        : <EmptyState
            title="Nenhuma participação"
            description="Quando você der seu primeiro lance, o lote aparecerá aqui."
          />}
    </Card>
  </Page>;
}

type Receipt = {
  token: string;
  lotId: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  finalAmountCents: string;
  winner: string;
  settledAt: string;
  result: string;
};

export function ReceiptPage() {
  const { token = "" } = useParams();
  const { showToast } = useToast();
  const receipt = useData(() => api<Receipt>(`/receipts/${token}`), [token]);
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      showToast({
        kind: "success",
        title: "Link copiado",
        message: "O link do comprovante está na área de transferência."
      });
    } catch (caught) {
      showToast({
        kind: "error",
        title: "Não foi possível copiar o link",
        message: errorMessage(caught)
      });
    }
  };
  if (receipt.error) {
    return <Page title="Comprovante de arremate">
      <ErrorState message={receipt.error} retry={receipt.refresh} />
    </Page>;
  }
  if (!receipt.data) return <LoadingState />;
  const item = receipt.data;
  return <div className="page receipt-page">
    <Card className="receipt">
      <div className="receipt-head">
        <span className="eyebrow">Comprovante de arrematação</span>
        <h1>Lote arrematado</h1>
        <p>Registro público da arrematação, sem dados pessoais do vencedor.</p>
      </div>
      <div className="receipt-book">
        <div className="receipt-book-copy">
          <span className="eyebrow">Lote {item.lotId.slice(0, 8)}</span>
          <h2>{item.title}</h2>
          <p>{item.authors.join(", ")}</p>
        </div>
        <BookCover src={item.coverUrl} title={item.title} />
      </div>
      <div className="receipt-grid">
        <div><span>Comprovante</span><strong>{item.token.slice(0, 12).toUpperCase()}</strong></div>
        <div><span>Resultado</span><strong>Arrematado</strong></div>
        <div><span>Vencedor público</span><strong>{item.winner}</strong></div>
        <div><span>Encerramento</span><strong>{formatAuctionDateTime(item.settledAt)}</strong></div>
      </div>
      <div className="receipt-total">
        <span>Valor final do arremate</span>
        <MoneyDisplay large value={item.finalAmountCents} />
      </div>
      <Button onClick={() => void copyLink()}>
        <Copy size={17} /> {copied ? "Link copiado" : "Copiar link do comprovante"}
      </Button>
    </Card>
  </div>;
}

type AuditStatus = "INTEGRO" | "ADULTERADO" | "INCONCLUSIVO";

export function auditCheckResults(status: AuditStatus) {
  if (status === "INTEGRO") {
    return { tone: "success", integrity: "Validada", sequence: "Validada", signatures: "Válidas" } as const;
  }
  if (status === "ADULTERADO") {
    return {
      tone: "error",
      integrity: "Com divergência",
      sequence: "Não confirmada",
      signatures: "Não confirmadas"
    } as const;
  }
  return {
    tone: "warning",
    integrity: "Não concluída",
    sequence: "Não concluída",
    signatures: "Não concluídas"
  } as const;
}

type Audit = {
  lotId: string;
  status: AuditStatus;
  bidCount: number;
  verifiedAt: string;
  message: string;
  bids: Array<{
    sequence: number;
    participant: string;
    amountCents: string;
    acceptedAt: string;
  }>;
};

export function AuditPage() {
  const { id = "" } = useParams();
  const audit = useData(() => api<Audit>(`/lots/${id}/audit`), [id]);
  const lot = useData(() => api<Pick<Lot, "title" | "authors">>(`/lots/${id}`), [id]);
  if (audit.error || lot.error) {
    return <Page title="Auditoria de lances">
      <ErrorState
        message={audit.error || lot.error}
        retry={() => {
          void audit.refresh();
          void lot.refresh();
        }}
      />
    </Page>;
  }
  if (!audit.data || !lot.data) return <LoadingState />;
  const item = audit.data;
  const kind = item.status === "INTEGRO"
    ? "success"
    : item.status === "ADULTERADO" ? "error" : "warning";
  const checks = auditCheckResults(item.status);
  const resultLabel = item.status === "INTEGRO"
    ? "Íntegro"
    : item.status === "ADULTERADO" ? "Divergência encontrada" : "Verificação inconclusiva";
  const resultTitle = item.status === "INTEGRO"
    ? "Histórico íntegro"
    : item.status === "ADULTERADO"
      ? "Foi identificada uma divergência no histórico"
      : "Não foi possível concluir a verificação";
  const explanation = item.status !== "INTEGRO"
    ? item.message
    : item.bidCount === 0
      ? "O lote ainda não possui lances. Os dados iniciais e o histórico independente foram verificados sem divergências."
      : `Os ${item.bidCount} lance${item.bidCount === 1 ? "" : "s"} registrado${item.bidCount === 1 ? "" : "s"} correspondem ao histórico independente e passaram pelas validações de integridade, sequência e assinatura.`;

  return <Page
    eyebrow={`Histórico público · Lote ${id.slice(0, 8)}`}
    title="Auditoria de lances"
    description={`${lot.data.title} - ${lot.data.authors.join(", ")}`}
  >
    <StatusMessage kind={kind}>
      <div><strong>{resultTitle}</strong><p>{explanation}</p></div>
    </StatusMessage>
    <div className="content-grid audit-grid">
      <Card>
        <div className="card-heading">
          <h3>Histórico completo</h3>
          <Link to={`/lots/${id}`}>Ver leilão -&gt;</Link>
        </div>
        {item.bids.length
          ? <div className="table-wrap"><table>
              <thead><tr><th>Seq.</th><th>Participante</th><th>Valor</th><th>Horário</th></tr></thead>
              <tbody>{item.bids.map((bid) => <tr key={bid.sequence}>
                <td>{String(bid.sequence).padStart(3, "0")}</td>
                <td>{bid.participant}</td>
                <td><MoneyDisplay value={bid.amountCents} /></td>
                <td>{new Date(bid.acceptedAt).toLocaleString("pt-BR")}</td>
              </tr>)}</tbody>
            </table></div>
          : <EmptyState
              title="Histórico vazio"
              description="O lote ainda não possui lances confirmados."
            />}
      </Card>
      <Card className="audit-summary-card">
        <h3>Resumo da verificação</h3>
        <div className="line-list">
          <div className="line-row"><span>Lances verificados</span><strong>{item.bidCount}</strong></div>
          <div className="line-row">
            <span>Verificado em</span>
            <strong>{new Date(item.verifiedAt).toLocaleString("pt-BR")}</strong>
          </div>
        </div>
        <details className="audit-technical-details">
          <summary>Ver detalhes técnicos</summary>
          <div className="audit-technical-content">
            <p>Resultado geral: <strong>{resultLabel}</strong></p>
            <ul className="audit-check-list">
              <li>
                <span>Integridade dos registros</span>
                <strong className={`audit-check-result-${checks.tone}`}>{checks.integrity}</strong>
              </li>
              <li>
                <span>Sequência dos lances</span>
                <strong className={`audit-check-result-${checks.tone}`}>{checks.sequence}</strong>
              </li>
              <li>
                <span>Assinaturas criptográficas</span>
                <strong className={`audit-check-result-${checks.tone}`}>{checks.signatures}</strong>
              </li>
            </ul>
          </div>
        </details>
      </Card>
    </div>
  </Page>;
}

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

const auctionTimeZone = "America/Sao_Paulo";
const auctionDateTimeParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: auctionTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

export function dateTimeInAuctionZone(date: Date) {
  const parts = Object.fromEntries(
    auctionDateTimeParts.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function auctionDateTimeToIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const desiredUtc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5])
  );
  let guess = desiredUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      auctionDateTimeParts.formatToParts(new Date(guess))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value])
    );
    const renderedUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    guess += desiredUtc - renderedUtc;
  }
  const date = new Date(guess);
  return Number.isNaN(date.getTime()) || dateTimeInAuctionZone(date) !== value
    ? null
    : date.toISOString();
}

export function auctionDateAndTimeToIso(date: string, time: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time)
    ? auctionDateTimeToIso(`${date}T${time}`)
    : null;
}

export function validateLotSchedule({
  startsImmediately,
  startsAt,
  endsAt,
  now = Date.now()
}: {
  startsImmediately: boolean;
  startsAt: string;
  endsAt: string;
  now?: number;
}) {
  const startIso = startsImmediately ? new Date(now).toISOString() : auctionDateTimeToIso(startsAt);
  const endIso = auctionDateTimeToIso(endsAt);
  const startTime = startIso ? new Date(startIso).getTime() : Number.NaN;
  const endTime = endIso ? new Date(endIso).getTime() : Number.NaN;
  const startError = !startsImmediately && startsAt && startTime < now
    ? "Escolha um horário futuro ou use “Iniciar imediatamente”."
    : undefined;
  const endError = endsAt && endTime <= now
    ? "O encerramento deve estar no futuro."
    : endsAt && startIso && endTime <= startTime
      ? "O encerramento deve ser posterior ao início."
      : undefined;
  return { startIso, endIso, startError, endError, valid: Boolean(startIso && endIso && !startError && !endError) };
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

type PublicationState = "IDLE" | "PUBLISHING" | "COMPLETED";

export function CreateLotPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const publishingLock = useRef(false);
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
  const [startMode, setStartMode] = useState<"IMMEDIATE" | "SCHEDULED">("IMMEDIATE");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [validationNow, setValidationNow] = useState(Date.now());
  const [publicationState, setPublicationState] = useState<PublicationState>("IDLE");

  useEffect(() => {
    const timer = setInterval(() => setValidationNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

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
  const publishing = publicationState === "PUBLISHING";
  const startsImmediately = startMode === "IMMEDIATE";
  const startsAt = startDate && startTime ? `${startDate}T${startTime}` : "";
  const endsAt = endDate && endTime ? `${endDate}T${endTime}` : "";
  const schedule = validateLotSchedule({ startsImmediately, startsAt, endsAt, now: validationNow });
  const lotMoneyError = (value: string) => !value
    ? undefined
    : BigInt(value) <= 0n
      ? "Informe um valor maior que zero."
      : BigInt(value) > 100_000_000n
        ? "O valor máximo é R$ 1.000.000,00."
        : undefined;
  const startingError = lotMoneyError(startingCents);
  const incrementError = lotMoneyError(incrementCents);
  const validLotMoney = (value: string) => Boolean(value) && !lotMoneyError(value);
  const conditionsValid = descriptionContentLength >= 10
    && validLotMoney(startingCents)
    && validLotMoney(incrementCents)
    && schedule.valid;
  const formValid = Boolean(selected) && conditionsValid;
  const currentDateTime = dateTimeInAuctionZone(new Date(validationNow));
  const minimumStartDateTime = dateTimeInAuctionZone(new Date(validationNow + 60_000));
  const endComparisonDateTime = startsImmediately ? currentDateTime : startsAt;
  const endComparisonIso = auctionDateTimeToIso(endComparisonDateTime);
  const minimumEndDateTime = endComparisonIso
    ? dateTimeInAuctionZone(new Date(Date.parse(endComparisonIso) + 60_000))
    : minimumStartDateTime;
  const minimumStartDate = minimumStartDateTime.slice(0, 10);
  const minimumStartTime = startDate === minimumStartDate ? minimumStartDateTime.slice(11) : undefined;
  const minimumEndDate = minimumEndDateTime.slice(0, 10);
  const minimumEndTime = endDate === minimumEndDate ? minimumEndDateTime.slice(11) : undefined;
  const previewDate = (value: string | null) => value ? formatAuctionDateTime(value) : "—";
  const publicationStepClass = publicationState === "COMPLETED"
    ? "done"
    : publicationState === "PUBLISHING"
      ? "processing"
      : formValid ? "active" : "";
  const publicationStepLabel = publicationState === "COMPLETED"
    ? "Concluída"
    : publicationState === "PUBLISHING"
      ? "Em processamento"
      : formValid ? "Etapa atual" : null;

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

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (publishingLock.current) return;
    const currentSchedule = validateLotSchedule({ startsImmediately, startsAt, endsAt, now: Date.now() });
    if (
      !selected
      || descriptionContentLength < 10
      || !validLotMoney(startingCents)
      || !validLotMoney(incrementCents)
      || !currentSchedule.valid
    ) {
      setValidationNow(Date.now());
      if (descriptionContentLength < 10) document.getElementById("description")?.focus();
      showToast({
        kind: "warning",
        title: "Revise os dados do lote",
        message: "Preencha os campos obrigatórios e corrija os horários antes de publicar."
      });
      return;
    }
    publishingLock.current = true;
    setPublicationState("PUBLISHING");
    let completed = false;
    try {
      const lot = await api<Lot>("/lots", {
        method: "POST",
        body: JSON.stringify({
          catalogToken: selected.catalogToken,
          description,
          condition,
          startingBidCents: startingCents,
          minimumIncrementCents: incrementCents,
          startsImmediately,
          startsAt: startsImmediately ? undefined : currentSchedule.startIso,
          endsAt: currentSchedule.endIso
        })
      });
      completed = true;
      setPublicationState("COMPLETED");
      showToast({ kind: "success", title: "Lote publicado", message: "O novo lote já está disponível na casa de leilões." });
      await new Promise((resolve) => setTimeout(resolve, 650));
      navigate(`/lots/${lot.id}`);
    } catch (caught) {
      showToast({ kind: "error", title: "Não foi possível publicar o lote", message: errorMessage(caught) });
    } finally {
      publishingLock.current = false;
      if (!completed) setPublicationState("IDLE");
    }
  };

  return <Page eyebrow="Gestão de lotes" title="Criar novo lote" description="Selecione um livro do catálogo e defina as condições do leilão.">
    <div className="steps" aria-label="Progresso da criação do lote">
      <span className={`step ${selected ? "done" : "active"}`} aria-current={!selected ? "step" : undefined}><span>1 <b>Selecionar livro</b></span><small>{selected ? "Concluída" : "Etapa atual"}</small></span>
      <span className={`step ${!selected ? "" : conditionsValid ? "done" : "active"}`} aria-current={selected && !conditionsValid ? "step" : undefined}><span>2 <b>Configurar lote</b></span>{selected && <small>{conditionsValid ? "Concluída" : "Etapa atual"}</small>}</span>
      <span className={`step ${publicationStepClass}`} aria-current={publicationState === "PUBLISHING" || publicationState === "IDLE" && formValid ? "step" : undefined} aria-busy={publishing}><span>3 <b>Publicar</b></span>{publicationStepLabel && <small>{publicationStepLabel}</small>}</span>
    </div>
    <form className="create-grid" onSubmit={publish}>
      <div className="stack">
        <Card>
          <div className="card-heading">
            <div><span className="eyebrow">Livro<span className="required-mark" aria-hidden="true"> *</span><span className="sr-only"> (obrigatório)</span></span><h3>Buscar na Open Library</h3></div>
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
                {selected && <Button className="keep-selected-book" type="button" variant="ghost" size="sm" onClick={() => setChoosingBook(false)}>Manter livro selecionado</Button>}
              </>}
        </Card>
        <Card>
          <span className="eyebrow">Condições</span><h3>Condições do exemplar</h3>
          <FormField label="Descrição do exemplar" htmlFor="description" required>
            <Textarea id="description" name="description" rows={4} minLength={10} maxLength={2000} value={description} onChange={(event) => setDescription(event.currentTarget.value)} aria-describedby="description-counter" aria-invalid={descriptionTooShort} required />
            <small id="description-counter" className={`character-counter ${descriptionCounterClass}`} aria-live="polite"><span>{descriptionFeedback}</span><span>{description.length.toLocaleString("pt-BR")}/2.000</span></small>
          </FormField>
          <FormField label="Estado de conservação" htmlFor="condition">
            <Select id="condition" name="condition" value={condition} onChange={(event) => setCondition(event.currentTarget.value as typeof condition)} required>
              <option value="EXCELLENT">Excelente</option><option value="GOOD">Bom</option><option value="FAIR">Regular</option><option value="POOR">Ruim</option>
            </Select>
          </FormField>
          <div className="form-grid">
            <FormField label="Lance inicial" htmlFor="starting" error={startingError}><MoneyInput id="starting" valueCents={startingCents} onValueChange={setStartingCents} aria-invalid={Boolean(startingError)} required /></FormField>
            <FormField label="Incremento mínimo" htmlFor="increment" error={incrementError}><MoneyInput id="increment" valueCents={incrementCents} onValueChange={setIncrementCents} aria-invalid={Boolean(incrementError)} required /></FormField>
          </div>
          <fieldset className="start-mode-field">
            <legend className="required-label">Início do leilão</legend>
            <div className="start-mode-options">
              <label className={startsImmediately ? "start-mode-option active" : "start-mode-option"}><input type="radio" name="startMode" value="IMMEDIATE" checked={startsImmediately} onChange={() => setStartMode("IMMEDIATE")} /><span><strong>Ao publicar</strong><small>O leilão começa assim que for publicado.</small></span></label>
              <label className={!startsImmediately ? "start-mode-option active" : "start-mode-option"}><input type="radio" name="startMode" value="SCHEDULED" checked={!startsImmediately} onChange={() => setStartMode("SCHEDULED")} /><span><strong>Agendar início</strong><small>Escolha uma data e um horário para começar.</small></span></label>
            </div>
          </fieldset>
          {!startsImmediately && <div className="form-grid schedule-fields">
            <FormField label="Data de início" htmlFor="startDate" required><Input id="startDate" name="startDate" type="date" min={minimumStartDate} value={startDate} onChange={(event) => setStartDate(event.currentTarget.value)} required aria-invalid={Boolean(schedule.startError)} /></FormField>
            <FormField label="Horário de início" htmlFor="startTime" error={schedule.startError} required><Input id="startTime" name="startTime" type="time" step={60} min={minimumStartTime} value={startTime} onChange={(event) => setStartTime(event.currentTarget.value)} required aria-invalid={Boolean(schedule.startError)} /></FormField>
          </div>}
          <div className="form-grid schedule-fields">
            <FormField label="Data de término" htmlFor="endDate" required><Input id="endDate" name="endDate" type="date" min={minimumEndDate} value={endDate} onChange={(event) => setEndDate(event.currentTarget.value)} required aria-invalid={Boolean(schedule.endError)} /></FormField>
            <FormField label="Horário de término" htmlFor="endTime" error={schedule.endError} required><Input id="endTime" name="endTime" type="time" step={60} min={minimumEndTime} value={endTime} onChange={(event) => setEndTime(event.currentTarget.value)} required aria-invalid={Boolean(schedule.endError)} /></FormField>
          </div>
          <p className="timezone-note">Horário de Brasília.</p>
        </Card>
      </div>
      <aside className="preview-column"><Card className="preview">
        <h3>Prévia do lote</h3>
        <div className="preview-book-summary">
          <BookCover src={selectedCoverUrl} title={selected?.title ?? "Nenhum livro selecionado"} className="preview-cover" />
          <div className="preview-book-copy"><strong>{selected?.title ?? "Selecione um livro"}</strong><span>{selected?.authors.join(", ") ?? "Pesquise e selecione um item para continuar."}</span>{selected && <Badge status={conditionLabel(condition)} />}</div>
        </div>
        <div className="preview-facts"><div><span>Lance inicial</span><strong>{startingCents ? money(startingCents) : "—"}</strong></div><div><span>Incremento</span><strong>{incrementCents ? money(incrementCents) : "—"}</strong></div><div><span>Início</span><strong>{startsImmediately ? "Imediato" : previewDate(schedule.startIso)}</strong></div><div><span>Encerramento</span><strong>{previewDate(schedule.endIso)}</strong></div></div>
        <Button className="full" size="lg" loading={publishing} disabled={!formValid || publicationState !== "IDLE"}>{publicationState === "COMPLETED" ? "Lote publicado" : publishing ? "Publicando lote…" : "Publicar lote"}</Button>
      </Card></aside>
    </form>
  </Page>;
}
