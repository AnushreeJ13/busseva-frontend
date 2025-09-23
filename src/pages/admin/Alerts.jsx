// src/pages/admin/Alerts.jsx
import React, { useState } from "react";
import { 
  AlertTriangle, Shield, Bell, Wrench, 
  CheckCircle, XCircle, MessageCircle,
  Clock, User, MapPin, Bus
} from "lucide-react";

export default function Alerts() {
  // Sample data - replace with actual API calls
  const [alerts] = useState([
    {
      id: 1,
      type: "safety",
      severity: "high",
      title: "SOS Alert Triggered",
      description: "Passenger activated emergency button on Bus MH01-XX-1234",
      location: "Mumbai-Pune Highway",
      time: "2 minutes ago",
      status: "pending",
      busId: "MH01-XX-1234",
      userId: "USER123"
    },
    {
      id: 2,
      type: "maintenance",
      severity: "medium",
      title: "Engine Temperature High",
      description: "Bus KA01-YY-5678 reporting high engine temperature",
      location: "Bangalore City",
      time: "15 minutes ago",
      status: "in-progress",
      busId: "KA01-YY-5678"
    },
    {
      id: 3,
      type: "complaint",
      severity: "low",
      title: "AC Not Working",
      description: "Multiple passengers reported AC malfunction",
      time: "1 hour ago",
      status: "resolved",
      busId: "DL01-ZZ-9012"
    }
  ]);

  const handleQuickAction = (alertId, action) => {
    console.log(`Taking ${action} on alert ${alertId}`);
    // Implement your action logic here
  };

  return (
    <div style={styles.container}>
      {/* Stats Overview */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statIcon} className="stat-icon-red">
            <AlertTriangle size={24} />
          </div>
          <div style={styles.statInfo}>
            <h3>Active Alerts</h3>
            <span style={styles.statNumber}>12</span>
          </div>
        </div>
        
        <div style={styles.statCard}>
          <div style={styles.statIcon} className="stat-icon-yellow">
            <Shield size={24} />
          </div>
          <div style={styles.statInfo}>
            <h3>Safety Reports</h3>
            <span style={styles.statNumber}>5</span>
          </div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statIcon} className="stat-icon-blue">
            <Wrench size={24} />
          </div>
          <div style={styles.statInfo}>
            <h3>Maintenance</h3>
            <span style={styles.statNumber}>8</span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={styles.quickActions}>
        <h3 style={styles.sectionTitle}>Quick Actions</h3>
        <div style={styles.actionButtons}>
          <button style={{...styles.actionButton, backgroundColor: '#ef4444'}}>
            <Shield /> Emergency Response
          </button>
          <button style={{...styles.actionButton, backgroundColor: '#f59e0b'}}>
            <Bell /> Broadcast Alert
          </button>
          <button style={{...styles.actionButton, backgroundColor: '#3b82f6'}}>
            <Wrench /> Maintenance Request
          </button>
        </div>
      </div>

      {/* Active Alerts */}
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
                    {alert.severity.toUpperCase()}
                  </span>
                </div>
                <span style={styles.alertTime}>
                  <Clock size={14} />
                  {alert.time}
                </span>
              </div>

              <h4 style={styles.alertTitle}>{alert.title}</h4>
              <p style={styles.alertDescription}>{alert.description}</p>

              <div style={styles.alertDetails}>
                {alert.busId && (
                  <span style={styles.detailBadge}>
                    <Bus size={14} />
                    {alert.busId}
                  </span>
                )}
                {alert.location && (
                  <span style={styles.detailBadge}>
                    <MapPin size={14} />
                    {alert.location}
                  </span>
                )}
                {alert.userId && (
                  <span style={styles.detailBadge}>
                    <User size={14} />
                    {alert.userId}
                  </span>
                )}
              </div>

              <div style={styles.alertActions}>
                <button 
                  style={{...styles.actionBtn, backgroundColor: '#22c55e'}}
                  onClick={() => handleQuickAction(alert.id, 'acknowledge')}
                >
                  <CheckCircle size={16} /> Acknowledge
                </button>
                <button 
                  style={{...styles.actionBtn, backgroundColor: '#ef4444'}}
                  onClick={() => handleQuickAction(alert.id, 'escalate')}
                >
                  <AlertTriangle size={16} /> Escalate
                </button>
                <button 
                  style={{...styles.actionBtn, backgroundColor: '#6b7280'}}
                  onClick={() => handleQuickAction(alert.id, 'dismiss')}
                >
                  <XCircle size={16} /> Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
    marginBottom: '24px',
  },
  statCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '20px',
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
  },
  statIcon: {
    padding: '12px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  statNumber: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
  },
  quickActions: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '16px',
    color: '#1f2937',
  },
  actionButtons: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    cursor: 'pointer',
    fontWeight: '600',
    transition: 'transform 0.2s ease',
  },
  alertsList: {
    display: 'grid',
    gap: '20px',
  },
  alertCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
  },
  alertHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  alertType: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  severityBadge: {
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
  },
  alertTime: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    color: '#6b7280',
    fontSize: '14px',
  },
  alertTitle: {
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '8px',
    color: '#1f2937',
  },
  alertDescription: {
    color: '#4b5563',
    marginBottom: '16px',
  },
  alertDetails: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '16px',
  },
  detailBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    backgroundColor: '#f3f4f6',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#4b5563',
  },
  alertActions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  },
  actionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 12px',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'transform 0.1s ease',
  },
};