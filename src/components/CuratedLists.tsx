import type { BucketListItem, WeatherForecast, Category } from '../types';
import { CATEGORY_INFO } from '../types';
import PlaceholderImage from './PlaceholderImage';

interface NavTarget {
  name: string;
  itemId?: string;
  initialTab?: 'want_to_do' | 'done';
  initialCategory?: Category;
}

const MIN_RAIL_ITEMS = 3;
const MAX_RAIL_ITEMS = 10;
const MAX_CATEGORY_RAILS = 3;

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

function sortForRail(items: BucketListItem[]): BucketListItem[] {
  return [...items].sort((a, b) =>
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/** Horizontal scrolling rail of place cards. Shared by Dashboard sections. */
export function ItemRail({ title, items, onNavigate, onSeeAll }: {
  title: string;
  items: BucketListItem[];
  onNavigate: (s: NavTarget) => void;
  onSeeAll?: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-6">
      <div className="px-6 flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-sand-900">{title}</h3>
        {onSeeAll && (
          <button onClick={onSeeAll} className="text-xs text-sand-600 hover:text-sand-900 transition">
            See all
          </button>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto px-6 pb-2 scrollbar-hide">
        {items.map(item => (
          <button key={item.id} onClick={() => onNavigate({ name: 'detail', itemId: item.id })}
            className="flex-shrink-0 w-40 card text-left">
            <div className="place-img-container h-24 overflow-hidden">
              {item.photoUrl ? (
                <img src={item.photoUrl} alt={item.name} className="place-img"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    img.style.display = 'none';
                    const placeholder = img.nextElementSibling as HTMLElement | null;
                    if (placeholder) placeholder.style.display = 'flex';
                  }} />
              ) : null}
              <PlaceholderImage category={item.category}
                className={item.photoUrl ? 'hidden' : ''} />
            </div>
            <div className="p-3">
              <div className="text-xs font-medium text-sand-900 truncate">{item.name}</div>
              <div className="text-[10px] text-sand-700 mt-1">
                {item.travelDistanceKm} km · {item.costLevel === 'free' ? 'Free' : item.costLevel}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

interface Props {
  items: BucketListItem[];
  todayWeather?: WeatherForecast;
  onNavigate: (s: NavTarget) => void;
}

/**
 * Auto-generated curated rails for the Dashboard:
 * smart context lists (weather, duration, cost) plus the user's
 * biggest categories. Rails only appear once they have enough items.
 * This is also the future placement surface for discover/sponsored
 * content — see docs/MONETIZATION.md.
 */
export default function CuratedLists({ items, todayWeather, onNavigate }: Props) {
  const todo = items.filter(i => i.status === 'want_to_do');
  if (todo.length < MIN_RAIL_ITEMS) return null;

  const rails: { key: string; title: string; items: BucketListItem[]; seeAll?: NavTarget }[] = [];

  // Smart list: weather-matched picks for today
  if (todayWeather) {
    const isBadWeather = ['rainy', 'snowy', 'foggy'].includes(todayWeather.weatherType);
    const perfectToday = todo.filter(i => isBadWeather
      ? (i.weatherSuitability === 'bad_weather_ideal' || i.setting === 'indoor')
      : ((i.setting === 'outdoor' || i.setting === 'mixed') && i.weatherSuitability !== 'bad_weather_ideal'));
    rails.push({ key: 'today', title: 'Perfect for today', items: perfectToday });
  }

  // Personal list: high-priority items the user marked as most wanted
  const topPriority = todo.filter(i => i.priority === 'high');
  rails.push({ key: 'priority', title: 'Top of your list', items: topPriority });

  // Smart list: short activities
  const quickWins = todo.filter(i => i.durationEstimate === 'under_1h' || i.durationEstimate === '1_2h');
  rails.push({ key: 'quick', title: 'Quick wins', items: quickWins });

  // Smart list: free activities
  const freeToDo = todo.filter(i => i.costLevel === 'free');
  rails.push({ key: 'free', title: 'Free to do', items: freeToDo });

  // Category collections: the user's biggest categories
  const byCategory = new Map<Category, BucketListItem[]>();
  for (const item of todo) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }
  const topCategories = [...byCategory.entries()]
    .filter(([, list]) => list.length >= MIN_RAIL_ITEMS)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, MAX_CATEGORY_RAILS);
  for (const [category, list] of topCategories) {
    rails.push({
      key: `cat-${category}`,
      title: CATEGORY_INFO[category].label,
      items: list,
      seeAll: { name: 'list', initialCategory: category },
    });
  }

  return (
    <>
      {rails
        .filter(rail => rail.items.length >= MIN_RAIL_ITEMS)
        .map(rail => (
          <ItemRail key={rail.key}
            title={rail.title}
            items={sortForRail(rail.items).slice(0, MAX_RAIL_ITEMS)}
            onNavigate={onNavigate}
            onSeeAll={rail.seeAll ? () => onNavigate(rail.seeAll!) : undefined}
          />
        ))}
    </>
  );
}
