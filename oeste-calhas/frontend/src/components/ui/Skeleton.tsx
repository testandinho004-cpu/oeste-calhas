export default function Skeleton({ h = 16, w = "100%", r, style }: { h?: number | string; w?: number | string; r?: number; style?: React.CSSProperties }) {
  return <div className="skeleton" aria-hidden="true" style={{ height: h, width: w, borderRadius: r, ...style }} />;
}
