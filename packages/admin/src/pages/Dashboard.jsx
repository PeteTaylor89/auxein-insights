// src/pages/Dashboard.jsx — the /session diagnostic.
//
// Started life as the Phase 1 scaffold proving the dual-token session worked;
// kept because it is the only screen showing BOTH identities side by side, which
// is exactly what you want when the admin site half-works (plan §7.1/§7.6).
// Reachable from the nav under the user menu.
import { CheckCircle2 } from 'lucide-react';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import AdminLayout from '../components/AdminLayout';

export default function Dashboard() {
  const { growUser, insightsUser } = useAdminAuth();

  return (
    <AdminLayout
      title="Session details"
      subtitle="Both identity systems this origin depends on, and what each one serves."
    >
      <div className="dash">
      <div className="dash-card">
        <h2>Session</h2>
        <p className="dash-note">
          Both halves of the session, as the app currently holds them. Either one
          missing is what produces a half-working admin site.
        </p>

        <div className="dash-grid">
          <div className="dash-half">
            <div className="dash-half-head">
              <CheckCircle2 size={15} /> Grow
            </div>
            <dl>
              <dt>Email</dt><dd>{growUser?.email}</dd>
              <dt>Name</dt><dd>{growUser?.fullName || '—'}</dd>
              <dt>Role</dt><dd><code>{growUser?.userTypeRole}</code></dd>
            </dl>
            <p className="dash-scope">Serves <code>/api/admin/*</code> and <code>/api/v1/grow-admin/*</code></p>
          </div>

          <div className="dash-half">
            <div className="dash-half-head">
              <CheckCircle2 size={15} /> Insights
            </div>
            <dl>
              <dt>Email</dt><dd>{insightsUser?.email}</dd>
              <dt>is_admin</dt><dd><code>{String(insightsUser?.is_admin)}</code></dd>
              <dt>Origin</dt><dd><code>{insightsUser?.origin || '—'}</code></dd>
            </dl>
            <p className="dash-scope">Serves <code>/api/v1/admin/*</code></p>
          </div>
        </div>
      </div>
      </div>

      <style>{`
        .dash { max-width: 900px; }
        .dash-card {
          border: 1px solid #E5E2D9; border-radius: 10px; padding: 22px; background: #fff;
        }
        .dash-card h2 { margin: 0 0 6px; font-size: 15px; }
        .dash-note { margin: 0 0 20px; font-size: 13px; color: #77736A; line-height: 1.6; }
        .dash-grid {
          display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        }
        .dash-half { border: 1px solid #E5E2D9; border-radius: 8px; padding: 14px; background: #FAF9F5; }
        .dash-half-head {
          display: flex; align-items: center; gap: 7px;
          font-weight: 700; font-size: 13px; color: #5B6830; margin-bottom: 12px;
        }
        .dash-half dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; font-size: 13px; }
        .dash-half dt { color: #77736A; }
        .dash-half dd { margin: 0; word-break: break-all; }
        .dash-scope { margin: 12px 0 0; font-size: 11px; color: #918C81; line-height: 1.5; }
        code { font-size: 12px; }
      `}</style>
    </AdminLayout>
  );
}
