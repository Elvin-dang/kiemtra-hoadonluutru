"use client";

import { InvoiceCheck, PlatformProvider } from "@kiemtra/ui";

import { webPlatform } from "./webPlatform";

export function WebApp() {
  return (
    <PlatformProvider platform={webPlatform}>
      <InvoiceCheck />
    </PlatformProvider>
  );
}
