import OrbitDial from '../OrbitDial.jsx';

/**
 * Spending dial, centred and sized to the smaller side of its container.
 * (Kept under three/ for import compatibility; it is now a crisp SVG instrument.)
 */
export default function Ring({ segments, className = '', children, onSelect, interactive = true }) {
  if (!segments?.length) return null;
  const total = segments.reduce((a, s) => a + s.amount, 0);
  return (
    <div className={`absolute inset-0 grid place-items-center p-6 sm:p-10 ${className}`} style={{ containerType: 'size' }}>
      <div style={{ width: 'min(100cqw, 100cqh, 520px)' }}>
        <OrbitDial segments={segments} total={total} onSelect={onSelect} interactive={interactive}>{children}</OrbitDial>
      </div>
    </div>
  );
}
