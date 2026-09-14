import { useState } from "react";
import { passwordProblem } from "../../shared/password";
import type { PublicUser } from "../../shared/user";
import { api, ApiError, login } from "../api";
import { Icon } from "./Icon";

/** Shell shared by the sign-in and set-a-password screens. */
function Gate({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="card w-full max-w-[360px] p-7 flex flex-col gap-4 rounded-lg" style={{ boxShadow: "var(--shadow-2)" }}>
        <span className="w-11 h-11 rounded-[13px] bg-accent text-accent-fg inline-flex items-center justify-center" aria-hidden>
          <Icon name="briefcase" size={22} strokeWidth={2} />
        </span>
        <div>
          <div className="font-semibold text-[20px] tracking-[-0.025em]">{title}</div>
          <div className="text-[13px] text-fg-2 mt-0.5">{subtitle}</div>
        </div>
        {children}
        {footer}
      </div>
    </div>
  );
}

export function SignIn({ onSignedIn }: { onSignedIn: (user: PublicUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await login(email, password));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not sign in");
      setBusy(false);
    }
  };

  return (
    <Gate
      title="Applications"
      subtitle="Sign in to your tracker."
      footer={<div className="text-[11px] text-muted">Accounts are created by the owner of this instance. This device stays signed in until you change your password.</div>}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          className="input h-10"
          type="email"
          aria-label="Email"
          placeholder="you@example.com"
          autoComplete="username"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="input h-10"
          type="password"
          aria-label="Password"
          placeholder="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="btn btn-primary h-10" disabled={!email || !password || busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {error && <div className="badge badge-danger self-start h-auto py-1.5 px-3 whitespace-normal">{error}</div>}
      </form>
    </Gate>
  );
}

/**
 * Shown when an account is still on the temporary password an admin handed over.
 * The API lets this one case through without the current password, since the
 * whole point is that somebody else chose it.
 */
export function SetPassword({ user, onDone }: { user: PublicUser; onDone: (user: PublicUser) => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = password ? passwordProblem(password) : null;
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = password.length > 0 && !problem && !mismatch && confirm.length > 0;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await api.changePassword(password));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set the password");
      setBusy(false);
    }
  };

  return (
    <Gate
      title="Choose a password"
      subtitle={`Signed in as ${user.email}. Replace the temporary password before you start.`}
      footer={<div className="text-[11px] text-muted">Changing your password signs out every other device.</div>}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          className="input h-10"
          type="password"
          aria-label="New password"
          placeholder="New password"
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          className="input h-10"
          type="password"
          aria-label="Confirm new password"
          placeholder="Confirm"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <button type="submit" className="btn btn-primary h-10" disabled={!ready || busy}>
          {busy ? "Saving…" : "Save and continue"}
        </button>
        {(problem ?? (mismatch ? "The two passwords do not match" : null) ?? error) && (
          <div className="badge badge-danger self-start h-auto py-1.5 px-3 whitespace-normal">{problem ?? (mismatch ? "The two passwords do not match" : null) ?? error}</div>
        )}
      </form>
    </Gate>
  );
}
