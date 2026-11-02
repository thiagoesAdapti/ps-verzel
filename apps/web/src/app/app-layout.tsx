import { LogOut, Menu, Plus, Trophy, Wallet } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./auth-provider.tsx";
import { useToast } from "./toast-provider.tsx";
import { Button } from "../components/ui/index.tsx";

export function AppLayout() {
  const { user, logout } = useAuth(); const { showToast } = useToast(); const [open, setOpen] = useState(false), [leaving, setLeaving] = useState(false);
  const signOut = async () => { setLeaving(true); try { await logout(); showToast({ kind: "success", title: "Sessão encerrada", message: "Você saiu da sua conta com segurança." }); } catch (error) { showToast({ kind: "error", title: "Não foi possível sair", message: error instanceof Error ? error.message : "Tente novamente." }); } finally { setLeaving(false); } };
  return <><header className="header"><div className="header-inner"><Link className="wordmark" to="/">Casa de Leilões<span>.</span></Link><button className="menu-button" aria-label="Abrir menu" onClick={() => setOpen(!open)}><Menu /></button><nav className={open ? "nav nav-open" : "nav"} onClick={() => setOpen(false)}><NavLink to="/">Vitrine</NavLink>{user?.role === "BIDDER" && <><NavLink to="/wallet"><Wallet size={16} /> Minha carteira</NavLink><NavLink to="/my-auctions"><Trophy size={16} /> Meus arremates</NavLink></>}{user?.role === "AUCTIONEER" && <><NavLink to="/auctioneer" end>Meu painel</NavLink><NavLink to="/auctioneer/lots/new"><Plus size={16} /> Criar lote</NavLink></>}</nav><div className="account-actions">{user ? <><span className="account-name">{user.name.split(" ")[0]}</span><Button variant="ghost" size="sm" loading={leaving} onClick={() => void signOut()}><LogOut size={16} /> Sair</Button></> : <><Link className="btn btn-ghost btn-sm" to="/login">Entrar</Link><Link className="btn btn-primary btn-sm" to="/register">Criar conta</Link></>}</div></div></header><main><Outlet /></main><footer className="footer">Casa de Leilões · Disputas de livros com histórico público verificável.</footer></>;
}
export function Page({ eyebrow, title, description, actions, children }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode }) { return <div className="page"><div className="page-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions}</div>{children}</div>; }
