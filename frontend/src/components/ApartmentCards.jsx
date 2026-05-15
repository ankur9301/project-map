import React from "react";
import { Bike, Car, Clock, Dumbbell, ExternalLink, Footprints, MapPin, MoreHorizontal, RefreshCw, ShoppingBasket, Sparkles, Star, Trash2, TreePine, TramFront } from "lucide-react";
import {
  arrivalLabel,
  commuteTone,
  distanceLabel,
  getCommute,
  minutesLabel,
  overallScoreLabel,
  overallTone,
  priceLabel,
  roundTrip,
  scoreNumber,
  subScoreLabel,
  subScoreTone,
} from "../utils";

const SUBWAY_COLORS = {
  A: "blue", C: "blue", E: "blue",
  B: "orange", D: "orange", F: "orange", M: "orange",
  G: "lime",
  J: "brown", Z: "brown",
  L: "gray",
  N: "yellow", Q: "yellow", R: "yellow", W: "yellow",
  S: "dark",
  1: "red", 2: "red", 3: "red",
  4: "green", 5: "green", 6: "green",
  7: "purple",
};

const SCORE_DIMENSIONS = [
  { key: "commute_score",     label: "Commute",     Icon: TramFront },
  { key: "walkability_score", label: "Walkability", Icon: Footprints },
  { key: "grocery_score",     label: "Grocery",     Icon: ShoppingBasket },
  { key: "gym_score",         label: "Gym",         Icon: Dumbbell },
  { key: "lifestyle_score",   label: "Lifestyle",   Icon: Sparkles },
  { key: "quietness_score",   label: "Quiet",       Icon: TreePine },
];

const POI_LABELS = {
  gym: "Gyms",
  grocery_store: "Groceries",
  cafe: "Cafes",
  restaurant: "Restaurants",
  park: "Parks",
  subway_station: "Transit stops",
};

