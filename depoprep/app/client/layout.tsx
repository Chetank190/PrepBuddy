"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Scale, LayoutDashboard, BookOpen, Mic, LogOut, Lock } from "lucide-react";

const navItems = [
  { href: "/client", label: "Dashboard", icon: LayoutDashboard, requiresTraining: false },
  { href: "/client/training", label: "Training", icon: BookOpen, requiresTraining: false },
  { href: "/client/simulation", label: "Simulation", icon: Mic, requiresTraining: true },
];

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const unlock = useQuery(
    api.moduleProgress.getTrainingUnlockStatus,
    user ? { clientId: user._id } : "skip"
  );

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace("/login");
    else if (user.role !== "client") router.replace("/lawyer");
  }, [user, isLoading, router]);

  if (isLoading || !user) return null;

  const simulationUnlocked = unlock?.allModulesPassed ?? false;

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-64 border-r bg-card flex flex-col">
        <div className="p-6 border-b">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Scale className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">PrepBuddy</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Client Portal</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon, requiresTraining }) => {
            const isActive =
              href === "/client" ? pathname === "/client" : pathname.startsWith(href);
            const locked = requiresTraining && !simulationUnlocked;

            return (
              <Link key={href} href={href}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : locked
                        ? "text-muted-foreground/70 hover:bg-accent/50"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                  title={
                    locked ? "Complete all basic training modules (≥80%) to unlock" : undefined
                  }
                >
                  <Icon className="w-4 h-4" />
                  {label}
                  {locked && <Lock className="w-3 h-3 ml-auto opacity-60" />}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              logout();
              router.replace("/login");
            }}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
