import { useState } from 'react';
import type { BucketListItem, UserProfile, WeatherForecast, Category } from '../types';
import { CATEGORY_INFO } from '../types';
import { formatTravelShort } from '../utils/travelDisplay';
import PlaceImg from './PlaceImg';

interface NavTarget {
  name: string;
  itemId?: string;
  initialTab?: 'want_to_do' | 'done';
  initialCategory?: Category;
}

const MIN_RAIL_ITEMS = 3;
const MAX_RAIL_ITEMS = 10;
const MAX_CATEGORY_RAILS = 3;
const MAX_RECENT_ITEMS = 5;

/** When a smart rail (Perfect for today, Short on time, etc.) captures more than
 *  this share of the user's library, it's not really a "split" — it's just the
 *  whole list with a different title. Skip it so the dashboard stays varied.
 *  Mirror lower bound prevents the inverse (rails capturing too little). */
const RAIL_SPLIT_MAX_SHARE = 0.7;
const RAIL_SPLIT_MIN_SHARE = 0.3;

/** Library-size tiers for how many rails to show. Keeps the dashboard from
 *  showing the same five places five different ways early on. */
const SMALL_LIBRARY_MAX_RAILS = 3;
const MEDIUM_LIBRARY_MAX_RAILS = 5;
const SMALL_LIBRARY_THRESHOLD = 10;
const MEDIUM_LIBRARY_THRESHOLD = 20;

/** Fisher-Yates shuffle, returns a new array. */
function shuffled<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

