export function getCommute(apartment, direction) {
  return apartment.commutes?.find((commute) => commute.direction === direction) || {};
}

export function roundTrip(apartment) {
  const morning = getCommute(apartment, "morning").total_minutes;
  const evening = getCommute(apartment, "evening").total_minutes;
  return Number.isFinite(morning) && Number.isFinite(evening) ? morning + evening : null;
}

export function minutesLabel(minutes) {
  if (!Number.isFinite(minutes)) return "Pending";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function priceLabel(price) {
  if (!Number.isFinite(price)) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(price);
}

export function commuteTone(minutes) {
  if (!Number.isFinite(minutes)) return "pending";
  if (minutes <= 35) return "great";
  if (minutes <= 50) return "ok";
  return "rough";
}

export function arrivalLabel(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function distanceLabel(km) {
  if (!Number.isFinite(km)) return "-";
  const miles = km * 0.621371;
  return `${miles.toFixed(1)} mi`;
}
