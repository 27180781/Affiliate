// Formatting helpers (Hebrew locale, ILS currency).
const currency = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 2,
});

const dateFmt = new Intl.DateTimeFormat('he-IL', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export const money = (n) => currency.format(Number(n ?? 0));
export const dateTime = (d) => (d ? dateFmt.format(new Date(d)) : '');

// Rate (0..1) → percent string, e.g. 0.2 → "20%".
export const percent = (rate) =>
  rate == null || rate === '' ? '' : `${Number((Number(rate) * 100).toFixed(2))}%`;

export const STATUS_LABELS = {
  pending: 'ממתין',
  approved: 'אושר',
  paid: 'שולם',
};

export const STATUS_CLASSES = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-sky-100 text-sky-800',
  paid: 'bg-emerald-100 text-emerald-800',
};