function sortForRail(items: BucketListItem[]): BucketListItem[] {
  return [...items].sort((a, b) =>
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/** Horizontal scrolling rail of place cards. Shared by Dashboard sections.
 *  The rail container is a role="region" landmark so screen-reader users can
 *  jump between rails via rotor. */
export function ItemRail({ title, items, profile, onNavigate, onSeeAll, headingId }: {
  title: string;
  items: BucketListItem[];
  profile: UserProfile;
  onNavigate: (s: NavTarget) => void;
  onSeeAll?: () => void;
  headingId: string;
}) {
  const preferred = profile.preferredTransport || 'car';
  if (items.length === 0) return null;
  return (
    <section className="mb-6" aria-labelledby={headingId}>
      <div className="px-6 flex items-baseline justify-between mb-3">
        <h2 id={headingId} className="text-sm font-semibold text-sand-900">{title}</h2>
        {onSeeAll && (
          <button
            onClick={onSeeAll}
            className="text-xs text-sand-700 hover:text-sand-900 transition min-h-[44px] px-2 -mx-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50 rounded"
          >
            See all
          </button>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto px-6 pb-2 scrollbar-hide" role="list">
        {items.map(item => {
          const travelLabel = formatTravelShort(item, preferred);
          const cost = item.costLevel === 'free' ? 'Free' : item.costLevel;
          const categoryLabel = CATEGORY_INFO[item.category]?.label ?? item.category;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate({ name: 'detail', itemId: item.id })}
              role="listitem"
              aria-label={`${item.name}, ${categoryLabel}, ${travelLabel}, ${cost}`}
              className="flex-shrink-0 w-40 card text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50 active:scale-[0.98] transition-transform"
            >
              <div className="place-img-container h-24 overflow-hidden">
                <PlaceImg
                  src={item.photoUrl}
                  alt=""
                  name={item.name}
                  category={item.category}
                />
              </div>
              <div className="p-3">
                <div className="text-xs font-medium text-sand-900 truncate">{item.name}</div>
                <div className="text-xs text-sand-700 mt-1">
                  {travelLabel} · {cost}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface Props {
  items: BucketListItem[];
  profile: UserProfile;
  todayWeather?: WeatherForecast;
  onNavigate: (s: NavTarget) => void;
}

interface RailDef {
  key: string;
  title: string;
  /** Items that match this rail's criterion, before split/dedup checks. */
  candidates: BucketListItem[];
  /** Skip the 30-70% split check (e.g., personal lists, recently added, categories). */
  skipSplitCheck?: boolean;
  /** Item ordering — by default `sortForRail`; set to identity for recent. */
  sort?: (items: BucketListItem[]) => BucketListItem[];
  seeAll?: NavTarget;
}

/**
 * Auto-generated curated rails for the Dashboard. Three layers of pruning keep
 * the page varied:
 *   1. **Smart split check.** A context rail (today/short/full-day/free) only
 *      earns its place when it captures roughly 30-70% of the library. Outside
 *      that band it's either redundant (all items fit) or too sparse.
 *   2. **Library-size gating.** Small libraries (<10 items) cap at 3 rails;
 *      medium (<20) cap at 5. Prevents the "same 5 places, 6 lenses" problem.
 *   3. **Soft dedup.** A place can appear once across rails; later rails may
 *      reuse it only if the rail would otherwise fall below MIN_RAIL_ITEMS.
 */
export default function CuratedLists({ items, profile, todayWeather, onNavigate }: Props) {
  // Random ordering of all categories, fixed for this mount. Render-time filtering
  // by eligibility picks the first 3 with enough items, so the random shuffle stays
  // stable as items load while still giving a fresh mix each Dashboard mount.
  const [categoryOrder] = useState<Category[]>(() =>
    shuffled(Object.keys(CATEGORY_INFO) as Category[])
  );

  const todo = items.filter(i => i.status === 'want_to_do');
  if (todo.length < MIN_RAIL_ITEMS) return null;

  const railDefs: RailDef[] = [];

  // Personal rails — never split-checked. These are intent rails (priority,
  // recency) that earn their place regardless of share.
  const topPriority = todo.filter(i => i.priority === 'high');
  railDefs.push({ key: 'priority', title: 'Top of your list', candidates: topPriority, skipSplitCheck: true });

  const recentItems = [...items]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_RECENT_ITEMS);
  railDefs.push({
    key: 'recent',
    title: 'Recently added',
    candidates: recentItems,
    skipSplitCheck: true,
    // Already chronologically sorted; preserve that order in the rail.
    sort: (xs) => xs,
  });

  // Smart context rails — these get the split check.
  if (todayWeather) {
    const isBadWeather = ['rainy', 'snowy', 'foggy'].includes(todayWeather.weatherType);
    const perfectToday = todo.filter(i => isBadWeather
      ? (i.weatherSuitability === 'bad_weather_ideal' || i.setting === 'indoor')
      : ((i.setting === 'outdoor' || i.setting === 'mixed') && i.weatherSuitability !== 'bad_weather_ideal'));
    railDefs.push({ key: 'today', title: 'Perfect for today', candidates: perfectToday });
  }

  const shortOnTime = todo.filter(i => i.durationEstimate === 'under_1h' || i.durationEstimate === '1_2h');
  railDefs.push({ key: 'short', title: 'Short on time?', candidates: shortOnTime });

  const fullDayOut = todo.filter(i => i.durationEstimate === 'half_day' || i.durationEstimate === 'full_day');
  railDefs.push({ key: 'full-day', title: 'Full day out', candidates: fullDayOut });

  const freeToDo = todo.filter(i => i.costLevel === 'free');
  railDefs.push({ key: 'free', title: 'Free to do', candidates: freeToDo });

  // Category collections — never split-checked (a category rail is a category
  // rail, even if it's most of the library), but ordering is randomised per mount.
  const byCategory = new Map<Category, BucketListItem[]>();
  for (const item of todo) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }
  const selectedCategories = categoryOrder
    .filter(c => (byCategory.get(c)?.length ?? 0) >= MIN_RAIL_ITEMS)
    .slice(0, MAX_CATEGORY_RAILS);
  for (const category of selectedCategories) {
    railDefs.push({
      key: `cat-${category}`,
      title: CATEGORY_INFO[category].label,
      candidates: byCategory.get(category)!,
      skipSplitCheck: true,
      seeAll: { name: 'list', initialCategory: category },
    });
  }

  // ---- Pruning ----

  // Layer 1: split check. Rails must hit a meaningful slice of the todo list.
  const todoCount = todo.length;
  const railsAfterSplit = railDefs.filter(rail => {
    if (rail.candidates.length < MIN_RAIL_ITEMS) return false;
    if (rail.skipSplitCheck) return true;
    const share = rail.candidates.length / todoCount;
    return share >= RAIL_SPLIT_MIN_SHARE && share <= RAIL_SPLIT_MAX_SHARE;
  });

  // Layer 2: library-size cap.
  const maxRails = todoCount < SMALL_LIBRARY_THRESHOLD
    ? SMALL_LIBRARY_MAX_RAILS
    : todoCount < MEDIUM_LIBRARY_THRESHOLD
      ? MEDIUM_LIBRARY_MAX_RAILS
      : railsAfterSplit.length;
  const railsAfterCap = railsAfterSplit.slice(0, maxRails);

  // Layer 3: soft dedup. Track ids surfaced in earlier rails; subsequent rails
  // prefer fresh items but may fall back to repeats only when they'd otherwise
  // drop below MIN_RAIL_ITEMS.
  const seen = new Set<string>();
  const railsFinal = railsAfterCap.map(rail => {
    const sortFn = rail.sort ?? sortForRail;
    const ordered = sortFn(rail.candidates);
    const fresh = ordered.filter(i => !seen.has(i.id));
    let chosen: BucketListItem[];
    if (fresh.length >= MIN_RAIL_ITEMS) {
      chosen = fresh.slice(0, MAX_RAIL_ITEMS);
    } else {
      // Rail would collapse — top up with repeats so it still meets the floor.
      const topUp = ordered.filter(i => seen.has(i.id));
      chosen = [...fresh, ...topUp].slice(0, MAX_RAIL_ITEMS);
    }
    chosen.forEach(i => seen.add(i.id));
    return { ...rail, items: chosen };
  }).filter(rail => rail.items.length >= MIN_RAIL_ITEMS);

  return (
    <>
      {railsFinal.map(rail => (
        <ItemRail
          key={rail.key}
          title={rail.title}
          items={rail.items}
          profile={profile}
          onNavigate={onNavigate}
          onSeeAll={rail.seeAll ? () => onNavigate(rail.seeAll!) : undefined}
          headingId={`rail-${rail.key}`}
        />
      ))}
    </>
  );
}
