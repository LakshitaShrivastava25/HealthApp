import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { colors } from '../theme';

/**
 * Hand-drawn SVG artwork for the app. Vectors rather than PNGs so every
 * illustration stays sharp at any density and follows the theme colours —
 * one palette change restyles the whole set.
 */

const HEART =
  'M50 88 C20 66 6 50 6 32 C6 18 17 8 30 8 C39 8 46 13 50 20 C54 13 61 8 70 8 C83 8 94 18 94 32 C94 50 80 66 50 88 Z';
const PULSE = 'M14 44 H36 L42 36 L50 56 L58 26 L64 44 H86';

/** The brand mark: a heart with a pulse line, on a gradient tile. */
export function LogoMark({ size = 64, tile = true }: { size?: number; tile?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="logoBg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#7C6AE0" />
          <Stop offset="1" stopColor={colors.brandPurpleDark} />
        </LinearGradient>
      </Defs>
      {tile && <Rect x="0" y="0" width="100" height="100" rx="26" fill="url(#logoBg)" />}
      <G transform={tile ? 'translate(18 20) scale(0.64)' : undefined}>
        <Path d={HEART} fill={colors.white} />
        <Path
          d={PULSE}
          stroke={tile ? colors.brandPurple : colors.brandPurple}
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </G>
    </Svg>
  );
}

/** Soft background blobs shared by the larger scenes. */
function Blobs({ tint = colors.brandLavender }: { tint?: string }) {
  return (
    <>
      <Circle cx="120" cy="100" r="86" fill={tint} />
      <Circle cx="206" cy="42" r="16" fill={tint} />
      <Circle cx="34" cy="160" r="10" fill={tint} />
      <Circle cx="214" cy="150" r="6" fill={colors.brandTeal} opacity={0.35} />
      <Circle cx="30" cy="48" r="5" fill={colors.brandPurple} opacity={0.3} />
    </>
  );
}

/** Folder of reports with a medical cross — the records locker. */
export function RecordsArt({ width = 240 }: { width?: number }) {
  return (
    <Svg width={width} height={(width * 200) / 240} viewBox="0 0 240 200">
      <Blobs />
      <Rect x="74" y="44" width="92" height="116" rx="10" fill={colors.white} stroke={colors.border} strokeWidth={2} />
      <Rect x="88" y="62" width="44" height="6" rx="3" fill={colors.brandPurple} />
      <Rect x="88" y="78" width="64" height="5" rx="2.5" fill={colors.border} />
      <Rect x="88" y="90" width="56" height="5" rx="2.5" fill={colors.border} />
      <Rect x="88" y="102" width="60" height="5" rx="2.5" fill={colors.border} />
      <Path d="M88 132 H104 L110 120 L118 142 L124 126 H152" stroke={colors.brandTeal} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M56 92 H112 L122 104 H184 V166 A8 8 0 0 1 176 174 H64 A8 8 0 0 1 56 166 Z" fill={colors.brandPurple} />
      <Path d="M56 112 H184 V166 A8 8 0 0 1 176 174 H64 A8 8 0 0 1 56 166 Z" fill="#7C6AE0" />
      <Circle cx="120" cy="142" r="16" fill={colors.white} />
      <Rect x="116" y="133" width="8" height="18" rx="2" fill={colors.brandPurple} />
      <Rect x="111" y="138" width="18" height="8" rx="2" fill={colors.brandPurple} />
    </Svg>
  );
}

/** Shield with a check — insurance and privacy. */
export function ShieldArt({ width = 240 }: { width?: number }) {
  return (
    <Svg width={width} height={(width * 200) / 240} viewBox="0 0 240 200">
      <Blobs tint="#E3F6F6" />
      <Path d="M120 30 L172 50 V96 C172 130 150 156 120 170 C90 156 68 130 68 96 V50 Z" fill={colors.brandTeal} />
      <Path d="M120 30 L172 50 V96 C172 130 150 156 120 170 Z" fill="#0B8F90" />
      <Path d="M96 100 L114 118 L148 82" stroke={colors.white} strokeWidth={10} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Rect x="176" y="118" width="40" height="28" rx="6" fill={colors.white} stroke={colors.border} strokeWidth={2} />
      <Rect x="184" y="126" width="16" height="4" rx="2" fill={colors.brandTeal} />
      <Rect x="184" y="134" width="24" height="4" rx="2" fill={colors.border} />
    </Svg>
  );
}

