import type { Category } from '../types';
import {
  Buildings, CastleTurret, Church, Mountains, Tree, Waves, Flame,
  ForkKnife, Martini, MicrophoneStage, Confetti, Ticket, Heart, PawPrint,
  ShoppingBag, DotsThree, PersonSimpleWalk,
} from '@phosphor-icons/react';

interface Props {
  category: Category;
  className?: string;
}

const CATEGORY_PLACEHOLDER: Record<Category, {
  Icon: React.ElementType;
  bg: string;
  iconColor: string;
}> = {
  museum_gallery:      { Icon: Buildings,         bg: 'from-violet-100 to-violet-200',     iconColor: '#7c3aed' },
  historical:          { Icon: CastleTurret,      bg: 'from-amber-100 to-amber-200',       iconColor: '#92400e' },
  religious_site:      { Icon: Church,            bg: 'from-yellow-50 to-amber-100',       iconColor: '#a16207' },
  nature_landscape:    { Icon: Mountains,         bg: 'from-emerald-100 to-emerald-200',   iconColor: '#059669' },
  park_garden:         { Icon: Tree,              bg: 'from-green-100 to-green-200',       iconColor: '#16a34a' },
  neighbourhood_walks: { Icon: PersonSimpleWalk,  bg: 'from-slate-100 to-blue-100',        iconColor: '#64748b' },
  beach_water:         { Icon: Waves,             bg: 'from-sky-100 to-sky-200',           iconColor: '#0284c7' },
  active:              { Icon: Flame,             bg: 'from-red-100 to-red-200',           iconColor: '#dc2626' },
  food_drink:          { Icon: ForkKnife,         bg: 'from-orange-100 to-orange-200',     iconColor: '#ea580c' },
  nightlife:           { Icon: Martini,           bg: 'from-rose-100 to-rose-200',         iconColor: '#9d174d' },
  theatre_concert:     { Icon: MicrophoneStage,   bg: 'from-purple-100 to-purple-200',     iconColor: '#7e22ce' },
  amusement_park:      { Icon: Confetti,          bg: 'from-cyan-100 to-cyan-200',         iconColor: '#0891b2' },
  entertainment:       { Icon: Ticket,            bg: 'from-fuchsia-100 to-fuchsia-200',   iconColor: '#c026d3' },
  zoo_aquarium:        { Icon: PawPrint,          bg: 'from-lime-100 to-lime-200',         iconColor: '#65a30d' },
  wellness:            { Icon: Heart,             bg: 'from-teal-100 to-teal-200',         iconColor: '#0d9488' },
  shopping:            { Icon: ShoppingBag,       bg: 'from-pink-100 to-pink-200',         iconColor: '#be185d' },
  other:               { Icon: DotsThree,         bg: 'from-slate-100 to-slate-200',       iconColor: '#737373' },
};

export default function PlaceholderImage({ category, className = '' }: Props) {
  const config = CATEGORY_PLACEHOLDER[category];
  const { Icon, bg, iconColor } = config;

  return (
    <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${bg} ${className}`}>
      <Icon size={36} color={iconColor} weight="duotone" />
    </div>
  );
}
