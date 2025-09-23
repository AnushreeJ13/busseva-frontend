import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Bell, Shield, Globe, Palette, Database, 
  Mail, Users, Clock, AlertTriangle, Save,
  ToggleLeft, Monitor, Lock, User, Bus,
  MapPin, IndianRupee, UserCheck, Route
} from "lucide-react";

// Keep the existing notification function
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

export default function Settings() {
  const [settings, setSettings] = useState({
    busManagement: {
      autoAssignDrivers: true,
      maintenanceReminders: true,
      fuelTracking: true,
      occupancyTracking: true,
      routeOptimization: true,
      maxPassengers: 40,
      standardFare: 100,
    },
    driverManagement: {
      dutyHours: 8,
      breakTime: 30,
      mandatoryRest: 8,
      documentReminders: true,
      trainingReminders: true,
      performanceTracking: true
    },
    routeManagement: {
      dynamicRouting: true,
      peakHourAdjustment: true,
      realTimeUpdates: true,
      maxDelay: 15,
      stopDuration: 2,
      autoRerouting: true
    },
    safety: {
      sosButton: true,
      speedLimit: 80,
      nightPatrol: true,
      womenSafety: true,
      cctv: true,
      emergencyContacts: ["112", "100", "108"]
    },
    payments: {
      onlinePayment: true,
      cashPayment: true,
      upi: true,
      cards: true,
      passes: true,
      refundWindow: 24
    }
  });

  // Handle settings change with validation
  const handleSettingChange = (category, setting, value) => {
    // Validate settings before updating
    if (!validateSetting(category, setting, value)) {
      showNotification("Invalid setting value!", "error");
      return;
    }

    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [setting]: value
      }
    }));
    
    // Save to backend
    saveSettingToBackend(category, setting, value);
  };

  // Validation function
  const validateSetting = (category, setting, value) => {
    switch (category) {
      case "busManagement":
        if (setting === "maxPassengers" && (value < 10 || value > 60)) {
          return false;
        }
        if (setting === "standardFare" && (value < 0 || value > 1000)) {
          return false;
        }
        break;
      case "driverManagement":
        if (setting === "dutyHours" && (value < 4 || value > 12)) {
          return false;
        }
        if (setting === "breakTime" && (value < 15 || value > 60)) {
          return false;
        }
        break;
      // Add more validations as needed
    }
    return true;
  };

  // Save to backend
  const saveSettingToBackend = async (category, setting, value) => {
    try {
      // Replace with your API call
      const response = await fetch('/api/settings/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, setting, value })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save setting');
      }
      
      showNotification("Setting updated successfully", "success");
    } catch (error) {
      showNotification("Failed to save setting", "error");
      console.error(error);
    }
  };

  return (
    <div className="settings-container" style={styles.container}>
      {/* Bus Management Settings */}
      <div className="settings-section" style={styles.section}>
        <div style={styles.sectionHeader}>
          <Bus size={24} />
          <h2>Bus Management</h2>
        </div>
        
        <div style={styles.settingsGrid}>
          <div style={styles.setting}>
            <label>Maximum Passengers</label>
            <input
              type="number"
              value={settings.busManagement.maxPassengers}
              onChange={(e) => handleSettingChange("busManagement", "maxPassengers", parseInt(e.target.value))}
              style={styles.input}
            />
          </div>

          <div style={styles.setting}>
            <label>Standard Fare (₹)</label>
            <input
              type="number"
              value={settings.busManagement.standardFare}
              onChange={(e) => handleSettingChange("busManagement", "standardFare", parseInt(e.target.value))}
              style={styles.input}
            />
          </div>

          <div style={styles.setting}>
            <label>Auto-assign Drivers</label>
            <input
              type="checkbox"
              checked={settings.busManagement.autoAssignDrivers}
              onChange={(e) => handleSettingChange("busManagement", "autoAssignDrivers", e.target.checked)}
            />
          </div>

          {/* Add more bus management settings */}
        </div>
      </div>

      {/* Driver Management */}
      <div className="settings-section" style={styles.section}>
        <div style={styles.sectionHeader}>
          <UserCheck size={24} />
          <h2>Driver Management</h2>
        </div>
        
        <div style={styles.settingsGrid}>
          <div style={styles.setting}>
            <label>Duty Hours</label>
            <input
              type="number"
              value={settings.driverManagement.dutyHours}
              onChange={(e) => handleSettingChange("driverManagement", "dutyHours", parseInt(e.target.value))}
              style={styles.input}
            />
          </div>

          <div style={styles.setting}>
            <label>Break Time (minutes)</label>
            <input
              type="number"
              value={settings.driverManagement.breakTime}
              onChange={(e) => handleSettingChange("driverManagement", "breakTime", parseInt(e.target.value))}
              style={styles.input}
            />
          </div>

          {/* Add more driver settings */}
        </div>
      </div>

      {/* Safety Settings */}
      <div className="settings-section" style={styles.section}>
        <div style={styles.sectionHeader}>
          <Shield size={24} />
          <h2>Safety Settings</h2>
        </div>
        
        <div style={styles.settingsGrid}>
          <div style={styles.setting}>
            <label>Speed Limit (km/h)</label>
            <input
              type="number"
              value={settings.safety.speedLimit}
              onChange={(e) => handleSettingChange("safety", "speedLimit", parseInt(e.target.value))}
              style={styles.input}
            />
          </div>

          <div style={styles.setting}>
            <label>Women Safety Features</label>
            <input
              type="checkbox"
              checked={settings.safety.womenSafety}
              onChange={(e) => handleSettingChange("safety", "womenSafety", e.target.checked)}
            />
          </div>

          <div style={styles.setting}>
            <label>Night Patrol</label>
            <input
              type="checkbox"
              checked={settings.safety.nightPatrol}
              onChange={(e) => handleSettingChange("safety", "nightPatrol", e.target.checked)}
            />
          </div>

          {/* Add more safety settings */}
        </div>
      </div>

      {/* Add more sections as needed */}

      <div style={styles.actions}>
        <button 
          style={styles.saveButton} 
          onClick={() => showNotification("All settings saved!", "success")}
        >
          <Save size={16} />
          Save All Changes
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: "24px",
    maxWidth: "1200px",
    margin: "0 auto",
  },
  section: {
    background: 'white',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '20px',
    color: '#2563eb',
  },
  settingsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
  },
  header: {
    marginBottom: "32px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: "24px",
    marginBottom: "32px",
  },
  card: {
    background: "white",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "20px",
    color: "#2563eb",
  },
  cardContent: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  setting: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  input: {
    padding: "8px",
    borderRadius: "6px",
    border: "1px solid #e2e8f0",
    width: "100px",
  },
  select: {
    padding: "8px",
    borderRadius: "6px",
    border: "1px solid #e2e8f0",
    minWidth: "120px",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "24px",
  },
  saveButton: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 24px",
    background: "#2563eb",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "600",
    transition: "all 0.2s ease",
  },
};
