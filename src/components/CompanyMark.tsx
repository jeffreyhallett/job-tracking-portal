import { useState } from "react";

/** Company logo from the posting's domain, with a monogram fallback. */
export function CompanyMark({ company, url, size = 28, className = "" }: { company: string; url?: string; size?: number; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const host = hostOf(url);
  const hue = hashHue(company);
  // Monogram until the logo has actually loaded; a blocked or slow favicon never leaves a blank box.
  const showImg = host !== undefined && !failed && loaded;
  return (
    <span
      className={`relative inline-flex items-center justify-center shrink-0 rounded-[7px] overflow-hidden select-none ${className}`}
      style={{
        width: size,
        height: size,
        background: showImg ? "var(--c-panel)" : `oklch(0.92 0.06 ${hue})`,
        boxShadow: "inset 0 0 0 1px var(--c-line)",
        color: `oklch(0.42 0.12 ${hue})`,
        fontSize: Math.round(size * 0.42),
        fontWeight: 600,
        letterSpacing: "-0.02em",
      }}
      aria-hidden
    >
      {!showImg && initials(company)}
      {host !== undefined && !failed && (
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onLoad={(e) => {
            // Google returns a 16px globe placeholder for unknown hosts; treat that as no logo.
            if (e.currentTarget.naturalWidth <= 16) setFailed(true);
            else setLoaded(true);
          }}
          onError={() => setFailed(true)}
          style={{ width: Math.round(size * 0.64), height: Math.round(size * 0.64), objectFit: "contain", display: showImg ? "block" : "none" }}
        />
      )}
    </span>
  );
}

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const h = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
    // ATS hosts say nothing about the company; fall back to the monogram.
    if (/greenhouse\.io|lever\.co|ashbyhq\.com|workday|myworkdayjobs|smartrecruiters|icims|jobvite|linkedin\.com|simplify\.jobs|wellfound\.com|indeed\.com|glassdoor/i.test(h)) return undefined;
    return h;
  } catch {
    return undefined;
  }
}

function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return (words[0] ?? "").slice(0, 2).toUpperCase();
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}
