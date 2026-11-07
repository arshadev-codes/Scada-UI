import type { ReactNode } from 'react';
import { TopBar } from './TopBar';
import { StatusStrip } from './StatusStrip';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only z-[70] bg-accent-grad px-3 py-2 text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[1680px] flex-1 px-5 py-6">
        {children}
      </main>
      <StatusStrip />
    </div>
  );
}
