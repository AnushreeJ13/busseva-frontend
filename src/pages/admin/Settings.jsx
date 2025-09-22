import React from "react";
import { useNavigate } from "react-router-dom";
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
  return (
    <div className="card">
      <div className="card-header">
        <h3>Settings</h3>
      </div>
      <p style={{ padding: 16 }}>Coming soon</p>
    </div>
  );
}
