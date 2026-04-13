import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SettingsProvider } from "./contexts/SettingsContext";
import { App } from "./App";
import "./global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </StrictMode>
);