/** Pill bottle, capsule and clock — medicines and reminders. */
export function MedicineArt({ width = 240 }: { width?: number }) {
  return (
    <Svg width={width} height={(width * 200) / 240} viewBox="0 0 240 200">
      <Blobs />
      <Rect x="80" y="58" width="64" height="16" rx="5" fill={colors.brandPurpleDark} />
      <Rect x="84" y="72" width="56" height="94" rx="10" fill={colors.brandPurple} />
      <Rect x="92" y="96" width="40" height="42" rx="6" fill={colors.white} />
      <Rect x="98" y="104" width="28" height="5" rx="2.5" fill={colors.brandPurple} />
      <Rect x="98" y="114" width="20" height="4" rx="2" fill={colors.border} />
      <Rect x="98" y="123" width="24" height="4" rx="2" fill={colors.border} />
      <G transform="rotate(-35 58 140)">
        <Rect x="38" y="130" width="44" height="20" rx="10" fill={colors.white} stroke={colors.border} strokeWidth={2} />
        <Path d="M60 130 H72 A10 10 0 0 1 72 150 H60 Z" fill={colors.brandTeal} />
      </G>
      <Circle cx="172" cy="120" r="30" fill={colors.white} stroke={colors.brandTeal} strokeWidth={5} />
      <Path d="M172 102 V120 L184 128" stroke={colors.ink700} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** A family of three profile badges connected to one account. */
export function FamilyArt({ width = 240 }: { width?: number }) {
  const person = (cx: number, cy: number, r: number, fill: string) => (
    <G>
      <Circle cx={cx} cy={cy} r={r + 8} fill={colors.white} />
      <Circle cx={cx} cy={cy - r * 0.25} r={r * 0.42} fill={fill} />
      <Path d={`M${cx - r * 0.72} ${cy + r * 0.62} C${cx - r * 0.6} ${cy + r * 0.12} ${cx + r * 0.6} ${cy + r * 0.12} ${cx + r * 0.72} ${cy + r * 0.62}`} fill={fill} />
    </G>
  );
  return (
    <Svg width={width} height={(width * 200) / 240} viewBox="0 0 240 200">
      <Blobs />
      <Path d="M76 128 L120 88 L164 128" stroke={colors.brandPurple} strokeWidth={3} strokeDasharray="6 6" fill="none" />
      {person(120, 80, 34, colors.brandPurple)}
      {person(70, 136, 26, colors.brandTeal)}
      {person(170, 136, 26, colors.warning)}
      <Path d={HEART} fill={colors.danger} transform="translate(108 150) scale(0.24)" />
    </Svg>
  );
}

/** A vertical path of dated events — the health timeline. */
export function TimelineArt({ width = 240 }: { width?: number }) {
  const row = (y: number, dot: string, w: number) => (
    <G>
      <Circle cx="82" cy={y} r="9" fill={dot} />
      <Circle cx="82" cy={y} r="4" fill={colors.white} />
      <Rect x="102" y={y - 14} width={w} height="28" rx="8" fill={colors.white} stroke={colors.border} strokeWidth={2} />
      <Rect x="112" y={y - 6} width={w * 0.45} height="5" rx="2.5" fill={dot} />
      <Rect x="112" y={y + 3} width={w * 0.7} height="4" rx="2" fill={colors.border} />
    </G>
  );
  return (
    <Svg width={width} height={(width * 200) / 240} viewBox="0 0 240 200">
      <Blobs />
      <Rect x="80" y="36" width="4" height="130" rx="2" fill={colors.border} />
      {row(52, colors.brandPurple, 90)}
      {row(100, colors.brandTeal, 74)}
      {row(148, colors.warning, 84)}
    </Svg>
  );
}

/** A small, generic "nothing here yet" tray for empty lists. */
export function EmptyArt({ width = 140 }: { width?: number }) {
  return (
    <Svg width={width} height={(width * 110) / 140} viewBox="0 0 140 110">
      <Circle cx="70" cy="56" r="46" fill={colors.brandLavender} />
      <Path d="M30 66 L42 42 H98 L110 66 V86 A6 6 0 0 1 104 92 H36 A6 6 0 0 1 30 86 Z" fill={colors.white} stroke={colors.border} strokeWidth={2} />
      <Path d="M30 66 H54 L58 74 H82 L86 66 H110" stroke={colors.brandPurple} strokeWidth={3} fill="none" strokeLinejoin="round" />
      <Circle cx="70" cy="24" r="4" fill={colors.brandTeal} />
      <Circle cx="52" cy="30" r="2.5" fill={colors.brandPurple} opacity={0.5} />
      <Circle cx="90" cy="30" r="2.5" fill={colors.brandPurple} opacity={0.5} />
    </Svg>
  );
}
