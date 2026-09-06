// Small outline icon set, Material-Symbols-like: 24 viewBox, 1.75 stroke, round joins.
const PATHS = {
  search: "M10.5 3.5a7 7 0 1 1 0 14 7 7 0 0 1 0-14ZM15.5 15.5 20.5 20.5",
  plus: "M12 5v14M5 12h14",
  sync: "M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4",
  help: "M9.5 9.5a2.5 2.5 0 1 1 3.6 2.24c-.7.35-1.1.9-1.1 1.76M12 17h.01M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z",
  close: "M6 6l12 12M18 6 6 18",
  clock: "M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z",
  calendar: "M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  copy: "M9 9h10v10H9zM5 15V5h10",
  keyboard: "M4 7h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1ZM7 10h.01M11 10h.01M15 10h.01M7 13h.01M17 13h.01M10 13h4",
  pin: "M12 21s-6-5.33-6-10a6 6 0 1 1 12 0c0 4.67-6 10-6 10ZM12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z",
  people: "M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM20 19v-1.5a3.5 3.5 0 0 0-2.5-3.36M15.5 4.6a3 3 0 0 1 0 5.8",
  notes: "M8 4h8a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2ZM9 9h6M9 13h4",
  timeline: "M12 3v18M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM12 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  link: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 1 0-5.66-5.66l-1.5 1.5M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 1 0 5.66 5.66l1.5-1.5",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  chevron: "M8 10l4 4 4-4",
  check: "M5 12.5 9.5 17 19 7.5",
  undo: "M9 14 4 9l5-5M4 9h9a6 6 0 0 1 0 12h-2",
  briefcase: "M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9ZM4 13h16",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className = "", strokeWidth = 1.75 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 ${className}`}>
      <path d={PATHS[name]} />
    </svg>
  );
}
