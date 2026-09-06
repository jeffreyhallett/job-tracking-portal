import { useState } from "react";
import { ApiError, login } from "../api";
import { Icon } from "./Icon";

export function PasswordGate({ onAuthed }: { onAuthed: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(password);
      onAuthed();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? "Wrong password" : e instanceof Error ? e.message : "Could not sign in");
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <form
        className="glass glass-strong w-full max-w-[340px] p-7 flex flex-col gap-4 rounded-lg"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <span className="relative w-12 h-12 rounded-[14px] bg-accent text-accent-fg inline-flex items-center justify-center" style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,.45), 0 6px 18px color-mix(in srgb, var(--c-accent) 40%, transparent)" }} aria-hidden>
          <Icon name="briefcase" size={24} strokeWidth={2} />
        </span>
        <div className="relative">
          <div className="font-bold text-[24px] tracking-[-0.03em]">Applications</div>
          <div className="text-[13px] text-fg-2 mt-0.5">Enter the password to continue.</div>
        </div>
        <input
          className="input h-10 relative"
          type="password"
          aria-label="Password"
          placeholder="Password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="btn btn-primary h-10" disabled={!password || busy}>
          {busy ? "Checking…" : "Continue"}
        </button>
        {error && <div className="badge badge-danger self-start relative">{error}</div>}
        <div className="text-[11px] text-muted relative">This device stays signed in until the password changes.</div>
      </form>
    </div>
  );
}
