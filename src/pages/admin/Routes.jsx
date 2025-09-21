// src/pages/admin/Routes.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "../../lib/firebase";
import { useNavigate } from "react-router-dom";
import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { getCountFromServer } from "firebase/firestore";
function showNotification(message, type = "info") {
  const notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed; top: 20px; right: 20px; padding: 12px 20px;
    background: ${
      type === "success" ? "#10b981" : type === "error" ? "#ef4444" : "#4f46e5"
    };
    color: white; border-radius: 10px; font-weight: 600; z-index: 10000;
    transform: translateX(400px); transition: transform 0.3s ease;
    box-shadow: 0 8px 20px rgba(0,0,0,0.2);
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.transform = "translateX(0)";
  }, 100);
  setTimeout(() => {
    notification.style.transform = "translateX(400px)";
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}
export default function Routes() {
  const [routes, setRoutes] = useState([]);
  const [form, setForm] = useState({ name: "", start: "", end: "" });

  const [filters, setFilters] = useState({
    search: "",
    start: "ALL",
    end: "ALL",
    sortBy: "createdAt_desc", // createdAt_desc | name_asc | start_asc | end_asc
  });

  const [counts, setCounts] = useState({ total: 0 });
  const firstInputRef = useRef(null);
  const navigate = useNavigate();
  const handleLogout = () => {
    localStorage.removeItem("token");
    showNotification("Logged out successfully", "info");
    navigate("/login");
  };
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
    }
  }, [navigate]);
  useEffect(() => {
    firstInputRef.current?.focus();
    const q = query(collection(db, "routes"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setRoutes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // Server-side total using aggregation count()
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const coll = collection(db, "routes");
        const totalSnap = await getCountFromServer(coll);
        if (!mounted) return;
        setCounts({ total: totalSnap.data().count || 0 });
      } catch (e) {
        // noop
      }
    };
    refresh();
    return () => {
      mounted = false;
    };
  }, [db]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.start.trim() || !form.end.trim()) return;
    await addDoc(collection(db, "routes"), {
      name: form.name.trim(),
      start: form.start.trim(),
      end: form.end.trim(),
      createdAt: serverTimestamp(),
    });
    setForm({ name: "", start: "", end: "" });
  };

  // Distinct lists for dropdowns
  const starts = useMemo(
    () =>
      Array.from(new Set(routes.map((r) => r.start).filter(Boolean))).sort(
        (a, b) => String(a).localeCompare(String(b))
      ),
    [routes]
  );
  const ends = useMemo(
    () =>
      Array.from(new Set(routes.map((r) => r.end).filter(Boolean))).sort(
        (a, b) => String(a).localeCompare(String(b))
      ),
    [routes]
  );

  // Client-side filtering
  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return routes.filter((r) => {
      const text = `${r.name ?? ""} ${r.start ?? ""} ${
        r.end ?? ""
      }`.toLowerCase();
      if (q && !text.includes(q)) return false;
      if (filters.start !== "ALL" && r.start !== filters.start) return false;
      if (filters.end !== "ALL" && r.end !== filters.end) return false;
      return true;
    });
  }, [routes, filters]);

  // Sorting
  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (filters.sortBy === "name_asc") {
      arr.sort((a, b) =>
        String(a.name ?? "").localeCompare(String(b.name ?? ""))
      );
    } else if (filters.sortBy === "start_asc") {
      arr.sort((a, b) =>
        String(a.start ?? "").localeCompare(String(b.start ?? ""))
      );
    } else if (filters.sortBy === "end_asc") {
      arr.sort((a, b) =>
        String(a.end ?? "").localeCompare(String(b.end ?? ""))
      );
    }
    // createdAt_desc is already applied by the live query
    return arr;
  }, [filtered, filters.sortBy]);

  // Analytics: unique counts + bidirectional corridors
  const uniqueStarts = starts.length;
  const uniqueEnds = ends.length;

  const bidiPairs = useMemo(() => {
    const set = new Set(routes.map((r) => `${r.start}||${r.end}`));
    let count = 0;
    const seen = new Set();
    routes.forEach((r) => {
      const a = String(r.start ?? "");
      const b = String(r.end ?? "");
      const canon = a < b ? `${a}||${b}` : `${b}||${a}`;
      const reverse = `${b}||${a}`;
      if (!seen.has(canon) && set.has(reverse)) {
        seen.add(canon);
        count += 1;
      }
    });
    return count;
  }, [routes]);

  // CSV export (respects filters + sort)
  const exportCSV = () => {
    const header = ["Route", "Start", "End"];
    const lines = sorted.map((r) => [r.name ?? "", r.start ?? "", r.end ?? ""]);
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const csv = [
      header.map(esc).join(","),
      ...lines.map((row) => row.map(esc).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `routes_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () =>
    setFilters({
      search: "",
      start: "ALL",
      end: "ALL",
      sortBy: "createdAt_desc",
    });

  return (
    <div className="page-stack">
      {/* Add Route */}
      <section className="card glass">
        <header className="section-head">
          <h3 className="section-title">Add Route</h3>
          <span className="pill">Total (live): {routes.length}</span>
        </header>

        <form className="form-grid form-3" onSubmit={submit}>
          <label className="field">
            <span className="field-label">Route Name</span>
            <div className="input-wrap">
              <span className="input-icon">🛣️</span>
              <input
                ref={firstInputRef}
                value={form.name}
                onChange={(e) =>
                  setForm((s) => ({ ...s, name: e.target.value }))
                }
                placeholder="Delhi - Agra"
                required
                className="input"
              />
            </div>
          </label>

          <label className="field">
            <span className="field-label">Start</span>
            <div className="input-wrap">
              <span className="input-icon">🏁</span>
              <input
                value={form.start}
                onChange={(e) =>
                  setForm((s) => ({ ...s, start: e.target.value }))
                }
                placeholder="Delhi"
                required
                className="input"
              />
            </div>
          </label>

          <label className="field">
            <span className="field-label">End</span>
            <div className="input-wrap">
              <span className="input-icon">🎯</span>
              <input
                value={form.end}
                onChange={(e) =>
                  setForm((s) => ({ ...s, end: e.target.value }))
                }
                placeholder="Agra"
                required
                className="input"
              />
            </div>
          </label>

          <div className="form-actions span-3">
            <button type="submit" className="btn btn-gradient">
              Save Route
            </button>
          </div>
        </form>
      </section>

      {/* Filters + Analytics */}
      <section className="card glass">
        <header className="section-head">
          <h3 className="section-title">Filters & Analytics</h3>
          <div className="toolbar" style={{ display: "flex", gap: 12 }}>
            <button type="button" className="btn" onClick={exportCSV}>
              Export CSV
            </button>
            <button type="button" className="btn ghost" onClick={clearFilters}>
              Clear
            </button>
          </div>
        </header>

        <div className="form-grid form-3">
          <label className="field">
            <span className="field-label">Search</span>
            <div className="input-wrap">
              <span className="input-icon">🔎</span>
              <input
                value={filters.search}
                onChange={(e) =>
                  setFilters((s) => ({ ...s, search: e.target.value }))
                }
                placeholder="Search name / start / end"
                className="input"
              />
            </div>
          </label>

          <label className="field">
            <span className="field-label">Start</span>
            <div className="input-wrap">
              <span className="input-icon">🧭</span>
              <select
                value={filters.start}
                onChange={(e) =>
                  setFilters((s) => ({ ...s, start: e.target.value }))
                }
                className="input select"
              >
                <option value="ALL">All</option>
                {starts.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <label className="field">
            <span className="field-label">End</span>
            <div className="input-wrap">
              <span className="input-icon">📍</span>
              <select
                value={filters.end}
                onChange={(e) =>
                  setFilters((s) => ({ ...s, end: e.target.value }))
                }
                className="input select"
              >
                <option value="ALL">All</option>
                {ends.map((e2) => (
                  <option key={e2} value={e2}>
                    {e2}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <label className="field">
            <span className="field-label">Sort</span>
            <div className="input-wrap">
              <span className="input-icon">🔽</span>
              <select
                value={filters.sortBy}
                onChange={(e) =>
                  setFilters((s) => ({ ...s, sortBy: e.target.value }))
                }
                className="input select"
              >
                <option value="createdAt_desc">Newest</option>
                <option value="name_asc">Route A→Z</option>
                <option value="start_asc">Start A→Z</option>
                <option value="end_asc">End A→Z</option>
              </select>
            </div>
          </label>
        </div>

        {/* KPI tiles */}
        <div
          className="kpis"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0,1fr))",
            gap: 12,
            marginTop: 12,
          }}
        >
          <div className="kpi-tile">
            <div className="kpi-title">Total Routes</div>
            <div className="kpi-value">{counts.total}</div>
          </div>
          <div className="kpi-tile">
            <div className="kpi-title">Unique Starts</div>
            <div className="kpi-value">{uniqueStarts}</div>
          </div>
          <div className="kpi-tile">
            <div className="kpi-title">Unique Ends</div>
            <div className="kpi-value">{uniqueEnds}</div>
          </div>
          <div className="kpi-tile">
            <div className="kpi-title">Bidirectional Pairs</div>
            <div className="kpi-value">{bidiPairs}</div>
          </div>
        </div>
      </section>

      {/* All Routes */}
      <section className="card glass">
        <header className="section-head">
          <h3 className="section-title">All Routes</h3>
          <span className="pill">Showing: {sorted.length}</span>
        </header>

        <div className="table-wrap">
          <table className="data-table routes-table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Start</th>
                <th>End</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.start}</td>
                  <td>{r.end}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={3} className="empty-row">
                    No routes match filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
