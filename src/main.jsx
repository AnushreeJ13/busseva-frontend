// src/main.jsx (Vite)
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import Login from "./login.jsx";

// Admin layout + feature pages
import Admin from "./pages/admin/admin.jsx";
import DashboardHome from "./pages/admin/DashboardHome.jsx";
import Buses from "./pages/admin/Buses.jsx";
import Drivers from "./pages/admin/Drivers.jsx";
import RoutesPage from "./pages/admin/Routes.jsx";
import Shifts from "./pages/admin/Shifts.jsx";
import Alerts from "./pages/admin/Alerts.jsx";
import Settings from "./pages/admin/Settings.jsx";

import "./i18n";
import SiteGuideAssistant from "./components/SiteGuideAssistant";

// Optional: smooth-scroll to #hash targets inside BrowserRouter
import ScrollToAnchor from "./scroll-to-anchor.jsx"; // see helper below

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    {/* Global assistant, persists across all routes */}
    <SiteGuideAssistant />

    {/* Optional: enable smooth anchor jumps */}
    <ScrollToAnchor />

    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/login" element={<Login />} />

      {/* Parent admin route with nested children */}
      <Route path="/admin" element={<Admin />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardHome />} />
        <Route path="buses" element={<Buses />} />
        <Route path="drivers" element={<Drivers />} />
        <Route path="routes" element={<RoutesPage />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="settings" element={<Settings />} />
        <Route path="shifts" element={<Shifts />} />
      </Route>
    </Routes>
  </BrowserRouter>
);