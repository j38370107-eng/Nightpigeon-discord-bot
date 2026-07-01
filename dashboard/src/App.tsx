import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect, createContext, useContext } from "react";
import { api } from "./lib/api";
import Home from "./pages/Home";
import Login from "./pages/Login";
import GuildSelect from "./pages/GuildSelect";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import DashboardLayout from "./components/DashboardLayout";
import YamlConfig from "./pages/dashboard/YamlConfig";
import Docs from "./pages/dashboard/Docs";
import Access from "./pages/dashboard/Access";
import DocsPage from "./pages/docs/DocsPage";

interface AuthCtx {
  user: any | null;
  loading: boolean;
  refetch: () => void;
}

export const AuthContext = createContext<AuthCtx>({ user: null, loading: true, refetch: () => {} });
export const useAuth = () => useContext(AuthContext);

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:"var(--accent)" }}>Loading…</div>;
  if (!user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = () => {
    setLoading(true);
    api.auth.me().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  };

  useEffect(() => { refetch(); }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refetch }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/servers" element={<RequireAuth><GuildSelect /></RequireAuth>} />
          <Route path="/dashboard/:guildId" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
            <Route index element={<YamlConfig />} />
            <Route path="config" element={<YamlConfig />} />
            <Route path="docs" element={<Docs />} />
            <Route path="access" element={<Access />} />
          </Route>
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/docs/:pageId" element={<DocsPage />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
