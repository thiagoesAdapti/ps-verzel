import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

export type ToastKind = "success" | "error" | "warning" | "info";
export type ToastInput = { kind: ToastKind; title: string; message?: string; duration?: number };
type ToastItem = ToastInput & { id: number; duration: number };
type ToastContextValue = { showToast(input: ToastInput): number; dismissToast(id: number): void };

const ToastContext = createContext<ToastContextValue | null>(null);
let nextToastId = 0;

const icons = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info
};

function Toast({ item, dismiss }: { item: ToastItem; dismiss: (id: number) => void }) {
  const Icon = icons[item.kind];
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(item.id), item.duration);
    return () => window.clearTimeout(timer);
  }, [dismiss, item.duration, item.id]);
  return <div
    className={`toast toast-${item.kind}`}
    role={item.kind === "error" ? "alert" : "status"}
    style={{ "--toast-duration": `${item.duration}ms` } as CSSProperties}
  >
    <span className="toast-icon" aria-hidden="true"><Icon size={20} /></span>
    <div className="toast-content"><strong>{item.title}</strong>{item.message && <p>{item.message}</p>}</div>
    <button className="toast-close" type="button" aria-label="Fechar notificação" onClick={() => dismiss(item.id)}><X size={16} /></button>
  </div>;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dismissToast = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const showToast = useCallback((input: ToastInput) => {
    const id = ++nextToastId;
    const duration = input.duration ?? (input.kind === "success" ? 4_500 : 6_000);
    setToasts((current) => [...current, { ...input, id, duration }].slice(-4));
    return id;
  }, []);
  const value = useMemo(() => ({ showToast, dismissToast }), [dismissToast, showToast]);
  return <ToastContext.Provider value={value}>{children}<div className="toast-region" aria-label="Notificações">{toasts.map((toast) => <Toast key={toast.id} item={toast} dismiss={dismissToast} />)}</div></ToastContext.Provider>;
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("ToastProvider ausente");
  return value;
}
