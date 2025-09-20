// src/pages/admin/Drivers.jsx
import React, { useEffect, useRef, useState } from "react";
import { db } from "../../lib/firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";

// ---------------------------
// Verhoeff algorithm tables
// ---------------------------
const d = [
  [0,1,2,3,4,5,6,7,8,9],
  [1,2,3,4,0,6,7,8,9,5],
  [2,3,4,0,1,7,8,9,5,6],
  [3,4,0,1,2,8,9,5,6,7],
  [4,0,1,2,3,9,5,6,7,8],
  [5,9,8,7,6,0,4,3,2,1],
  [6,5,9,8,7,1,0,4,3,2],
  [7,6,5,9,8,2,1,0,4,3],
  [8,7,6,5,9,3,2,1,0,4],
  [9,8,7,6,5,4,3,2,1,0]
];

const p = [
  [0,1,2,3,4,5,6,7,8,9],
  [1,5,7,6,2,8,3,0,9,4],
  [5,8,0,3,7,9,6,1,4,2],
  [8,9,1,6,0,4,3,5,2,7],
  [9,4,5,3,1,2,6,8,7,0],
  [4,2,8,6,5,7,9,3,0,1],
  [2,7,9,3,8,0,6,4,1,5],
  [7,0,4,6,9,1,3,2,5,8]
];

const inv = [0,4,3,2,1,5,6,7,8,9];

// Check if Aadhaar is valid using Verhoeff
function isValidAadhaar(aadhaar) {
  if (!/^\d{12}$/.test(aadhaar)) return false; // must be 12 digits
  let c = 0;
  let invertedArray = aadhaar.split("").reverse().map(Number);
  for (let i = 0; i < invertedArray.length; i++) {
    c = d[c][p[i % 8][invertedArray[i]]];
  }
  return c === 0;
}

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [form, setForm] = useState({ name: "", phone: "", licenseNo: "", aadhaar: "" });
  const firstInputRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    firstInputRef.current?.focus();
    const q = query(collection(db, "drivers"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setDrivers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.name.trim() || !form.phone.trim() || !form.licenseNo.trim() || !form.aadhaar.trim()) {
      setError("All fields are required.");
      return;
    }

    if (!isValidAadhaar(form.aadhaar.trim())) {
      setError("Invalid Aadhaar number. Please check again.");
      return;
    }

    await addDoc(collection(db, "drivers"), {
      name: form.name.trim(),
      phone: form.phone.trim(),
      licenseNo: form.licenseNo.trim(),
      aadhaar: form.aadhaar.trim(),
      createdAt: serverTimestamp(),
    });

    setForm({ name: "", phone: "", licenseNo: "", aadhaar: "" });
  };

  return (
    <div className="page-stack">
      {/* Add Driver */}
      <section className="card glass">
        <header className="section-head">
          <h3 className="section-title">Add Driver</h3>
          <span className="pill">Total: {drivers.length}</span>
        </header>

        <form className="form-grid form-4" onSubmit={submit}>
          {/* Name */}
          <label className="field">
            <span className="field-label">Driver Name</span>
            <div className="input-wrap">
              <span className="input-icon">👤</span>
              <input
                ref={firstInputRef}
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="अमित शर्मा"
                required
                className="input"
              />
            </div>
          </label>

          {/* Phone */}
          <label className="field">
            <span className="field-label">Phone</span>
            <div className="input-wrap">
              <span className="input-icon">📞</span>
              <input
                value={form.phone}
                onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
                placeholder="9876543210"
                required
                className="input"
              />
            </div>
          </label>

          {/* License */}
          <label className="field">
            <span className="field-label">License No.</span>
            <div className="input-wrap">
              <span className="input-icon">🪪</span>
              <input
                value={form.licenseNo}
                onChange={(e) => setForm((s) => ({ ...s, licenseNo: e.target.value }))}
                placeholder="UP-DR-2025-001"
                required
                className="input"
              />
            </div>
          </label>

          {/* Aadhaar */}
          <label className="field">
            <span className="field-label">Aadhaar No.</span>
            <div className="input-wrap">
              <span className="input-icon">🔢</span>
              <input
                value={form.aadhaar}
                onChange={(e) => setForm((s) => ({ ...s, aadhaar: e.target.value }))}
                placeholder="1234 5678 9012"
                required
                className="input"
              />
            </div>
          </label>

          {error && (
            <div className="form-error span-4">
              <span>⚠️ {error}</span>
            </div>
          )}

          <div className="form-actions span-4">
            <button type="submit" className="btn btn-gradient">Save Driver</button>
          </div>
        </form>
      </section>

      {/* All Drivers */}
      <section className="card glass">
        <header className="section-head">
          <h3 className="section-title">All Drivers</h3>
        </header>

        <div className="table-wrap">
          <table className="data-table drivers-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>License No.</th>
                <th>Aadhaar</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td className="mono">{d.phone}</td>
                  <td className="mono">{d.licenseNo}</td>
                  <td className="mono">{d.aadhaar}</td>
                </tr>
              ))}
              {drivers.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty-row">No drivers yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
