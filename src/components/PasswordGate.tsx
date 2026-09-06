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
        className="card w-full max-w-[340px] p-7 flex flex-col gap-4 rounded-lg"
        style={{ boxShadow: "var(--shadow-2)" }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <span className="w-11 h-11 rounded-[13px] bg-accent text-accent-fg inline-flex items-center justify-center" aria-hidden>
          <Icon name="briefcase" size={22} strokeWidth={2} />
        </span>
        <div>
          <div className="font-semibold text-[20px] tracking-[-0.025em]">Applications</div>
          <div className="text-[13px] text-fg-2 mt-0.5">Enter the password to continue.</div>
        </div>
        <input
          className="input h-10"
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
        {error && <div className="badge badge-danger self-start">{error}</div>}
        <div className="text-[11px] text-muted">This device stays signed in until the password changes.</div>
      </form>
    </div>
  );
}
