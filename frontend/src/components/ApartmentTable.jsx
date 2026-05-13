import React from "react";
import { ArrowUpDown, RefreshCw, Star, Trash2 } from "lucide-react";
import { distanceLabel, getCommute, minutesLabel, priceLabel, roundTrip } from "../utils";

const COLUMN_WIDTHS = {
  address: 280,
  price: 110,
  morning: 115,
  evening: 115,
  roundTrip: 120,
  distance: 110,
  bed: 76,
  bath: 76,
  agent_name: 170,
  agent_phone: 140,
  agent_broker: 160,
  source: 120,
  listing_url: 95,
  features: 360,
  vibe: 260,
  notes: 300,
  score: 88,
};

export default function ApartmentTable({ apartments, columns, visibleColumns, sortKey, sortDirection, onSort, onToggleFavorite, onRecalculate, onDelete }) {
  const headers = columns.filter(([key]) => visibleColumns.includes(key));

  function valueFor(apartment, key) {
    const morning = getCommute(apartment, "morning");
    const evening = getCommute(apartment, "evening");
    const distanceKm = Number.isFinite(morning.total_distance_km) && Number.isFinite(evening.total_distance_km)
      ? morning.total_distance_km + evening.total_distance_km
      : null;
    const values = {
      address: <span className="addressCell">{apartment.address}</span>,
      price: priceLabel(apartment.price),
      morning: minutesLabel(morning.total_minutes),
      evening: minutesLabel(evening.total_minutes),
      roundTrip: minutesLabel(roundTrip(apartment)),
      distance: distanceLabel(distanceKm),
      bed: apartment.bed ?? "-",
      bath: apartment.bath ?? "-",
      agent_name: apartment.agent_name || apartment.agent_broker || "-",
      agent_phone: apartment.agent_phone || "-",
      agent_broker: apartment.agent_broker || "-",
      source: apartment.source || "-",
      listing_url: apartment.listing_url ? <a className="tableLink" href={apartment.listing_url} target="_blank" rel="noreferrer">Open</a> : "-",
      features: apartment.features || "-",
      vibe: apartment.vibe || "-",
      notes: apartment.notes || "-",
      score: apartment.commute_score ?? "-",
    };
    return values[key] ?? "-";
  }

  return (
    <div className="tableWrap">
      <table className="comparisonTable">
        <colgroup>
          <col style={{ width: 134 }} />
          {headers.map(([key]) => <col key={key} style={{ width: COLUMN_WIDTHS[key] || 140 }} />)}
        </colgroup>
        <thead>
          <tr>
            <th>Actions</th>
            {headers.map(([key, label]) => (
              <th className={`col-${key}`} key={key}>
                <button className="sortButton" type="button" onClick={() => onSort(key)}>
                  {label}
                  <ArrowUpDown size={14} className={sortKey === key ? sortDirection : ""} />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {apartments.map((apartment) => {
            return (
              <tr key={apartment.id}>
                <td className="rowActions">
                  <button className={`iconButton tableIcon ${apartment.favorite ? "active" : ""}`} type="button" onClick={() => onToggleFavorite(apartment)} aria-label="Toggle favorite">
                    <Star size={16} fill={apartment.favorite ? "currentColor" : "none"} />
                  </button>
                  <button className="iconButton tableIcon" type="button" onClick={() => onRecalculate(apartment.id)} aria-label="Recalculate">
                    <RefreshCw size={16} />
                  </button>
                  <button className="iconButton tableIcon danger" type="button" onClick={() => onDelete(apartment.id)} aria-label="Delete">
                    <Trash2 size={16} />
                  </button>
                </td>
                {headers.map(([key]) => <td className={`col-${key}`} key={key}>{valueFor(apartment, key)}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
