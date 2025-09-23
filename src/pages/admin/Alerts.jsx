// src/pages/admin/Alerts.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Shield, Bell, Wrench,
  CheckCircle, XCircle, MessageCircle,
  Clock, User, MapPin, Bus, Paperclip, Phone
} from "lucide-react";
import { db } from "../../lib/firebase";
import {
  collection, query, orderBy, onSnapshot, doc, updateDoc
} from "firebase/firestore";

const formatTime = (t) => {
  // t can be Firestore Timestamp or ISO string
  let d = null;
  if (t && typeof t.toDate === "function") d = t.toDate();
  else if (typeof t === "string") d = new Date(t);
  else return "just now";
  const diff = Math.max(0, Date.now() - d.getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const days = Math.floor(h / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

const mapSeverity = (incidentType = "") => {
  const t = incidentType.toLowerCase();
  if (t.includes("physical")) return "high";
  if (t.includes("verbal")) return "medium";
  if (t.includes("inappropriate")) return "medium";
  if (t.includes("discriminatory")) return "medium";
  return "low";
};

export default function Alerts() {
  const [safetyReports, setSafetyReports] = useState([]);
  const [demo] = useState([
    {
      id: "sample-1", type: "safety", severity: "high",
      title: "SOS Alert Triggered",
      description: "Passenger activated emergency button on Bus MH01-XX-1234",
      location: "Mumbai-Pune Highway", time: "2 minutes ago",
      status: "pending", busId: "MH01-XX-1234", userId: "USER123", source: "demo"
    },
    { id: "sample-2", type: "maintenance", severity: "medium",
      title: "Engine Temperature High",
      description: "Bus KA01-YY-5678 reporting high engine temperature",
      location: "Bangalore City", time: "15 minutes ago",
      status: "in-progress", busId: "KA01-YY-5678", source: "demo"
    },
    { id: "sample-3", type: "complaint", severity: "low",
      title: "AC Not Working",
      description: "Multiple passengers reported AC malfunction",
      time: "1 hour ago", status: "resolved", busId: "DL01-ZZ-9012", source: "demo"
    }
  ]);

  useEffect(() => {
    const q = query(collection(db, "harassmentReports"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          type: "safety",
          severity: mapSeverity(data.incidentType),
          title: `Confidential Report${data.busNumber ? ` • ${data.busNumber}` : ""}`,
          description: `${data.incidentType || "Safety concern"}${data.description ? ` — ${data.description}` : ""}`,
          location: data.location || null,
          time: formatTime(data.timestamp),
          status: data.status || "submitted",
          busId: data.busId || data.busNumber || null,
          userId: data.userId || null,
          attachmentCount: Number.isFinite(data.attachmentCount) ? data.attachmentCount : (Array.isArray(data.attachments) ? data.attachments.length : 0),
          caseId: data.caseId || null,
          incidentType: data.incidentType || "Other safety concern",
          source: "firestore"
        };
      });
      setSafetyReports(rows);
    }, (err) => console.error("listen error:", err));
    return () => unsub();
  }, []);

  const alerts = useMemo(() => [...safetyReports, ...demo], [safetyReports, demo]);

  const activeCount = alerts.filter(a => !["resolved", "closed", "dismissed"].includes((a.status || "").toLowerCase())).length;
  const safetyCount = alerts.filter(a => a.type === "safety").length;
  const maintenanceCount = alerts.filter(a => a.type === "maintenance").length;

  const handleQuickAction = async (alert, action) => {
    if (alert.source !== "firestore") return;
    const ref = doc(db, "harassmentReports", alert.id);
    const status =
      action === "acknowledge" ? "in-progress" :
      action === "escalate" ? "escalated" :
      action === "dismiss" ? "closed" : alert.status;
    try {
      await updateDoc(ref, { status });
    } catch (e) {
      console.error(`Failed to ${action}:`, e);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={{ ...styles.statIcon, backgroundColor: "#fee2e2" }}>
            <AlertTriangle size={24} />
          </div>
          <div style={styles.statInfo}>
            <h3>Active Alerts</h3>
            <span style={styles.statNumber}>{activeCount}</span>
          </div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statIcon, backgroundColor: "#fef3c7" }}>
            <Shield size={24} />
          </div>
          <div style={styles.statInfo}>
            <h3>Safety Reports</h3>
            <span style={styles.statNumber}>{safetyCount}</span>
          </div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statIcon, backgroundColor: "#dbeafe" }}>
            <Wrench size={24} />
          </div>
          <div style={styles.statInfo}>
            <h3>Maintenance</h3>
            <span style={styles.statNumber}>{maintenanceCount}</span>
          </div>
        </div>
      </div>

      <div style={styles.quickActions}>
        <h3 style={styles.sectionTitle}>Quick Actions</h3>
        <div style={styles.actionButtons}>
          <a href="tel:100" style={{ ...styles.actionButton, backgroundColor: '#ef4444', textDecoration: "none" }}>
            <Shield /> Emergency Response (100)
          </a>
          <button style={{ ...styles.actionButton, backgroundColor: '#f59e0b' }}>
            <Bell /> Broadcast Alert
          </button>
          <button style={{ ...styles.actionButton, backgroundColor: '#3b82f6' }}>
            <Wrench /> Maintenance Request
          </button>
          <a href="tel:1800123456" style={{ ...styles.actionButton, backgroundColor: '#6b7280', textDecoration: "none" }}>
            <Phone /> Support
          </a>
        </div>
      </div>

      <div style={styles.alertsSection}>
        <h3 style={styles.sectionTitle}>Active Alerts & Reports</h3>
        <div style={styles.alertsList}>
          {alerts.map(alert => (
            <div key={alert.id} style={styles.alertCard}>
              <div style={styles.alertHeader}>
                <div style={styles.alertType}>
                  {alert.type === 'safety' && <Shield size={20} color="#ef4444" />}
                  {alert.type === 'maintenance' && <Wrench size={20} color="#f59e0b" />}
                  {alert.type === 'complaint' && <MessageCircle size={20} color="#3b82f6" />}
                  <span style={{
                    ...styles.severityBadge,
                    backgroundColor:
                      alert.severity === 'high' ? '#fecaca' :
                      alert.severity === 'medium' ? '#fef3c7' : '#dbeafe',
                    color:
                      alert.severity === 'high' ? '#991b1b' :
                      alert.severity === 'medium' ? '#92400e' : '#1e40af'
                  }}>
                    {String(alert.severity || "").toUpperCase()}
                  </span>
                </div>
                <span style={styles.alertTime}>
                  <Clock size={14} />
                  {alert.time}
                </span>
              </div>

              <h4 style={styles.alertTitle}>
                {alert.title}
                {alert.caseId && (
                  <span style={{ marginLeft: 8, fontSize: 12, color: "#6b7280" }}>
                    • {alert.caseId}
                  </span>
                )}
              </h4>

              <p style={styles.alertDescription}>{alert.description}</p>

              <div style={styles.alertDetails}>
                {alert.busId && (
                  <span style={styles.detailBadge}><Bus size={14} />{alert.busId}</span>
                )}
                {alert.location && (
                  <span style={styles.detailBadge}><MapPin size={14} />{alert.location}</span>
                )}
                {alert.userId && (
                  <span style={styles.detailBadge}><User size={14} />{alert.userId}</span>
                )}
                {Number(alert.attachmentCount) > 0 && (
                  <span style={styles.detailBadge}><Paperclip size={14} />{alert.attachmentCount} attachment{alert.attachmentCount === 1 ? "" : "s"}</span>
                )}
                {alert.incidentType && alert.type === "safety" && (
                  <span style={styles.detailBadge}><Shield size={14} />{alert.incidentType}</span>
                )}
              </div>

              <div style={styles.alertActions}>
                <button style={{ ...styles.actionBtn, backgroundColor: '#22c55e' }}
                        onClick={() => handleQuickAction(alert, 'acknowledge')}>
                  <CheckCircle size={16} /> Acknowledge
                </button>
                <button style={{ ...styles.actionBtn, backgroundColor: '#ef4444' }}
                        onClick={() => handleQuickAction(alert, 'escalate')}>
                  <AlertTriangle size={16} /> Escalate
                </button>
                <button style={{ ...styles.actionBtn, backgroundColor: '#6b7280' }}
                        onClick={() => handleQuickAction(alert, 'dismiss')}>
                  <XCircle size={16} /> Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20 }}>
          <hr />
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <a href="tel:100" style={{ ...styles.footerBtnRed }}>
              <Phone size={16} /> Call Police (100)
            </a>
            <a href="tel:1800123456" style={{ ...styles.footerBtnSupport }}>
              <Phone size={16} /> Support Helpline
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { padding: '24px', maxWidth: '1200px', margin: '0 auto' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '24px' },
  statCard: { display: 'flex', alignItems: 'center', gap: '16px', padding: '20px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' },
  statIcon: { padding: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  statInfo: { display: 'flex', flexDirection: 'column', gap: '4px' },
  statNumber: { fontSize: '24px', fontWeight: 'bold', color: '#1f2937' },
  quickActions: { marginBottom: '24px' },
  sectionTitle: { fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#1f2937' },
  actionButtons: { display: 'flex', gap: '12px', flexWrap: 'wrap' },
  actionButton: { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: '600', transition: 'transform 0.2s ease' },
  alertsList: { display: 'grid', gap: '20px' },
  alertCard: { backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' },
  alertHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  alertType: { display: 'flex', alignItems: 'center', gap: '8px' },
  severityBadge: { padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600' },
  alertTime: { display: 'flex', alignItems: 'center', gap: '4px', color: '#6b7280', fontSize: '14px' },
  alertTitle: { fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' },
  alertDescription: { color: '#4b5563', marginBottom: '16px' },
  alertDetails: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' },
  detailBadge: { display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', backgroundColor: '#f3f4f6', borderRadius: '6px', fontSize: '14px', color: '#4b5563' },
  alertActions: { display: 'flex', gap: '8px', justifyContent: 'flex-end' },
  actionBtn: { display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 12px', border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: '500', transition: 'transform 0.1s ease' },
  footerBtnRed: { display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 14px", borderRadius: 8, color: "white", backgroundColor: "#ef4444", textDecoration: "none" },
  footerBtnSupport: { display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 14px", borderRadius: 8, color: "white", backgroundColor: "#6b7280", textDecoration: "none" }
};
