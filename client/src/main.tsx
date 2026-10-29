import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth";
import { DocumentPage } from "./pages/DocumentPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { NotFound } from "./pages/NotFound";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      {/* Signed-out visitors see the login screen at whatever URL they opened, so share links land on the doc after sign-in. */}
      <AuthProvider fallback={<div className="splash" />} signedOut={<LoginPage />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/d/:id" element={<DocumentPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
