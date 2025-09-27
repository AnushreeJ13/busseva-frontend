// src/pages/admin/Admin.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  Bus,
  Users,
  AlertTriangle,
  TrendingUp,
  MapPin,
  Settings as SettingsIcon,
  Plus,
  Bell,
  BarChart3,
  Route as RouteIcon,
  UserCheck,
  AlertCircle,
  Clock,
} from "lucide-react";
import "./admin.css";

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
  Timestamp,
} from "firebase/firestore";

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

function getOccupancyColorClass(occupancy) {
  const n = Number(occupancy ?? 0);
  if (n >= 80) return "occupancy-high";
  if (n >= 50) return "occupancy-medium";
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

export default function Admin() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [adminName, setAdminName] = useState("Admin");
  const addBusRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem("token");
    showNotification("Logged out successfully", "info");
    navigate("/login");
  };

  const validTabs = new Set([
    "dashboard",
    "buses",
    "drivers",
    "routes",
    "shifts",
    "alerts",
    "settings",
  ]);

  // URL <-> UI sync
  useEffect(() => {
    const parts = location.pathname.split("/").filter(Boolean);
    const seg = parts.length <= 1 ? "dashboard" : parts[1];
    if (validTabs.has(seg) && seg !== activeTab) setActiveTab(seg);
  }, [location.pathname]); // eslint-disable-line

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
    }
  }, [navigate]);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;

        const response = await fetch("https://busseva.onrender.com/api/user", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const userData = await response.json();
          setAdminName(userData.name);
        }
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      }
    };

    fetchUserData();
  }, []);

  // Live Firestore state
  const [buses, setBuses] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [counts, setCounts] = useState({ total: 0, ghost: 0 });
  const [todayRevenue, setTodayRevenue] = useState(null);

  // Live buses
  useEffect(() => {
    const qRef = query(collection(db, "buses"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(qRef, (snap) => {
      setBuses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // Live alerts (latest 10)
  useEffect(() => {
    const qRef = query(
      collection(db, "alerts"),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    const unsub = onSnapshot(qRef, (snap) => {
      setAlerts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // KPI counts
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

  // Today's revenue
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const now = new Date();
        const start = Timestamp.fromDate(
          new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
        );
        const end = Timestamp.fromDate(
          new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + 1,
            0,
            0,
            0,
            0
          )
        );
        const base = collection(db, "payments");
        const qRef = query(
          base,
          where("createdAt", ">=", start),
          where("createdAt", "<", end)
        );
        const agg = await getAggregateFromServer(qRef, {
          total: sum("amount"),
        });
        if (!mounted) return;
        setTodayRevenue(Number(agg.data().total ?? 0));
      } catch {
        setTodayRevenue(0);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, []);

  // Derived metrics
  const activeDrivers = useMemo(() => {
    const set = new Set(
      buses
        .filter((b) => b.status === "ACTIVE")
        .map((b) => b.driver)
        .filter(Boolean)
    );
    return set.size;
  }, [buses]);

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

  // UI effects
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "metro-neon");

    const reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const aur = document.createElement("div");
    aur.className = "aurora-layer";
    document.body.appendChild(aur);

    const btn = addBusRef.current;
    const cleanup = [];

    if (btn && !reduce) {
      btn.classList.add("magnetic-btn");
      const strength = 14;

      const onMove = (e) => {
        const r = btn.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = (e.clientX - cx) / (r.width / 2);
        const dy = (e.clientY - cy) / (r.height / 2);
        btn.style.setProperty("--mx", dx * strength + "px");
        btn.style.setProperty("--my", dy * strength + "px");
        btn.style.setProperty("--ms", "1.02");
        btn.style.setProperty("--gx", dx * 20 + 50 + "%");
        btn.style.setProperty("--gy", dy * 20 + 50 + "%");
      };

      const onLeave = () => {
        btn.style.setProperty("--mx", "0px");
        btn.style.setProperty("--my", "0px");
        btn.style.setProperty("--ms", "1");
      };

      const confettiBurst = (x, y) => {
        const colors = [
          "#7c3aed",
          "#dc2626",
          "#22c55e",
          "#f59e0b",
          "#2563eb",
          "#ec4899",
        ];
        const n = 18;
        for (let i = 0; i < n; i++) {
          const d = document.createElement("div");
          d.className = "confetti";
          d.style.left = x + "px";
          d.style.top = y + "px";
          d.style.background = colors[i % colors.length];
          d.style.transform += ` translate(${(Math.random() * 2 - 1) * 16}px, ${
            (Math.random() * 2 - 1) * 12
          }px) rotate(${Math.random() * 360}deg)`;
          d.style.animationDelay = Math.random() * 0.12 + "s";
          d.style.animationDuration = 0.7 + Math.random() * 0.5 + "s";
          document.body.appendChild(d);
          setTimeout(() => d.remove(), 1200);
        }
      };

      const onClick = (e) => {
        confettiBurst(e.clientX, e.clientY);
        navigate("/admin/buses");
      };

      btn.addEventListener("mousemove", onMove);
      btn.addEventListener("mouseleave", onLeave);
      btn.addEventListener("blur", onLeave);
      btn.addEventListener("click", onClick);

      cleanup.push(() => {
        btn.removeEventListener("mousemove", onMove);
        btn.removeEventListener("mouseleave", onLeave);
        btn.removeEventListener("blur", onLeave);
        btn.removeEventListener("click", onClick);
      });
    }

    return () => {
      aur.remove();
      cleanup.forEach((fn) => fn());
    };
  }, [navigate]);

  const handleSidebarClick = (id) => {
    setActiveTab(id);
    if (id === "dashboard") {
      navigate("/admin");
    } else {
      navigate(`/admin/${id}`);
    }
  };

  const StatCard = ({ title, value, icon: Icon }) => (
    <div className="stat-card">
      <p className="stat-card-title">{title}</p>
      <div className="stat-card-content">
        <p className="stat-card-value">{value}</p>
        <div className="stat-card-icon-container">
          <Icon className="stat-card-icon" />
        </div>
      </div>
    </div>
  );

  const isDashboard = activeTab === "dashboard";

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="header-container">
        <div className="header-logo">
          <div className="logo-icon-bg">
            <Bus size={20} color="#fff" />
          </div>
          <h1 className="logo-text">BusSeva</h1>
        </div>
        <div className="header-actions">
          <div className="welcome-text">Welcome back, {adminName}</div>
          <div className="notification-bell">
            <Bell size={20} />
            <span className="notification-badge">{alerts.length}</span>
          </div>
          <button
            className="add-bus-btn"
            ref={addBusRef}
            onClick={handleLogout}
          >
            <span>Logout</span>
          </button>
        </div>
      </header>

      <div className="main-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <nav>
            <ul className="sidebar-nav">
              {[
                { id: "dashboard", label: "Dashboard", icon: BarChart3 },
                { id: "buses", label: "Bus Management", icon: Bus },
                { id: "drivers", label: "Driver Management", icon: UserCheck },
                { id: "routes", label: "Route Management", icon: RouteIcon },
                { id: "shifts", label: "Shift Management", icon: Clock },
                {
                  id: "alerts",
                  label: "Alerts & Reports",
                  icon: AlertTriangle,
                },
                { id: "settings", label: "Settings", icon: SettingsIcon },
              ].map((item) => (
                <li key={item.id} className="sidebar-nav-item">
                  <button
                    onClick={() => handleSidebarClick(item.id)}
                    className={activeTab === item.id ? "active" : ""}
                  >
                    <item.icon size={20} />
                    <span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="main-content">
          {isDashboard ? (
            <>
              <h2 className="dashboard-title">BusSeva Dashboard</h2>

              {/* Stats Cards */}
              <div className="stats-grid">
                <StatCard
                  title="Total Buses"
                  value={String(counts.total)}
                  icon={Bus}
                />
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

              {/* Live Bus Status */}
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
                          <td
                            colSpan={6}
                            style={{ textAlign: "center", opacity: 0.7 }}
                          >
                            No buses yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Alerts */}
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
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
