import React from "react";
import { X } from "lucide-react";

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

  return (
    <div className="modalLayer" role="presentation">
      <form className="modal" onSubmit={onSubmit}>
        <div className="modalHeader">
          <div>
            <p className="eyebrow">New apartment</p>
            <h2>Add a listing</h2>
          </div>
          <button className="iconButton" type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <label className="field wide">
          <span>Address</span>
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
          <span>Listing URL</span>
          <input value={form.listing_url} onChange={(event) => update("listing_url", event.target.value)} placeholder="https://..." />
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
