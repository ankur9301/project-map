import React from "react";
import { Link, MapPin, X } from "lucide-react";

const initialForm = {
  address: "",
  price: "",
  beds: "",
  baths: "",
  sqft: "",
  building_has_gym: false,
  pet_friendly: false,
  vibe: "",
  notes: "",
  agent_name: "",
  agent_phone: "",
  agent_broker: "",
  listing_url: "",
  image_url: "",
  source: "",
  neighborhood_name: "",
  favorite: false,
};

export { initialForm };

export default function AddApartmentModal({ open, form, setForm, loading, onClose, onSubmit }) {
  if (!open) return null;

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const updateUrl = (value) => {
    let source = form.source;
    try {
      source = new URL(value).hostname.replace(/^www\./, "");
    } catch {
      source = form.source;
    }
    setForm((current) => ({ ...current, listing_url: value, source }));
  };

  return (
    <div className="modalLayer" role="presentation">
      <form className="modal" onSubmit={onSubmit}>
        <div className="modalHeader">
          <div>
            <p className="eyebrow">Decision workspace</p>
            <h2>Add an apartment to score</h2>
          </div>
          <button className="iconButton" type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <section className="inputModePanel">
          <div>
            <Link size={18} />
            <div>
              <strong>Paste listing URL</strong>
              <span>The Chrome extension is the fastest path — this modal is the manual backup.</span>
            </div>
          </div>
          <label className="field wide">
            <span>Listing URL</span>
            <input value={form.listing_url} onChange={(event) => updateUrl(event.target.value)} placeholder="https://www.zillow.com/..." />
          </label>
        </section>

        <label className="field wide">
          <span><MapPin size={14} />Address</span>
          <input value={form.address} onChange={(event) => update("address", event.target.value)} required placeholder="123 Main St, Hoboken, NJ" />
        </label>

        <div className="formGrid">
          <label className="field">
            <span>Price ($)</span>
            <input type="number" min="0" value={form.price} onChange={(event) => update("price", event.target.value)} placeholder="3200" />
          </label>
          <label className="field">
            <span>Beds</span>
            <input type="number" min="0" step="0.5" value={form.beds} onChange={(event) => update("beds", event.target.value)} placeholder="1" />
          </label>
          <label className="field">
            <span>Baths</span>
            <input type="number" min="0" step="0.5" value={form.baths} onChange={(event) => update("baths", event.target.value)} placeholder="1" />
          </label>
          <label className="field">
            <span>Sqft</span>
            <input type="number" min="0" value={form.sqft} onChange={(event) => update("sqft", event.target.value)} placeholder="650" />
          </label>
        </div>

        <div className="formGrid">
          <label className="field">
            <span>Neighborhood</span>
            <input value={form.neighborhood_name} onChange={(event) => update("neighborhood_name", event.target.value)} placeholder="West Village" />
          </label>
          <label className="check inline">
            <input type="checkbox" checked={form.building_has_gym} onChange={(event) => update("building_has_gym", event.target.checked)} />
            <span>Building has gym</span>
          </label>
          <label className="check inline">
            <input type="checkbox" checked={form.pet_friendly} onChange={(event) => update("pet_friendly", event.target.checked)} />
            <span>Pet friendly</span>
          </label>
        </div>

        <label className="field wide">
          <span>Vibe</span>
          <textarea value={form.vibe} onChange={(event) => update("vibe", event.target.value)} placeholder="Quiet block, sunlight, close to the park..." />
        </label>
        <label className="field wide">
          <span>Notes</span>
          <textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Tour notes, tradeoffs, broker details..." />
        </label>
        <div className="formGrid agentGrid">
          <label className="field">
            <span>Listing agent</span>
            <input value={form.agent_name} onChange={(event) => update("agent_name", event.target.value)} placeholder="Agent or manager" />
          </label>
          <label className="field">
            <span>Agent phone</span>
            <input value={form.agent_phone} onChange={(event) => update("agent_phone", event.target.value)} placeholder="(555) 123-4567" />
          </label>
          <label className="field">
            <span>Broker</span>
            <input value={form.agent_broker} onChange={(event) => update("agent_broker", event.target.value)} placeholder="Brokerage / property manager" />
          </label>
        </div>
        <label className="field wide">
          <span>Image URL (optional)</span>
          <input value={form.image_url} onChange={(event) => update("image_url", event.target.value)} placeholder="https://..." />
        </label>
        <label className="field wide">
          <span>Source</span>
          <input value={form.source} onChange={(event) => update("source", event.target.value)} placeholder="zillow.com, streeteasy.com..." />
        </label>
        <label className="check">
          <input type="checkbox" checked={form.favorite} onChange={(event) => update("favorite", event.target.checked)} />
          <span>Mark as favorite</span>
        </label>

        <div className="modalActions">
          <button className="ghostButton" type="button" onClick={onClose}>Cancel</button>
          <button className="primaryButton" disabled={loading} type="submit">
            {loading ? "Scoring..." : "Add and score"}
          </button>
        </div>
      </form>
    </div>
  );
}
