// src/pages/admin/Buses.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "../../lib/firebase";
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

export default function Buses() {
  const [buses, setBuses] = useState([]);
  const [form, setForm] = useState({
    number: "",
    route: "",
    driver: "",
    status: "ACTIVE",
    occupancy: 0,
  });
  const [filters, setFilters] = useState({
    search: "",
    route: "ALL",
    driver: "ALL",
    status: "ALL",
    occMin: 0,
    occMax: 100,
    sortBy: "createdAt_desc", // createdAt_desc | occupancy_desc | occupancy_asc | number_asc
  });
  const [counts, setCounts] = useState({
    total: 0,
    active: 0,
    maintenance: 0,
    ghost: 0,
  });
  const firstInputRef = useRef(null);

  // Focus + live subscription (already ordered by createdAt desc)
  useEffect(() => {
    firstInputRef.current?.focus();
    const q = query(collection(db, "buses"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBuses(rows);
    });
    return () => unsub();
  }, []);

  // Server-side counts using Firestore count() aggregation
  useEffect(() => {
    let isMounted = true;
    const refreshCounts = async () => {
      try {
        const coll = collection(db, "buses");
        const [totalSnap, activeSnap, maintSnap, ghostSnap] = await Promise.all([
          getCountFromServer(coll),
          getCountFromServer(query(coll, where("status", "==", "ACTIVE"))),
          getCountFromServer(query(coll, where("status", "==", "MAINTENANCE"))),
          getCountFromServer(query(coll, where("status", "==", "GHOST BUS"))),
        ]);
        if (!isMounted) return;
        setCounts({
          total: totalSnap.data().count || 0,
          active: activeSnap.data().count || 0,
          maintenance: maintSnap.data().count || 0,
          ghost: ghostSnap.data().count || 0,
        });
      } catch (e) {
        // fail-soft: keep old counts
      }
    };
    refreshCounts();
    // Optional: re-run on interval if desired
    // const t = setInterval(refreshCounts, 20000);
    // return () => { isMounted = false; clearInterval(t); };
    return () => {
      isMounted = false;
    };
  }, [db]);

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      number: form.number.trim(),
      route: form.route.trim(),
      driver: form.driver.trim(),
      status: form.status,
      occupancy: Number(form.occupancy) || 0,
      createdAt: serverTimestamp(),
    };
    if (!payload.number || !payload.route || !payload.driver) return;
    await addDoc(collection(db, "buses"), payload);
    setForm({ number: "", route: "", driver: "", status: "ACTIVE", occupancy: 0 });
  };

  const statusClass = (s) =>
    s === "ACTIVE" ? "status-badge ok" : s === "MAINTENANCE" ? "status-badge maint" : "status-badge ghost";

  // Derived lists for dropdowns
  const routes = useMemo(
    () => Array.from(new Set(buses.map((b) => b.route).filter(Boolean))).sort(),
    [buses]
  );
  const drivers = useMemo(
    () => Array.from(new Set(buses.map((b) => b.driver).filter(Boolean))).sort(),
    [buses]
  );

  // Client-side filtering
  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return buses.filter((b) => {
      const occ = Number(b.occupancy ?? 0);
      const text = `${b.number ?? ""} ${b.route ?? ""} ${b.driver ?? ""}`.toLowerCase();
      if (q && !text.includes(q)) return false;
      if (filters.route !== "ALL" && b.route !== filters.route) return false;
      if (filters.driver !== "ALL" && b.driver !== filters.driver) return false;
      if (filters.status !== "ALL" && b.status !== filters.status) return false;
      if (occ < filters.occMin || occ > filters.occMax) return false;
      return true;
    });
  }, [buses, filters]);

  // Sorting for specific fields (createdAt already sorted by subscription)
  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (filters.sortBy === "occupancy_desc") {
      arr.sort((a, b) => (Number(b.occupancy ?? 0) - Number(a.occupancy ?? 0)));
    } else if (filters.sortBy === "occupancy_asc") {
      arr.sort((a, b) => (Number(a.occupancy ?? 0) - Number(b.occupancy ?? 0)));
    } else if (filters.sortBy === "number_asc") {
      arr.sort((a, b) => String(a.number ?? "").localeCompare(String(b.number ?? "")));
    }
    return arr;
  }, [filtered, filters.sortBy]);

  // Quick KPIs from current data
  const avgOccupancy = useMemo(() => {
    if (!buses.length) return 0;
    const sum = buses.reduce((acc, b) => acc + Number(b.occupancy ?? 0), 0);
    return Math.round((sum / buses.length) * 10) / 10;
  }, [buses]);
  const highUtil = useMemo(() => buses.filter((b) => Number(b.occupancy ?? 0) >= 80).length, [buses]);

  const exportCSV = () => {
    const header = ["Bus Number", "Route", "Driver", "Status", "Occupancy"];
    const lines = sorted.map((b) => [
      String(b.number ?? ""),
      String(b.route ?? ""),
      String(b.driver ?? ""),
      String(b.status ?? ""),
      String(b.occupancy ?? 0),
    ]);
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const csv = [header.map(esc).join(","), ...lines.map((r) => r.map(esc).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `buses_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () =>
    setFilters({ search: "", route: "ALL", driver: "ALL", status: "ALL", occMin: 0, occMax: 100, sortBy: "createdAt_desc" });

  return (
    <div className="page-stack">
      {/* Add Bus */}
      <section className="card glass">
        <header className="section-head">
          <h3 className="section-title">Add Bus</h3>
          <span className="pill">Total: {buses.length}</span>
        </header>

        <form className="form-grid form-3" onSubmit={submit}>
          <label className="field">
            <span className="field-label">Bus Number</span>
            <div className="input-wrap">
              <span className="input-icon">🚌</span>
              <input
                ref={firstInputRef}
                value={form.number}
                onChange={(e) => setForm((s) => ({ ...s, number: e.target.value }))}
                placeholder="UP 32 AB 1234"
                required
                className="input"
              />
            </div>
          </label>

          <label className="field">
            <span className="field-label">Route</span>
            <div className="input-wrap">
              <span className="input-icon">🗺️</span>
              <input
                value={form.route}
                onChange={(e) => setForm((s) => ({ ...s, route: e.target.value }))}
                placeholder="Delhi - Agra"
                required
                className="input"
              />
            </div>
          </label>

          <label className="field">
            <span className="field-label">Driver</span>
            <div className="input-wrap">
              <span className="input-icon">👤</span>
              <input
                value={form.driver}
                onChange={(e) => setForm((s) => ({ ...s, driver: e.target.value }))}
                placeholder="राम कुमार"
                required
                className="input"
              />
            </div>
          </label>

          <label className="field">
            <span className="field-label">Status</span>
            <div className="input-wrap">
              <span className="input-icon">⚙️</span>
              <select
                value={form.status}
                onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}
                className="input select"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
                <option value="GHOST BUS">GHOST BUS</option>
              </select>
            </div>
          </label>

          <label className="field">
            <span className="field-label">Occupancy %</span>
            <div className="input-wrap">
              <span className="input-icon">📈</span>
              <input
                type="number"
                min={0}
                max={100}
                value={form.occupancy}
                onChange={(e) => setForm((s) => ({ ...s, occupancy: e.target.value }))}
                className="input"
              />
            </div>
          </label>

          <div className="form-actions span-3">
            <button type="submit" className="btn btn-gradient">Save Bus</button>
          </div>
        </form>
      </section>

      {/* Filters + Analytics */}
      <section className="card glass">
        <header className="section-head">
          <h3 className="section-title">Filters & Analytics</h3>
          <div className="toolbar" style={{ display: "flex", gap: 12 }}>
            <button type="button" className="btn" onClick={exportCSV}>Export CSV</button>
            <button type="button" className="btn ghost" onClick={clearFilters}>Clear</button>
          </div>
        </header>

        <div className="form-grid form-3">
          <label className="field">
            <span className="field-label">Search</span>
            <div className="input-wrap">
              <span className="input-icon">🔎</span>
              <input
                value={filters.search}
                onChange={(e) => setFilters((s) => ({ ...s, search: e.target.value }))}
                placeholder="Search number / route / driver"
                className="input"
              />
            </div>
          </label>

          <label className="field">
            <span className="field-label">Route</span>
            <div className="input-wrap">
              <span className="input-icon">🧭</span>
              <select
                value={filters.route}
                onChange={(e) => setFilters((s) => ({ ...s, route: e.target.value }))}
                className="input select"
              >
                <option value="ALL">All</option>
                {routes.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </label>

          <label className="field">
            <span className="field-label">Driver</span>
            <div className="input-wrap">
              <span className="input-icon">🚖</span>
              <select
                value={filters.driver}
                onChange={(e) => setFilters((s) => ({ ...s, driver: e.target.value }))}
                className="input select"
              >
                <option value="ALL">All</option>
                {drivers.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </label>

          <label className="field">
            <span className="field-label">Status</span>
            <div className="input-wrap">
              <span className="input-icon">📦</span>
              <select
                value={filters.status}
                onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value }))}
                className="input select"
              >
                <option value="ALL">All</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
                <option value="GHOST BUS">GHOST BUS</option>
              </select>
            </div>
          </label>

          <label className="field">
            <span className="field-label">Occupancy Range</span>
            <div className="input-wrap">
              <span className="input-icon">🎚️</span>
              <div className="range-wrap" style={{ display: "flex", gap: 8, width: "100%" }}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={filters.occMin}
                  onChange={(e) => setFilters((s) => ({ ...s, occMin: Number(e.target.value) }))}
                  className="input"
                  style={{ maxWidth: 90 }}
                />
                <span style={{ alignSelf: "center" }}>to</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={filters.occMax}
                  onChange={(e) => setFilters((s) => ({ ...s, occMax: Number(e.target.value) }))}
                  className="input"
                  style={{ maxWidth: 90 }}
                />
              </div>
            </div>
          </label>

          <label className="field">
            <span className="field-label">Sort</span>
            <div className="input-wrap">
              <span className="input-icon">🔽</span>
              <select
                value={filters.sortBy}
                onChange={(e) => setFilters((s) => ({ ...s, sortBy: e.target.value }))}
                className="input select"
              >
                <option value="createdAt_desc">Newest</option>
                <option value="occupancy_desc">Occupancy High→Low</option>
                <option value="occupancy_asc">Occupancy Low→High</option>
                <option value="number_asc">Bus Number A→Z</option>
              </select>
            </div>
          </label>
        </div>

        {/* KPI tiles */}
        <div className="kpis" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 12, marginTop: 12 }}>
          <div className="kpi-tile">
            <div className="kpi-title">Total</div>
            <div className="kpi-value">{counts.total}</div>
          </div>
          <div className="kpi-tile">
            <div className="kpi-title">Active</div>
            <div className="kpi-value">{counts.active}</div>
          </div>
          <div className="kpi-tile">
            <div className="kpi-title">Maintenance</div>
            <div className="kpi-value">{counts.maintenance}</div>
          </div>
          <div className="kpi-tile">
            <div className="kpi-title">Ghost</div>
            <div className="kpi-value">{counts.ghost}</div>
          </div>
          <div className="kpi-tile">
            <div className="kpi-title">Avg Occupancy</div>
            <div className="kpi-value">{avgOccupancy}%</div>
          </div>
        </div>
        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>
          High utilization (≥80%): {highUtil}
        </div>
      </section>

      {/* All Buses */}
      <section className="card glass">
        <header className="section-head">
          <h3 className="section-title">All Buses</h3>
          <span className="pill">Showing: {sorted.length}</span>
        </header>

        <div className="table-wrap">
          <table className="data-table buses-table">
            <thead>
              <tr>
                <th>Bus Number</th>
                <th>Route</th>
                <th>Driver</th>
                <th>Status</th>
                <th>Occupancy</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((b) => (
                <tr key={b.id}>
                  <td>{b.number}</td>
                  <td>{b.route}</td>
                  <td>{b.driver}</td>
                  <td><span className={statusClass(b.status)}>{b.status}</span></td>
                  <td>
                    <div className="meter">
                      <div
                        className={`meter-fill ${Number(b.occupancy ?? 0) >= 80 ? "hi" : Number(b.occupancy ?? 0) >= 50 ? "mid" : "lo"}`}
                        style={{ width: `${b.occupancy ?? 0}%` }}
                      />
                    </div>
                    <span className="meter-val">{b.occupancy ?? 0}%</span>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-row">No buses match filters</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
