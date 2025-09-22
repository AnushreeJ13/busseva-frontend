// src/pages/admin/DashboardHome.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bus,
  Users,
  AlertTriangle,
  TrendingUp,
  MapPin,
  AlertCircle,
  Clock,
} from "lucide-react";
import StatCard from "../../components/StatCard";
import { db } from "../../lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  where,
  limit,
  getCountFromServer,
  getAggregateFromServer,
  sum,
} from "firebase/firestore";
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
function getStatusColorClass(status) {
  switch (status) {
    case "ACTIVE":
      return "status-active";
    case "MAINTENANCE":
      return "status-maintenance";
    case "GHOST BUS":
      return "status-ghost";
    default:
      return "";
  }
}

function getOccupancyColorClass(occupancy) {
  if (Number(occupancy) >= 80) return "occupancy-high";
  if (Number(occupancy) >= 50) return "occupancy-medium";
  return "";
}

function timeAgo(d) {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins > 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

export default function DashboardHome() {
  const [buses, setBuses] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [counts, setCounts] = useState({ total: 0, ghost: 0 });
  const navigate = useNavigate();
  const [todayRevenue, setTodayRevenue] = useState(null); // null => loading, number => ₹

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

  // Live buses
  useEffect(() => {
    const q = query(collection(db, "buses"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBuses(rows);
    });
    return () => unsub();
  }, []);

  // Live alerts (latest 10)
  useEffect(() => {
    const q = query(
      collection(db, "alerts"),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAlerts(rows);
    });
    return () => unsub();
  }, []);

  // Aggregation counts
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const coll = collection(db, "buses");
        const [totalSnap, ghostSnap] = await Promise.all([
          getCountFromServer(coll),
          getCountFromServer(query(coll, where("status", "==", "GHOST BUS"))),
        ]);
        if (!mounted) return;
        setCounts({
          total: totalSnap.data().count || 0,
          ghost: ghostSnap.data().count || 0,
        });
      } catch {
        // soft-fail
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, []);

  // Today's revenue via SUM(amount) on payments between [startOfDay, nextDay)
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const now = new Date();
        const start = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          0,
          0,
          0,
          0
        );
        const end = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + 1,
          0,
          0,
          0,
          0
        );
        const base = collection(db, "payments"); // expects { amount: number, createdAt: Timestamp }
        const q = query(
          base,
          where("createdAt", ">=", start),
          where("createdAt", "<", end)
        );
        const aggSnap = await getAggregateFromServer(q, {
          total: sum("amount"),
        });
        if (!mounted) return;
        const val = aggSnap.data().total ?? 0;
        setTodayRevenue(Number(val));
      } catch {
        // If collection/field missing, show null and render "—"
        setTodayRevenue(0);
      }
    };
    run();
    // optional: refresh periodically
    // const t = setInterval(run, 30000);
    return () => {
      mounted = false;
      // clearInterval(t);
    };
  }, []);

  // Derived: active drivers (unique among ACTIVE buses)
  const activeDrivers = useMemo(() => {
    const set = new Set(
      buses
        .filter((b) => b.status === "ACTIVE")
        .map((b) => b.driver)
        .filter(Boolean)
    );
    return set.size;
  }, [buses]);

  // Prepare live table rows (fallback to createdAt when updatedAt missing)
  const busRows = useMemo(() => {
    return buses.slice(0, 10).map((b) => {
      const ts = b.updatedAt?.toDate?.() || b.createdAt?.toDate?.() || null;
      return {
        number: b.number ?? "—",
        route: b.route ?? "—",
        driver: b.driver ?? "—",
        status: b.status ?? "—",
        occupancy: Number(b.occupancy ?? 0),
        lastUpdateText: timeAgo(ts),
      };
    });
  }, [buses]);

  const currency = (n) => {
    if (n == null) return "—";
    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(n);
    } catch {
      return `₹${n}`;
    }
  };

  return (
    <>
      <div className="stats-grid">
        <StatCard title="Total Buses" value={String(counts.total)} icon={Bus} />
        <StatCard
          title="Active Drivers"
          value={String(activeDrivers)}
          icon={Users}
        />
        <StatCard
          title="Ghost Buses"
          value={String(counts.ghost)}
          icon={AlertTriangle}
        />
        <StatCard
          title="Today's Revenue"
          value={currency(todayRevenue)}
          icon={TrendingUp}
        />
      </div>

      <div className="live-status-card">
        <div className="card-header">
          <div className="card-title-group">
            <MapPin size={20} color="#dc2626" />
            <h3>Live Bus Status</h3>
          </div>
        </div>
        <div className="table-responsive">
          <table className="bus-table">
            <thead>
              <tr>
                <th>Bus Number</th>
                <th>Route</th>
                <th>Driver</th>
                <th>Status</th>
                <th>Occupancy</th>
                <th>Last Update</th>
              </tr>
            </thead>
            <tbody>
              {busRows.map((bus, index) => (
                <tr key={index}>
                  <td>{bus.number}</td>
                  <td>{bus.route}</td>
                  <td>{bus.driver}</td>
                  <td>
                    <span
                      className={`status-pill ${getStatusColorClass(
                        bus.status
                      )}`}
                    >
                      {bus.status}
                    </span>
                  </td>
                  <td>
                    <div className="occupancy-cell">
                      <div className="occupancy-bar-container">
                        <div
                          className={`occupancy-bar ${getOccupancyColorClass(
                            bus.occupancy
                          )}`}
                          style={{ width: `${bus.occupancy}%` }}
                        />
                      </div>
                      <span>{bus.occupancy}%</span>
                    </div>
                  </td>
                  <td>{bus.lastUpdateText}</td>
                </tr>
              ))}
              {busRows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", opacity: 0.7 }}>
                    No buses yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="alerts-card ticket-edge">
        <div className="card-header">
          <div className="card-title-group">
            <AlertCircle size={20} color="#dc2626" />
            <h3>Recent Alerts</h3>
          </div>
        </div>
        <div className="alerts-list">
          {alerts.map((alert) => {
            const ts = alert.createdAt?.toDate?.() || null;
            const type =
              alert.type === "ghost" ? "dot-ghost" : "dot-maintenance";
            return (
              <div key={alert.id} className="alert-item">
                <div className={`alert-dot ${type}`} />
                <div className="alert-content">
                  <p className="alert-message">{alert.message}</p>
                  <div className="alert-time">
                    <Clock size={12} />
                    <span>{timeAgo(ts)}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {alerts.length === 0 && (
            <div className="alert-item" style={{ opacity: 0.7 }}>
              No alerts
            </div>
          )}
        </div>
      </div>
    </>
  );
}
