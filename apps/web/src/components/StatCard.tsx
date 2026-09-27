import type { ReactNode } from 'react';

export function StatCard({ label, value, suffix, note, icon }: { label: string; value: number | string; suffix?: string; note: string; icon: ReactNode }) {
  return <div className="stat-card"><div><div className="muted">{label}</div><div className="stat-value">{value}<small>{suffix}</small></div><div className="stat-note">{note}</div></div><div className="stat-icon">{icon}</div></div>;
}
