import React, { useEffect, useMemo, useState } from "react";
import { Bike, Car, Download, EyeOff, Footprints, LayoutGrid, MapPin, Moon, Plus, RefreshCw, Search, SlidersHorizontal, Sun, TrainFront, Trash2 } from "lucide-react";
import {
  addApartment,
  deleteApartment,
  downloadExport,
  getApartments,
  getTarget,
  recalculateApartment,
  saveTarget,
  updateApartment,
} from "./api";
import ApartmentCards from "./components/ApartmentCards";
import ApartmentTable from "./components/ApartmentTable";
import AddApartmentModal, { initialForm } from "./components/AddApartmentModal";
import DecisionCompare from "./components/DecisionCompare";
import MapPanel from "./components/MapPanel";
import { supabase } from "./supabaseClient";
import { getCommute, overallScoreLabel, roundTrip, scoreNumber } from "./utils";
import "./styles.css";

const TABLE_COLUMNS = [
  ["address", "Address"],
  ["neighborhood_name", "Neighborhood"],
  ["price", "Price"],
  ["beds", "Beds"],
  ["baths", "Baths"],
  ["sqft", "Sqft"],
  ["overall_score", "Overall"],
  ["commute_score", "Commute"],
  ["walkability_score", "Walk"],
  ["grocery_score", "Grocery"],
  ["gym_score", "Gym"],
  ["lifestyle_score", "Lifestyle"],
  ["morning", "Morning"],
  ["evening", "Evening"],
  ["roundTrip", "Round trip"],
  ["distance", "Distance"],
  ["agent_name", "Agent"],
  ["agent_phone", "Phone"],
  ["agent_broker", "Broker"],
  ["source", "Source"],
  ["listing_url", "Link"],
  ["vibe", "Vibe"],
  ["notes", "Notes"],
];

const DEFAULT_VISIBLE_COLUMNS = [
  "address",
  "neighborhood_name",
  "price",
  "beds",
  "baths",
  "overall_score",
  "commute_score",
  "walkability_score",
  "grocery_score",
  "gym_score",
  "morning",
  "evening",
  "roundTrip",
];

const COMMUTE_MODES = [
  { value: "transit", label: "Transit", Icon: TrainFront },
  { value: "car", label: "Car", Icon: Car },
  { value: "cycling", label: "Cycling", Icon: Bike },
  { value: "walking", label: "Walking", Icon: Footprints },
];

const COLUMN_STORAGE_KEY = "visibleColumns.v3";

const CARD_SORTS = [
  ["overall_score", "Overall score"],
  ["commute_score", "Commute"],
  ["walkability_score", "Walkability"],
  ["grocery_score", "Grocery"],
  ["gym_score", "Gym"],
  ["price", "Price"],
  ["morning", "Morning"],
  ["evening", "Evening"],
  ["roundTrip", "Round trip"],
];

