import React from "react";
import { Clock, ExternalLink, Footprints, MapPin, MoreHorizontal, Star, Trash2 } from "lucide-react";
import { arrivalLabel, commuteTone, distanceLabel, getCommute, minutesLabel, priceLabel, roundTrip } from "../utils";

const SUBWAY_COLORS = {
  A: "blue",
  C: "blue",
  E: "blue",
  B: "orange",
  D: "orange",
  F: "orange",
  M: "orange",
  G: "lime",
  J: "brown",
  Z: "brown",
  L: "gray",
  N: "yellow",
  Q: "yellow",
  R: "yellow",
  W: "yellow",
  S: "dark",
  1: "red",
  2: "red",
  3: "red",
  4: "green",
  5: "green",
  6: "green",
  7: "purple",
};

function transitTokens(lines = "") {
  if (!lines || lines === "Walk only") return [];
  return [...new Set(
    lines
      .split(",")
      .map((line) => line.trim().replace(/\s+Line$/, ""))
      .filter(Boolean)
  )].slice(0, 6);
}

function splitRouteMetrics(metrics = "") {
  const parts = metrics.split(",").map((item) => item.trim()).filter(Boolean);
  return {
    duration: parts[0] || "",
    transfers: parts[1] || "",
    walk: parts[2] || "",
    lines: parts.slice(3).join(", "),
  };
}

function transferLabel(count) {
  if (!Number.isFinite(count)) return "Transfers unavailable";
  return count === 1 ? "1 transfer" : `${count} transfers`;
}

function walkLabel(minutes) {
  if (!Number.isFinite(minutes)) return "Walk time unavailable";
  return minutes === 1 ? "1 min walking" : `${minutes} min walking`;
}

function burdenLevel(value, good, ok) {
  if (!Number.isFinite(value)) return "Unknown";
  if (value <= good) return "Easy";
  if (value <= ok) return "Manageable";
  return "Heavy";
}

function routeSteps(steps = "") {
  return steps
    .split(/\s+\|\s+/)
    .map((step) => step.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((step) => !/^walk \(0 min\)$/i.test(step))
    .slice(0, 6);
}

const FEATURE_KEYWORDS = [
  ["In-unit laundry", /in[- ]?unit laundry|washer\/dryer|washer dryer/i],
  ["Central AC", /central ac|air conditioning|a\/c/i],
  ["Dishwasher", /dishwasher/i],
  ["Microwave", /microwave/i],
  ["Stainless appliances", /stainless steel/i],
  ["No fee", /no fee/i],
  ["Terrace", /terrace|balcony/i],
  ["Hardwood floors", /hardwood/i],
  ["Elevator", /elevator/i],
  ["Doorman", /doorman/i],
  ["Gym", /\bgym\b|fitness/i],
  ["Parking", /parking/i],
  ["Closet space", /closet/i],
  ["Private entrance", /private entrance/i],
];

function titleCase(value) {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bAc\b/g, "AC");
}

function featureParts(value = "") {
  if (!value) return { chips: [], description: "" };
  const chips = [];
  for (const [label, pattern] of FEATURE_KEYWORDS) {
    if (pattern.test(value)) chips.push(label);
  }
  const explicit = value
    .replace(/([a-z])([A-Z])/g, "$1 | $2")
    .split(/\s*\|\s*|,\s*/)
    .map((item) => item.trim())
    .filter((item) => item.length > 2 && item.length <= 42 && !/[.!?]/.test(item))
    .map(titleCase);

  const uniqueChips = [...new Set([...chips, ...explicit])].slice(0, 10);
  const description = value
    .replace(/([a-z])([A-Z])/g, "$1. $2")
    .replace(/\s+/g, " ")
    .trim();

  return { chips: uniqueChips, description };
}

