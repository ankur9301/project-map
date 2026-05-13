import React, { useEffect, useMemo, useState } from "react";
import { Download, EyeOff, LayoutGrid, MapPin, Moon, Plus, Search, SlidersHorizontal, Sun, Trash2 } from "lucide-react";
import { addApartment, deleteApartment, downloadExport, getApartments, getTarget, recalculateApartment, saveTarget, updateApartment } from "./api";
import ApartmentCards from "./components/ApartmentCards";
import ApartmentTable from "./components/ApartmentTable";
import AddApartmentModal, { initialForm } from "./components/AddApartmentModal";
import MapPanel from "./components/MapPanel";
import { supabase } from "./supabaseClient";
import { getCommute, roundTrip } from "./utils";
import "./styles.css";

const TABLE_COLUMNS = [
  ["address", "Address"],
  ["price", "Price"],
  ["morning", "Morning"],
  ["evening", "Evening"],
  ["roundTrip", "Round trip"],
  ["distance", "Distance"],
  ["bed", "Bed"],
  ["bath", "Bath"],
  ["agent_name", "Agent"],
  ["agent_phone", "Phone"],
  ["agent_broker", "Broker"],
  ["source", "Source"],
  ["listing_url", "Link"],
  ["features", "Features"],
  ["vibe", "Vibe"],
  ["notes", "Notes"],
  ["score", "Score"],
];

