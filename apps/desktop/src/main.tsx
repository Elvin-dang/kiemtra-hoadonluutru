import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { InvoiceCheck, PlatformProvider } from "@kiemtra/ui";

import { desktopPlatform } from "./desktopPlatform";

import "./main.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <PlatformProvider platform={desktopPlatform}>
      <InvoiceCheck />
    </PlatformProvider>
  </StrictMode>,
);
