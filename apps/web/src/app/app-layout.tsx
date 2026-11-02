import { Menu } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";

export function AppLayout() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="header">
        <div className="header-inner">
          <Link className="wordmark" to="/">Casa de Leiloes<span>.</span></Link>
          <button
            className="menu-button"
            type="button"
            aria-label="Abrir menu"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <Menu />
          </button>
          <nav className={open ? "nav nav-open" : "nav"} onClick={() => setOpen(false)}>
            <NavLink to="/">Vitrine</NavLink>
          </nav>
          <div className="account-actions">
            <Link className="btn btn-ghost btn-sm" to="/login">Entrar</Link>
            <Link className="btn btn-primary btn-sm" to="/register">Criar conta</Link>
          </div>
        </div>
      </header>
      <main><Outlet /></main>
      <footer className="footer">
        Casa de Leiloes - Disputas de livros com historico publico verificavel.
      </footer>
    </>
  );
}

export function Page({
  eyebrow,
  title,
  description,
  actions,
  children
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
