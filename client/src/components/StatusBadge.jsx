import { STATUS_LABELS, STATUS_CLASSES } from '../format.js';

export default function StatusBadge({ status }) {
  return (
    <span className={`badge ${STATUS_CLASSES[status] ?? 'bg-slate-100 text-slate-700'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
