import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface GeofenceMapPickerModalProps {
  initialLat: number | null;
  initialLng: number | null;
  initialRadius: number;
  initialLabel: string;
  onConfirm: (data: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
    label: string;
  }) => void;
  onClose: () => void;
}

// Major Philippine coordinates for instant zero-latency suggestions
const PH_QUICK_PRESETS: Record<string, [number, number]> = {
  "manila": [14.5995, 120.9842],
  "quezon city": [14.6760, 121.0437],
  "makati": [14.5547, 121.0244],
  "taguig (bgc)": [14.5507, 121.0509],
  "pasig": [14.5764, 121.0851],
  "mandaluyong": [14.5794, 121.0359],
  "paranaque": [14.4793, 120.9969],
  "pasay": [14.5378, 120.9997],
  "caloocan": [14.6488, 120.9678],
  "las pinas": [14.4445, 120.9939],
  "muntinlupa": [14.3917, 121.0417],
  "valenzuela": [14.7011, 120.9831],
  "cebu city": [10.3157, 123.8854],
  "mandaue city": [10.3342, 123.9453],
  "lapu-lapu city": [10.3128, 123.9536],
  "davao city": [7.1907, 125.4553],
  "tagbilaran bohol": [9.6729, 123.8730],
  "iloilo city": [10.7202, 122.5621],
  "bacolod city": [10.6765, 122.9509],
  "cagayan de oro": [8.4542, 124.6319],
  "general santos": [6.1164, 125.1716],
  "zamboanga city": [6.9214, 122.0790],
  "angeles pampanga": [15.1450, 120.5887],
  "san fernando pampanga": [15.0340, 120.6860],
  "batangas city": [13.7565, 121.0583],
  "lipa batangas": [13.9419, 121.1644],
  "subic zambales": [14.8778, 120.2343],
  "baguio city": [16.4023, 120.5960],
};

function createGeofenceCenterIcon(radiusMeters: number, isLight: boolean = false): L.DivIcon {
  const radiusLabel =
    radiusMeters >= 1000
      ? `${(radiusMeters / 1000).toFixed(1).replace(/\.0$/, "")} km Radius`
      : `${radiusMeters} m Radius`;

  const pillBg = isLight ? "#ffffff" : "#0f172a";
  const pillColor = isLight ? "#0284c7" : "#00d4ff";
  const pillBorder = isLight ? "1.5px solid #0284c7" : "1px solid #00d4ff";
  const pillShadow = isLight ? "0 3px 10px rgba(0,0,0,0.15)" : "0 4px 12px rgba(0,0,0,0.6)";

  return L.divIcon({
    className: "custom-geofence-center-pin",
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    html: `
      <div style="
        width: 48px;
        height: 48px;
        position: relative;
        cursor: grab;
        box-sizing: border-box;
      ">
        <div style="
          position: absolute;
          bottom: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%);
          background: ${pillBg};
          color: ${pillColor};
          border: ${pillBorder};
          padding: 3px 9px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
          box-shadow: ${pillShadow};
          pointer-events: none;
          letter-spacing: 0.3px;
          box-sizing: border-box;
        ">
          ${radiusLabel}
        </div>

        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 46px;
          height: 46px;
          border-radius: 50%;
          border: 2px solid #00d4ff;
          background: rgba(0, 212, 255, 0.22);
          box-sizing: border-box;
          pointer-events: none;
          box-shadow: 0 0 14px rgba(0, 212, 255, 0.6);
        "></div>

        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: #00d4ff;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 3px 12px rgba(0,0,0,0.5);
          border: 2px solid #ffffff;
          box-sizing: border-box;
          z-index: 2;
        ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="display: block; margin: auto;">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
            <circle cx="12" cy="10" r="3" fill="#0f172a"></circle>
          </svg>
        </div>
      </div>
    `,
  });
}

