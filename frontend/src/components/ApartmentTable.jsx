import React from "react";
import { ArrowUpDown, RefreshCw, Star, Trash2 } from "lucide-react";
import { distanceLabel, getCommute, minutesLabel, overallScoreLabel, priceLabel, roundTrip, subScoreLabel } from "../utils";

const COLUMN_WIDTHS = {
  address: 280,
  neighborhood_name: 150,
  price: 110,
  morning: 115,
  evening: 115,
  roundTrip: 120,
  distance: 110,
  beds: 76,
  baths: 76,
  sqft: 80,
  agent_name: 170,
  agent_phone: 140,
  agent_broker: 160,
  source: 120,
  listing_url: 95,
  vibe: 260,
  notes: 300,
  overall_score: 95,
  commute_score: 95,
  walkability_score: 95,
  grocery_score: 90,
  gym_score: 80,
  lifestyle_score: 95,
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
      neighborhood_name: apartment.neighborhood_name || "-",
      price: priceLabel(apartment.price),
      morning: minutesLabel(morning.total_minutes),
      evening: minutesLabel(evening.total_minutes),
      roundTrip: minutesLabel(roundTrip(apartment)),
      distance: distanceLabel(distanceKm),
      beds: apartment.beds ?? "-",
      baths: apartment.baths ?? "-",
      sqft: apartment.sqft ?? "-",
      agent_name: apartment.agent_name || apartment.agent_broker || "-",
      agent_phone: apartment.agent_phone || "-",
      agent_broker: apartment.agent_broker || "-",
      source: apartment.source || "-",
      listing_url: apartment.listing_url
        ? <a className="tableLink" href={apartment.listing_url} target="_blank" rel="noreferrer">Open</a>
        : "-",
      vibe: apartment.vibe || "-",
      notes: apartment.notes || "-",
      overall_score: overallScoreLabel(apartment.overall_score),
      commute_score: subScoreLabel(apartment.commute_score),
      walkability_score: subScoreLabel(apartment.walkability_score),
      grocery_score: subScoreLabel(apartment.grocery_score),
      gym_score: subScoreLabel(apartment.gym_score),
      lifestyle_score: subScoreLabel(apartment.lifestyle_score),
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
          {apartments.map((apartment) => (
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