function TransitBadge({ token }) {
  const subwayColor = SUBWAY_COLORS[token];
  const isBus = /^\d{2,3}$/.test(token) && !SUBWAY_COLORS[token];
  return <span className={`transitBadge ${subwayColor ? `subway ${subwayColor}` : ""} ${isBus ? "bus" : ""}`}>{token}</span>;
}

function RouteOptionList({ title, summary }) {
  if (!summary) return null;
  const options = summary.match(/Fastest[^\n]*(?:\n(?!Fastest).*)*/g) || [];

  return (
    <details className="routeDetails" open={title === "Morning route options"}>
      <summary>{title}</summary>
      <div className="routeOptionList">
        {options.map((option) => {
          const header = option.match(/^([^:]+):\s+([^.]*)\.\s*(.*)$/s);
          const label = header?.[1] || "Route";
          const metrics = header?.[2] || option;
          const steps = header?.[3] || "";
          const { duration, transfers, walk, lines } = splitRouteMetrics(metrics);
          const tokens = transitTokens(lines);
          const cleanSteps = routeSteps(steps.replaceAll(" -> ", " | "));

          return (
            <article className="routeOption" key={`${title}-${label}-${metrics}`}>
              <div className="routeOptionTop">
                <div>
                  <span className="optionKicker">Fastest route</span>
                  <strong>{duration}</strong>
                </div>
                <div className="routeLabels">
                  <span className="routeLabel">{label}</span>
                </div>
              </div>
              <div className="routePath" aria-label={`${label} transit lines`}>
                {tokens.map((token, index) => (
                  <React.Fragment key={token}>
                    {index > 0 && <span className="routeArrow">&gt;</span>}
                    <TransitBadge token={token} />
                  </React.Fragment>
                ))}
              </div>
              <div className="routeMetrics">
                <span>{transfers}</span>
                <span><Footprints size={14} />{walk}</span>
              </div>
              {cleanSteps.length > 0 && (
                <ol className="routeStepList">
                  {cleanSteps.map((step, index) => <li key={`${label}-${index}`}>{step}</li>)}
                </ol>
              )}
            </article>
          );
        })}
      </div>
    </details>
  );
}

