// Routes.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from 'react-hot-toast';
import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  getCountFromServer,
  doc,
  updateDoc,
  GeoPoint,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom bus stop icon
const busStopIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3473/3473475.png',
  iconSize: [25, 25],
  iconAnchor: [12, 25],
  popupAnchor: [0, -25],
});

// =====================
// OSM/OSRM HELPERS
// =====================

// Free endpoints (no keys); be considerate of public usage limits
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
OSRM_BASE = "https://routing.openstreetmap.de/routed-car";

// Geocode a place/city name -> { lat, lon, display_name }
async function geocodeNominatim(query) {
  const url = `${NOMINATIM_BASE}/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) throw new Error(`No results for: ${query}`);
  const { lat, lon, display_name } = data[0];
  return { lat: Number(lat), lon: Number(lon), display_name };
}

// Reverse geocode lat/lon -> human-friendly { name, city }
async function reverseNominatim(lat, lon) {
  const url = `${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lon}&zoom=12&addressdetails=1`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`Reverse geocoding failed: ${res.status}`);
  const data = await res.json();
  const name = data?.name || data?.address?.suburb || data?.address?.town || data?.address?.city || data?.display_name?.split(",")[0] || "Stop";
  const city = data?.address?.city || data?.address?.town || data?.address?.state_district || data?.address?.state || "";
  return { name, city };
}

// Route between two coords via OSRM -> { distanceKm, durationMin, polyline }
async function osrmRoute(start, end) {
  // OSRM expects lon,lat order
  const coords = `${start.lon},${start.lat};${end.lon},${end.lat}`;
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=polyline&alternatives=false&steps=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Routing failed: ${res.status}`);
  const json = await res.json();
  if (!json?.routes?.[0]) throw new Error("No route found between the given locations");
  const r = json.routes[0];
  const distanceKm = Math.round((r.distance || 0) / 1000);
  const durationMin = Math.round((r.duration || 0) / 60);
  const polyline = r.geometry; // encoded polyline5
  return { distanceKm, durationMin, polyline };
}

// Decode polyline5 to [lat, lon] pairs
function decodePolyline(encoded) {
  const points = [];
  let index = 0, len = encoded.length;
  let lat = 0, lng = 0;
  while (index < len) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;
    points.push([lat * 1e-5, lng * 1e-5]);
  }
  return points;
}

// Pick ~N evenly spaced indices along decoded route to create mid stops
function pickStopsAlongRoute(decodedCoords, numStops) {
  if (decodedCoords.length === 0 || numStops <= 0) return [];
  const picks = [];
  for (let i = 1; i <= numStops; i++) {
    const ratio = i / (numStops + 1);
    const idx = Math.min(decodedCoords.length - 1, Math.round(ratio * (decodedCoords.length - 1)));
    const [lat, lon] = decodedCoords[idx];
    picks.push({ lat, lon });
  }
  return picks;
}

// Fare calculator helpers
function fareToHere(baseFare, perKmRate, distanceKm) {
  const bf = Number(baseFare || 0);
  const pk = Number(perKmRate || 0);
  const d = Number(distanceKm || 0);
  return Math.round((bf + pk * d) * 100) / 100; // 2 decimals
}
function segmentFare(perKmRate, fromKm, toKm) {
  const pk = Number(perKmRate || 0);
  const seg = Math.max(0, Number(toKm || 0) - Number(fromKm || 0));
  return Math.round((pk * seg) * 100) / 100;
}

