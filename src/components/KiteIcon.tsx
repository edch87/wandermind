interface Props {
  size?: number;
  color?: string;
  className?: string;
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
}

export default function KiteIcon({ size = 24, color = 'currentColor', className = '', weight = 'regular' }: Props) {
  const strokeWidth = weight === 'bold' ? 20 : weight === 'thin' ? 8 : 16;
  const filled = weight === 'fill' || weight === 'duotone';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Kite body */}
      <path
        d="M128,20 L224,136 L128,236 L32,136 Z"
        fill={filled ? color : 'none'}
        fillOpacity={weight === 'duotone' ? 0.2 : 1}
      />
      {/* Horizontal spar */}
      <line x1="32" y1="136" x2="224" y2="136" />
      {/* Vertical spine */}
      <line x1="128" y1="20" x2="128" y2="236" />
      {/* Tail */}
      <path d="M128,236 C150,262 106,288 128,314" />
    </svg>
  );
}
