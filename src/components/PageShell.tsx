import { AppHeader } from "./AppHeader";
import { AppFooter } from "./AppFooter";
import { MobileTabBar } from "./MobileTabBar";

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col pb-16 md:pb-0">
      <AppHeader />
      <main className="flex-1">{children}</main>
      <AppFooter />
      <MobileTabBar />
    </div>
  );
}
