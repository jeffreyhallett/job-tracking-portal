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
  settings: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4",
  eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  eyeOff: "M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M6.6 6.7C4 8.4 2 12 2 12s3.5 6 10 6c1.7 0 3.2-.4 4.5-1M9.9 6.2A9.9 9.9 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-2.4 3.1",
  arrowUp: "M12 19V5M6 11l6-6 6 6",
  arrowDown: "M12 5v14M6 13l6 6 6-6",
  key: "M14.5 10a4 4 0 1 1 4-4 4 4 0 0 1-4 4ZM11.7 8.8 3 17.5V21h3.5l1-1v-2h2v-2h2l1.2-1.2",
  signOut: "M15 12H4M8 8l-4 4 4 4M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1",
  robot: "M9 3v2M15 3v2M7 7h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2ZM9.5 12h.01M14.5 12h.01M9.5 15.5h5",
  columns: "M4 5h16v14H4zM10 5v14M16 5v14",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className = "", strokeWidth = 1.75 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 ${className}`}>
      <path d={PATHS[name]} />
    </svg>
  );
}
