import { useState } from "react";
import { ApiError, login } from "../api";

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
        className="card w-full max-w-[320px] p-6 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <div className="font-semibold text-[17px] tracking-[-0.02em]">Applications</div>
          <div className="text-[12px] text-fg-2 mt-0.5">Enter the password to continue.</div>
        </div>
        <input
          className="input"
          type="password"
          aria-label="Password"
          placeholder="Password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={!password || busy}>
          {busy ? "Checking…" : "Continue"}
        </button>
        {error && <div className="text-[12px] text-danger">{error}</div>}
        <div className="text-[11px] text-muted">This device stays signed in until the password changes.</div>
      </form>
    </div>
  );
}
