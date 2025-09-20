// src/components/StatCard.jsx
import React from "react";

export default function StatCard({ title, value, icon: Icon }) {
  return (
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
}
