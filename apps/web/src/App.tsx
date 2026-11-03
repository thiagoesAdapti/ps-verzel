import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./app/app-layout.tsx";
import { useAuth, type User } from "./app/auth-provider.tsx";
import { LoadingState } from "./components/ui/index.tsx";
import { AuctioneerPage, CreateLotPage, HomePage, LoginPage, RegisterPage, WalletPage } from "./features/pages.tsx";

function PendingScreen({ title }: { title: string }) {
  return (
    <main className="page">
      <h1>{title}</h1>
      <p>Interface aguardando o respectivo marco de reconstrucao.</p>
    </main>
  );
}

function Protected({ role, children }: { role: User["role"]; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace />;
  return user.role === role ? children : <Navigate to="/" replace />;
}

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/lots/:id" element={<PendingScreen title="Sala de leilao" />} />
        <Route path="/lots/:id/audit" element={<PendingScreen title="Auditoria do lote" />} />
        <Route path="/receipts/:token" element={<PendingScreen title="Comprovante publico" />} />
        <Route path="/wallet" element={<Protected role="BIDDER"><WalletPage /></Protected>} />
        <Route path="/my-auctions" element={<Protected role="BIDDER"><PendingScreen title="Meus leiloes" /></Protected>} />
        <Route path="/auctioneer" element={<Protected role="AUCTIONEER"><AuctioneerPage /></Protected>} />
        <Route path="/auctioneer/lots/new" element={<Protected role="AUCTIONEER"><CreateLotPage /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
