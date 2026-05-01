import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { FoodCartProvider } from "@/hooks/useFoodCart";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "HatodGo — Food, Padala, Pabili & Ride in Balamban" },
      { name: "description", content: "All-in-one delivery, errand and ride app for Balamban, Toledo and Asturias." },
      { name: "author", content: "HatodGo" },
      { property: "og:title", content: "HatodGo — Food, Padala, Pabili & Ride in Balamban" },
      { property: "og:description", content: "All-in-one delivery, errand and ride app for Balamban, Toledo and Asturias." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "HatodGo — Food, Padala, Pabili & Ride in Balamban" },
      { name: "twitter:description", content: "All-in-one delivery, errand and ride app for Balamban, Toledo and Asturias." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/wZiTqJXzNLZljua9qZ0Bdec2esA3/social-images/social-1777381155290-ChatGPT_Image_Apr_28,_2026,_08_58_49_AM.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/wZiTqJXzNLZljua9qZ0Bdec2esA3/social-images/social-1777381155290-ChatGPT_Image_Apr_28,_2026,_08_58_49_AM.webp" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <FoodCartProvider>
      <Outlet />
      <Toaster richColors position="top-center" />
    </FoodCartProvider>
  );
}
