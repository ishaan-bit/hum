"use client";

export type HumScreenId = "hum" | "read" | "song" | "thread";

type BottomNavProps = {
  activeScreen: HumScreenId;
  onChange: (screen: HumScreenId) => void;
  readAvailable: boolean;
  songAvailable: boolean;
};

const navItems: Array<{ id: HumScreenId; label: string; mark: string }> = [
  { id: "hum", label: "Hum", mark: "01" },
  { id: "read", label: "Read", mark: "02" },
  { id: "song", label: "Song", mark: "03" },
  { id: "thread", label: "Thread", mark: "04" },
];

export default function BottomNav({ activeScreen, onChange, readAvailable, songAvailable }: BottomNavProps) {
  return (
    <nav className="app-bottom-nav" aria-label="Hum screens">
      {navItems.map((item) => {
        const active = activeScreen === item.id;
        const disabled = (item.id === "read" && !readAvailable) || (item.id === "song" && !songAvailable);

        return (
          <button
            key={item.id}
            type="button"
            aria-current={active ? "page" : undefined}
            disabled={disabled}
            onClick={() => onChange(item.id)}
            className={active ? "active" : undefined}
          >
            <span aria-hidden="true">{item.mark}</span>
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