const DEFAULT_VISIBLE_COLUMNS = TABLE_COLUMNS.map(([key]) => key);
const COLUMN_STORAGE_KEY = "visibleColumns.v2";
const CARD_SORTS = [
  ["commute_score", "Score"],
  ["price", "Price"],
  ["morning", "Morning"],
  ["evening", "Evening"],
  ["roundTrip", "Round trip"],
  ["distance", "Distance"],
  ["bed", "Bed"],
  ["bath", "Bath"],
];

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function App() {
  const [apartments, setApartments] = useState([]);
  const [search, setSearch] = useState("");
  const [showFavorites, setShowFavorites] = useState(false);
  const [theme, setTheme] = useState("light");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [sortKey, setSortKey] = useState("commute_score");
  const [sortDirection, setSortDirection] = useState("desc");
  const [viewPanelOpen, setViewPanelOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const [targetForm, setTargetForm] = useState({ label: "Office", address: "731 Lexington Ave, New York, NY" });
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLUMN_STORAGE_KEY) || "null");
      return Array.isArray(saved) && saved.length >= 6 ? saved.filter((key) => DEFAULT_VISIBLE_COLUMNS.includes(key)) : DEFAULT_VISIBLE_COLUMNS;
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
    try {
      const data = await getApartments({ search, favorite: showFavorites ? true : undefined });
      setApartments(data.items);
    } catch (error) {
      setToast(error.message);
    }
  }

  async function loadTarget() {
    try {
      const data = await getTarget();
      setTarget(data);
      setTargetForm({ label: data.label || "Office", address: data.address || "" });
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
    setToast("Calculating commute with OTP...");
    try {
      await addApartment({
        ...form,
        price: numeric(form.price),
        bed: numeric(form.bed),
        bath: numeric(form.bath),
      });
      setForm(initialForm);
      setModalOpen(false);
      setToast("Apartment saved.");
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
    setToast("Recalculating route...");
    try {
      await recalculateApartment(id);
      setToast("Commute refreshed.");
      await load();
    } catch (error) {
      setToast(error.message);
    }
  }

  async function remove(id) {
    if (!window.confirm("Delete this apartment from your tracker?")) return;
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
    const ok = window.confirm(`Delete ${sortedApartments.length} shown apartment${sortedApartments.length === 1 ? "" : "s"} from your tracker?`);
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
    setToast("Saving target and recalculating commutes...");
    try {
      const updated = await saveTarget(targetForm, true);
      setTarget(updated);
      setToast("Target saved. Commutes refreshed.");
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
      setSortDirection("asc");
    }
  }

  const sortedApartments = useMemo(() => {
    const valueFor = (apartment) => {
      if (sortKey === "morning") return getCommute(apartment, "morning").total_minutes;
      if (sortKey === "evening") return getCommute(apartment, "evening").total_minutes;
      if (sortKey === "roundTrip") return roundTrip(apartment);
      if (sortKey === "distance") {
        const morning = getCommute(apartment, "morning");
        const evening = getCommute(apartment, "evening");
        return Number.isFinite(morning.total_distance_km) && Number.isFinite(evening.total_distance_km)
          ? morning.total_distance_km + evening.total_distance_km
          : null;
      }
      if (sortKey === "score") return apartment.commute_score;
      if (sortKey === "commute_score") return apartment.commute_score;
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
  }, [apartments, sortKey, sortDirection]);

  const bestId = useMemo(() => {
    const ranked = apartments.filter((item) => roundTrip(item) !== null).sort((a, b) => roundTrip(a) - roundTrip(b));
    return ranked[0]?.id;
  }, [apartments]);

  const cheapestId = useMemo(() => {
    const ranked = apartments.filter((item) => Number.isFinite(item.price)).sort((a, b) => a.price - b.price);
    return ranked[0]?.id;
  }, [apartments]);

  const averageRoundTrip = useMemo(() => {
    const values = apartments.map(roundTrip).filter(Number.isFinite);
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  }, [apartments]);

  return (
    <main>
      <header className="appHeader">
        <div>
          <p className="eyebrow">NYC / NJ apartment hunt</p>
          <h1>Commute <em>tracker.</em></h1>
          <p className="subtitle">A local command center for turning listing chaos into a ranked, side-by-side shortlist of where you could actually live.</p>
        </div>
        <div className="heroConsole" aria-label="Tracker status">
          <div>
            <span>Target</span>
            <strong>{target?.label || "Office"}</strong>
          </div>
          <div>
            <span>AM route</span>
            <strong>7:00</strong>
          </div>
          <div>
            <span>PM route</span>
            <strong>5:30</strong>
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
        <div><span>Avg round trip</span><strong>{averageRoundTrip ? `${averageRoundTrip} min` : "—"}</strong></div>
        <div><span>Favorites</span><strong>{apartments.filter((item) => item.favorite).length}</strong></div>
        <div><span>Route engine</span><strong>Google</strong></div>
      </section>

      <section className="toolbar">
        <label className="searchBox">
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search address, features, vibe..." />
        </label>
        <button className={`ghostButton ${showFavorites ? "selected" : ""}`} type="button" onClick={() => setShowFavorites((current) => !current)}>
          Favorites
        </button>
        <button className={`ghostButton ${viewPanelOpen ? "selected" : ""}`} type="button" onClick={() => setViewPanelOpen((current) => !current)}>
          <SlidersHorizontal size={16} /> View
        </button>
        <button className="ghostButton dangerButton" type="button" onClick={deleteShownApartments} disabled={!sortedApartments.length}>
          <Trash2 size={16} /> Delete shown
        </button>
      </section>

      <section className="targetPanel">
        <div>
          <p className="eyebrow">Target location</p>
          <h2>{target?.address || "Choose your office or destination"}</h2>
          <p className="muted">Routes calculate home to target at 7:00 AM, then target back home at 5:30 PM.</p>
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
            <p className="muted">Hide noisy columns while you compare listings. This only changes the page view, not the saved Excel data.</p>
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
            <p className="eyebrow">Ready for listings</p>
            <h2>Start with one apartment address</h2>
            <p className="muted">Add a Zillow, StreetEasy, or Apartments.com address and the tracker will save the listing. Commute timing appears after OTP is running.</p>
          </div>
          <button className="primaryButton" type="button" onClick={() => setModalOpen(true)}><Plus size={16} />Add apartment</button>
        </section>
      )}

      {!!sortedApartments.length && (
        <section className="cardSortPanel">
          <div>
            <p className="eyebrow">Card sorting</p>
            <h2>Browse by what matters</h2>
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
          <ApartmentCards apartments={sortedApartments} bestId={bestId} cheapestId={cheapestId} onToggleFavorite={toggleFavorite} onDelete={remove} />
        </div>
        <MapPanel apartments={sortedApartments} target={target} />
      </section>

      <section className="comparisonPanel">
        <div className="comparisonHeader">
          <div>
            <p className="eyebrow">Comparison matrix</p>
            <h2>Full apartment details</h2>
          </div>
          <p className="muted">Scroll horizontally for all listing, contact, commute, and notes fields.</p>
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
        />
      </section>

      <AddApartmentModal open={modalOpen} form={form} setForm={setForm} loading={loading} onClose={() => setModalOpen(false)} onSubmit={handleSubmit} />
    </main>
  );
}
