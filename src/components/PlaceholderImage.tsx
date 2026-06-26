import type { Category } from '../types';
import {
  Buildings, CastleTurret, Church, Mountains, Tree, Waves, Flame,
  ForkKnife, Martini, MicrophoneStage, Confetti, Ticket, Heart, PawPrint,
  ShoppingBag, DotsThree, PersonSimpleWalk,
} from '@phosphor-icons/react';

interface Props {
  category: Category;
  /** When provided, the place name is overlaid in serif (detail variant) or
   *  used only as the icon's title attribute (card variant). */
  name?: string;
  className?: string;
  /** 'card' = small, icon-only. 'detail' = hero, with serif title + soft texture. */
  variant?: 'card' | 'detail';
}

/**
 * Per-category palette. Each entry produces a soft photographic-style background
 * — two warm-toned stops layered as a radial highlight over a tint — and a
 * matching duotone icon. The goal is that when we *can't* show a real photo,
 * the card still reads as a deliberate design choice, not a missing asset.
 *
 *   highlight: top-left "sunlight" colour (radial gradient stop 1)
 *   base:      bottom-right shadow tint   (radial gradient stop 2)
 *   icon:      duotone glyph fill
 */
const CATEGORY_PLACEHOLDER: Record<Category, {
  Icon: React.ElementType;
  highlight: string;
  base: string;
  icon: string;
}> = {
  museum_gallery:      { Icon: Buildings,        highlight: '#EDE4F7', base: '#B8A7D4', icon: '#5B3F8A' },
  historical:          { Icon: CastleTurret,     highlight: '#FBEFD9', base: '#D4A574', icon: '#7A4E1F' },
  religious_site:      { Icon: Church,           highlight: '#FBF3D9', base: '#D4B574', icon: '#7A5C1F' },
  nature_landscape:    { Icon: Mountains,        highlight: '#DDEFE0', base: '#7FA98A', icon: '#2F5A3D' },
  park_garden:         { Icon: Tree,             highlight: '#E5F1D8', base: '#8FB36B', icon: '#3D6B2A' },
  neighbourhood_walks: { Icon: PersonSimpleWalk, highlight: '#EBE6DC', base: '#A89A82', icon: '#5C4F38' },
  beach_water:         { Icon: Waves,            highlight: '#DEEDF7', base: '#7DAACB', icon: '#1F5A7A' },
  active:              { Icon: Flame,            highlight: '#FBDED4', base: '#D48772', icon: '#9A3A1F' },
  food_drink:          { Icon: ForkKnife,        highlight: '#FBE4D4', base: '#D49872', icon: '#8A4A1F' },
  nightlife:           { Icon: Martini,          highlight: '#EDDDE6', base: '#A87499', icon: '#5B2F4F' },
  theatre_concert:     { Icon: MicrophoneStage,  highlight: '#E8DDED', base: '#9C82B0', icon: '#4F3868' },
  amusement_park:      { Icon: Confetti,         highlight: '#DBECEF', base: '#7AB2BC', icon: '#1F6571' },
  entertainment:       { Icon: Ticket,           highlight: '#F2DDF0', base: '#B78AB4', icon: '#6B3868' },
  zoo_aquarium:        { Icon: PawPrint,         highlight: '#E8EFD8', base: '#9CB36B', icon: '#4F6B2A' },
  wellness:            { Icon: Heart,            highlight: '#DDEDE9', base: '#7AB0A4', icon: '#2A5B53' },
  shopping:            { Icon: ShoppingBag,      highlight: '#F2DEE5', base: '#C78AA0', icon: '#7A2F47' },
  other:               { Icon: DotsThree,        highlight: '#EBE6DC', base: '#A89A82', icon: '#5C4F38' },
};

export default function PlaceholderImage({
  category,
  name,
  className = '',
  variant = 'card',
}: Props) {
  const { Icon, highlight, base, icon } = CATEGORY_PLACEHOLDER[category];

  // Radial highlight from top-left over a flatter base — suggests light
  // direction and gives the panel a photographic feeling instead of a flat
  // duotone wash.
  const bgStyle: React.CSSProperties = {
    background: `
      radial-gradient(120% 100% at 15% 10%, ${highlight} 0%, transparent 55%),
      radial-gradient(140% 120% at 100% 100%, ${base} 0%, ${highlight} 70%)
    `,
  };

  if (variant === 'detail') {
    return (
      <div
        className={`w-full h-full flex flex-col items-center justify-center relative overflow-hidden ${className}`}
        style={bgStyle}
      >
        {/* Subtle grain — a sparse dot pattern that breaks up the gradient and
            adds a hint of texture. Sits underneath the content. */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.18] mix-blend-multiply pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(${icon} 0.6px, transparent 0.6px)`,
            backgroundSize: '14px 14px',
          }}
        />
        <Icon size={64} color={icon} weight="duotone" />
        {name && (
          <div
            className="mt-4 px-6 text-center max-w-[80%]"
            style={{
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontStyle: 'italic',
              color: icon,
              fontSize: '22px',
              lineHeight: 1.2,
              letterSpacing: '0.01em',
              textShadow: '0 1px 0 rgba(255,255,255,0.4)',
            }}
          >
            {name}
          </div>
        )}
      </div>
    );
  }

  // Card variant — list rows, search results, recommend cards. Icon only,
  // name passed through as a tooltip so screen readers still get it.
  return (
    <div
      className={`w-full h-full flex items-center justify-center relative overflow-hidden ${className}`}
      style={bgStyle}
      title={name || undefined}
    >
      {/* Light texture for the same reason as the detail variant, but more
          restrained at small sizes so it doesn't read as noise. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.12] mix-blend-multiply pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(${icon} 0.5px, transparent 0.5px)`,
          backgroundSize: '12px 12px',
        }}
      />
      <Icon size={36} color={icon} weight="duotone" />
    </div>
  );
}
