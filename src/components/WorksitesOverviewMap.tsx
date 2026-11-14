import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { BranchLocation } from "../types";
import { getDistanceInMeters } from "../utils/geofence";

interface WorksitesOverviewMapProps {
  branches: BranchLocation[];
  currentGps: { lat: number; lng: number; accuracy: number } | null;
  onEditBranch: (branch: BranchLocation) => void;
  onAddAtCoordinates: (lat: number, lng: number) => void;
}

const createWorksiteIcon = (isActive: boolean) =>
  L.divIcon({
    className: "custom-branch-pin",
    html: `
      <div style="
        width: 32px;
        height: 32px;
        background: ${isActive ? "#0284c7" : "#64748b"};
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
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });

const userGpsIcon = L.divIcon({
  className: "custom-user-gps-pin",
  html: `
    <div style="
      width: 18px;
      height: 18px;
      background: #10b981;
      border: 3px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 0 12px rgba(16, 185, 129, 0.8), 0 2px 6px rgba(0,0,0,0.3);
    "></div>
  `,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -9],
});

export default function WorksitesOverviewMap({
  branches,
  currentGps,
  onEditBranch,
  onAddAtCoordinates,
}: WorksitesOverviewMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Determine initial center
      const initialLat = currentGps ? currentGps.lat : branches.length > 0 ? branches[0].latitude : 14.5995;
      const initialLng = currentGps ? currentGps.lng : branches.length > 0 ? branches[0].longitude : 120.9842;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 13,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;
      mapInstanceRef.current = map;

      // Handle map clicks to quick-add at clicked coordinates
      map.on("click", (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        const popupContent = document.createElement("div");
        popupContent.style.padding = "0.25rem";
        popupContent.innerHTML = `
          <div style="font-weight: 700; font-size: 0.85rem; margin-bottom: 0.25rem;">📍 New Worksite</div>
          <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 0.5rem;">
            Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}
          </div>
          <button id="add-worksite-btn" style="
            background: #0284c7;
            color: #fff;
            border: none;
            padding: 0.35rem 0.75rem;
            border-radius: 6px;
            font-size: 0.75rem;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
          ">➕ Register Worksite Here</button>
        `;

        const popup = L.popup()
          .setLatLng([lat, lng])
          .setContent(popupContent)
          .openOn(map);

        setTimeout(() => {
          const btn = document.getElementById("add-worksite-btn");
          if (btn) {
            btn.onclick = () => {
              map.closePopup(popup);
              onAddAtCoordinates(Number(lat.toFixed(6)), Number(lng.toFixed(6)));
            };
          }
        }, 50);
      });

      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersLayerRef.current = null;
      }
    };
  }, []);

  // Sync branches & user GPS markers
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;
    const layer = markersLayerRef.current;
    layer.clearLayers();

    const bounds = L.latLngBounds([]);

    // Plot user GPS position if available
    if (currentGps) {
      const userLatLng = L.latLng(currentGps.lat, currentGps.lng);
      bounds.extend(userLatLng);

      L.marker(userLatLng, { icon: userGpsIcon })
        .bindPopup(`<strong>🛰️ Your Current Device GPS</strong><br>Accuracy: ±${currentGps.accuracy}m`)
        .addTo(layer);

      L.circle(userLatLng, {
        radius: Math.max(currentGps.accuracy, 30),
        color: "#10b981",
        fillColor: "#10b981",
        fillOpacity: 0.1,
        weight: 1.5,
      }).addTo(layer);
    }

    // Plot each branch
    branches.forEach((b) => {
      const pos = L.latLng(b.latitude, b.longitude);
      bounds.extend(pos);

      const marker = L.marker(pos, {
        icon: createWorksiteIcon(b.isActive),
      }).addTo(layer);

      L.circle(pos, {
        radius: b.radiusMeters,
        color: b.isActive ? "#0284c7" : "#94a3b8",
        fillColor: b.isActive ? "#0284c7" : "#94a3b8",
        fillOpacity: b.isActive ? 0.15 : 0.08,
        weight: 2,
        dashArray: b.isActive ? undefined : "4, 6",
      }).addTo(layer);

      let distanceStr = "—";
      if (currentGps) {
        const dist = getDistanceInMeters(currentGps.lat, currentGps.lng, b.latitude, b.longitude);
        distanceStr = dist >= 1000 ? `${(dist / 1000).toFixed(2)} km away` : `${Math.round(dist)} m away`;
      }

      const popupDiv = document.createElement("div");
      popupDiv.style.minWidth = "180px";
      popupDiv.innerHTML = `
        <div style="font-weight: 800; font-size: 0.9rem; margin-bottom: 0.2rem; color: #0f172a;">${b.name}</div>
        <div style="font-size: 0.75rem; color: #475569; margin-bottom: 0.4rem;">${b.address}</div>
        <div style="font-size: 0.72rem; color: #64748b; margin-bottom: 0.2rem;">
          Allowed Perimeter: <strong>${b.radiusMeters}m</strong>
        </div>
        <div style="font-size: 0.72rem; color: #64748b; margin-bottom: 0.5rem;">
          Live Distance: <strong>${distanceStr}</strong>
        </div>
        <button id="edit-branch-${b.id}" style="
          background: #0284c7;
          color: #fff;
          border: none;
          padding: 0.35rem 0.65rem;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
        ">✏️ Edit Worksite</button>
      `;

      marker.bindPopup(popupDiv);

      marker.on("popupopen", () => {
        const editBtn = document.getElementById(`edit-branch-${b.id}`);
        if (editBtn) {
          editBtn.onclick = () => {
            onEditBranch(b);
          };
        }
      });
    });

    if (bounds.isValid() && mapInstanceRef.current) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [branches, currentGps]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "500px",
        borderRadius: "16px",
        overflow: "hidden",
        border: "1.5px solid var(--border-input)",
        boxShadow: "var(--shadow)",
      }}
    >
      <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />

      {/* Map Legend / Info Overlay */}
      <div
        style={{
          position: "absolute",
          top: "0.75rem",
          right: "0.75rem",
          zIndex: 400,
          background: "var(--bg-surface)",
          border: "1.5px solid var(--border-input)",
          padding: "0.5rem 0.85rem",
          borderRadius: "10px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          display: "flex",
          flexDirection: "column",
          gap: "0.3rem",
          fontSize: "0.72rem",
          color: "var(--text)",
        }}
      >
        <div style={{ fontWeight: 800, color: "var(--text-main)" }}>🗺️ Worksites Map Legend</div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#0284c7", display: "inline-block" }} />
          <span>Active Worksite Perimeter</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
          <span>Your Live Device GPS</span>
        </div>
        <div style={{ fontSize: "0.68rem", color: "var(--text-dim)", marginTop: "0.2rem" }}>
          💡 Click any point on the map to add a worksite
        </div>
      </div>
    </div>
  );
}

