import React, { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  orderBy,
  Timestamp,
} from "firebase/firestore";

export default function Shifts() {
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [form, setForm] = useState({
    driverId: "",
    route: "",
    date: "",
    startTime: "",
    duration: 0,
  });
  const [editShiftId, setEditShiftId] = useState(null);

  // Utility to format Firestore Timestamp to input-friendly date string YYYY-MM-DD
  const formatDate = (ts) => {
    if (!ts) return "";
    const dt = ts.toDate();
    return dt.toISOString().slice(0, 10);
  };

  // Utility to format Firestore Timestamp to input-friendly time string HH:mm
  const formatTime = (ts) => {
    if (!ts) return "";
    const dt = ts.toDate();
    return dt.toTimeString().slice(0, 5);
  };

  // Fetch drivers
  useEffect(() => {
    const q = query(collection(db, "drivers"), orderBy("name"));
    const unsub = onSnapshot(q, (snap) =>
      setDrivers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);

  // Fetch routes
  useEffect(() => {
    const q = query(collection(db, "routes"), orderBy("name"));
    const unsub = onSnapshot(q, (snap) =>
      setRoutes(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);

  // Fetch shifts
  useEffect(() => {
    const q = query(
      collection(db, "shifts"),
      orderBy("startTimestamp", "desc")
    );
    const unsub = onSnapshot(q, (snap) =>
      setShifts(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          // Add formatted fields for UI easily
          formattedDate: formatDate(d.data().startTimestamp),
          formattedStartTime: formatTime(d.data().startTimestamp),
          formattedEndTime: formatTime(d.data().endTimestamp),
        }))
      )
    );
    return () => unsub();
  }, []);

  // Handle form changes
  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // Calculate endTimestamp from startTimestamp + duration
  const calculateEndTimestamp = (startTimestamp, durationMinutes) => {
    if (!startTimestamp || !durationMinutes) return null;
    const endMillis = startTimestamp.toMillis() + durationMinutes * 60000;
    return Timestamp.fromMillis(endMillis);
  };

  // Save or update shift
  const onSave = async () => {
    if (!form.driverId || !form.route || !form.date || !form.startTime) {
      alert("Please fill all required fields.");
      return;
    }

    try {
      // Combine date and time into Date object
      const [year, month, day] = form.date.split("-");
      const [hours, minutes] = form.startTime.split(":").map(Number);
      const startDate = new Date(year, month - 1, day, hours, minutes);
      const startTimestamp = Timestamp.fromDate(startDate);

      const endTimestamp = calculateEndTimestamp(startTimestamp, form.duration);

      const dataToSave = {
        driverId: form.driverId,
        route: form.route,
        startTimestamp,
        duration: Number(form.duration),
        endTimestamp,
      };

      if (editShiftId) {
        const shiftRef = doc(db, "shifts", editShiftId);
        await updateDoc(shiftRef, dataToSave);
        setEditShiftId(null);
      } else {
        await addDoc(collection(db, "shifts"), dataToSave);
      }

      setForm({
        driverId: "",
        route: "",
        date: "",
        startTime: "",
        duration: 0,
      });
    } catch (error) {
      console.error("Failed to save shift", error);
    }
  };

  // Edit shift, populate form with Firestore Timestamp conversion
  const onEdit = (shift) => {
    setForm({
      driverId: shift.driverId,
      route: shift.route,
      date: formatDate(shift.startTimestamp),
      startTime: formatTime(shift.startTimestamp),
      duration: shift.duration,
    });
    setEditShiftId(shift.id);
  };

  return (
    <div>
      <h2 className="dashboard-title">Shift Management</h2>

      {/* Form */}
      <div className="form-grid form-3">
        <div className="field">
          <label className="field-label">Driver</label>
          <select
            name="driverId"
            value={form.driverId}
            onChange={onChange}
            className="input-wrap"
          >
            <option value="">Select driver</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label">Route</label>
          <select
            name="route"
            value={form.route}
            onChange={onChange}
            className="input-wrap"
          >
            <option value="">Select route</option>
            {routes.map((r) => (
              <option key={r.id} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label">Date</label>
          <input
            type="date"
            name="date"
            value={form.date}
            onChange={onChange}
            className="input-wrap"
          />
        </div>

        <div className="field">
          <label className="field-label">Start Time</label>
          <input
            type="time"
            name="startTime"
            value={form.startTime}
            onChange={onChange}
            className="input-wrap"
          />
        </div>

        <div className="field">
          <label className="field-label">Duration (minutes)</label>
          <input
            type="number"
            name="duration"
            value={form.duration}
            onChange={onChange}
            className="input-wrap"
          />
        </div>

        <div className="field">
          <label className="field-label">End Time</label>
          <input
            type="time"
            value={
              form.date && form.startTime && form.duration
                ? formatTime(
                    calculateEndTimestamp(
                      Timestamp.fromDate(
                        new Date(
                          ...form.date
                            .split("-")
                            .map((v, i) => (i > 0 ? v - 1 : v)),
                          ...form.startTime.split(":").map(Number)
                        )
                      ),
                      Number(form.duration)
                    )
                  )
                : ""
            }
            disabled
            className="input-wrap"
          />
        </div>

        <div className="form-actions span-3">
          <button className="btn btn-gradient" onClick={onSave}>
            {editShiftId ? "Update Shift" : "Add Shift"}
          </button>
        </div>
      </div>

      {/* Past shifts table */}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Driver</th>
              <th>Route</th>
              <th>Date</th>
              <th>Start Time</th>
              <th>Duration</th>
              <th>End Time</th>
              <th>Edit</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((shift) => (
              <tr key={shift.id}>
                <td>
                  {drivers.find((d) => d.id === shift.driverId)?.name || "—"}
                </td>
                <td>{shift.route}</td>
                <td>{shift.formattedDate || ""}</td>
                <td>{shift.formattedStartTime || ""}</td>
                <td>{shift.duration}</td>
                <td>{shift.formattedEndTime || ""}</td>
                <td>
                  <button onClick={() => onEdit(shift)}>Edit</button>
                </td>
              </tr>
            ))}
            {shifts.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", opacity: 0.7 }}>
                  No shifts found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}