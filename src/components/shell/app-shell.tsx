"use client";

import * as React from "react";
import { DataProvider, useAppData } from "@/components/providers/data-provider";
import { UIProvider } from "@/components/providers/ui-provider";
import { SyncProvider } from "@/components/providers/sync-provider";
import { DesktopNav, MobileNav } from "./nav";
import { Onboarding } from "./onboarding";
import { RewardsEngine } from "@/components/gamification/rewards-engine";
import { CelebrationLayer, Toaster } from "@/components/gamification/feedback";
import { CheckinSheet, QuickLogSheet, StepsSheet, WalkSheet, WaterSheet, WeightSheet } from "@/components/logging/quick-sheets";
import { FoodLoggerSheet } from "@/components/logging/food-logger";
import { ReminderScheduler, ServiceWorkerRegistrar } from "./reminders";
import { HealthAutoSync } from "@/components/activity/health-devices";

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col items-center gap-4">
        <div className="grid h-14 w-14 animate-pulse place-items-center rounded-2xl bg-lime text-lg font-black text-lime-ink">175</div>
        <p className="text-sm text-subtle">Loading your plan…</p>
      </div>
    </div>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const { data, error } = useAppData();
  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-sm">
          <p className="text-lg font-semibold">Storage unavailable</p>
          <p className="mt-2 text-sm text-muted">
            PROJECT 175 stores your data privately in this browser (IndexedDB). It may be blocked in private browsing mode. Details: {error.message}
          </p>
        </div>
      </div>
    );
  }
  if (!data) return <Splash />;
  if (!data.profile?.onboarded || !data.targets.length) return <Onboarding />;
  return (
    <div className="app-glow flex min-h-dvh">
      <DesktopNav />
      <main className="min-w-0 flex-1">{children}</main>
      <MobileNav />
      <QuickLogSheet />
      <FoodLoggerSheet />
      <WeightSheet />
      <StepsSheet />
      <WalkSheet />
      <WaterSheet />
      <CheckinSheet />
      <RewardsEngine />
      <ReminderScheduler />
      <HealthAutoSync />
      <CelebrationLayer />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  // Render nothing data-dependent on the server: all user data lives in this browser.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return <Splash />;
  return (
    <DataProvider>
      <SyncProvider>
        <UIProvider>
          <Gate>{children}</Gate>
          <Toaster />
          <ServiceWorkerRegistrar />
        </UIProvider>
      </SyncProvider>
    </DataProvider>
  );
}
