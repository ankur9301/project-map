import React, { useEffect, useMemo, useRef } from "react";
import { Building2, MapPin } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getCommute, minutesLabel, priceLabel, roundTrip } from "../utils";

const DEFAULT_TARGET = {
  lat: 40.7614205,
  lon: -73.9675149,
  label: "Office",
  address: "731 Lexington Ave, New York, NY",
};

function markerIcon(className, label) {
  return L.divIcon({
    className: `customMapMarker ${className}`,
    html: `<span>${label}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

function popupHtml(apartment) {
  const morning = getCommute(apartment, "morning");
  const evening = getCommute(apartment, "evening");
  return `
    <div class="mapPopup">
      <strong>${escapeHtml(apartment.address)}</strong>
      <span>${escapeHtml(priceLabel(apartment.price))} / ${apartment.bed ?? "-"} bed / ${apartment.bath ?? "-"} bath</span>
      <span>AM ${escapeHtml(minutesLabel(morning.total_minutes))} · PM ${escapeHtml(minutesLabel(evening.total_minutes))}</span>
      <span>Round trip ${escapeHtml(minutesLabel(roundTrip(apartment)))}</span>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export default function MapPanel({ apartments, target }) {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const plotted = useMemo(
    () => apartments.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)),
    [apartments]
  );
  const targetPoint = useMemo(() => ({
    lat: Number.isFinite(target?.latitude) ? target.latitude : DEFAULT_TARGET.lat,
    lon: Number.isFinite(target?.longitude) ? target.longitude : DEFAULT_TARGET.lon,
    label: target?.label || DEFAULT_TARGET.label,
    address: target?.address || DEFAULT_TARGET.address,
  }), [target]);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;

    mapRef.current = L.map(mapNode.current, {
      zoomControl: false,
      scrollWheelZoom: true,
      attributionControl: true,
    }).setView([40.75, -73.98], 11);

    L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(mapRef.current);

    layerRef.current = L.layerGroup().addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;

    layerRef.current.clearLayers();
    const bounds = L.latLngBounds([[targetPoint.lat, targetPoint.lon]]);

    L.marker([targetPoint.lat, targetPoint.lon], { icon: markerIcon("office", "T") })
      .bindPopup(`<div class="mapPopup"><strong>${escapeHtml(targetPoint.label)}</strong><span>${escapeHtml(targetPoint.address)}</span></div>`)
      .addTo(layerRef.current);

    plotted.forEach((apartment, index) => {
      const position = [apartment.latitude, apartment.longitude];
      bounds.extend(position);
      L.marker(position, { icon: markerIcon("apartment", String(index + 1)) })
        .bindPopup(popupHtml(apartment))
        .addTo(layerRef.current);
    });

    if (plotted.length) {
      mapRef.current.fitBounds(bounds, { padding: [36, 36], maxZoom: 13 });
    } else {
      mapRef.current.setView([targetPoint.lat, targetPoint.lon], 12);
    }
  }, [plotted, targetPoint]);

  return (
    <section className="mapPanel">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Live map</p>
          <h2>{targetPoint.label} commute map</h2>
        </div>
        <Building2 size={22} />
      </div>
      <div className="mapStats">
        <span><MapPin size={14} />{plotted.length} plotted</span>
        <span>Free OSM tiles</span>
      </div>
      <div className="leafletShell">
        <div ref={mapNode} className="realMap" aria-label="OpenStreetMap apartment map" />
      </div>
      <p className="muted mapHint">Click a marker to see price, commute time, and round trip. Marker T is your target.</p>
    </section>
  );
}
