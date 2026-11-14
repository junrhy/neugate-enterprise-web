import { useState, useEffect } from "react";
import { Employee, AttendanceLog, BranchLocation } from "../types";
import { useToast } from "../context/ToastContext";
import { getDistanceInMeters } from "../utils/geofence";
import MapLocationPicker from "./MapLocationPicker";
import WorksitesOverviewMap from "./WorksitesOverviewMap";

interface GeofencedClockInProps {
  employees: Employee[];
  branches: BranchLocation[];
  onAddBranch: (branch: BranchLocation) => Promise<void>;
  onToggleBranch?: (branchId: string, isActive: boolean) => Promise<void>;
  onDeleteBranch?: (branchId: string) => Promise<void>;
  onScan?: (employeeId: string, locationOverride?: string) => Promise<{ employee: Employee | null; log: AttendanceLog }>;
}

export default function GeofencedClockInConsole({
  employees,
  branches,
  onAddBranch,
  onToggleBranch,
  onDeleteBranch,
}: GeofencedClockInProps) {
  const toast = useToast();
  const [subTab, setSubTab] = useState<"worksites" | "employees" | "rules">("worksites");
  const [worksitesView, setWorksitesView] = useState<"cards" | "map">("cards");
  const [employeeSearch, setEmployeeSearch] = useState("");

  // Live GPS for distance calculations
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [loadingGps, setLoadingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Employee-to-branch policy assignments stored in localStorage
  const [employeePolicies, setEmployeePolicies] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem("neugate_employee_branch_policies");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Terminal geofence settings stored in localStorage
  const [enforceGeofence, setEnforceGeofence] = useState(() => {
    return localStorage.getItem("neugate_geofence_enforce") === "true";
  });
  const [overridePin, setOverridePin] = useState(() => {
    return localStorage.getItem("neugate_geofence_override_pin") || "9999";
  });

  // Add / Edit Worksite Modal State
  const [showModal, setShowModal] = useState(false);
  const [showMapInModal, setShowMapInModal] = useState(true);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [branchName, setBranchName] = useState("");
  const [branchAddress, setBranchAddress] = useState("");
  const [branchLat, setBranchLat] = useState("");
  const [branchLng, setBranchLng] = useState("");
  const [branchRadius, setBranchRadius] = useState("300");

  // Fetch live GPS coordinates
  const fetchGpsPosition = (isManual = false) => {
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
        if (isManual) {
          toast.success("GPS position locked!", "GPS Acquired");
        }
      },
      (err) => {
        console.warn("GPS Location error:", err);
        setLoadingGps(false);
        setGpsError("Could not retrieve GPS coordinates. Please enable Location Services.");
        setGpsLocation({ lat: 14.6143, lng: 120.9573, accuracy: 15 });
        if (isManual) {
          toast.info("Using simulated office GPS coordinates.", "GPS Fallback");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    fetchGpsPosition(false);
  }, []);

  // Quick-add current location as a worksite
  const handleQuickAddCurrentLocation = async () => {
    if (!gpsLocation) {
      toast.warning("Waiting for GPS position to lock...", "GPS Needed");
      return;
    }
    const newBranch: BranchLocation = {
      id: `BR-${Math.floor(10 + Math.random() * 90)}`,
      name: "Main Yard / Office",
      address: "Primary Worksites Location",
      latitude: gpsLocation.lat,
      longitude: gpsLocation.lng,
      radiusMeters: 300,
      isActive: true,
    };
    await onAddBranch(newBranch);
    toast.success("Main Yard registered at your current GPS location (300m radius)!", "Worksite Added");
  };

  // Open modal for new worksite
  const handleOpenAddModal = () => {
    setEditingBranchId(null);
    setBranchName("");
    setBranchAddress("");
    if (gpsLocation) {
      setBranchLat(String(gpsLocation.lat));
      setBranchLng(String(gpsLocation.lng));
    } else {
      setBranchLat("14.5995");
      setBranchLng("120.9842");
    }
    setBranchRadius("300");
    setShowMapInModal(true);
    setShowModal(true);
  };

  // Open modal prefilled with coordinates picked from map
  const handleOpenAddModalAtCoords = (lat: number, lng: number) => {
    setEditingBranchId(null);
    setBranchName("");
    setBranchAddress("");
    setBranchLat(String(lat));
    setBranchLng(String(lng));
    setBranchRadius("300");
    setShowMapInModal(true);
    setShowModal(true);
  };

  // Open modal for editing an existing worksite
  const handleOpenEditModal = (b: BranchLocation) => {
    setEditingBranchId(b.id);
    setBranchName(b.name);
    setBranchAddress(b.address);
    setBranchLat(String(b.latitude));
    setBranchLng(String(b.longitude));
    setBranchRadius(String(b.radiusMeters));
    setShowMapInModal(true);
    setShowModal(true);
  };

  // Submit worksite
  const handleSaveBranch = async () => {
    if (!branchName.trim() || !branchLat.trim() || !branchLng.trim()) {
      toast.warning("Please fill in worksite name and GPS coordinates.", "Missing Fields");
      return;
    }

    const lat = parseFloat(branchLat);
    const lng = parseFloat(branchLng);
    const radius = parseInt(branchRadius, 10) || 300;

    if (isNaN(lat) || isNaN(lng)) {
      toast.error("Invalid latitude or longitude format.", "Input Error");
      return;
    }

    if (editingBranchId) {
      // Editing existing branch: update in branches list via delete + re-add or toggle
      if (onDeleteBranch) {
        await onDeleteBranch(editingBranchId);
      }
      const updated: BranchLocation = {
        id: editingBranchId,
        name: branchName.trim(),
        address: branchAddress.trim() || "Registered Worksite",
        latitude: lat,
        longitude: lng,
        radiusMeters: radius,
        isActive: true,
      };
      await onAddBranch(updated);
      toast.success(`Updated worksite "${updated.name}"!`, "Worksite Updated");
    } else {
      const newBranch: BranchLocation = {
        id: `BR-${Math.floor(10 + Math.random() * 90)}`,
        name: branchName.trim(),
        address: branchAddress.trim() || "Registered Worksite",
        latitude: lat,
        longitude: lng,
        radiusMeters: radius,
        isActive: true,
      };
      await onAddBranch(newBranch);
      toast.success(`Registered worksite "${newBranch.name}"!`, "Worksite Registered");
    }

    setShowModal(false);
  };

  // Update employee worksite policy
  const handleAssignEmployeeWorksite = (empId: string, branchId: string) => {
    const updated = { ...employeePolicies };
    if (!branchId || branchId === "ALL") {
      delete updated[empId];
    } else {
      updated[empId] = branchId;
    }
    setEmployeePolicies(updated);
    localStorage.setItem("neugate_employee_branch_policies", JSON.stringify(updated));
    toast.success("Employee worksite policy saved.", "Policy Updated");
  };

  // Format distance
  const formatDistance = (meters: number) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${meters} meters`;
  };

  // Filter employees
  const filteredEmployees = employees.filter(
    (e) =>
      e.name.toLowerCase().includes(employeeSearch.toLowerCase()) ||
      e.departmentJobTitle.toLowerCase().includes(employeeSearch.toLowerCase()) ||
      e.id.toLowerCase().includes(employeeSearch.toLowerCase())
  );

  return (
    <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Header Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(14, 165, 233, 0.12), rgba(99, 102, 241, 0.12))",
          border: "1.5px solid var(--border-input)",
          borderRadius: "16px",
          padding: "1.25rem 1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-main)" }}>
            📍 Worksite &amp; Geofence Policy Management
          </h2>
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0.3rem 0 0 0" }}>
            Configure authorized company yards, ports, and depots. Set allowed worksite policies so attendance at the Gate Terminal is verified.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {branches.length === 0 && gpsLocation && (
            <button
              className="btn btn-outline"
              style={{ fontSize: "0.8rem", padding: "0.5rem 0.9rem" }}
              onClick={handleQuickAddCurrentLocation}
              title="Set current GPS position as your main worksite"
            >
              📍 Quick-Set Current Location
            </button>
          )}
          <button
            className="btn btn-primary"
            style={{ fontSize: "0.85rem", padding: "0.5rem 1.1rem" }}
            onClick={handleOpenAddModal}
          >
            ➕ Register New Worksite
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
        <div style={{ background: "var(--bg-card)", border: "1.5px solid var(--border-input)", borderRadius: "12px", padding: "1rem 1.25rem", boxShadow: "var(--shadow)" }}>
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>Total Worksites</span>
          <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--primary)", marginTop: "0.2rem" }}>
            {branches.length} <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-dim)" }}>Locations</span>
          </div>
          <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "0.25rem", display: "block" }}>
            {branches.filter((b) => b.isActive).length} active geofence perimeters
          </span>
        </div>

        <div style={{ background: "var(--bg-card)", border: "1.5px solid var(--border-input)", borderRadius: "12px", padding: "1rem 1.25rem", boxShadow: "var(--shadow)" }}>
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>Staff Policies Assigned</span>
          <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--success)", marginTop: "0.2rem" }}>
            {Object.keys(employeePolicies).length} <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-dim)" }}>/ {employees.length} Staff</span>
          </div>
          <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "0.25rem", display: "block" }}>
            {employees.length - Object.keys(employeePolicies).length} unrestricted (allowed at all sites)
          </span>
        </div>

        <div style={{ background: "var(--bg-card)", border: "1.5px solid var(--border-input)", borderRadius: "12px", padding: "1rem 1.25rem", boxShadow: "var(--shadow)" }}>
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>Terminal Geofence Check</span>
          <div style={{ fontSize: "1.1rem", fontWeight: 800, color: enforceGeofence ? "var(--success)" : "var(--warning)", marginTop: "0.4rem" }}>
            {enforceGeofence ? "🟢 Strict Enforcement ON" : "⚪ Monitoring Only (OFF)"}
          </div>
          <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "0.25rem", display: "block" }}>
            Terminal attendance verification mode
          </span>
        </div>

        <div style={{ background: "var(--bg-card)", border: "1.5px solid var(--border-input)", borderRadius: "12px", padding: "1rem 1.25rem", boxShadow: "var(--shadow)" }}>
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>Terminal GPS Status</span>
          <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "var(--text-main)", marginTop: "0.35rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span>{gpsLocation ? "🛰️" : "⏳"}</span>
            {gpsLocation ? `Signal Locked (±${gpsLocation.accuracy}m)` : "Acquiring Signal..."}
          </div>
          <span style={{ fontSize: "0.72rem", fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)", marginTop: "0.25rem", display: "block" }}>
            {gpsLocation ? `Lat: ${gpsLocation.lat.toFixed(4)}, Lng: ${gpsLocation.lng.toFixed(4)}` : "Checking coordinates..."}
          </span>
        </div>
      </div>

      {/* Sub-Tab Navigation Bar */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1.5px solid var(--border-input)", paddingBottom: "0.5rem" }}>
        <button
          type="button"
          className="btn btn-outline"
          style={{
            fontSize: "0.82rem",
            padding: "0.45rem 1rem",
            borderRadius: "10px",
            background: subTab === "worksites" ? "var(--primary)" : "var(--bg-surface)",
            color: subTab === "worksites" ? "#fff" : "var(--text)",
            borderColor: subTab === "worksites" ? "var(--primary)" : "var(--border-input)",
            fontWeight: 700,
          }}
          onClick={() => setSubTab("worksites")}
        >
          🏢 Worksites &amp; Yards ({branches.length})
        </button>

        <button
          type="button"
          className="btn btn-outline"
          style={{
            fontSize: "0.82rem",
            padding: "0.45rem 1rem",
            borderRadius: "10px",
            background: subTab === "employees" ? "var(--primary)" : "var(--bg-surface)",
            color: subTab === "employees" ? "#fff" : "var(--text)",
            borderColor: subTab === "employees" ? "var(--primary)" : "var(--border-input)",
            fontWeight: 700,
          }}
          onClick={() => setSubTab("employees")}
        >
          👥 Employee Worksite Policies ({employees.length})
        </button>

        <button
          type="button"
          className="btn btn-outline"
          style={{
            fontSize: "0.82rem",
            padding: "0.45rem 1rem",
            borderRadius: "10px",
            background: subTab === "rules" ? "var(--primary)" : "var(--bg-surface)",
            color: subTab === "rules" ? "#fff" : "var(--text)",
            borderColor: subTab === "rules" ? "var(--primary)" : "var(--border-input)",
            fontWeight: 700,
          }}
          onClick={() => setSubTab("rules")}
        >
          ⚙️ Gate Terminal Geofence Rules
        </button>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SUB-TAB 1: WORKSITES & YARDS LIST */}
      {/* ───────────────────────────────────────────────────────────── */}
      {subTab === "worksites" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Sub-header Toolbar with View Switcher */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Registered Company Yards &amp; Depots ({branches.length})
            </span>
            <div style={{ display: "flex", background: "var(--bg-surface)", border: "1.5px solid var(--border-input)", borderRadius: "8px", overflow: "hidden" }}>
              <button
                type="button"
                style={{
                  padding: "0.32rem 0.75rem",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  border: "none",
                  background: worksitesView === "cards" ? "var(--primary)" : "transparent",
                  color: worksitesView === "cards" ? "#fff" : "var(--text)",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onClick={() => setWorksitesView("cards")}
              >
                📋 Cards
              </button>
              <button
                type="button"
                style={{
                  padding: "0.32rem 0.75rem",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  border: "none",
                  background: worksitesView === "map" ? "var(--primary)" : "transparent",
                  color: worksitesView === "map" ? "#fff" : "var(--text)",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onClick={() => setWorksitesView("map")}
              >
                🗺️ Regional Map
              </button>
            </div>
          </div>

          {branches.length === 0 ? (
            <div
              style={{
                padding: "3rem 1.5rem",
                textAlign: "center",
                background: "var(--bg-card)",
                borderRadius: "16px",
                border: "1.5px dashed var(--border-input)",
                boxShadow: "var(--shadow)",
              }}
            >
              <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>🗺️</div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 800, margin: "0 0 0.5rem 0", color: "var(--text-main)" }}>
                No Company Worksites Registered Yet
              </h3>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", maxWidth: "420px", margin: "0 auto 1.5rem auto", lineHeight: 1.5 }}>
                Register company offices, warehouses, trucking yards, or port depots to verify employee presence during Gate Terminal attendance scans.
              </p>
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
                {gpsLocation && (
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: "0.85rem", padding: "0.5rem 1.1rem" }}
                    onClick={handleQuickAddCurrentLocation}
                  >
                    📍 Set Current Location as Main Yard (300m)
                  </button>
                )}
                <button
                  className="btn btn-outline"
                  style={{ fontSize: "0.85rem", padding: "0.5rem 1.1rem" }}
                  onClick={handleOpenAddModal}
                >
                  ➕ Register Custom Worksite
                </button>
              </div>
            </div>
          ) : worksitesView === "map" ? (
            <WorksitesOverviewMap
              branches={branches}
              currentGps={gpsLocation}
              onEditBranch={handleOpenEditModal}
              onAddAtCoordinates={handleOpenAddModalAtCoords}
            />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.25rem" }}>
              {branches.map((b) => {
                const dist = gpsLocation
                  ? getDistanceInMeters(gpsLocation.lat, gpsLocation.lng, b.latitude, b.longitude)
                  : null;
                const isTerminalHere = dist !== null && dist <= b.radiusMeters;

                return (
                  <div
                    key={b.id}
                    className="card"
                    style={{
                      background: "var(--bg-card)",
                      border: isTerminalHere ? "1.5px solid var(--success)" : "1.5px solid var(--border-input)",
                      borderRadius: "14px",
                      padding: "1.25rem",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "0.85rem",
                      boxShadow: "var(--shadow)",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.4rem" }}>
                        <div>
                          <strong style={{ fontSize: "0.95rem", color: "var(--text-main)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <span>🏢</span> {b.name}
                          </strong>
                          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "block", marginTop: "0.2rem" }}>
                            📍 {b.address}
                          </span>
                        </div>
                        {isTerminalHere && (
                          <span
                            style={{
                              fontSize: "0.68rem",
                              padding: "0.2rem 0.55rem",
                              borderRadius: "999px",
                              background: "var(--success)",
                              color: "#fff",
                              fontWeight: 800,
                              whiteSpace: "nowrap",
                            }}
                          >
                            TERMINAL HERE
                          </span>
                        )}
                      </div>

                      <div style={{ background: "var(--bg-input)", borderRadius: "8px", padding: "0.6rem 0.75rem", marginTop: "0.6rem", border: "1px solid var(--border-input)", display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.72rem", fontFamily: "JetBrains Mono, monospace" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)" }}>
                          <span>GPS Coordinates:</span>
                          <strong>{b.latitude.toFixed(5)}, {b.longitude.toFixed(5)}</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)" }}>
                          <span>Perimeter Radius:</span>
                          <strong style={{ color: "var(--primary)" }}>{b.radiusMeters} meters</strong>
                        </div>
                        {dist !== null && (
                          <div style={{ display: "flex", justifyContent: "space-between", color: isTerminalHere ? "var(--success)" : "var(--text-muted)", borderTop: "1px solid var(--border)", paddingTop: "0.3rem", marginTop: "0.2rem" }}>
                            <span>Distance from Terminal:</span>
                            <strong>{formatDistance(dist)}</strong>
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{
                          fontSize: "0.72rem",
                          padding: "0.25rem 0.6rem",
                          color: b.isActive ? "var(--success)" : "var(--text-dim)",
                          borderColor: b.isActive ? "var(--success)" : "var(--border-input)",
                          fontWeight: 700,
                        }}
                        onClick={() => onToggleBranch && onToggleBranch(b.id, !b.isActive)}
                      >
                        {b.isActive ? "🟢 Active" : "⚪ Inactive"}
                      </button>

                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ fontSize: "0.72rem", padding: "0.25rem 0.6rem" }}
                          onClick={() => setWorksitesView("map")}
                          title="View on Regional Map"
                        >
                          🗺️ Map
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ fontSize: "0.72rem", padding: "0.25rem 0.6rem" }}
                          onClick={() => handleOpenEditModal(b)}
                          title="Edit coordinates & radius"
                        >
                          ✏️ Edit
                        </button>
                        {onDeleteBranch && (
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{
                              fontSize: "0.72rem",
                              padding: "0.25rem 0.6rem",
                              color: "var(--danger)",
                              borderColor: "rgba(239, 68, 68, 0.3)",
                            }}
                            onClick={async () => {
                              if (window.confirm(`Are you sure you want to delete worksite "${b.name}"?`)) {
                                await onDeleteBranch(b.id);
                                toast.success(`Deleted worksite "${b.name}".`, "Worksite Removed");
                              }
                            }}
                            title="Delete worksite"
                          >
                            🗑️ Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SUB-TAB 2: EMPLOYEE WORKSITE ASSIGNMENT POLICIES */}
      {/* ───────────────────────────────────────────────────────────── */}
      {subTab === "employees" && (
        <div
          className="card"
          style={{
            background: "var(--bg-card)",
            border: "1.5px solid var(--border-input)",
            borderRadius: "16px",
            padding: "1.5rem",
            boxShadow: "var(--shadow)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <div>
              <h3 style={{ fontSize: "1rem", fontWeight: 800, margin: 0, color: "var(--text-main)" }}>
                👥 Employee Worksite Assignment Policies
              </h3>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.2rem 0 0 0" }}>
                Designate which worksite each employee belongs to. Employees with unrestricted access can clock in at any branch.
              </p>
            </div>

            <div style={{ width: "260px" }}>
              <input
                className="form-input"
                placeholder="🔍 Filter employee name or role..."
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                style={{ fontSize: "0.82rem", padding: "0.45rem 0.75rem" }}
              />
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ borderBottom: "1.5px solid var(--border-input)", background: "var(--bg-input)" }}>
                  <th style={{ padding: "0.6rem 0.8rem", textAlign: "left", color: "var(--text-muted)", fontSize: "0.72rem", textTransform: "uppercase" }}>Employee ID</th>
                  <th style={{ padding: "0.6rem 0.8rem", textAlign: "left", color: "var(--text-muted)", fontSize: "0.72rem", textTransform: "uppercase" }}>Employee Name</th>
                  <th style={{ padding: "0.6rem 0.8rem", textAlign: "left", color: "var(--text-muted)", fontSize: "0.72rem", textTransform: "uppercase" }}>Department &amp; Job Title</th>
                  <th style={{ padding: "0.6rem 0.8rem", textAlign: "left", color: "var(--text-muted)", fontSize: "0.72rem", textTransform: "uppercase" }}>Allowed Worksite Policy</th>
                  <th style={{ padding: "0.6rem 0.8rem", textAlign: "left", color: "var(--text-muted)", fontSize: "0.72rem", textTransform: "uppercase" }}>Policy Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                      No employees match your filter.
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => {
                    const assignedBranchId = employeePolicies[emp.id];
                    const assignedBranch = branches.find((b) => b.id === assignedBranchId);

                    return (
                      <tr key={emp.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.6rem 0.8rem", fontFamily: "JetBrains Mono, monospace", color: "var(--text-dim)" }}>
                          #{emp.id}
                        </td>
                        <td style={{ padding: "0.6rem 0.8rem", fontWeight: 700, color: "var(--text-main)" }}>
                          {emp.name}
                        </td>
                        <td style={{ padding: "0.6rem 0.8rem", color: "var(--text-muted)" }}>
                          {emp.departmentJobTitle}
                        </td>
                        <td style={{ padding: "0.6rem 0.8rem" }}>
                          <select
                            className="form-input"
                            style={{ fontSize: "0.8rem", padding: "0.35rem 0.65rem", maxWidth: "260px" }}
                            value={assignedBranchId || "ALL"}
                            onChange={(e) => handleAssignEmployeeWorksite(emp.id, e.target.value)}
                          >
                            <option value="ALL">🌐 All Worksites (Unrestricted)</option>
                            {branches.map((b) => (
                              <option key={b.id} value={b.id}>
                                🏢 {b.name} ({b.radiusMeters}m radius)
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: "0.6rem 0.8rem" }}>
                          {assignedBranch ? (
                            <span
                              style={{
                                fontSize: "0.7rem",
                                padding: "0.2rem 0.55rem",
                                borderRadius: "6px",
                                background: "rgba(14, 165, 233, 0.12)",
                                color: "var(--primary)",
                                fontWeight: 700,
                              }}
                            >
                              📍 Restricted to {assignedBranch.name}
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: "0.7rem",
                                padding: "0.2rem 0.55rem",
                                borderRadius: "6px",
                                background: "rgba(16, 185, 129, 0.12)",
                                color: "var(--success)",
                                fontWeight: 700,
                              }}
                            >
                              🌐 Any Branch Allowed
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SUB-TAB 3: GATE TERMINAL GEOFENCE RULES & DIAGNOSTICS */}
      {/* ───────────────────────────────────────────────────────────── */}
      {subTab === "rules" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "1.5rem" }}>
          {/* Rules Configuration */}
          <div
            className="card"
            style={{
              background: "var(--bg-card)",
              border: "1.5px solid var(--border-input)",
              borderRadius: "16px",
              padding: "1.5rem",
              boxShadow: "var(--shadow)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div>
              <h3 style={{ fontSize: "1rem", fontWeight: 800, margin: 0, color: "var(--text-main)" }}>
                ⚙️ Gate Terminal Enforcement Rules
              </h3>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.25rem 0 0 0" }}>
                Define how strictly the Gate Terminal verifies physical location during RFID, QR, and biometric scans.
              </p>
            </div>

            {/* Rule 1: Enforce Geofence */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", background: "var(--bg-input)", borderRadius: "10px", border: "1px solid var(--border-input)" }}>
              <div>
                <strong style={{ fontSize: "0.85rem", color: "var(--text-main)", display: "block" }}>
                  Enforce Worksite Geofence on Gate Terminal
                </strong>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  When enabled, scans on the Gate Terminal are blocked if the terminal device is outside registered company worksite boundaries.
                </span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={enforceGeofence}
                  onChange={(e) => {
                    setEnforceGeofence(e.target.checked);
                    localStorage.setItem("neugate_geofence_enforce", String(e.target.checked));
                    toast.success(`Geofence enforcement ${e.target.checked ? "Enabled" : "Disabled"}.`, "Rule Saved");
                  }}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            {/* Rule 2: Override PIN */}
            <div style={{ padding: "1rem", background: "var(--bg-input)", borderRadius: "10px", border: "1px solid var(--border-input)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <label className="form-label" style={{ margin: 0 }}>
                Manager / Guard Override PIN Code
              </label>
              <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                4-digit security PIN to authorize cross-branch attendance or emergency off-site scans.
              </span>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginTop: "0.25rem" }}>
                <input
                  type="password"
                  className="form-input"
                  style={{ maxWidth: "160px", fontFamily: "JetBrains Mono, monospace", fontSize: "1rem", textAlign: "center", letterSpacing: "0.2em" }}
                  value={overridePin}
                  maxLength={4}
                  onChange={(e) => {
                    setOverridePin(e.target.value);
                    localStorage.setItem("neugate_geofence_override_pin", e.target.value);
                  }}
                />
                <span style={{ fontSize: "0.75rem", color: "var(--success)", fontWeight: 700 }}>
                  Active PIN
                </span>
              </div>
            </div>

            {/* Explanation card */}
            <div style={{ background: "rgba(14, 165, 233, 0.08)", border: "1px solid var(--primary-dim)", borderRadius: "10px", padding: "1rem", fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
              <strong style={{ color: "var(--primary)", display: "block", marginBottom: "0.3rem" }}>
                💡 Centralized Terminal Architecture
              </strong>
              All employee check-ins and check-outs are recorded through the main <strong>Gate Terminal</strong> (RFID cards, biometric fingerprints, QR codes, or facial recognition). These geofencing policies ensure that each scan is automatically verified against your configured company worksite locations.
            </div>
          </div>

          {/* Terminal GPS Diagnostic */}
          <div
            className="card"
            style={{
              background: "var(--bg-card)",
              border: "1.5px solid var(--border-input)",
              borderRadius: "16px",
              padding: "1.5rem",
              boxShadow: "var(--shadow)",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 800, margin: 0, color: "var(--text-main)" }}>
                🛰️ Terminal GPS Diagnostic
              </h3>
              <button
                type="button"
                className="btn btn-outline"
                style={{ fontSize: "0.72rem", padding: "0.25rem 0.6rem" }}
                onClick={() => fetchGpsPosition(true)}
                disabled={loadingGps}
              >
                {loadingGps ? "Locating..." : "🔄 Refresh GPS"}
              </button>
            </div>

            {gpsLocation ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                <div style={{ background: "var(--bg-input)", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-input)" }}>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block" }}>Latitude</span>
                  <strong style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.95rem" }}>{gpsLocation.lat.toFixed(6)}</strong>
                </div>
                <div style={{ background: "var(--bg-input)", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-input)" }}>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block" }}>Longitude</span>
                  <strong style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.95rem" }}>{gpsLocation.lng.toFixed(6)}</strong>
                </div>
                <div style={{ background: "var(--bg-input)", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-input)" }}>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block" }}>Accuracy</span>
                  <strong style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.95rem", color: "var(--success)" }}>±{gpsLocation.accuracy} meters</strong>
                </div>
              </div>
            ) : gpsError ? (
              <div style={{ color: "var(--danger)", fontSize: "0.82rem", padding: "1rem", background: "rgba(239, 68, 68, 0.1)", borderRadius: "8px" }}>
                ⚠️ {gpsError}
              </div>
            ) : (
              <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", textAlign: "center", padding: "1.5rem" }}>
                Locating GPS satellite coordinates...
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL: ADD / EDIT WORKSITE */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="modal-overlay" onClick={(ev) => ev.target === ev.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: showMapInModal ? 680 : 520, width: "100%", borderRadius: "16px", padding: "1.5rem", transition: "max-width 0.2s" }}>
            <div className="modal-header" style={{ marginBottom: "1.25rem" }}>
              <div>
                <span className="modal-title" style={{ fontSize: "1.1rem", fontWeight: 800 }}>
                  {editingBranchId ? "✏️ Edit Worksite Perimeter" : "📍 Register New Worksite Geofence"}
                </span>
                <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  Define physical coordinates and allowable clock-in boundary.
                </p>
              </div>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Worksite / Yard Name</label>
                <input
                  className="form-input"
                  placeholder="e.g. Main Warehouse / Port Depot"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Physical Address</label>
                <input
                  className="form-input"
                  placeholder="e.g. Pier 4, North Harbor, Manila"
                  value={branchAddress}
                  onChange={(e) => setBranchAddress(e.target.value)}
                />
              </div>

              {/* Coordinates with Map Picker & Auto-Fill */}
              <div style={{ background: "var(--bg-input)", padding: "0.85rem", borderRadius: "10px", border: "1px solid var(--border-input)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.4rem" }}>
                  <label className="form-label" style={{ margin: 0 }}>GPS Coordinates & Worksite Pin</label>
                  <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{
                        fontSize: "0.7rem",
                        padding: "0.2rem 0.5rem",
                        borderColor: showMapInModal ? "var(--primary)" : undefined,
                        background: showMapInModal ? "var(--primary-dim)" : undefined,
                        color: showMapInModal ? "var(--primary)" : undefined,
                        fontWeight: showMapInModal ? 700 : 500,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                      onClick={() => setShowMapInModal(!showMapInModal)}
                    >
                      🗺️ {showMapInModal ? "Hide Map" : "Select from Map"}
                    </button>
                    {gpsLocation && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem", whiteSpace: "nowrap", flexShrink: 0 }}
                        onClick={() => {
                          setBranchLat(String(gpsLocation.lat));
                          setBranchLng(String(gpsLocation.lng));
                          toast.info("Copied current GPS coordinates into fields.", "Coordinates Filled");
                        }}
                      >
                        🎯 Current GPS
                      </button>
                    )}
                  </div>
                </div>

                {showMapInModal && (
                  <div style={{ marginBottom: "0.85rem" }}>
                    <MapLocationPicker
                      latitude={parseFloat(branchLat) || (gpsLocation ? gpsLocation.lat : 14.5995)}
                      longitude={parseFloat(branchLng) || (gpsLocation ? gpsLocation.lng : 120.9842)}
                      radiusMeters={parseInt(branchRadius, 10) || 300}
                      onSelectCoordinates={(lat, lng, addressHint) => {
                        setBranchLat(String(lat));
                        setBranchLng(String(lng));
                        if (addressHint && !branchAddress) {
                          setBranchAddress(addressHint.split(",").slice(0, 3).join(","));
                        }
                      }}
                      height={260}
                    />
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", display: "block", marginBottom: "0.2rem" }}>Latitude</span>
                    <input
                      className="form-input"
                      style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.85rem" }}
                      placeholder="e.g. 14.6143"
                      value={branchLat}
                      onChange={(e) => setBranchLat(e.target.value)}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", display: "block", marginBottom: "0.2rem" }}>Longitude</span>
                    <input
                      className="form-input"
                      style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.85rem" }}
                      placeholder="e.g. 120.9573"
                      value={branchLng}
                      onChange={(e) => setBranchLng(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Allowed Radius with Presets */}
              <div className="form-group" style={{ margin: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                  <label className="form-label" style={{ margin: 0 }}>Allowed Perimeter Radius (Meters)</label>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--primary)" }}>{branchRadius} meters</span>
                </div>
                <input
                  type="number"
                  className="form-input"
                  placeholder="300"
                  value={branchRadius}
                  onChange={(e) => setBranchRadius(e.target.value)}
                />
                <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                  {["100", "200", "300", "500", "1000"].map((r) => (
                    <button
                      key={r}
                      type="button"
                      className="btn btn-outline"
                      style={{
                        fontSize: "0.7rem",
                        padding: "0.2rem 0.5rem",
                        borderColor: branchRadius === r ? "var(--primary)" : undefined,
                        color: branchRadius === r ? "var(--primary)" : undefined,
                        fontWeight: branchRadius === r ? 700 : 400,
                      }}
                      onClick={() => setBranchRadius(r)}
                    >
                      {Number(r) >= 1000 ? "1 km" : `${r}m`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: "1.5rem" }}>
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveBranch}>
                💾 {editingBranchId ? "Update Worksite" : "Save Worksite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
