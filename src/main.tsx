import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initializeApiRuntime } from './lib/apiClient';
import { initializePersistedWorkerStateBridge } from './lib/persistedState';
import { registerNexusServiceWorker } from './lib/pwa';

const STYLE_FALLBACK_ID = "nexus-ui-fallback-link";

function ensureUtilityStyles() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const probe = document.createElement("div");
  probe.className = "hidden lg:flex flex items-center justify-between gap-4 px-4 rounded-2xl";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  document.body.appendChild(probe);

  const styles = window.getComputedStyle(probe);
  const utilitiesReady =
    styles.display === "none" &&
    styles.columnGap !== "normal" &&
    styles.paddingLeft !== "0px" &&
    styles.borderTopLeftRadius !== "0px";

  probe.remove();

  if (utilitiesReady || document.getElementById(STYLE_FALLBACK_ID)) {
    return;
  }

  const fallbackLink = document.createElement("link");
  fallbackLink.id = STYLE_FALLBACK_ID;
  fallbackLink.rel = "stylesheet";
  fallbackLink.href = "/nexus-ui-fallback.css";
  document.head.appendChild(fallbackLink);
  console.warn("[Styles] Tailwind utility layer missing at runtime. Loaded compiled fallback CSS.");
}

initializeApiRuntime();
void initializePersistedWorkerStateBridge();
void registerNexusServiceWorker();
ensureUtilityStyles();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
