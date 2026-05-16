import { useState } from 'react';
import type { BucketListItem, Category, CostLevel, DurationEstimate, Setting, WeatherSuitability, GroupType, Season, TimeOfDay, Priority } from '../types';
import { CATEGORY_INFO, COST_LABELS, DURATION_LABELS, SEASON_LABELS, TIME_OF_DAY_LABELS, formatDuration } from '../types';
import { Star, MapPin, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  items: BucketListItem[];
  onSelectItem: (id: string) => void;
  onNavigate: (s: { name: string }) => void;
}

type Tab = 'want_to_do' | 'done';
type SortBy = 'recent' | 'priority' | 'travel' | 'name';

export default function BucketList({ items, onSelectItem, onNavigate }: Props) {
  const [tab, setTab] = useState<Tab>('want_to_do');
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>('all');
  const [filterCost, setFilterCost] = useState<CostLevel | 'all'>('all');
  const [filterDuration, setFilterDuration] = useState<DurationEstimate | 'all'>('all');
  const [filterSetting, setFilterSetting] = useState<Setting | 'all'>('all');
  const [filterWeather, setFilterWeather] = useState<WeatherSuitability | 'all'>('all');
  const [filterGroup, setFilterGroup] = useState<GroupType | 'all'>('all');
  const [filterSeason, setFilterSeason] = useState<Season | 'all'>('all');
  const [filterTimeOfDay, setFilterTimeOfDay] = useState<TimeOfDay | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [filterDogFriendly, setFilterDogFriendly] = useState(false);
  const [filterWheelchair, setFilterWheelchair] = useState(false);
  const [filterStroller, setFilterStroller] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const hasActiveFilters = filterCategory !== 'all' || filterCost !== 'all' || filterDuration !== 'all' ||
    filterSetting !== 'all' || filterWeather !== 'all' || filterGroup !== 'all' || filterSeason !== 'all' ||
    filterTimeOfDay !== 'all' || filterPriority !== 'all' || filterDogFriendly || filterWheelchair || filterStroller;

  let filtered = items.filter(i => i.status === tab);
  if (filterCategory !== 'all') filtered = filtered.filter(i => i.category === filterCategory);
  if (filterCost !== 'all') filtered = filtered.filter(i => i.costLevel === filterCost);
  if (filterDuration !== 'all') filtered = filtered.filter(i => i.durationEstimate === filterDuration);
  if (filterSetting !== 'all') filtered = filtered.filter(i => i.setting === filterSetting);
  if (filterWeather !== 'all') filtered = filtered.filter(i => i.weatherSuitability === filterWeather);
  if (filterGroup !== 'all') filtered = filtered.filter(i => i.groupSuitability.includes(filterGroup));
  if (filterSeason !== 'all') filtered = filtered.filter(i => (i.bestSeasons || []).includes('any') || (i.bestSeasons || []).includes(filterSeason));
  if (filterTimeOfDay !== 'all') filtered = filtered.filter(i => (i.bestTimesOfDay || []).includes('any') || (i.bestTimesOfDay || []).includes(filterTimeOfDay));
  if (filterPriority !== 'all') filtered = filtered.filter(i => i.priority === filterPriority);
  if (filterDogFriendly) filtered = filtered.filter(i => i.dogFriendly === true);
  if (filterWheelchair) filtered = filtered.filter(i => i.wheelchairAccessible === true);
  if (filterStroller) filtered = filtered.filter(i => i.strollerFriendly === true);

  const clearAllFilters = () => {
    setFilterCategory('all'); setFilterCost('all'); setFilterDuration('all');
    setFilterSetting('all'); setFilterWeather('all'); setFilterGroup('all');
    setFilterSeason('all'); setFilterTimeOfDay('all'); setFilterPriority('all');
    setFilterDogFriendly(false); setFilterWheelchair(false); setFilterStroller(false);
  };

  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'priority': return ({ high: 3, medium: 2, low: 1 }[b.priority]) - ({ high: 3, medium: 2, low: 1 }[a.priority]);
      case 'travel': return a.travelTimeMinutes - b.travelTimeMinutes;
      case 'name': return a.name.localeCompare(b.name);
      default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  const usedCategories = [...new Set(items.map(i => i.category))];

  return (
    <div className="page-enter px-6 py-6 pb-24">
      <h2 className="text-xl font-semibold text-sand-900 mb-4">My <span className="heading-accent">bucket list</span></h2>

      {/* Tabs */}
      <div className="flex bg-sand-100 rounded-2xl p-1 mb-4">
        <button onClick={() => setTab('want_to_do')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition ${
            tab === 'want_to_do' ? 'bg-white text-sand-900 shadow-sm' : 'text-sand-500'
          }`}>
          To explore ({items.filter(i => i.status === 'want_to_do').length})
        </button>
        <button onClick={() => setTab('done')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition ${
            tab === 'done' ? 'bg-white text-sand-900 shadow-sm' : 'text-sand-500'
          }`}>
          Visited ({items.filter(i => i.status === 'done').length})
        </button>
      </div>

      {/* Sort & Filter */}
      <div className="flex items-center gap-2 mb-4">
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="text-xs px-3 py-2 rounded-xl border border-sand-200 bg-white text-sand-700 focus:outline-none">
          <option value="recent">Recently added</option>
          <option value="priority">Priority</option>
          <option value="travel">Nearest</option>
          <option value="name">A-Z</option>
        </select>
        <button onClick={() => setShowFilters(!showFilters)}
          className={`text-xs px-3 py-2 rounded-xl border transition ${
            showFilters || hasActiveFilters
              ? 'border-sand-500 text-sand-800 bg-sand-100' : 'border-sand-200 text-sand-600'
          }`}>
          Filters {hasActiveFilters && '●'}
        </button>
      </div>

      {showFilters && (
        <div className="bg-sand-100 rounded-2xl p-4 mb-4 space-y-3">
          <div>
            <label className="text-[10px] font-medium text-sand-500 uppercase tracking-wider block mb-1">Category</label>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as Category | 'all')}
              className="text-xs px-3 py-2 rounded-xl border border-sand-200 bg-white w-full">
              <option value="all">All categories</option>
              {usedCategories.map(c => (
                <option key={c} value={c}>{CATEGORY_INFO[c].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-sand-500 uppercase tracking-wider block mb-1">Cost</label>
            <div className="toggle-group">
              <button className={`toggle-btn text-xs ${filterCost === 'all' ? 'active' : ''}`}
                onClick={() => setFilterCost('all')}>All</button>
              {(Object.entries(COST_LABELS) as [CostLevel, string][]).map(([key, label]) => (
                <button key={key} className={`toggle-btn text-xs ${filterCost === key ? 'active' : ''}`}
                  onClick={() => setFilterCost(key)}>{label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-medium text-sand-500 uppercase tracking-wider block mb-1">Time needed</label>
            <div className="toggle-group">
              <button className={`toggle-btn text-xs ${filterDuration === 'all' ? 'active' : ''}`}
                onClick={() => setFilterDuration('all')}>All</button>
              {(Object.entries(DURATION_LABELS) as [DurationEstimate, string][]).map(([key, label]) => (
                <button key={key} className={`toggle-btn text-xs ${filterDuration === key ? 'active' : ''}`}
                  onClick={() => setFilterDuration(key)}>{label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-medium text-sand-500 uppercase tracking-wider block mb-1">Good for</label>
            <div className="toggle-group">
              <button className={`toggle-btn text-xs ${filterGroup === 'all' ? 'active' : ''}`}
                onClick={() => setFilterGroup('all')}>All</button>
              {(['solo', 'couple', 'friends', 'family', 'kids'] as GroupType[]).map(g => (
                <button key={g} className={`toggle-btn text-xs ${filterGroup === g ? 'active' : ''}`}
                  onClick={() => setFilterGroup(g)}>{g.charAt(0).toUpperCase() + g.slice(1)}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-medium text-sand-500 uppercase tracking-wider block mb-1">Priority</label>
            <div className="toggle-group">
              <button className={`toggle-btn text-xs ${filterPriority === 'all' ? 'active' : ''}`}
                onClick={() => setFilterPriority('all')}>All</button>
              {(['high', 'medium', 'low'] as Priority[]).map(p => (
                <button key={p} className={`toggle-btn text-xs ${filterPriority === p ? 'active' : ''}`}
                  onClick={() => setFilterPriority(p)}>{p.charAt(0).toUpperCase() + p.slice(1)}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-medium text-sand-500 uppercase tracking-wider block mb-1">Accessibility</label>
            <div className="toggle-group">
              <button className={`toggle-btn text-xs ${filterDogFriendly ? 'active' : ''}`}
                onClick={() => setFilterDogFriendly(!filterDogFriendly)}>Dog-friendly</button>
              <button className={`toggle-btn text-xs ${filterWheelchair ? 'active' : ''}`}
                onClick={() => setFilterWheelchair(!filterWheelchair)}>Wheelchair</button>
              <button className={`toggle-btn text-xs ${filterStroller ? 'active' : ''}`}
                onClick={() => setFilterStroller(!filterStroller)}>Stroller</button>
            </div>
          </div>

          {/* Expandable extra filters */}
          <button onClick={() => setShowMoreFilters(!showMoreFilters)}
            className="text-xs text-sand-600 font-medium inline-flex items-center gap-1">
            {showMoreFilters ? 'Less filters' : 'More filters'}
            {showMoreFilters ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {showMoreFilters && (
            <>
              <div>
                <label className="text-[10px] font-medium text-sand-500 uppercase tracking-wider block mb-1">Setting</label>
                <div className="toggle-group">
                  <button className={`toggle-btn text-xs ${filterSetting === 'all' ? 'active' : ''}`}
                    onClick={() => setFilterSetting('all')}>All</button>
                  {([['indoor', 'Indoor'], ['outdoor', 'Outdoor'], ['mixed', 'Mixed']] as const).map(([key, label]) => (
                    <button key={key} className={`toggle-btn text-xs ${filterSetting === key ? 'active' : ''}`}
                      onClick={() => setFilterSetting(key)}>{label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-sand-500 uppercase tracking-wider block mb-1">Weather</label>
                <div className="toggle-group">
                  <button className={`toggle-btn text-xs ${filterWeather === 'all' ? 'active' : ''}`}
                    onClick={() => setFilterWeather('all')}>All</button>
                  {([['any', 'Any weather'], ['good_weather', 'Good weather'], ['bad_weather_ideal', 'Bad weather']] as const).map(([key, label]) => (
                    <button key={key} className={`toggle-btn text-xs ${filterWeather === key ? 'active' : ''}`}
                      onClick={() => setFilterWeather(key)}>{label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-sand-500 uppercase tracking-wider block mb-1">Season</label>
                <div className="toggle-group">
                  <button className={`toggle-btn text-xs ${filterSeason === 'all' ? 'active' : ''}`}
                    onClick={() => setFilterSeason('all')}>All</button>
                  {(Object.entries(SEASON_LABELS) as [Season, string][]).filter(([k]) => k !== 'any').map(([key, label]) => (
                    <button key={key} className={`toggle-btn text-xs ${filterSeason === key ? 'active' : ''}`}
                      onClick={() => setFilterSeason(key)}>{label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-sand-500 uppercase tracking-wider block mb-1">Time of day</label>
                <div className="toggle-group">
                  <button className={`toggle-btn text-xs ${filterTimeOfDay === 'all' ? 'active' : ''}`}
                    onClick={() => setFilterTimeOfDay('all')}>All</button>
                  {(Object.entries(TIME_OF_DAY_LABELS) as [TimeOfDay, string][]).filter(([k]) => k !== 'any').map(([key, label]) => (
                    <button key={key} className={`toggle-btn text-xs ${filterTimeOfDay === key ? 'active' : ''}`}
                      onClick={() => setFilterTimeOfDay(key)}>{label}</button>
                  ))}
                </div>
              </div>
            </>
          )}

          <button onClick={clearAllFilters}
            className="text-xs text-terra-500 font-medium">Clear filters</button>
        </div>
      )}

      {/* Items */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="flex justify-center mb-3"><MapPin size={32} strokeWidth={1.5} className="text-sand-300" /></div>
          <p className="text-sm text-sand-500 mb-4">
            {tab === 'want_to_do' ? 'No places yet. Start adding some!' : 'Nothing completed yet. Get out there!'}
          </p>
          {tab === 'want_to_do' && (
            <button onClick={() => onNavigate({ name: 'add' })}
              className="px-6 py-2.5 bg-sand-900 text-sand-100 rounded-xl text-sm font-medium">Add a place</button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => {
            const cat = CATEGORY_INFO[item.category];
            return (
              <button key={item.id} onClick={() => onSelectItem(item.id)}
                className="w-full text-left card flex overflow-hidden">
                {/* Image */}
                <div className="w-24 h-24 flex-shrink-0 bg-sand-200">
                  {item.photoUrl ? (
                    <img src={item.photoUrl} alt={item.name} className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-medium text-sand-500">{cat.label}</div>
                  )}
                </div>
                {/* Content */}
                <div className="flex-1 p-3 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-sm font-medium text-sand-900 truncate">{item.name}</h4>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="badge bg-sand-100 text-sand-700">{formatDuration(item.travelTimeMinutes)}</span>
                        <span className="badge bg-sand-100 text-sand-700">{DURATION_LABELS[item.durationEstimate]}</span>
                        <span className="badge bg-sand-100 text-sand-700">{COST_LABELS[item.costLevel]}</span>
                      </div>
                    </div>
                    {item.priority === 'high' && (
                      <span className="badge bg-terra-500 text-white flex-shrink-0">High</span>
                    )}
                  </div>
                  {item.status === 'done' && item.completionRating && (
                    <div className="mt-1.5 flex gap-0.5">
                      {Array.from({ length: item.completionRating }).map((_, i) => (
                        <Star key={i} size={12} strokeWidth={1.5} className="text-amber-500 fill-amber-500" />
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