function transitTokens(lines = "") {
  if (!lines || lines === "Walk only") return [];
  return [...new Set(
    lines.split(",").map((line) => line.trim().replace(/\s+Line$/, "")).filter(Boolean)
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

function modeLabel(mode = "transit") {
  return {
    transit: "Transit",
    car: "Car",
    cycling: "Cycling",
    walking: "Walking",
  }[mode] || "Transit";
}

function ModeIcon({ mode }) {
  const Icon = { car: Car, cycling: Bike, walking: Footprints, transit: TramFront }[mode] || TramFront;
  return <Icon size={14} />;
}

function transferLabel(count) {
  if (!Number.isFinite(count)) return "Transfers unavailable";
  return count === 1 ? "1 transfer" : `${count} transfers`;
}

function routeSteps(steps = "") {
  return steps
    .split(/\s+\|\s+/)
    .map((step) => step.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((step) => !/^walk \(0 min\)$/i.test(step))
    .slice(0, 6);
}

function TransitBadge({ token }) {
  const subwayColor = SUBWAY_COLORS[token];
  const isBus = /^\d{2,3}$/.test(token) && !SUBWAY_COLORS[token];
  return <span className={`transitBadge ${subwayColor ? `subway ${subwayColor}` : ""} ${isBus ? "bus" : ""}`}>{token}</span>;
}

function metersLabel(meters) {
  const value = Number(meters);
  if (!Number.isFinite(value)) return "distance unknown";
  if (value < 1609) return `${Math.round(value)} m`;
  return `${(value / 1609.344).toFixed(1)} mi`;
}

function scoreReason(apartment) {
  const snapshotErrors = apartment.poi_snapshot?.__errors__ || [];
  const errors = [...(apartment.score_breakdown?.pipeline_errors || []), ...snapshotErrors.map((item) => `${item.category}: ${item.error}`)];
  if (errors.length) {
    const unique = [...new Set(errors.map((error) => String(error).replace(/\s+/g, " ").trim()))];
    return unique.slice(0, 3).join(" · ");
  }
  const poi = apartment.poi_snapshot || {};
  const poiCounts = Object.values(poi).reduce((sum, item) => sum + (Number(item?.count) || 0), 0);
  if (!poiCounts) return "No nearby POIs were returned or cached yet. Check Places API New and recalculate.";
  return "Scores are based on the nearby POIs stored below plus commute data.";
}

function NearbyAudit({ apartment }) {
  const snapshot = apartment.poi_snapshot || {};
  const breakdown = apartment.score_breakdown || {};
  const categories = Object.entries(POI_LABELS);

  return (
    <div className="nearbyAudit">
      <p className="auditNotice">{scoreReason(apartment)}</p>
      <div className="poiGrid">
        {categories.map(([key, label]) => {
          const entry = snapshot[key] || {};
          const nearest = entry.nearest;
          return (
            <div className="poiTile" key={key}>
              <span>{label}</span>
              <strong>{entry.count ?? 0}</strong>
              <small>
                {nearest?.name
                  ? `${nearest.name} · ${metersLabel(nearest.distance_m)}`
                  : "No nearby result"}
              </small>
            </div>
          );
        })}
      </div>
      <div className="auditGrid">
        {SCORE_DIMENSIONS.map(({ key, label }) => {
          const name = key.replace("_score", "");
          const data = breakdown[name] || {};
          const firstUseful = Object.entries(data).find(([, value]) => value !== null && typeof value !== "object");
          return (
            <div className="auditTile" key={key}>
              <span>{label}</span>
              <strong>{subScoreLabel(apartment[key])}</strong>
              <small>{firstUseful ? `${firstUseful[0].replaceAll("_", " ")}: ${firstUseful[1]}` : "No detail yet"}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScoreBar({ Icon, label, score }) {
  const value = scoreNumber(score);
  const tone = subScoreTone(score);
  const widthPercent = value === null ? 0 : Math.max(4, Math.min(100, (value / 10) * 100));
  return (
    <div className={`scoreBarRow tone-${tone}`} title={`${label}: ${value === null ? "Pending" : value.toFixed(1) + " / 10"}`}>
      <span className="scoreBarLabel"><Icon size={13} />{label}</span>
      <span className="scoreBarTrack">
        <span className="scoreBarFill" style={{ width: `${widthPercent}%` }} />
      </span>
      <span className="scoreBarValue">{subScoreLabel(score)}</span>
    </div>
  );
}

function RouteOptionList({ title, summary, commuteMode = "transit" }) {
  if (!summary) return null;
  const options = summary.match(/Fastest[^\n]*(?:\n(?!Fastest).*)*/g) || [];
  const isTransit = commuteMode === "transit";

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
          const simpleMetrics = metrics.split(",").map((item) => item.trim()).filter(Boolean);

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
              {isTransit ? (
                <div className="routePath" aria-label={`${label} transit lines`}>
                  {tokens.map((token, index) => (
                    <React.Fragment key={token}>
                      {index > 0 && <span className="routeArrow">&gt;</span>}
                      <TransitBadge token={token} />
                    </React.Fragment>
                  ))}
                </div>
              ) : (
                <div className="routePath simple" aria-label={`${label} ${modeLabel(commuteMode)} route`}>
                  <span className="routeModePill"><ModeIcon mode={commuteMode} />{modeLabel(commuteMode)}</span>
                </div>
              )}
              <div className="routeMetrics">
                {isTransit ? (
                  <>
                    <span>{transfers}</span>
                    <span><Footprints size={14} />{walk}</span>
                  </>
                ) : (
                  <>
                    <span>{simpleMetrics[1] || "Distance pending"}</span>
                    <span><ModeIcon mode={commuteMode} />{simpleMetrics[2] || modeLabel(commuteMode)}</span>
                  </>
                )}
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

export default function ApartmentCards({ apartments, bestId, cheapestId, compareIds = [], onToggleCompare, onToggleFavorite, onRecalculate, onDelete, commuteMode = "transit" }) {
  return (
    <section className="cardsGrid" aria-label="Apartment cards">
      {apartments.map((apartment) => {
        const morning = getCommute(apartment, "morning", commuteMode);
        const evening = getCommute(apartment, "evening", commuteMode);
        const trip = roundTrip(apartment, commuteMode);
        const distanceKm = Number.isFinite(morning.total_distance_km) && Number.isFinite(evening.total_distance_km)
          ? morning.total_distance_km + evening.total_distance_km
          : null;
        const lines = [morning.lines, evening.lines].filter(Boolean).join(" / ");
        const overallTag = overallTone(apartment.overall_score);
        const friction = scoreNumber(apartment.daily_friction_score);

        return (
          <article className="apartmentCard" key={apartment.id}>
            <div className={`scoreRibbon tone-${overallTag}`}>
              <div className="scoreRibbonMain">
                <span>Overall</span>
                <strong>{overallScoreLabel(apartment.overall_score)}</strong>
                <small>/ 100</small>
              </div>
              <div className="scoreRibbonMeta">
                {apartment.neighborhood_name && <span className="neighborhoodChip">{apartment.neighborhood_name}</span>}
                {friction !== null && (
                  <span className={`frictionChip friction-${subScoreTone(10 - friction)}`} title="Daily friction (lower = smoother)">
                    Friction {friction.toFixed(1)}
                  </span>
                )}
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
                <p className="priceLine">
                  {priceLabel(apartment.price)}
                  <span>
                    {apartment.beds ?? "-"} bed / {apartment.baths ?? "-"} bath
                    {apartment.sqft ? ` / ${apartment.sqft} sqft` : ""}
                  </span>
                </p>
              </div>
              <div className="cardActions">
                {apartment.listing_url && (
                  <a className="iconButton" href={apartment.listing_url} target="_blank" rel="noreferrer" aria-label="Open listing">
                    <ExternalLink size={18} />
                  </a>
                )}
                <button className="iconButton" onClick={() => onRecalculate?.(apartment.id)} aria-label="Recalculate commute and nearby scores" type="button">
                  <RefreshCw size={18} />
                </button>
                <button className="iconButton danger" onClick={() => onDelete(apartment.id)} aria-label="Delete apartment" type="button">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            <div className="badges">
              {bestId === apartment.id && <span className="badge best">Best commute</span>}
              {cheapestId === apartment.id && <span className="badge cheap">Cheapest</span>}
              <button
                className={`badge compareBadge ${compareIds.includes(apartment.id) ? "selected" : ""}`}
                type="button"
                onClick={() => onToggleCompare?.(apartment.id)}
              >
                {compareIds.includes(apartment.id) ? "Comparing" : "Compare"}
              </button>
              {apartment.building_has_gym && <span className="badge">In-building gym</span>}
              {apartment.pet_friendly && <span className="badge">Pet friendly</span>}
            </div>

            <section className="scoreCluster" aria-label="Score breakdown">
              {SCORE_DIMENSIONS.map(({ key, label, Icon }) => (
                <ScoreBar key={key} Icon={Icon} label={label} score={apartment[key]} />
              ))}
            </section>

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

            <div className="commuteSummary">
              <span>{lines || `${modeLabel(commuteMode)} route appears after routing`}</span>
              <span>Round trip {minutesLabel(trip)}</span>
              <span>{distanceLabel(distanceKm)} total</span>
              {commuteMode === "transit" ? (
                <>
                  <span>Morning: {transferLabel(morning.transfers)}</span>
                  <span>Evening: {transferLabel(evening.transfers)}</span>
                </>
              ) : (
                <span>{modeLabel(commuteMode)} time saved for this mode</span>
              )}
            </div>

            {(morning.route_summary || evening.route_summary) && (
              <details className="cardDrawer">
                <summary><MoreHorizontal size={17} />Route detail</summary>
                <div className="routeOptions">
                  <RouteOptionList title="Morning route options" summary={morning.route_summary} commuteMode={commuteMode} />
                  <RouteOptionList title="Evening route options" summary={evening.route_summary} commuteMode={commuteMode} />
                </div>
              </details>
            )}

            <details className="cardDrawer">
              <summary><MoreHorizontal size={17} />Nearby & scoring</summary>
              <NearbyAudit apartment={apartment} />
            </details>

            <details className="cardDrawer">
              <summary><MoreHorizontal size={17} />Notes & contact</summary>
              {(apartment.agent_name || apartment.agent_phone || apartment.agent_broker) && (
                <div className="agentStrip">
                  <strong>{apartment.agent_name || "N/A"}</strong>
                  <span>{apartment.agent_phone || "N/A"}</span>
                  <span>{apartment.agent_broker || apartment.source || "N/A"}</span>
                  {apartment.listing_url && <a href={apartment.listing_url} target="_blank" rel="noreferrer">Open listing</a>}
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
