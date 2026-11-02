import { BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, type ReactNode } from "react";
export const money = (value: string | null | undefined) => {
  if (value == null) return "—";
  const cents = BigInt(value);
  const absolute = cents < 0n ? -cents : cents;
  const whole = (absolute / 100n).toLocaleString("pt-BR");
  const fraction = String(absolute % 100n).padStart(2, "0");
  return `${cents < 0n ? "-" : ""}R$ ${whole},${fraction}`;
};
const conditionLabels: Record<string, string> = { EXCELLENT: "Excelente", GOOD: "Bom", FAIR: "Regular", POOR: "Ruim" };
export const conditionLabel = (condition: string) => conditionLabels[condition] ?? condition;
const auctionDateTimeFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
export const formatAuctionDateTime = (value: string | Date) => auctionDateTimeFormatter.format(new Date(value));
export function MoneyDisplay({ value, large = false }: { value: string | null | undefined; large?: boolean }) { return <span className={large ? "money money-large" : "money"}>{money(value)}</span>; }
export function Badge({ status }: { status: string }) { const labels: Record<string, string> = { LIVE: "Ao vivo", SCHEDULED: "Agendado", ENDED: "Encerrado", CANCELLED: "Cancelado", READY: "Sincronizado", PENDING: "Sincronizando", INTEGRO: "Histórico íntegro", ADULTERADO: "Histórico adulterado", INCONCLUSIVO: "Verificação inconclusiva", LEADING: "Liderando", OUTBID: "Superado", WON: "Arrematado" }; return <span className={`badge badge-${status.toLowerCase()}`}>{labels[status] ?? status}</span>; }
export function openLibraryCoverUrl(coverId: number | null | undefined) { return Number.isInteger(coverId) && Number(coverId) > 0 ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg?default=false` : null; }
export function BookCover({ src, title, className = "" }: { src?: string | null; title: string; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src && src !== failedSrc);
  return <div className={`book-cover ${className}`}>{showImage ? <span className="book-cover-media"><img src={src!} alt={`Capa de ${title}`} decoding="async" onError={() => setFailedSrc(src!)} onLoad={(event) => { if (event.currentTarget.naturalWidth <= 1 || event.currentTarget.naturalHeight <= 1) setFailedSrc(src!); }} /></span> : <div className="book-placeholder"><BookOpen /><strong>{title}</strong></div>}</div>;
}
export type Lot = { id: string; title: string; authors: string[]; coverUrl: string | null; status: string; auditState: string; currentBidCents: string | null; startingBidCents: string; effectiveEndsAt: string; serverNow: string; bidCount: number; minimumIncrementCents: string; nextMinimumCents: string; description: string; condition: string; publicationYear: number | null; isLeading?: boolean; position?: number | null; version: number };
export function lotBidLabel(lot: Pick<Lot, "status" | "currentBidCents">) {
  if (lot.currentBidCents == null) return "Lance inicial";
  return lot.status === "ENDED" ? "Lance final" : "Lance atual";
}
export function LotCard({ lot }: { lot: Lot }) { return <Link to={`/lots/${lot.id}`} className="lot-card card"><div className="lot-visual"><BookCover src={lot.coverUrl} title={lot.title} /><Badge status={lot.status} /></div><div className="lot-copy"><small>Lote {lot.id.slice(0, 8)}</small><h3>{lot.title}</h3><p>{lot.authors.join(", ")}</p><div className="lot-value"><div><small>{lotBidLabel(lot)}</small><MoneyDisplay value={lot.currentBidCents ?? lot.startingBidCents} /></div><span>{lot.bidCount} lance{lot.bidCount === 1 ? "" : "s"}</span></div></div></Link>; }
export function Metric({ label, value, note, accent = false }: { label: string; value: ReactNode; note: string; accent?: boolean }) { return <CardMetric accent={accent}><span>{label}</span><strong>{value}</strong><small>{note}</small></CardMetric>; }
function CardMetric({ children, accent }: { children: ReactNode; accent: boolean }) { return <div className={`card metric ${accent ? "metric-accent" : ""}`}>{children}</div>; }
