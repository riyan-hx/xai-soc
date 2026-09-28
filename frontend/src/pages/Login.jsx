import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Eye, EyeOff, FlaskConical, ShieldCheck } from "lucide-react";
import { useAuth } from "../api/auth";

// Static illustration of the product's core idea. Values are made up for the
// picture and labelled as such; nothing here is read from the API.
const SAMPLE = [
  { name: "DNS query length mean", value: 0.31, dir: 1 },
  { name: "DNS queries per session", value: 0.24, dir: 1 },
  { name: "DNS query entropy", value: 0.17, dir: 1 },
  { name: "Unique dest ports", value: 0.06, dir: -1 },
  { name: "Flow packets per sec", value: 0.04, dir: -1 },
];

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { login, token, ready } = useAuth();
  const navigate = useNavigate();

  if (ready && token) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login">
      <section className="login-form-side">
        <div className="brand" style={{ marginBottom: 56 }}>
          <span className="brand-mark">
            <ShieldCheck size={19} strokeWidth={2.2} />
          </span>
          <span className="brand-name">SOC Console</span>
        </div>

        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <h1>Sign in</h1>
          <p className="muted" style={{ marginTop: 6, marginBottom: 28 }}>
            Triage alerts with the reasoning in front of you.
          </p>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="you@company.com"
              disabled={submitting}
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="password-wrap">
              <input
                id="password"
                className="input"
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={submitting}
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={show ? "Hide password" : "Show password"}
                onClick={() => setShow((s) => !s)}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="error-banner" role="alert" style={{ marginTop: 16 }}>
              {error}
            </div>
          )}

          <button className="btn btn-primary btn-block" style={{ marginTop: 22, height: 44 }} type="submit" disabled={submitting || !email || !password}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>

          <p className="field-hint" style={{ marginTop: 18 }}>
            First run? The README explains the seeded admin account. Change its password after signing in.
          </p>
        </form>
      </section>

      <section className="login-art" aria-hidden="true">
        <div className="login-art-inner">
          <h2>Every alert comes with its reasons.</h2>
          <p>
            The model names the traffic, then shows which measurements pushed it there, so you can agree, argue, or
            dismiss it in seconds.
          </p>

          <div className="card login-sample">
            <div className="card-head" style={{ paddingTop: 14 }}>
              <div>
                <div className="card-title" style={{ fontSize: 14 }}>DNS tunneling</div>
                <div className="card-sub">Why the model said so</div>
              </div>
              <span className="pill pill-critical">
                <span className="pdot" /> Critical
              </span>
            </div>
            <div className="card-body">
              {SAMPLE.map((r) => (
                <div key={r.name} className="login-bar-row">
                  <span>{r.name}</span>
                  <span className="login-bar-track">
                    <span
                      className="login-bar-fill"
                      style={{
                        width: `${(r.value / 0.31) * 50}%`,
                        [r.dir > 0 ? "left" : "right"]: "50%",
                        background: r.dir > 0 ? "var(--accent)" : "var(--ink-3)",
                      }}
                    />
                  </span>
                </div>
              ))}
            </div>
            <div className="login-sample-note">
              <FlaskConical size={13} /> Illustration with made-up values
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