export default function Routes() {
  const [routes, setRoutes] = useState([]);
  const [form, setForm] = useState({
    name: "",
    start: "",
    end: "",
    operatingDays: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
    isActive: true,
    estimatedDuration: "",
    fare: { baseFare: 0, perKmRate: 0 },
    stops: [],
    totalDistance: 0,
  });
  const [filters, setFilters] = useState({
    search: "",
    start: "ALL",
    end: "ALL",
    sortBy: "createdAt_desc",
  });
  const [counts, setCounts] = useState({ total: 0 });
  const [expanded, setExpanded] = useState({});
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [savingRouteId, setSavingRouteId] = useState(null);
  const [mapCenter, setMapCenter] = useState([20.5937, 78.9629]); // India
  const [mapZoom, setMapZoom] = useState(5);
  const [routePolyline, setRoutePolyline] = useState([]);
  const [mapMarkers, setMapMarkers] = useState([]);
  const firstInputRef = useRef(null);

  // Helper for timestamp conversion
  const tsToLocal = (t) => {
    try {
      const d = t?.toDate?.();
      return d ? d.toLocaleString() : "—";
    } catch {
      return "—";
    }
  };

  // Live routes subscription
  useEffect(() => {
    firstInputRef.current?.focus();
    const qRef = query(collection(db, "routes"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(qRef, (snap) => {
      setRoutes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // Total count refresh
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const coll = collection(db, "routes");
        const totalSnap = await getCountFromServer(coll);
        if (!mounted) return;
        setCounts({ total: totalSnap.data().count || 0 });
      } catch (error) {
        console.error('Error getting count:', error);
      }
    };
    refresh();
    return () => { mounted = false; };
  }, []);

  // Update map markers when stops change
  useEffect(() => {
    if (form.stops.length > 0) {
      const markers = form.stops.map(stop => ({
        position: [stop.coordinates.latitude, stop.coordinates.longitude],
        name: stop.name,
        city: stop.city,
        distance: stop.distanceFromStart,
        stopOrder: stop.stopOrder
      }));
      setMapMarkers(markers);

      // Center map on the route
      if (markers.length > 0) {
        const lats = markers.map(m => m.position[0]);
        const lngs = markers.map(m => m.position[1]);
        const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
        const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
        setMapCenter([centerLat, centerLng]);
        setMapZoom(8);
      }
    }
  }, [form.stops]);

  // Suggest stops using OSM/OSRM
  const suggestStops = async () => {
    if (!form.start || !form.end) {
      toast.error('Please enter both start and end locations');
      return;
    }
    try {
      setLoadingSuggest(true);

      // Geocode start/end via Nominatim
      const startGeo = await geocodeNominatim(`${form.start}, India`);
      const endGeo   = await geocodeNominatim(`${form.end}, India`);

      // Clean display names for UI fields
      setForm(prev => ({
        ...prev,
        start: startGeo.display_name.split(",")[0],
        end:   endGeo.display_name.split(",")[0],
      }));

      // Route via OSRM
      const routeInfo = await osrmRoute(startGeo, endGeo);
      const decoded = decodePolyline(routeInfo.polyline);

      // Decide intermediate stops (~50 km apart, min 3)
      const numStops = Math.max(3, Math.floor(routeInfo.distanceKm / 50));
      const mids = pickStopsAlongRoute(decoded, numStops);

      // Reverse-geocode mid stops for names
      const midStops = [];
      for (let i = 0; i < mids.length; i++) {
        const p = mids[i];
        try {
          const rev = await reverseNominatim(p.lat, p.lon);
          midStops.push({
            id: `stop_${i+2}`,
            name: rev.name || `Stop ${i+2}`,
            city: rev.city || "",
            coordinates: new GeoPoint(p.lat, p.lon),
            stopOrder: i + 2,
            distanceFromStart: Math.round((routeInfo.distanceKm * (i + 1)) / (numStops + 1)),
          });
        } catch {
          midStops.push({
            id: `stop_${i+2}`,
            name: `Stop ${i+2}`,
            city: "",
            coordinates: new GeoPoint(p.lat, p.lon),
            stopOrder: i + 2,
            distanceFromStart: Math.round((routeInfo.distanceKm * (i + 1)) / (numStops + 1)),
          });
        }
      }

      // Build full stop list
      const stops = [
        {
          id: "stop_1",
          name: startGeo.display_name.split(",")[0],
          city: startGeo.display_name.split(",")[0],
          coordinates: new GeoPoint(startGeo.lat, startGeo.lon),
          stopOrder: 1,
          distanceFromStart: 0,
        },
        ...midStops,
        {
          id: `stop_${numStops + 2}`,
          name: endGeo.display_name.split(",")[0],
          city: endGeo.display_name.split(",")[0],
          coordinates: new GeoPoint(endGeo.lat, endGeo.lon),
          stopOrder: numStops + 2,
          distanceFromStart: routeInfo.distanceKm,
        },
      ];

      const hours = Math.floor(routeInfo.durationMin / 60);
      const minutes = routeInfo.durationMin % 60;
      const estimatedDuration = `${hours}h ${minutes}m`;

      setRoutePolyline(decoded);
      setForm(prev => ({
        ...prev,
        stops,
        totalDistance: routeInfo.distanceKm,
        estimatedDuration,
      }));

      // Map markers
      const markers = stops.map(s => ({
        position: [s.coordinates.latitude, s.coordinates.longitude],
        name: s.name,
        city: s.city,
        distance: s.distanceFromStart,
        stopOrder: s.stopOrder,
      }));
      setMapMarkers(markers);

      // Center map
      if (decoded.length > 0) {
        const lats = decoded.map(p => p[0]);
        const lons = decoded.map(p => p[1]);
        const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
        const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2;
        setMapCenter([centerLat, centerLon]);
        setMapZoom(8);
      }

      toast.success(`Created ${stops.length} stops on the route`);
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to suggest stops");
    } finally {
      setLoadingSuggest(false);
    }
  };

  // Submit new route
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.start.trim() || !form.end.trim()) {
      toast.error('Please fill all required fields');
      return;
    }

    try {
      const stopsPayload = [...(form.stops || [])]
        .sort((a, b) => (a.stopOrder || 0) - (b.stopOrder || 0))
        .map((s, idx) => ({
          id: s.id || `stop_${idx + 1}`,
          name: s.name || "",
          city: s.city || "",
          coordinates: s.coordinates,
          stopOrder: s.stopOrder || idx + 1,
          distanceFromStart: Number(s.distanceFromStart || 0),
          arrivalTime: null,
          departureTime: null,
        }));

      await addDoc(collection(db, "routes"), {
        name: form.name.trim(),
        start: form.start.trim(),
        end: form.end.trim(),
        operatingDays: form.operatingDays,
        isActive: !!form.isActive,
        estimatedDuration: form.estimatedDuration,
        fare: {
          baseFare: Number(form.fare.baseFare || 0),
          perKmRate: Number(form.fare.perKmRate || 0),
        },
        totalDistance: Number(form.totalDistance || 0),
        stops: stopsPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast.success('Route added successfully!');

      // Reset form
      setForm({
        name: "",
        start: "",
        end: "",
        operatingDays: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
        isActive: true,
        estimatedDuration: "",
        fare: { baseFare: 0, perKmRate: 0 },
        stops: [],
        totalDistance: 0,
      });

      // Reset map
      setRoutePolyline([]);
      setMapMarkers([]);

    } catch (error) {
      console.error('Error adding route:', error);
      toast.error('Failed to add route');
    }
  };

  // Auto-fill stops for existing route using OSM/OSRM
  const autofillRouteStops = async (route) => {
    if (!route?.start || !route?.end) { toast.error("Invalid route data"); return; }
    setSavingRouteId(route.id);
    try {
      const startGeo = await geocodeNominatim(`${route.start}, India`);
      const endGeo   = await geocodeNominatim(`${route.end}, India`);
      const routeInfo = await osrmRoute(startGeo, endGeo);
      const decoded = decodePolyline(routeInfo.polyline);

      const numStops = Math.max(3, Math.floor(routeInfo.distanceKm / 50));
      const mids = pickStopsAlongRoute(decoded, numStops);

      const midStops = [];
      for (let i = 0; i < mids.length; i++) {
        const p = mids[i];
        try {
          const rev = await reverseNominatim(p.lat, p.lon);
          midStops.push({
            id: `stop_${i+2}`,
            name: rev.name || `Stop ${i+2}`,
            city: rev.city || "",
            coordinates: new GeoPoint(p.lat, p.lon),
            stopOrder: i + 2,
            distanceFromStart: Math.round((routeInfo.distanceKm * (i + 1)) / (numStops + 1)),
          });
        } catch {
          midStops.push({
            id: `stop_${i+2}`,
            name: `Stop ${i+2}`,
            city: "",
            coordinates: new GeoPoint(p.lat, p.lon),
            stopOrder: i + 2,
            distanceFromStart: Math.round((routeInfo.distanceKm * (i + 1)) / (numStops + 1)),
          });
        }
      }

      const stops = [
        {
          id: "stop_1",
          name: route.start,
          city: route.start,
          coordinates: new GeoPoint(startGeo.lat, startGeo.lon),
          stopOrder: 1,
          distanceFromStart: 0,
        },
        ...midStops,
        {
          id: `stop_${numStops + 2}`,
          name: route.end,
          city: route.end,
          coordinates: new GeoPoint(endGeo.lat, endGeo.lon),
          stopOrder: numStops + 2,
          distanceFromStart: routeInfo.distanceKm,
        },
      ];

      const hours = Math.floor(routeInfo.durationMin / 60);
      const minutes = routeInfo.durationMin % 60;
      const estimatedDuration = `${hours}h ${minutes}m`;

      await updateDoc(doc(db, "routes", route.id), {
        stops,
        totalDistance: routeInfo.distanceKm,
        estimatedDuration,
        updatedAt: serverTimestamp(),
      });

      setExpanded((s) => ({ ...s, [route.id]: true }));
      toast.success("Route stops updated successfully");
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Auto-fill failed");
    } finally {
      setSavingRouteId(null);
    }
  };

  const starts = useMemo(
    () =>
      Array.from(new Set(routes.map((r) => r.start).filter(Boolean))).sort((a, b) =>
        String(a).localeCompare(String(b))
      ),
    [routes]
  );
  const ends = useMemo(
    () =>
      Array.from(new Set(routes.map((r) => r.end).filter(Boolean))).sort((a, b) =>
        String(a).localeCompare(String(b))
      ),
    [routes]
  );

  // Client-side filtering
  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return routes.filter((r) => {
      const text = `${r.name ?? ""} ${r.start ?? ""} ${r.end ?? ""}`.toLowerCase();
      if (q && !text.includes(q)) return false;
      if (filters.start !== "ALL" && r.start !== filters.start) return false;
      if (filters.end !== "ALL" && r.end !== filters.end) return false;
      return true;
    });
  }, [routes, filters]);

  // Sorting
  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (filters.sortBy === "name_asc") {
      arr.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
    } else if (filters.sortBy === "start_asc") {
      arr.sort((a, b) => String(a.start ?? "").localeCompare(String(b.start ?? "")));
    } else if (filters.sortBy === "end_asc") {
      arr.sort((a, b) => String(a.end ?? "").localeCompare(String(b.end ?? "")));
    }
    // createdAt_desc is already applied by the live query
    return arr;
  }, [filtered, filters.sortBy]);

  // CSV export (respects filters + sort)
  const exportCSV = () => {
    const header = ["Route", "Start", "End", "DistanceKm", "Duration", "Stops"];
    const lines = sorted.map((r) => [
      r.name ?? "",
      r.start ?? "",
      r.end ?? "",
      r.totalDistance ?? "",
      r.estimatedDuration ?? "",
      Array.isArray(r.stops) ? r.stops.length : 0,
    ]);
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const csv = [header.map(esc).join(","), ...lines.map((row) => row.map(esc).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `routes_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () =>
    setFilters({ search: "", start: "ALL", end: "ALL", sortBy: "createdAt_desc" });

  return (
    <div className="page-stack">
      {/* Add Route */}
      <section className="card glass">
        <header className="section-head">
          <h3 className="section-title">Add Route</h3>
          <span className="pill">Total (live): {routes.length}</span>
        </header>

        <form className="form-grid form-3" onSubmit={submit}>
          <label className="field">
            <span className="field-label">Route Name</span>
            <div className="input-wrap">
              <span className="input-icon">🛣️</span>
              <input
                ref={firstInputRef}
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="Delhi - Amritsar"
                required
                className="input"
              />
            </div>
          </label>

          <label className="field">
            <span className="field-label">Start</span>
            <div className="input-wrap">
              <span className="input-icon">🏁</span>
              <input
                value={form.start}
                onChange={(e) => setForm((s) => ({ ...s, start: e.target.value }))}
                placeholder="Delhi"
                required
                className="input"
              />
            </div>
          </label>

          <label className="field">
            <span className="field-label">End</span>
            <div className="input-wrap">
              <span className="input-icon">🎯</span>
              <input
                value={form.end}
                onChange={(e) => setForm((s) => ({ ...s, end: e.target.value }))}
                placeholder="Amritsar"
                required
                className="input"
              />
            </div>
          </label>

          <label className="field">
            <span className="field-label">Base Fare (₹)</span>
            <div className="input-wrap">
              <span className="input-icon">💰</span>
              <input
                type="number" min="0" step="1"
                value={form.fare.baseFare}
                onChange={(e) => setForm((s) => ({ ...s, fare: { ...s.fare, baseFare: e.target.value } }))}
                placeholder="e.g., 50"
                className="input"
              />
            </div>
          </label>

          <label className="field">
            <span className="field-label">Per Km (₹/km)</span>
            <div className="input-wrap">
              <span className="input-icon">📏</span>
              <input
                type="number" min="0" step="0.1"
                value={form.fare.perKmRate}
                onChange={(e) => setForm((s) => ({ ...s, fare: { ...s.fare, perKmRate: e.target.value } }))}
                placeholder="e.g., 2.5"
                className="input"
              />
            </div>
          </label>

          <label className="field">
            <span className="field-label">Duration</span>
            <div className="input-wrap">
              <span className="input-icon">⏱️</span>
              <input
                value={form.estimatedDuration}
                onChange={(e) => setForm((s) => ({ ...s, estimatedDuration: e.target.value }))}
                placeholder="e.g., 7h"
                className="input"
              />
            </div>
          </label>

          <div className="form-actions span-3" style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button type="button" className="btn" onClick={suggestStops} disabled={loadingSuggest}>
              {loadingSuggest ? "Suggesting..." : "Suggest Stops"}
            </button>
            <button type="submit" className="btn btn-gradient">Save Route</button>
            <button type="button" className="btn" onClick={exportCSV}>Export CSV</button>
            <button type="button" className="btn ghost" onClick={clearFilters}>Clear</button>
            <span style={{ opacity: 0.7 }}>
              {form.totalDistance ? `~${form.totalDistance} km` : ""}{form.estimatedDuration ? ` • ${form.estimatedDuration}` : ""}
            </span>
          </div>

          {/* Map Visualization */}
          <div className="span-3">
            <h4 style={{ marginTop: 12 }}>Route Map</h4>
            <div style={{ height: '400px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #ccc' }}>
              <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  attribution='&copy; OpenStreetMap contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Route Polyline */}
                {routePolyline.length > 0 && (
                  <Polyline positions={routePolyline} color="blue" weight={4} opacity={0.7} />
                )}

                {/* Stops Markers */}
                {mapMarkers.map((marker, index) => (
                  <Marker
                    key={index}
                    position={marker.position}
                    icon={busStopIcon}
                  >
                    <Popup>
                      <div>
                        <strong>Stop #{marker.stopOrder}: {marker.name}</strong><br />
                        {marker.city && `City: ${marker.city}<br />`}
                        Distance: {marker.distance} km
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </div>

          <div className="span-3">
            <h4 style={{ marginTop: 12 }}>Stops Preview</h4>
            {form.stops.length === 0 ? (
              <div className="empty-row">No stops yet — click Suggest Stops after entering Start and End</div>
            ) : (
              <div className="table-wrap" style={{ maxHeight: 240, overflow: "auto" }}>
                <table className="data-table routes-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>City</th>
                      <th>Dist (km)</th>
                      <th>Fare to here (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...form.stops].sort((a,b) => (a.stopOrder||0)-(b.stopOrder||0)).map((s, idx, arr) => {
                      const baseFare = form.fare?.baseFare ?? 0;
                      const perKmRate = form.fare?.perKmRate ?? 0;
                      return (
                        <tr key={s.id}>
                          <td>{s.stopOrder}</td>
                          <td>{s.name}</td>
                          <td>{s.city}</td>
                          <td>{s.distanceFromStart}</td>
                          <td>{fareToHere(baseFare, perKmRate, s.distanceFromStart)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </form>
      </section>

      {/* Filters & Analytics */}
      <section className="card glass">
        <header className="section-head">
          <h3 className="section-title">Filters & Analytics</h3>
        </header>
        <div className="form-grid form-3">
          <label className="field">
            <span className="field-label">Search</span>
            <div className="input-wrap">
              <span className="input-icon">🔎</span>
              <input
                value={filters.search}
                onChange={(e) => setFilters((s) => ({ ...s, search: e.target.value }))}
                placeholder="Search name / start / end"
                className="input"
              />
            </div>
          </label>
          <label className="field">
            <span className="field-label">Start</span>
            <div className="input-wrap">
              <span className="input-icon">🧭</span>
              <select
                value={filters.start}
                onChange={(e) => setFilters((s) => ({ ...s, start: e.target.value }))}
                className="input select"
              >
                <option value="ALL">All</option>
                {starts.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </label>
          <label className="field">
            <span className="field-label">End</span>
            <div className="input-wrap">
              <span className="input-icon">📍</span>
              <select
                value={filters.end}
                onChange={(e) => setFilters((s) => ({ ...s, end: e.target.value }))}
                className="input select"
              >
                <option value="ALL">All</option>
                {ends.map((e2) => (
                  <option key={e2} value={e2}>{e2}</option>
                ))}
              </select>
            </div>
          </label>
          <label className="field">
            <span className="field-label">Sort</span>
            <div className="input-wrap">
              <span className="input-icon">🔽</span>
              <select
                value={filters.sortBy}
                onChange={(e) => setFilters((s) => ({ ...s, sortBy: e.target.value }))}
                className="input select"
              >
                <option value="createdAt_desc">Newest</option>
                <option value="name_asc">Route A→Z</option>
                <option value="start_asc">Start A→Z</option>
                <option value="end_asc">End A→Z</option>
              </select>
            </div>
          </label>
        </div>

        <div className="kpis" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginTop: 12 }}>
          <div className="kpi-tile">
            <div className="kpi-title">Total Routes</div>
            <div className="kpi-value">{counts.total}</div>
          </div>
          <div className="kpi-tile">
            <div className="kpi-title">Unique Starts</div>
            <div className="kpi-value">{starts.length}</div>
          </div>
          <div className="kpi-tile">
            <div className="kpi-title">Unique Ends</div>
            <div className="kpi-value">{ends.length}</div>
          </div>
          <div className="kpi-tile">
            <div className="kpi-title">Bidirectional Pairs</div>
            <div className="kpi-value">—</div>
          </div>
        </div>
      </section>

      {/* All Routes */}
      <section className="card glass">
        <header className="section-head">
          <h3 className="section-title">All Routes</h3>
          <span className="pill">Showing: {sorted.length}</span>
        </header>
        <div className="table-wrap">
          <table className="data-table routes-table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Start</th>
                <th>End</th>
                <th>Distance</th>
                <th>Duration</th>
                <th>Fare</th>
                <th>Stops</th>
                <th>Actions</th>
                <th>Expand</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const open = !!expanded[r.id];
                const count = Array.isArray(r.stops) ? r.stops.length : 0;
                return (
                  <React.Fragment key={r.id}>
                    <tr>
                      <td>{r.name}</td>
                      <td>{r.start}</td>
                      <td>{r.end}</td>
                      <td>{r.totalDistance ? `${r.totalDistance} km` : "—"}</td>
                      <td>{r.estimatedDuration || "—"}</td>
                      <td>
                        {r.fare?.baseFare ? `₹${r.fare.baseFare}` : "₹0"}
                        {r.fare?.perKmRate ? ` • ₹${r.fare.perKmRate}/km` : ""}
                      </td>
                      <td>{count}</td>
                      <td style={{ display: "flex", gap: 8 }}>
                        <button
                          className="btn"
                          onClick={() => autofillRouteStops(r)}
                          disabled={savingRouteId === r.id}
                          title="Generate stops from OSM"
                        >
                          {savingRouteId === r.id ? "Filling..." : "Auto‑fill from OSM"}
                        </button>
                      </td>
                      <td>
                        <button className="btn ghost" onClick={() => setExpanded((s) => ({ ...s, [r.id]: !open }))}>
                          {open ? "Hide" : "View"}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={9}>
                          {count === 0 ? (
                            <div className="empty-row">No stops recorded for this route</div>
                          ) : (
                            <div className="table-wrap">
                              <table className="data-table">
                                <thead>
                                  <tr>
                                    <th>#</th>
                                    <th>Name</th>
                                    <th>City</th>
                                    <th>Distance (km)</th>
                                    <th>Fare to here (₹)</th>
                                    <th>Segment fare (₹)</th>
                                    <th>Arrival</th>
                                    <th>Departure</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {[...r.stops]
                                    .sort((a, b) => (a.stopOrder || 0) - (b.stopOrder || 0))
                                    .map((s, idx, arr) => {
                                      const baseFare = r.fare?.baseFare ?? 0;
                                      const perKmRate = r.fare?.perKmRate ?? 0;
                                      const toHere = fareToHere(baseFare, perKmRate, s.distanceFromStart);
                                      const prevKm = idx === 0 ? 0 : (arr[idx-1].distanceFromStart ?? 0);
                                      const segFare = idx === 0 ? 0 : segmentFare(perKmRate, prevKm, s.distanceFromStart);
                                      return (
                                        <tr key={s.id || idx}>
                                          <td>{s.stopOrder || idx + 1}</td>
                                          <td>{s.name || "—"}</td>
                                          <td>{s.city || "—"}</td>
                                          <td>{s.distanceFromStart ?? "—"}</td>
                                          <td>{toHere}</td>
                                          <td>{segFare}</td>
                                          <td>{tsToLocal(s.arrivalTime)}</td>
                                          <td>{tsToLocal(s.departureTime)}</td>
                                        </tr>
                                      );
                                    })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty-row">No routes match filters</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
