import Svg, { Path } from 'react-native-svg';

/**
 * A heart with a plus inside it — the AI User Assistant's mark, the same
 * drawing as the website's (frontend/src/shared/components/HeartPlusIcon).
 * Icon fonts only have a heart with the plus on its corner.
 */
export default function HeartPlusIcon({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      <Path d="M12 8.5v6" />
      <Path d="M9 11.5h6" />
    </Svg>
  );
}
