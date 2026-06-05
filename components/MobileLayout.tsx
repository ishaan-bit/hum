import type { ReactNode } from "react";

type MobileLayoutProps = {
  children: ReactNode;
};

export default function MobileLayout({ children }: MobileLayoutProps) {
  return (
    <main className="app-shell min-h-screen overflow-x-hidden text-[#fffaf0]">
      <div className="app-frame mx-auto flex min-h-screen w-full max-w-[480px] min-w-0 flex-col pb-[calc(env(safe-area-inset-bottom)+88px)] pt-[calc(env(safe-area-inset-top)+14px)]">
        <header className="app-header shrink-0 px-4 py-2">
          <h1 className="text-[22px] font-semibold leading-7 tracking-normal">Hum</h1>
          <p>private voice ritual</p>
        </header>
        {children}
        <nav className="app-bottom-nav" aria-label="Hum sections">
          <a href="#hum-capture">Hum</a>
          <a href="#today-read">Read</a>
          <a href="#today-song-match">Song</a>
          <a href="#hum-thread">Thread</a>
        </nav>
      </div>
    </main>
  );
}
