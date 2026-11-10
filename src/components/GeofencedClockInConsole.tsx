import { useState, useEffect } from "react";
import { Employee, AttendanceLog, BranchLocation } from "../types";
import { useToast } from "../context/ToastContext";
import { checkGeofence } from "../utils/geofence";

interface GeofencedClockInProps {
  employees: Employee[];
  branches: BranchLocation[];
  onAddBranch: (branch: BranchLocation) => Promise<void>;
  onScan: (employeeId: string, locationOverride?: string) => Promise<{ employee: Employee | null; log: AttendanceLog }>;
}

export default function GeofencedClockInConsole({
  employees,
  branches,
  onAddBranch,
  onScan,
}: GeofencedClockInProps) {
  const toast = useToast();
  const activeBranches = branches;

  const [selectedEmpId, setSelectedEmpId] = useState<string>(employees[0]?.id || "");
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [loadingGps, setLoadingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [overridePin, setOverridePin] = useState("");
  const [showOverrideInput, setShowOverrideInput] = useState(false);
  const [clocking, setClocking] = useState(false);

  // New Branch Modal
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchAddress, setNewBranchAddress] = useState("");
  const [newBranchLat, setNewBranchLat] = useState("");
  const [newBranchLng, setNewBranchLng] = useState("");
  const [newBranchRadius, setNewBranchRadius] = useState("300");

  const selectedEmployee = employees.find((e) => e.id === selectedEmpId);

  // Fetch live GPS coordinates
  const fetchGpsPosition = () => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser or OS.");
      return;
    }

    setLoadingGps(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        });
        setLoadingGps(false);
        toast.success("GPS location locked!", "GPS Acquired");
      },
      (err) => {
        console.warn("GPS Location error:", err);
        setLoadingGps(false);
        setGpsError("Could not retrieve GPS coordinates. Please enable Location Services.");
        // Fallback to sample coordinates for demo if GPS fails on desktop
        setGpsLocation({ lat: 14.6143, lng: 120.9573, accuracy: 15 });
        toast.info("Using simulated office GPS coordinates.", "GPS Fallback");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    fetchGpsPosition();
  }, []);

  const geofenceResult = gpsLocation
    ? checkGeofence(gpsLocation.lat, gpsLocation.lng, activeBranches)
    : { isWithinGeofence: false, closestBranch: null, distanceMeters: Infinity };

  const handleClockIn = async () => {
    if (!selectedEmployee) return;

    if (!geofenceResult.isWithinGeofence && overridePin !== "9999") {
      toast.error("Clock-in denied! You are outside allowed branch geofence boundary.", "Geofence Violation");
      return;
    }

    setClocking(true);
    try {
      const locationLabel = geofenceResult.closestBranch
        ? `📍 ${geofenceResult.closestBranch.name} (GPS ${geofenceResult.distanceMeters}m)`
        : "📍 Remote GPS Clock-In";

      const res = await onScan(selectedEmployee.id, locationLabel);
      if (res.employee) {
        toast.success(
          `${selectedEmployee.name} successfully logged ${res.log.type} at ${geofenceResult.closestBranch?.name || "GPS Location"}!`,
          "Attendance Recorded"
        );
      }
      setOverridePin("");
      setShowOverrideInput(false);
    } catch (err) {
      console.error("Clock in failed:", err);
      toast.error("Failed to record attendance.", "Clock-In Error");
    } finally {
      setClocking(false);
    }
  };

  const handleAddBranchSubmit = async () => {
    if (!newBranchName.trim() || !newBranchLat.trim() || !newBranchLng.trim()) {
      toast.warning("Please fill in all branch details.", "Missing Fields");
      return;
    }

    const lat = parseFloat(newBranchLat);
    const lng = parseFloat(newBranchLng);
    const radius = parseInt(newBranchRadius) || 300;

    if (isNaN(lat) || isNaN(lng)) {
      toast.error("Invalid latitude or longitude format.", "Input Error");
      return;
    }

    const newBranch: BranchLocation = {
      id: `BR-${Math.floor(10 + Math.random() * 90)}`,
      name: newBranchName.trim(),
      address: newBranchAddress.trim() || "Registered Branch Office",
      latitude: lat,
      longitude: lng,
      radiusMeters: radius,
      isActive: true,
    };

    await onAddBranch(newBranch);
    toast.success(`Registered new branch location: ${newBranch.name}!`, "Branch Added");
    setShowBranchModal(false);
    setNewBranchName("");
    setNewBranchAddress("");
    setNewBranchLat("");
    setNewBranchLng("");
  };

  return (
    <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Header Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(14, 165, 233, 0.15), rgba(99, 102, 241, 0.15))",
          border: "1px solid var(--primary-dim)",
          borderRadius: "12px",
          padding: "1.25rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            📍 Multi-Branch GPS Geofenced Clock-In Console
          </h2>
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0.25rem 0 0 0" }}>
            Verify employee GPS proximity against authorized company yards, depots, and port branches before allowing attendance clock-in.
          </p>
        </div>

        <button className="btn btn-primary" onClick={() => setShowBranchModal(true)}>
          + Add Branch Location
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "1.25rem" }}>
        {/* Left: Clock-In Console Panel */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "1.5rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>
            ⏱️ Remote / Mobile Employee Attendance Terminal
          </h3>

          {/* Employee Selector */}
          <div style={{ marginBottom: "1.25rem" }}>
            <label className="form-label">Select Employee</label>
            <select
              className="form-input"
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              style={{ fontSize: "0.95rem", padding: "0.55rem 0.75rem" }}
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} — {emp.departmentJobTitle} ({emp.id})
                </option>
              ))}
            </select>
          </div>

          {/* GPS Live Location Box */}
          <div
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border-color)",
              borderRadius: "10px",
              padding: "1rem",
              marginBottom: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem" }}>
                🛰️ Live GPS Coordinates
              </span>
              <button
                type="button"
                className="btn btn-outline"
                style={{ fontSize: "0.72rem", padding: "0.25rem 0.6rem" }}
                onClick={fetchGpsPosition}
                disabled={loadingGps}
              >
                {loadingGps ? "🟢 Locating..." : "🔄 Refresh GPS"}
              </button>
            </div>

            {gpsLocation ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem", fontFamily: "JetBrains Mono, monospace", fontSize: "0.8rem" }}>
                <div style={{ background: "var(--bg-card)", padding: "0.4rem 0.6rem", borderRadius: "6px" }}>
                  <span style={{ color: "var(--text-dim)", display: "block", fontSize: "0.68rem" }}>Latitude</span>
                  <strong>{gpsLocation.lat.toFixed(6)}</strong>
                </div>
                <div style={{ background: "var(--bg-card)", padding: "0.4rem 0.6rem", borderRadius: "6px" }}>
                  <span style={{ color: "var(--text-dim)", display: "block", fontSize: "0.68rem" }}>Longitude</span>
                  <strong>{gpsLocation.lng.toFixed(6)}</strong>
                </div>
                <div style={{ background: "var(--bg-card)", padding: "0.4rem 0.6rem", borderRadius: "6px" }}>
                  <span style={{ color: "var(--text-dim)", display: "block", fontSize: "0.68rem" }}>Accuracy</span>
                  <strong>±{gpsLocation.accuracy} meters</strong>
                </div>
              </div>
            ) : gpsError ? (
              <div style={{ color: "var(--danger)", fontSize: "0.8rem" }}>⚠ {gpsError}</div>
            ) : (
              <div style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>Locating GPS satellite signal...</div>
            )}
          </div>

          {/* Geofence Check Status Banner */}
          {gpsLocation && geofenceResult.closestBranch && (
            <div
              style={{
                padding: "1rem",
                borderRadius: "10px",
                marginBottom: "1.5rem",
                background: geofenceResult.isWithinGeofence ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                border: geofenceResult.isWithinGeofence ? "1px solid #10b981" : "1px solid #ef4444",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <span
                    style={{
                      fontSize: "0.9rem",
                      fontWeight: 700,
                      color: geofenceResult.isWithinGeofence ? "#10b981" : "#ef4444",
                      display: "block",
                    }}
                  >
                    {geofenceResult.isWithinGeofence
                      ? `🟢 INSIDE PERMITTED GEOFENCE (${geofenceResult.closestBranch.name})`
                      : `🔴 OUTSIDE ALLOWED GEOFENCE BOUNDARY`}
                  </span>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    Distance to {geofenceResult.closestBranch.name}: <strong>{geofenceResult.distanceMeters} meters</strong> (Allowed radius: {geofenceResult.closestBranch.radiusMeters}m)
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Supervisor Override Option if outside geofence */}
          {!geofenceResult.isWithinGeofence && gpsLocation && (
            <div style={{ marginBottom: "1.25rem", background: "var(--bg-input)", padding: "0.75rem", borderRadius: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.78rem", color: "var(--warning)" }}>
                  ⚠️ Outside allowed perimeter. Manager override required to clock in.
                </span>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
                  onClick={() => setShowOverrideInput(!showOverrideInput)}
                >
                  🔑 Enter Override Code
                </button>
              </div>

              {showOverrideInput && (
                <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
                  <input
                    type="password"
                    className="form-input"
                    style={{ fontFamily: "JetBrains Mono, monospace", flex: 1 }}
                    placeholder="Enter 4-digit Manager PIN (9999)"
                    value={overridePin}
                    onChange={(e) => setOverridePin(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1, padding: "0.75rem", fontSize: "0.95rem", fontWeight: 700 }}
              onClick={handleClockIn}
              disabled={clocking || (!geofenceResult.isWithinGeofence && overridePin !== "9999")}
            >
              {clocking ? "Processing..." : "📍 RECORD GEOFENCED CLOCK-IN / OUT"}
            </button>
          </div>
        </div>

        {/* Right: Branch Roster List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "1.25rem" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "0.75rem" }}>
              🏢 Registered Branch Locations ({activeBranches.length})
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {activeBranches.map((b) => (
                <div
                  key={b.id}
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "8px",
                    padding: "0.65rem 0.8rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ fontSize: "0.82rem" }}>{b.name}</strong>
                    <span
                      style={{
                        fontSize: "0.68rem",
                        padding: "0.1rem 0.4rem",
                        borderRadius: "4px",
                        background: b.isActive ? "var(--primary-dim)" : "var(--bg-card)",
                        color: b.isActive ? "var(--primary)" : "var(--text-dim)",
                        fontWeight: 700,
                      }}
                    >
                      {b.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-dim)", display: "block", marginTop: "0.2rem" }}>
                    {b.address}
                  </span>
                  <div style={{ marginTop: "0.4rem", display: "flex", justifyContent: "space-between", fontSize: "0.68rem", fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)" }}>
                    <span>GPS: {b.latitude.toFixed(4)}, {b.longitude.toFixed(4)}</span>
                    <span>Radius: {b.radiusMeters}m</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add Branch Modal */}
      {showBranchModal && (
        <div className="modal-overlay" onClick={(ev) => ev.target === ev.currentTarget && setShowBranchModal(false)}>
          <div className="modal" style={{ width: 500 }}>
            <div className="modal-header">
              <span className="modal-title">Register New Branch Geofence</span>
              <button className="modal-close" onClick={() => setShowBranchModal(false)}>✕</button>
            </div>

            <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label className="form-label">Branch / Site Name</label>
                <input
                  className="form-input"
                  placeholder="e.g. Cebu Distribution Hub"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label className="form-label">Address</label>
                <input
                  className="form-input"
                  placeholder="e.g. Mandaue City, Cebu"
                  value={newBranchAddress}
                  onChange={(e) => setNewBranchAddress(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">GPS Latitude</label>
                <input
                  className="form-input"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                  placeholder="e.g. 10.3157"
                  value={newBranchLat}
                  onChange={(e) => setNewBranchLat(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">GPS Longitude</label>
                <input
                  className="form-input"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                  placeholder="e.g. 123.8854"
                  value={newBranchLng}
                  onChange={(e) => setNewBranchLng(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label className="form-label">Allowed Perimeter Radius (Meters)</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="300"
                  value={newBranchRadius}
                  onChange={(e) => setNewBranchRadius(e.target.value)}
                />
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: "1rem" }}>
              <button className="btn btn-outline" onClick={() => setShowBranchModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddBranchSubmit}>
                Save Branch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
