import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./app/app-layout.tsx";

function PendingScreen({ title }: { title: string }) {
  return (
    <main>
      <h1>{title}</h1>
      <p>Interface aguardando o respectivo marco de reconstrucao.</p>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<PendingScreen title="Vitrine de leiloes" />} />
        <Route path="/login" element={<PendingScreen title="Entrar" />} />
        <Route path="/register" element={<PendingScreen title="Criar conta" />} />
        <Route path="/lots/:id" element={<PendingScreen title="Sala de leilao" />} />
        <Route path="/lots/:id/audit" element={<PendingScreen title="Auditoria do lote" />} />
        <Route path="/receipts/:token" element={<PendingScreen title="Comprovante publico" />} />
        <Route path="/wallet" element={<PendingScreen title="Carteira" />} />
        <Route path="/my-auctions" element={<PendingScreen title="Meus leiloes" />} />
        <Route path="/auctioneer" element={<PendingScreen title="Gestao do leiloeiro" />} />
        <Route path="/auctioneer/lots/new" element={<PendingScreen title="Novo lote" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
