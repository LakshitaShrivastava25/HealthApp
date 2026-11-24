/**
 * A heart with a plus inside it — the AI User Assistant's mark. Drawn here
 * rather than taken from lucide, whose heart-plus puts the plus outside the
 * heart's corner. Same 24-unit grid, stroke and caps as lucide icons, so it
 * sits beside them without looking out of place.
 */
export default function HeartPlusIcon({
  size = 16,
  strokeWidth = 2,
  className,
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      <path d="M12 8.5v6" />
      <path d="M9 11.5h6" />
    </svg>
  );
}
