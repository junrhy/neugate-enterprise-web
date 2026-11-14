import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface MapLocationPickerProps {
  latitude: number | null;
  longitude: number | null;
  radiusMeters?: number;
  onSelectCoordinates: (lat: number, lng: number, addressHint?: string) => void;
  height?: string | number;
}

// Custom modern vector map pin icon
const pinIcon = L.divIcon({
  className: "custom-map-pin-icon",
  html: `
    <div style="
      position: relative;
      width: 32px;
      height: 32px;
    ">
      <div style="
        width: 30px;
        height: 30px;
        background: #0284c7;
        border: 2.5px solid #ffffff;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 4px 12px rgba(0,0,0,0.35);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          width: 9px;
          height: 9px;
          background: #ffffff;
          border-radius: 50%;
          transform: rotate(45deg);
        "></div>
      </div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

export default function MapLocationPicker({
  latitude,
  longitude,
  radiusMeters = 300,
  onSelectCoordinates,
  height = 320,
}: MapLocationPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);

  // Default fallback coordinates: Philippines (Manila center)
  const defaultLat = 14.5995;
  const defaultLng = 120.9842;

  const currentLat = latitude ?? defaultLat;
  const currentLng = longitude ?? defaultLng;

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [currentLat, currentLng],
        zoom: latitude && longitude ? 16 : 13,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Create marker with draggable enabled
      const marker = L.marker([currentLat, currentLng], {
        icon: pinIcon,
        draggable: true,
      }).addTo(map);

      // Create Geofence perimeter radius circle
      const circle = L.circle([currentLat, currentLng], {
        radius: radiusMeters,
        color: "#0284c7",
        fillColor: "#0284c7",
        fillOpacity: 0.15,
        weight: 2,
        dashArray: "4, 6",
      }).addTo(map);

      marker.bindPopup(`<strong>Worksite Location</strong><br>Radius: ${radiusMeters}m`).openPopup();

      // Handle marker drag
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        circle.setLatLng(pos);
        onSelectCoordinates(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
      });

      // Handle map clicks to move the marker
      map.on("click", (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        marker.setLatLng([lat, lng]);
        circle.setLatLng([lat, lng]);
        marker.openPopup();
        onSelectCoordinates(Number(lat.toFixed(6)), Number(lng.toFixed(6)));
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;
      circleRef.current = circle;

      // Invalidate map size after render to fix grey tile display issues
      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
      }
    };
  }, []);

  // Sync external coordinates update
  useEffect(() => {
    if (!mapInstanceRef.current || !markerRef.current || !circleRef.current) return;
    if (latitude != null && longitude != null) {
      const pos = L.latLng(latitude, longitude);
      markerRef.current.setLatLng(pos);
      circleRef.current.setLatLng(pos);
    }
  }, [latitude, longitude]);

  // Sync radius circle update
  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(radiusMeters);
      if (markerRef.current) {
        markerRef.current.setPopupContent(`<strong>Worksite Location</strong><br>Perimeter Radius: ${radiusMeters}m`);
      }
    }
  }, [radiusMeters]);

  // Geocoding Search using OpenStreetMap Nominatim
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (err) {
      console.warn("Geocoding search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (res: { display_name: string; lat: string; lon: string }) => {
    const lat = parseFloat(res.lat);
    const lng = parseFloat(res.lon);
    if (!isNaN(lat) && !isNaN(lng)) {
      if (mapInstanceRef.current && markerRef.current && circleRef.current) {
        mapInstanceRef.current.setView([lat, lng], 16);
        markerRef.current.setLatLng([lat, lng]);
        circleRef.current.setLatLng([lat, lng]);
        markerRef.current.openPopup();
      }
      onSelectCoordinates(Number(lat.toFixed(6)), Number(lng.toFixed(6)), res.display_name);
      setSearchResults([]);
      setSearchQuery("");
    }
  };

  // Center on current device GPS
  const handleCenterOnGps = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        if (mapInstanceRef.current && markerRef.current && circleRef.current) {
          mapInstanceRef.current.setView([lat, lng], 17);
          markerRef.current.setLatLng([lat, lng]);
          circleRef.current.setLatLng([lat, lng]);
          markerRef.current.openPopup();
        }
        onSelectCoordinates(Number(lat.toFixed(6)), Number(lng.toFixed(6)));
      },
      (err) => {
        console.warn("Geolocation lookup error:", err);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%" }}>
      {/* Search Bar & Actions */}
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: "0.35rem", flex: 1, minWidth: 0, position: "relative" }}>
          <input
            type="text"
            className="form-input"
            style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem", height: "34px", flex: 1, minWidth: 0 }}
            placeholder="Search address, landmark, or city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-outline"
            style={{ fontSize: "0.78rem", padding: "0.35rem 0.75rem", height: "34px", flexShrink: 0, whiteSpace: "nowrap" }}
            disabled={isSearching}
          >
            {isSearching ? "Searching..." : "🔍 Search"}
          </button>

          {/* Search suggestions dropdown */}
          {searchResults.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "38px",
                left: 0,
                right: 0,
                background: "var(--bg-surface)",
                border: "1.5px solid var(--border-input)",
                borderRadius: "8px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                zIndex: 1000,
                maxHeight: "180px",
                overflowY: "auto",
              }}
            >
              {searchResults.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "0.5rem 0.75rem",
                    fontSize: "0.76rem",
                    borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                    color: "var(--text)",
                    lineHeight: 1.3,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-input-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  onClick={() => handleSelectSearchResult(item)}
                >
                  📍 {item.display_name}
                </div>
              ))}
            </div>
          )}
        </form>

        <button
          type="button"
          className="btn btn-outline"
          style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem", height: "34px", flexShrink: 0, whiteSpace: "nowrap" }}
          onClick={handleCenterOnGps}
          title="Center map on your current device GPS"
        >
          🎯 My GPS
        </button>
      </div>

      {/* Map Container */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: typeof height === "number" ? `${height}px` : height,
          borderRadius: "12px",
          overflow: "hidden",
          border: "1.5px solid var(--border-input)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}
      >
        <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />

        {/* Floating map hint */}
        <div
          style={{
            position: "absolute",
            bottom: "0.5rem",
            left: "0.5rem",
            zIndex: 400,
            background: "rgba(15, 23, 42, 0.8)",
            backdropFilter: "blur(4px)",
            color: "#ffffff",
            padding: "0.25rem 0.6rem",
            borderRadius: "6px",
            fontSize: "0.7rem",
            fontWeight: 500,
            pointerEvents: "none",
          }}
        >
          💡 Click map or drag pin 📍 to adjust perimeter center
        </div>
      </div>
    </div>
  );
}

