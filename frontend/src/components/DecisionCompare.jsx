import React from "react";
import { Dumbbell, Footprints, MapPin, ShoppingBasket, Sparkles, TrainFront, X } from "lucide-react";
import { getCommute, minutesLabel, overallScoreLabel, priceLabel, roundTrip, subScoreLabel } from "../utils";

const METRICS = [
  ["overall_score", "Overall", Sparkles],
  ["commute_score", "Commute", TrainFront],
  ["walkability_score", "Walkability", Footprints],
  ["grocery_score", "Groceries", ShoppingBasket],
  ["gym_score", "Gym", Dumbbell],
];

function routeLine(apartment, commuteMode) {
  const morning = getCommute(apartment, "morning", commuteMode);
  return morning.lines || "Route pending";
}

export default function DecisionCompare({ apartments, selectedIds, onToggle, commuteMode = "transit" }) {
  const selected = selectedIds
    .map((id) => apartments.find((apartment) => apartment.id === id))
    .filter(Boolean);
  const cards = selected.length ? selected : apartments.slice(0, 3);

  if (!apartments.length) return null;

  return (
    <section className="decisionCompare" aria-label="Side-by-side apartment comparison">
      <div className="comparisonHeader compact">
        <div>
          <p className="eyebrow">Compare mode</p>
          <h2>{selected.length ? "Your selected apartments" : "Top apartments at a glance"}</h2>
        </div>
        <p className="muted">Pick up to three cards to compare. If nothing is selected, this shows the current top three from your sort.</p>
      </div>

      <div className="compareGrid">
        {cards.map((apartment, index) => {
          const morning = getCommute(apartment, "morning", commuteMode);
          const evening = getCommute(apartment, "evening", commuteMode);
          return (
            <article className="compareCard" key={apartment.id}>
              <div className="compareRank">{String.fromCharCode(65 + index)}</div>
              {selectedIds.includes(apartment.id) && (
                <button className="compareRemove" type="button" onClick={() => onToggle(apartment.id)} aria-label="Remove from compare">
                  <X size={15} />
                </button>
              )}
              <div>
                <h3>{apartment.address}</h3>
                <p><MapPin size={14} />{apartment.neighborhood_name || apartment.source || "Neighborhood pending"}</p>
              </div>
              <div className="compareHeroStat">
                <span>{priceLabel(apartment.price)}</span>
                <strong>{overallScoreLabel(apartment.overall_score)}</strong>
                <small>overall</small>
              </div>
              <div className="compareFacts">
                <span>{apartment.beds ?? "-"} bed</span>
                <span>{apartment.baths ?? "-"} bath</span>
                <span>{apartment.sqft ? `${apartment.sqft} sqft` : "sqft N/A"}</span>
              </div>
              <div className="compareCommutes">
                <span><strong>{minutesLabel(morning.total_minutes)}</strong> morning</span>
                <span><strong>{minutesLabel(evening.total_minutes)}</strong> evening</span>
                <span><strong>{minutesLabel(roundTrip(apartment, commuteMode))}</strong> round trip</span>
              </div>
              <div className="compareRoute">{routeLine(apartment, commuteMode)}</div>
              <div className="compareScores">
                {METRICS.map(([key, label, Icon]) => (
                  <div key={key}>
                    <span><Icon size={13} />{label}</span>
                    <strong>{key === "overall_score" ? overallScoreLabel(apartment[key]) : subScoreLabel(apartment[key])}</strong>
                  </div>
                ))}
              </div>
              <p className="compareNotes">{apartment.notes || apartment.vibe || "No notes yet."}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
