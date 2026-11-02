import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.tsx";
import { ToastProvider } from "./app/toast-provider.tsx";
import "./styles/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Elemento raiz da aplicacao nao encontrado.");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
);
