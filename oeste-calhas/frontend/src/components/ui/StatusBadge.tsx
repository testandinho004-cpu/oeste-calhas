import { STATUS_LABEL } from "@/lib/format";
export default function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <span className={`badge ${status}`}>{label ?? STATUS_LABEL[status] ?? status}</span>;
}
