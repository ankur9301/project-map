import React from "react";
import { Link, MapPin, X } from "lucide-react";

const initialForm = {
  address: "",
  price: "",
  features: "",
  bed: "",
  bath: "",
  vibe: "",
  notes: "",
  agent_name: "",
  agent_phone: "",
  agent_broker: "",
  listing_url: "",
  source: "",
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
            <p className="eyebrow">Hybrid input</p>
            <h2>Add to decision workspace</h2>
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
              <span>Best for quick saving from mobile or when the extension is not installed.</span>
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
            <span>Price</span>
            <input type="number" min="0" value={form.price} onChange={(event) => update("price", event.target.value)} placeholder="3200" />
          </label>
          <label className="field">
            <span>Bed</span>
            <input type="number" min="0" step="0.5" value={form.bed} onChange={(event) => update("bed", event.target.value)} placeholder="1" />
          </label>
          <label className="field">
            <span>Bath</span>
            <input type="number" min="0" step="0.5" value={form.bath} onChange={(event) => update("bath", event.target.value)} placeholder="1" />
          </label>
        </div>

        <label className="field wide">
          <span>Features</span>
          <input value={form.features} onChange={(event) => update("features", event.target.value)} placeholder="Doorman, laundry, gym, elevator" />
        </label>
        <label className="field wide">
          <span>Vibe</span>
          <textarea value={form.vibe} onChange={(event) => update("vibe", event.target.value)} placeholder="Quiet block, close to groceries, sunlight..." />
        </label>
        <label className="field wide">
          <span>Notes</span>
          <textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Broker details, tour notes, tradeoffs..." />
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
          <span>Source</span>
          <input value={form.source} onChange={(event) => update("source", event.target.value)} placeholder="zillow.com, streeteasy.com, apartments.com..." />
        </label>
        <label className="check">
          <input type="checkbox" checked={form.favorite} onChange={(event) => update("favorite", event.target.checked)} />
          <span>Mark as favorite</span>
        </label>

        <div className="modalActions">
          <button className="ghostButton" type="button" onClick={onClose}>Cancel</button>
          <button className="primaryButton" disabled={loading} type="submit">
            {loading ? "Calculating..." : "Add and calculate"}
          </button>
        </div>
      </form>
    </div>
  );
}
