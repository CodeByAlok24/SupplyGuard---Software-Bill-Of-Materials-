import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export const metadata: Metadata = {
  title: "Workspace overview — SupplyGuard",
  description:
    "Monitor project inventory, SBOM coverage, license compliance, and vulnerability risk across your workspace.",
};

export default function WorkspaceLayout({ children }: LayoutProps<"/workspace">) {
  return <DashboardShell>{children}</DashboardShell>;
}