function numeric(value) {
  if (value === "" || value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonEmpty(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export default function App() {
  const [apartments, setApartments] = useState([]);
  const [search, setSearch] = useState("");
  const [showFavorites, setShowFavorites] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [sortKey, setSortKey] = useState("overall_score");
  const [sortDirection, setSortDirection] = useState("desc");
  const [viewPanelOpen, setViewPanelOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const [targetForm, setTargetForm] = useState({ label: "Office", address: "731 Lexington Ave, New York, NY", commute_mode: "transit" });
  const [compareIds, setCompareIds] = useState([]);
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLUMN_STORAGE_KEY) || "null");
      const validKeys = new Set(TABLE_COLUMNS.map(([key]) => key));
      const filtered = Array.isArray(saved) ? saved.filter((key) => validKeys.has(key)) : null;
      return filtered && filtered.length >= 6 ? filtered : DEFAULT_VISIBLE_COLUMNS;
    } catch {
      return DEFAULT_VISIBLE_COLUMNS;
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  async function load() {
    setDataLoading(true);
    try {
      const data = await getApartments({ search, favorite: showFavorites ? true : undefined });
      setApartments(data.items);
    } catch (error) {
      setToast(error.message);
    } finally {
      setDataLoading(false);
    }
  }

  async function loadTarget() {
    try {
      const data = await getTarget();
      setTarget(data);
      setTargetForm({ label: data.label || "Office", address: data.address || "", commute_mode: data.commute_mode || "transit" });
    } catch (error) {
      setToast(error.message);
    }
  }

  useEffect(() => {
    const handle = setTimeout(load, 180);
    return () => clearTimeout(handle);
  }, [search, showFavorites]);

  useEffect(() => {
    loadTarget();
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;
    let channel;
    supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id;
      if (!userId) return;
      channel = supabase
        .channel(`apartments-${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "apartments", filter: `user_id=eq.${userId}` },
          () => load()
        )
        .subscribe();
    });
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setToast("Scoring apartment — commute + nearby POIs...");
    try {
      await addApartment({
        address: nonEmpty(form.address),
        listing_url: nonEmpty(form.listing_url),
        image_url: nonEmpty(form.image_url),
        source: nonEmpty(form.source),
        neighborhood_name: nonEmpty(form.neighborhood_name),
        price: numeric(form.price),
        beds: numeric(form.beds),
        baths: numeric(form.baths),
        sqft: numeric(form.sqft),
        building_has_gym: !!form.building_has_gym,
        pet_friendly: !!form.pet_friendly,
        vibe: nonEmpty(form.vibe),
        notes: nonEmpty(form.notes),
        agent_name: nonEmpty(form.agent_name),
        agent_phone: nonEmpty(form.agent_phone),
        agent_broker: nonEmpty(form.agent_broker),
        favorite: !!form.favorite,
      });
      setForm(initialForm);
      setModalOpen(false);
      setToast("Apartment saved and scored.");
      await load();
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleFavorite(apartment) {
    await updateApartment(apartment.id, { favorite: !apartment.favorite });
    await load();
  }

  async function recalculate(id) {
    setToast("Recalculating commute + scores...");
    try {
      await recalculateApartment(id);
      setToast("Scores refreshed.");
      await load();
    } catch (error) {
      setToast(error.message);
    }
  }

  async function recalculateShownApartments() {
    if (!sortedApartments.length) return;
    setLoading(true);
    setToast(`Recalculating ${sortedApartments.length} shown apartment${sortedApartments.length === 1 ? "" : "s"}...`);
    try {
      for (const apartment of sortedApartments) {
        await recalculateApartment(apartment.id);
      }
      setToast("Shown apartments refreshed.");
      await load();
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function remove(id) {
    if (!window.confirm("Delete this apartment from your decision workspace?")) return;
    try {
      await deleteApartment(id);
      setToast("Apartment deleted.");
      await load();
    } catch (error) {
      setToast(error.message);
    }
  }

  async function deleteShownApartments() {
    if (!sortedApartments.length) return;
    const ok = window.confirm(`Delete ${sortedApartments.length} shown apartment${sortedApartments.length === 1 ? "" : "s"}?`);
    if (!ok) return;
    try {
      await Promise.all(sortedApartments.map((apartment) => deleteApartment(apartment.id)));
      setToast("Shown apartments deleted.");
      await load();
    } catch (error) {
      setToast(error.message);
    }
  }

  async function handleTargetSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setToast("Saving target and rescoring all apartments...");
    try {
      const updated = await saveTarget(targetForm, true);
      setTarget(updated);
      setToast("Target saved. Scores refreshed.");
      await load();
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleColumn(key) {
    setVisibleColumns((current) => {
      if (current.includes(key)) {
        const next = current.filter((item) => item !== key);
        return next.length ? next : current;
      }
      return [...current, key];
    });
  }

  function sortBy(key) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection(key === "price" ? "asc" : "desc");
    }
  }

  function toggleCompare(id) {
    setCompareIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return [...current.slice(-2), id];
    });
  }

  const activeCommuteMode = target?.commute_mode || targetForm.commute_mode || "transit";

  const sortedApartments = useMemo(() => {
    const valueFor = (apartment) => {
      if (sortKey === "morning") return getCommute(apartment, "morning", activeCommuteMode).total_minutes;
      if (sortKey === "evening") return getCommute(apartment, "evening", activeCommuteMode).total_minutes;
      if (sortKey === "roundTrip") return roundTrip(apartment, activeCommuteMode);
      if (sortKey === "distance") {
        const morning = getCommute(apartment, "morning", activeCommuteMode);
        const evening = getCommute(apartment, "evening", activeCommuteMode);
        return Number.isFinite(morning.total_distance_km) && Number.isFinite(evening.total_distance_km)
          ? morning.total_distance_km + evening.total_distance_km
          : null;
      }
      if (sortKey === "price") return scoreNumber(apartment.price);
      // numeric score fields
      if (sortKey.endsWith("_score")) return scoreNumber(apartment[sortKey]);
      return apartment[sortKey];
    };
    return [...apartments].sort((a, b) => {
      const av = valueFor(a);
      const bv = valueFor(b);
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "number" && typeof bv === "number") return sortDirection === "asc" ? av - bv : bv - av;
      return sortDirection === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [apartments, sortKey, sortDirection, activeCommuteMode]);

  const bestOverall = useMemo(() => {
    const ranked = apartments.filter((a) => scoreNumber(a.overall_score) !== null)
      .sort((a, b) => scoreNumber(b.overall_score) - scoreNumber(a.overall_score));
    return ranked[0];
  }, [apartments]);

  const cheapestId = useMemo(() => {
    const ranked = apartments.filter((item) => Number.isFinite(Number(item.price)))
      .sort((a, b) => Number(a.price) - Number(b.price));
    return ranked[0]?.id;
  }, [apartments]);

  const averageRoundTrip = useMemo(() => {
    const values = apartments.map((apartment) => roundTrip(apartment, activeCommuteMode)).filter(Number.isFinite);
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  }, [apartments, activeCommuteMode]);

  const averageOverall = useMemo(() => {
    const values = apartments.map((a) => scoreNumber(a.overall_score)).filter((v) => v !== null);
    return values.length ? (values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(0) : null;
  }, [apartments]);

  return (
    <main>
      <header className="appHeader">
        <div>
          <p className="eyebrow">Decision workspace</p>
          <h1>Apartment <em>intelligence.</em></h1>
          <p className="subtitle">Mode-aware scoring across commute, lifestyle, groceries, and gym access — so you can compare apartments on the things that actually shape daily life.</p>
        </div>
        <div className="heroConsole" aria-label="Tracker status">
          <div>
            <span>Target</span>
            <strong>{target?.label || "Office"}</strong>
          </div>
          <div>
            <span>Mode</span>
            <strong>{COMMUTE_MODES.find((mode) => mode.value === (target?.commute_mode || "transit"))?.label || "Transit"}</strong>
          </div>
          <div>
            <span>Top overall</span>
            <strong>{bestOverall ? overallScoreLabel(bestOverall.overall_score) : "—"}</strong>
          </div>
          <div>
            <span>Avg overall</span>
            <strong>{averageOverall ?? "—"}</strong>
          </div>
        </div>
        <div className="headerActions">
          <button className="iconButton" type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="ghostButton" type="button" onClick={() => downloadExport().catch((error) => setToast(error.message))}><Download size={16} />Export Excel</button>
          <button className="primaryButton" type="button" onClick={() => setModalOpen(true)}><Plus size={16} />Add apartment</button>
        </div>
      </header>

      <section className="stats">
        <div><span>Total listings</span><strong>{apartments.length}</strong></div>
        <div><span>Avg overall</span><strong>{averageOverall ?? "—"}</strong></div>
        <div><span>Avg round trip</span><strong>{averageRoundTrip ? `${averageRoundTrip} min` : "—"}</strong></div>
        <div><span>Favorites</span><strong>{apartments.filter((item) => item.favorite).length}</strong></div>
      </section>

      {dataLoading && (
        <section className="loadingStrip" aria-live="polite">
          <RefreshCw size={16} />
          Syncing your apartment workspace...
        </section>
      )}

      <section className="toolbar">
        <label className="searchBox">
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search address, neighborhood, vibe, notes..." />
        </label>
        <button className={`ghostButton ${showFavorites ? "selected" : ""}`} type="button" onClick={() => setShowFavorites((current) => !current)}>
          Favorites
        </button>
        <button className={`ghostButton ${viewPanelOpen ? "selected" : ""}`} type="button" onClick={() => setViewPanelOpen((current) => !current)}>
          <SlidersHorizontal size={16} /> View
        </button>
        <button className="ghostButton" type="button" onClick={recalculateShownApartments} disabled={!sortedApartments.length || loading}>
          <RefreshCw size={16} /> Recalculate shown
        </button>
        <button className="ghostButton dangerButton" type="button" onClick={deleteShownApartments} disabled={!sortedApartments.length}>
          <Trash2 size={16} /> Delete shown
        </button>
      </section>

      <section className="targetPanel">
        <div>
          <p className="eyebrow">Target location</p>
          <h2>{target?.address || "Choose your office or destination"}</h2>
          <p className="muted">Routes calculate with your selected transport mode at 7:00 AM and 5:30 PM. Changing this rescores every apartment.</p>
        </div>
        <form className="targetForm" onSubmit={handleTargetSubmit}>
          <label className="targetInput small">
            <span>Label</span>
            <input value={targetForm.label} onChange={(event) => setTargetForm((current) => ({ ...current, label: event.target.value }))} placeholder="Office" />
          </label>
          <label className="targetInput">
            <span>Address</span>
            <input value={targetForm.address} onChange={(event) => setTargetForm((current) => ({ ...current, address: event.target.value }))} placeholder="Office address" />
          </label>
          <div className="targetInput modeInput">
            <span>Mode</span>
            <div className="modeSegmented" role="radiogroup" aria-label="Commute transport mode">
              {COMMUTE_MODES.map(({ value, label, Icon }) => (
                <button
                  className={targetForm.commute_mode === value ? "selected" : ""}
                  type="button"
                  key={value}
                  role="radio"
                  aria-checked={targetForm.commute_mode === value}
                  onClick={() => setTargetForm((current) => ({ ...current, commute_mode: value }))}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button className="primaryButton" type="submit" disabled={loading || !targetForm.address.trim()}>
            <MapPin size={16} />Save target
          </button>
        </form>
      </section>

      {viewPanelOpen && (
        <section className="viewPanel">
          <div>
            <p className="eyebrow">Table controls</p>
            <h2>Choose what stays on the page</h2>
            <p className="muted">Hide noisy columns while you compare listings. This only changes the page view, not the saved data.</p>
          </div>
          <div className="columnChips">
            {TABLE_COLUMNS.map(([key, label]) => (
              <button
                className={`columnChip ${visibleColumns.includes(key) ? "on" : ""}`}
                type="button"
                key={key}
                onClick={() => toggleColumn(key)}
              >
                {visibleColumns.includes(key) ? <LayoutGrid size={15} /> : <EyeOff size={15} />}
                {label}
              </button>
            ))}
            <button className="columnChip reset" type="button" onClick={() => setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)}>
              Reset columns
            </button>
          </div>
        </section>
      )}

      {toast && <div className="toast" onAnimationEnd={() => setToast("")}>{toast}</div>}

      {!sortedApartments.length && (
        <section className="emptyState">
          <div>
            <p className="eyebrow">Ready to score</p>
            <h2>Add an apartment to begin</h2>
            <p className="muted">Use the Chrome extension on Zillow/StreetEasy/Apartments.com or add an address manually. The backend scores commute, walkability, grocery, gym, and lifestyle — all transparent heuristics, no AI black box.</p>
          </div>
          <button className="primaryButton" type="button" onClick={() => setModalOpen(true)}><Plus size={16} />Add apartment</button>
        </section>
      )}

      {!!sortedApartments.length && (
        <section className="cardSortPanel">
          <div>
            <p className="eyebrow">Card sorting</p>
            <h2>Sort by what matters</h2>
          </div>
          <div className="cardSortChips">
            {CARD_SORTS.map(([key, label]) => (
              <button
                className={`sortChip ${sortKey === key ? "active" : ""}`}
                type="button"
                key={key}
                onClick={() => sortBy(key)}
              >
                {label}
                {sortKey === key && <span>{sortDirection === "asc" ? "Low to high" : "High to low"}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="contentGrid">
        <div className="listingPane">
          <ApartmentCards
            apartments={sortedApartments}
            bestId={bestOverall?.id}
            cheapestId={cheapestId}
            compareIds={compareIds}
            onToggleCompare={toggleCompare}
            onToggleFavorite={toggleFavorite}
            onRecalculate={recalculate}
            onDelete={remove}
            commuteMode={activeCommuteMode}
          />
        </div>
        <MapPanel apartments={sortedApartments} target={target} commuteMode={activeCommuteMode} />
      </section>

      <DecisionCompare apartments={sortedApartments} selectedIds={compareIds} onToggle={toggleCompare} commuteMode={activeCommuteMode} />

      <section className="comparisonPanel">
        <div className="comparisonHeader">
          <div>
            <p className="eyebrow">Comparison matrix</p>
            <h2>Side-by-side fields</h2>
          </div>
          <p className="muted">Scroll horizontally to see all scores, commute breakdowns, listing info, and notes side-by-side.</p>
        </div>
        <ApartmentTable
          apartments={sortedApartments}
          columns={TABLE_COLUMNS}
          visibleColumns={visibleColumns}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={sortBy}
          onToggleFavorite={toggleFavorite}
          onRecalculate={recalculate}
          onDelete={remove}
          commuteMode={activeCommuteMode}
        />
      </section>

      <AddApartmentModal open={modalOpen} form={form} setForm={setForm} loading={loading} onClose={() => setModalOpen(false)} onSubmit={handleSubmit} />
    </main>
  );
}