export default function ApartmentCards({ apartments, bestId, cheapestId, onToggleFavorite, onDelete }) {
  return (
    <section className="cardsGrid" aria-label="Apartment cards">
      {apartments.map((apartment) => {
        const morning = getCommute(apartment, "morning");
        const evening = getCommute(apartment, "evening");
        const trip = roundTrip(apartment);
        const distanceKm = Number.isFinite(morning.total_distance_km) && Number.isFinite(evening.total_distance_km)
          ? morning.total_distance_km + evening.total_distance_km
          : null;
        const lines = [morning.lines, evening.lines].filter(Boolean).join(" / ");
        const features = featureParts(apartment.features);
        const heroFeatures = features.chips.slice(0, 3);
        const dailyTransfers = Number.isFinite(morning.transfers) && Number.isFinite(evening.transfers)
          ? morning.transfers + evening.transfers
          : null;
        const dailyWalk = Number.isFinite(morning.walking_minutes) && Number.isFinite(evening.walking_minutes)
          ? morning.walking_minutes + evening.walking_minutes
          : null;
        return (
          <article className="apartmentCard" key={apartment.id}>
            <div className="listingRibbon">
              <div>
                <span>{apartment.commute_score !== null ? `Score ${apartment.commute_score}` : "Unscored"}</span>
                <strong>{minutesLabel(trip)}</strong>
                <small>round trip</small>
              </div>
              <button
                className={`heartButton ${apartment.favorite ? "active" : ""}`}
                onClick={() => onToggleFavorite(apartment)}
                aria-label="Toggle favorite"
                type="button"
              >
                <Star size={22} fill={apartment.favorite ? "currentColor" : "none"} />
              </button>
            </div>
            <div className="cardTop">
              <div>
                <div className="addressLine">
                  <MapPin size={16} />
                  <h3>{apartment.address}</h3>
                </div>
                <p className="priceLine">{priceLabel(apartment.price)}<span>{apartment.bed ?? "-"} bed / {apartment.bath ?? "-"} bath</span></p>
              </div>
              <div className="cardActions">
                {apartment.listing_url && (
                  <a className="iconButton" href={apartment.listing_url} target="_blank" rel="noreferrer" aria-label="Open listing">
                    <ExternalLink size={18} />
                  </a>
                )}
                <button className="iconButton danger" onClick={() => onDelete(apartment.id)} aria-label="Delete apartment" type="button">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            <div className="badges">
              {bestId === apartment.id && <span className="badge best">Best commute</span>}
              {cheapestId === apartment.id && <span className="badge cheap">Cheapest</span>}
              {apartment.commute_score !== null && <span className="badge">Score {apartment.commute_score}</span>}
            </div>

            <div className="commutePair">
              <div className={`commuteBox ${commuteTone(morning.total_minutes)}`}>
                <span>Morning</span>
                <strong><Clock size={16} />{minutesLabel(morning.total_minutes)}</strong>
                <small>Arrives {arrivalLabel(morning.estimated_arrival)}</small>
              </div>
              <div className={`commuteBox ${commuteTone(evening.total_minutes)}`}>
                <span>Evening</span>
                <strong><Clock size={16} />{minutesLabel(evening.total_minutes)}</strong>
                <small>Arrives {arrivalLabel(evening.estimated_arrival)}</small>
              </div>
            </div>

            {heroFeatures.length > 0 && (
              <div className="miniFeatures">
                {heroFeatures.map((feature) => <span key={feature}>{feature}</span>)}
              </div>
            )}

            <div className="commuteSummary">
              <span>{lines || "Transit lines appear after routing"}</span>
              <span>Round trip {minutesLabel(trip)}</span>
              <span>{distanceLabel(distanceKm)} total</span>
              <span>Morning: {transferLabel(morning.transfers)}</span>
              <span>Evening: {transferLabel(evening.transfers)}</span>
            </div>
            {(morning.route_summary || evening.route_summary) && (
              <details className="cardDrawer">
                <summary><MoreHorizontal size={17} />Route</summary>
                <div className="routeOptions">
                  <RouteOptionList title="Morning route options" summary={morning.route_summary} />
                  <RouteOptionList title="Evening route options" summary={evening.route_summary} />
                </div>
              </details>
            )}
            <details className="cardDrawer">
              <summary><MoreHorizontal size={17} />Details</summary>
              <div className="decisionSignals">
                <span><strong>{burdenLevel(trip, 70, 95)}</strong> round trip</span>
                <span><strong>{burdenLevel(dailyTransfers, 2, 4)}</strong> transfers</span>
                <span><strong>{burdenLevel(dailyWalk, 18, 32)}</strong> walking</span>
              </div>
              {(apartment.agent_name || apartment.agent_phone || apartment.agent_broker) && (
                <div className="agentStrip">
                  <strong>{apartment.agent_name || "N/A"}</strong>
                  <span>{apartment.agent_phone || "N/A"}</span>
                  <span>{apartment.agent_broker || apartment.source || "N/A"}</span>
                  {apartment.listing_url && <a href={apartment.listing_url} target="_blank" rel="noreferrer">Open listing</a>}
                </div>
              )}
              {apartment.features && (
                <div className="featureBlock">
                  <span>Features</span>
                  {features.chips.length > 0 && (
                    <div className="featureChips">
                      {features.chips.map((feature) => <strong key={feature}>{feature}</strong>)}
                    </div>
                  )}
                  {features.description && <p>{features.description}</p>}
                </div>
              )}
              {apartment.vibe && <p className="noteText">{apartment.vibe}</p>}
              {apartment.notes && <p className="noteText">{apartment.notes}</p>}
            </details>
          </article>
        );
      })}
    </section>
  );
}
