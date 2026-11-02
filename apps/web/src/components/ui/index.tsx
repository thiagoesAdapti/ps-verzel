import { AlertCircle, ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { Children, isValidElement, useEffect, useId, useLayoutEffect, useRef } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Button({ variant = "primary", size = "md", loading, children, className = "", ref, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost" | "danger"; size?: "sm" | "md" | "lg"; loading?: boolean; ref?: Ref<HTMLButtonElement> }) { return <button ref={ref} className={`btn btn-${variant} btn-${size} ${className}`} disabled={loading || props.disabled} {...props}>{loading && <LoaderCircle size={16} className="spin" />}{children}</button>; }
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) { return <div className={`card ${className}`}>{children}</div>; }
type ConfirmationModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};
export function ConfirmationModal({ open, title, description, confirmLabel = "Confirmar", cancelLabel = "Voltar", loading = false, onConfirm, onClose }: ConfirmationModalProps) {
  const titleId = useId(), descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null), cancelButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose), loadingRef = useRef(loading);
  onCloseRef.current = onClose;
  loadingRef.current = loading;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loadingRef.current) onCloseRef.current();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;
  return <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget && !loading) onClose(); }}>
    <div
      ref={dialogRef}
      className="modal-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={loading}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        if (!buttons?.length) return;
        const first = buttons[0]!, last = buttons[buttons.length - 1]!;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{description}</p>
      <div className="modal-actions">
        <Button ref={cancelButtonRef} type="button" variant="outline" disabled={loading} onClick={onClose}>{cancelLabel}</Button>
        <Button type="button" variant="danger" loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </div>
  </div>;
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input className="input" {...props} />; }
export function moneyInputCents(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? digits.replace(/^0+(?=\d)/, "") : "";
}
export function formatMoneyInput(valueCents: string) {
  const normalized = moneyInputCents(valueCents);
  if (!normalized) return "";
  const cents = BigInt(normalized);
  return `${(cents / 100n).toLocaleString("pt-BR")},${String(cents % 100n).padStart(2, "0")}`;
}
type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type" | "inputMode"> & {
  valueCents: string;
  onValueChange: (valueCents: string) => void;
};
export function MoneyInput({ valueCents, onValueChange, className = "", onFocus, onKeyDown, ...props }: MoneyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const moveCaretToEnd = (input: HTMLInputElement) => input.setSelectionRange(input.value.length, input.value.length);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement === input) moveCaretToEnd(input);
  }, [valueCents]);
  return <div className="money-input"><span aria-hidden="true">R$</span><input
    {...props}
    ref={inputRef}
    className={`input money-input-control ${className}`}
    type="text"
    inputMode="numeric"
    autoComplete="off"
    pattern="[0-9.,]*"
    placeholder="0,00"
    value={formatMoneyInput(valueCents)}
    onChange={(event) => {
      const raw = event.currentTarget.value;
      const current = moneyInputCents(valueCents);
      const next = moneyInputCents(raw);
      onValueChange(raw.length < formatMoneyInput(current).length && current.length === 1 && next === "0" ? "" : next);
    }}
    onFocus={(event) => { moveCaretToEnd(event.currentTarget); onFocus?.(event); }}
    onKeyDown={(event) => {
      if (event.key === "Backspace" && event.currentTarget.selectionStart === event.currentTarget.selectionEnd) {
        event.preventDefault();
        onValueChange(moneyInputCents(valueCents).slice(0, -1));
      }
      onKeyDown?.(event);
    }}
  /></div>;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) { return <select className="input" {...props} />; }
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className="input" {...props} />; }
export function FormField({ label, htmlFor, error, hint, required = false, children }: { label: string; htmlFor: string; error?: string; hint?: string; required?: boolean; children: ReactNode }) { const isRequired = required || Children.toArray(children).some((child) => isValidElement<{ required?: boolean }>(child) && child.props.required); return <div className="field"><label htmlFor={htmlFor} className={isRequired ? "required-label" : undefined}>{label}</label>{children}{error ? <small className="field-error">{error}</small> : hint ? <small>{hint}</small> : null}</div>; }
export function StatusMessage({ kind = "info", children }: { kind?: "info" | "success" | "warning" | "error"; children: ReactNode }) { return <div className={`message message-${kind}`} role={kind === "error" ? "alert" : "status"}><AlertCircle size={17} />{children}</div>; }
export function LoadingState({ label = "Carregando…" }: { label?: string }) { return <div className="state"><LoaderCircle className="spin" /><p>{label}</p></div>; }
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) { return <div className="state"><AlertCircle /><h3>Não foi possível carregar</h3><p>{message}</p>{retry && <Button variant="outline" onClick={retry}>Tentar novamente</Button>}</div>; }
export function EmptyState({ title, description }: { title: string; description: string }) { return <div className="state"><h3>{title}</h3><p>{description}</p></div>; }
type PaginationProps = { page: number; totalPages: number; total: number; onPageChange: (page: number) => void; label?: string };
export function paginationItems(page: number, totalPages: number): Array<number | "ellipsis-left" | "ellipsis-right"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const visible = new Set([1, totalPages, page - 1, page, page + 1].filter((item) => item >= 1 && item <= totalPages));
  const pages = [...visible].sort((a, b) => a - b);
  const result: Array<number | "ellipsis-left" | "ellipsis-right"> = [];
  pages.forEach((item, index) => {
    const previous = pages[index - 1];
    if (previous && item - previous > 1) result.push(previous === 1 ? "ellipsis-left" : "ellipsis-right");
    result.push(item);
  });
  return result;
}
export function Pagination({ page, totalPages, total, onPageChange, label = "Paginação" }: PaginationProps) {
  if (totalPages <= 1) return null;
  return <nav className="pagination" aria-label={label}>
    <span className="pagination-summary">{total} registro{total === 1 ? "" : "s"}</span>
    <div className="pagination-controls">
      <button type="button" className="pagination-arrow" aria-label="Página anterior" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={17} /></button>
      {paginationItems(page, totalPages).map((item) => typeof item === "number"
        ? <button type="button" key={item} className={item === page ? "pagination-page active" : "pagination-page"} aria-label={`Página ${item}`} aria-current={item === page ? "page" : undefined} onClick={() => onPageChange(item)}>{item}</button>
        : <span className="pagination-ellipsis" aria-hidden="true" key={item}>…</span>)}
      <button type="button" className="pagination-arrow" aria-label="Próxima página" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}><ChevronRight size={17} /></button>
    </div>
  </nav>;
}