export default function GeofenceMapPickerModal({
  initialLat,
  initialLng,
  initialRadius,
  initialLabel,
  onConfirm,
  onClose,
}: GeofenceMapPickerModalProps) {
  const defaultLat = initialLat ?? 14.5995;
  const defaultLng = initialLng ?? 120.9842;

  const [selectedLat, setSelectedLat] = useState<number>(defaultLat);
  const [selectedLng, setSelectedLng] = useState<number>(defaultLng);
  const [radiusMeters, setRadiusMeters] = useState<number>(initialRadius || 500);
  const [locationLabel, setLocationLabel] = useState<string>(initialLabel || "");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<{ name: string; coords: [number, number] }[]>([]);
  const [locatingCurrent, setLocatingCurrent] = useState<boolean>(false);
  const [isSearchingOnline, setIsSearchingOnline] = useState<boolean>(false);

  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return document.body.classList.contains("light-mode") ? "light" : "dark";
  });

  useEffect(() => {
    const updateTheme = () => {
      const isLight = document.body.classList.contains("light-mode");
      setTheme(isLight ? "light" : "dark");
    };
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  // Search logic: check presets first
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const q = searchQuery.toLowerCase().trim();
    const matches: { name: string; coords: [number, number] }[] = [];
    for (const [name, coords] of Object.entries(PH_QUICK_PRESETS)) {
      if (name.includes(q)) {
        const displayName = name.replace(/\b\w/g, (c) => c.toUpperCase());
        matches.push({ name: displayName, coords });
      }
    }
    setSearchResults(matches);
  }, [searchQuery]);

  const handleOnlineSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearchingOnline(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery.trim()
        )}&limit=6`
      );
      if (res.ok) {
        const data = await res.json();
        const onlineMatches = data.map((item: any) => ({
          name: item.display_name,
          coords: [parseFloat(item.lat), parseFloat(item.lon)] as [number, number],
        }));
        setSearchResults((prev) => [...onlineMatches, ...prev]);
      }
    } catch (err) {
      console.warn("Geocoding search failed:", err);
    } finally {
      setIsSearchingOnline(false);
    }
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [selectedLat, selectedLng],
      zoom: 15,
      zoomControl: true,
    });
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const pinIcon = createGeofenceCenterIcon(radiusMeters, theme === "light");

    const marker = L.marker([selectedLat, selectedLng], {
      icon: pinIcon,
      draggable: true,
    }).addTo(map);
    markerRef.current = marker;

    const circle = L.circle([selectedLat, selectedLng], {
      radius: radiusMeters,
      color: "#00d4ff",
      fillColor: "#00d4ff",
      fillOpacity: 0.18,
      weight: 2,
      dashArray: "4, 6",
    }).addTo(map);
    circleRef.current = circle;

    map.fitBounds(circle.getBounds(), { padding: [50, 50], maxZoom: 17 });

    marker.on("drag", (e: any) => {
      const latlng = e.target.getLatLng();
      circle.setLatLng(latlng);
    });

    marker.on("dragend", (e: any) => {
      const latlng = e.target.getLatLng();
      const lat = Number(latlng.lat.toFixed(6));
      const lng = Number(latlng.lng.toFixed(6));
      setSelectedLat(lat);
      setSelectedLng(lng);
      circle.setLatLng(latlng);
    });

    map.on("click", (e: L.LeafletMouseEvent) => {
      const lat = Number(e.latlng.lat.toFixed(6));
      const lng = Number(e.latlng.lng.toFixed(6));
      setSelectedLat(lat);
      setSelectedLng(lng);
      marker.setLatLng(e.latlng);
      circle.setLatLng(e.latlng);
    });

    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Sync radius & theme updates
  useEffect(() => {
    if (circleRef.current && markerRef.current) {
      circleRef.current.setRadius(radiusMeters);
      markerRef.current.setIcon(createGeofenceCenterIcon(radiusMeters, theme === "light"));
      if (mapInstanceRef.current) {
        mapInstanceRef.current.fitBounds(circleRef.current.getBounds(), {
          padding: [50, 50],
          maxZoom: 17,
          animate: true,
        });
      }
    }
  }, [radiusMeters, theme]);

  const handleSelectSearchLocation = (item: { name: string; coords: [number, number] }) => {
    const [lat, lng] = item.coords;
    setSelectedLat(lat);
    setSelectedLng(lng);
    if (!locationLabel) {
      setLocationLabel(item.name.split(",")[0]);
    }
    setSearchQuery("");
    setSearchResults([]);

    if (mapInstanceRef.current && markerRef.current && circleRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      circleRef.current.setLatLng([lat, lng]);
      mapInstanceRef.current.fitBounds(circleRef.current.getBounds(), {
        padding: [50, 50],
        maxZoom: 17,
        animate: true,
      });
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setLocatingCurrent(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setSelectedLat(lat);
        setSelectedLng(lng);
        setLocatingCurrent(false);

        if (mapInstanceRef.current && markerRef.current && circleRef.current) {
          markerRef.current.setLatLng([lat, lng]);
          circleRef.current.setLatLng([lat, lng]);
          mapInstanceRef.current.fitBounds(circleRef.current.getBounds(), {
            padding: [50, 50],
            maxZoom: 17,
            animate: true,
          });
        }
      },
      (err) => {
        alert("Failed to acquire device location: " + err.message);
        setLocatingCurrent(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleApply = () => {
    onConfirm({
      latitude: selectedLat,
      longitude: selectedLng,
      radiusMeters,
      label: locationLabel.trim() || `Facility (${selectedLat.toFixed(4)}, ${selectedLng.toFixed(4)})`,
    });
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "rgba(0,0,0,0.78)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
        padding: "1rem",
        backdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "880px",
          background: "var(--bg-main, #0f172a)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          .custom-geofence-center-pin {
            background: transparent !important;
            border: none !important;
          }
        `}</style>

        {/* Modal Header */}
        <div
          style={{
            padding: "1.1rem 1.5rem",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h3 style={{ margin: "0 0 0.2rem 0", fontSize: "1.1rem", color: "var(--text-main)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>🗺️</span> Pick Geofence Worksite on Map
            </h3>
            <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-dim)" }}>
              Click anywhere on the map or drag the pin to designate the user's authorized work perimeter.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-outline"
            onClick={onClose}
            style={{ width: "30px", height: "30px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
          >
            ✕
          </button>
        </div>

        {/* Search & Location Bar */}
        <div
          style={{
            padding: "0.75rem 1.5rem",
            background: "rgba(255,255,255,0.02)",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            gap: "0.75rem",
            alignItems: "center",
            position: "relative",
          }}
        >
          <div style={{ flex: 1, position: "relative" }}>
            <input
              type="text"
              className="form-input"
              placeholder="🔍 Search city, address, or landmark (press Enter for global lookup)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleOnlineSearch();
                }
              }}
              style={{ fontSize: "0.82rem", width: "100%", padding: "0.45rem 0.75rem" }}
            />

            {searchResults.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  width: "100%",
                  background: "var(--bg-card, #1e293b)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  marginTop: "4px",
                  zIndex: 1000,
                  boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
                  maxHeight: "220px",
                  overflowY: "auto",
                }}
              >
                {searchResults.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleSelectSearchLocation(item)}
                    style={{
                      padding: "0.5rem 0.8rem",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      display: "flex",
                      justifyContent: "space-between",
                      color: "var(--text-main)",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0, 212, 255, 0.12)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>
                      📍 {item.name}
                    </span>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-dim)", fontFamily: "monospace", flexShrink: 0 }}>
                      {item.coords[0].toFixed(3)}, {item.coords[1].toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleOnlineSearch()}
            disabled={isSearchingOnline || !searchQuery.trim()}
            style={{ fontSize: "0.78rem", padding: "0.45rem 0.8rem", whiteSpace: "nowrap", flexShrink: 0 }}
          >
            {isSearchingOnline ? "Searching..." : "Search"}
          </button>

          <button
            type="button"
            className="btn btn-outline"
            onClick={handleUseCurrentLocation}
            disabled={locatingCurrent}
            style={{ fontSize: "0.78rem", padding: "0.45rem 0.8rem", display: "flex", alignItems: "center", gap: "0.4rem", whiteSpace: "nowrap", flexShrink: 0 }}
          >
            <span>📍</span> {locatingCurrent ? "Locating..." : "My GPS"}
          </button>
        </div>

        {/* Map Container */}
        <div style={{ position: "relative", width: "100%", height: "400px" }}>
          <div ref={mapContainerRef} style={{ width: "100%", height: "100%", zIndex: 1 }} />

          <div
            style={{
              position: "absolute",
              bottom: "12px",
              left: "12px",
              zIndex: 1000,
              background: "rgba(15, 23, 42, 0.9)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "8px",
              padding: "0.4rem 0.75rem",
              fontSize: "0.75rem",
              color: "#f1f5f9",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.5)",
              backdropFilter: "blur(6px)",
              pointerEvents: "none",
            }}
          >
            💡 Click anywhere on map to move pin &bull; Drag pin to fine-tune
          </div>
        </div>

        {/* Selected Coordinates & Perimeter Controls Footer */}
        <div
          style={{
            padding: "1.1rem 1.5rem",
            background: "rgba(255,255,255,0.02)",
            borderTop: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: "0.85rem",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: "0.85rem", alignItems: "center" }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: "0.75rem" }}>Facility / Geofence Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Main Office / Tagbilaran Yard"
                value={locationLabel}
                onChange={(e) => setLocationLabel(e.target.value)}
                style={{ fontSize: "0.8rem", padding: "0.4rem 0.6rem" }}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: "0.75rem" }}>Latitude</label>
              <input
                type="number"
                step="0.000001"
                className="form-input"
                value={selectedLat}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) {
                    setSelectedLat(val);
                    markerRef.current?.setLatLng([val, selectedLng]);
                    circleRef.current?.setLatLng([val, selectedLng]);
                  }
                }}
                style={{ fontSize: "0.8rem", padding: "0.4rem 0.6rem", fontFamily: "monospace" }}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: "0.75rem" }}>Longitude</label>
              <input
                type="number"
                step="0.000001"
                className="form-input"
                value={selectedLng}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) {
                    setSelectedLng(val);
                    markerRef.current?.setLatLng([selectedLat, val]);
                    circleRef.current?.setLatLng([selectedLat, val]);
                  }
                }}
                style={{ fontSize: "0.8rem", padding: "0.4rem 0.6rem", fontFamily: "monospace" }}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.85rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--text-dim)", fontWeight: 600 }}>Radius:</span>
              <div style={{ display: "flex", gap: "0.3rem" }}>
                {[100, 250, 500, 1000, 2000, 5000].map((radius) => (
                  <button
                    key={radius}
                    type="button"
                    className={`btn ${radiusMeters === radius ? "btn-primary" : "btn-outline"}`}
                    style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem", whiteSpace: "nowrap" }}
                    onClick={() => setRadiusMeters(radius)}
                  >
                    {radius >= 1000 ? `${radius / 1000} km` : `${radius} m`}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min="50"
                step="50"
                className="form-input"
                style={{ width: "80px", fontSize: "0.78rem", padding: "0.25rem 0.4rem" }}
                value={radiusMeters}
                onChange={(e) => setRadiusMeters(parseInt(e.target.value, 10) || 500)}
              />
              <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>meters</span>
            </div>

            <div style={{ display: "flex", gap: "0.6rem" }}>
              <button type="button" className="btn btn-outline" style={{ fontSize: "0.78rem", padding: "0.4rem 0.8rem" }} onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" style={{ fontSize: "0.78rem", padding: "0.4rem 0.8rem" }} onClick={handleApply}>
                💾 Apply Selected Location
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
