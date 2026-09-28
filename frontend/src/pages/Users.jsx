import { useEffect, useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../api/auth";
import { useToast } from "../components/Toast";
import Modal from "../components/Modal";
import { SkeletonRows } from "../components/Skeleton";
import { initials, titleCase } from "../lib/format";

const ROLES = [
  { value: "ANALYST", hint: "Triage alerts, submit verdicts, run simulations" },
  { value: "ADMIN", hint: "Everything, plus user management and demo data" },
  { value: "VIEWER", hint: "Read-only dashboards and reports" },
];
const ROLE_PILL = { ADMIN: "pill-critical", ANALYST: "pill-info", VIEWER: "" };

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "ANALYST" });
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  function load() {
    api.listUsers().then(setUsers).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleCreate(e) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await api.createUser(form);
      toast?.push({ type: "success", title: `Added ${form.name}` });
      setForm({ name: "", email: "", password: "", role: "ANALYST" });
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await api.deleteUser(target.id);
      toast?.push({ type: "success", title: `Removed ${target.name}` });
      load();
    } catch (err) {
      toast?.push({ type: "critical", title: "Could not remove the user", message: err.message });
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p>Decide who can sign in to the console and what they can do.</p>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="users-grid">
        <section className="card card-pad" aria-label="Add a user">
          <h2 className="card-title" style={{ marginBottom: 14 }}>Add a user</h2>
          <form onSubmit={handleCreate}>
            <div className="field">
              <label htmlFor="u-name">Name</label>
              <input id="u-name" className="input" value={form.name} onChange={set("name")} required />
            </div>
            <div className="field">
              <label htmlFor="u-email">Email</label>
              <input id="u-email" className="input" type="email" value={form.email} onChange={set("email")} required autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="u-password">Temporary password</label>
              <input id="u-password" className="input" type="password" value={form.password} onChange={set("password")} required minLength={8} autoComplete="new-password" />
              <span className="field-hint">At least 8 characters. Ask them to change it after signing in.</span>
            </div>
            <div className="field">
              <label htmlFor="u-role">Role</label>
              <select id="u-role" className="select" value={form.role} onChange={set("role")}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{titleCase(r.value)}</option>
                ))}
              </select>
              <span className="field-hint">{ROLES.find((r) => r.value === form.role)?.hint}</span>
            </div>

            {formError && <div className="error-banner" role="alert" style={{ marginTop: 14 }}>{formError}</div>}

            <button className="btn btn-primary btn-block" style={{ marginTop: 18 }} type="submit" disabled={submitting}>
              <UserPlus size={16} aria-hidden="true" /> {submitting ? "Adding…" : "Add user"}
            </button>
          </form>
        </section>

        <section className="card" aria-label="All users">
          <div className="card-head">
            <div>
              <h2 className="card-title">Accounts</h2>
              <div className="card-sub">{users ? `${users.length} with access` : "Loading…"}</div>
            </div>
          </div>
          <div className="table-wrap" style={{ paddingTop: 14 }}>
            <table className="table">
              <thead>
                <tr><th>Person</th><th>Role</th><th className="right"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {users === null && <SkeletonRows rows={4} cols={3} />}
                {users?.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="cell-main">
                        <span className="avatar">{initials(u.name)}</span>
                        <div>
                          <div className="cell-title">{u.name}{u.id === me?.id && <span className="muted"> (you)</span>}</div>
                          <div className="cell-sub">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className={`pill ${ROLE_PILL[u.role]}`}>{titleCase(u.role)}</span></td>
                    <td className="right">
                      {u.id !== me?.id && (
                        <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => setPendingDelete(u)} aria-label={`Remove ${u.name}`}>
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {pendingDelete && (
        <Modal title="Remove access" onClose={() => setPendingDelete(null)} width={400}>
          <p style={{ margin: "0 0 18px", color: "var(--ink-2)" }}>
            <strong style={{ color: "var(--ink)" }}>{pendingDelete.name}</strong> ({pendingDelete.email}) will no longer be able to sign in.
            Their past verdicts stay in the record.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-outline" onClick={() => setPendingDelete(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={confirmDelete}>Remove access</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
