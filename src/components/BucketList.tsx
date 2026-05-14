import { useState } from 'react';
import type { BucketListItem, Category, CostLevel } from '../types';
import { CATEGORY_INFO, COST_LABELS, DURATION_LABELS } from '../types';

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
  const [showFilters, setShowFilters] = useState(false);

  let filtered = items.filter(i => i.status === tab);

  if (filterCategory !== 'all') {
    filtered = filtered.filter(i => i.category === filterCategory);
  }
  if (filterCost !== 'all') {
    filtered = filtered.filter(i => i.costLevel === filterCost);
  }

  // Sort
  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'priority': {
        const rank = { high: 3, medium: 2, low: 1 };
        return rank[b.priority] - rank[a.priority];
      }
      case 'travel': return a.travelTimeMinutes - b.travelTimeMinutes;
      case 'name': return a.name.localeCompare(b.name);
      default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  // Get unique categories in list
  const usedCategories = [...new Set(items.map(i => i.category))];

  return (
    <div className="px-5 py-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">My Bucket List</h2>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('want_to_do')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition ${
            tab === 'want_to_do' ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Want to do ({items.filter(i => i.status === 'want_to_do').length})
        </button>
        <button
          onClick={() => setTab('done')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition ${
            tab === 'done' ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Completed ({items.filter(i => i.status === 'done').length})
        </button>
      </div>

      {/* Sort + Filter */}
      <div className="flex items-center gap-2 mb-4">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 focus:outline-none"
        >
          <option value="recent">Recently added</option>
          <option value="priority">Priority</option>
          <option value="travel">Nearest first</option>
          <option value="name">A-Z</option>
        </select>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`text-xs px-3 py-1.5 rounded-lg border transition ${
            showFilters || filterCategory !== 'all' || filterCost !== 'all'
              ? 'border-teal-500 text-teal-600 bg-teal-50' : 'border-gray-200 text-gray-600'
          }`}
        >
          🔽 Filters {(filterCategory !== 'all' || filterCost !== 'all') && '(active)'}
        </button>
      </div>

      {showFilters && (
        <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Category</label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as Category | 'all')}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white w-full"
            >
              <option value="all">All categories</option>
              {usedCategories.map(c => (
                <option key={c} value={c}>{CATEGORY_INFO[c].emoji} {CATEGORY_INFO[c].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Cost</label>
            <div className="toggle-group">
              <button className={`toggle-btn text-xs ${filterCost === 'all' ? 'active' : ''}`}
                onClick={() => setFilterCost('all')}>All</button>
              {(Object.entries(COST_LABELS) as [CostLevel, string][]).map(([key, label]) => (
                <button key={key} className={`toggle-btn text-xs ${filterCost === key ? 'active' : ''}`}
                  onClick={() => setFilterCost(key)}>{label}</button>
              ))}
            </div>
          </div>
          <button onClick={() => { setFilterCategory('all'); setFilterCost('all'); }}
            className="text-xs text-teal-500 font-medium">Clear all filters</button>
        </div>
      )}

      {/* Items list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">{tab === 'want_to_do' ? '🗺️' : '🎉'}</div>
          <p className="text-sm text-gray-500">
            {tab === 'want_to_do'
              ? 'No places yet! Add your first bucket list item.'
              : 'No completed items yet. Get out there!'}
          </p>
          {tab === 'want_to_do' && (
            <button
              onClick={() => onNavigate({ name: 'add' })}
              className="mt-4 px-6 py-2 bg-teal-500 text-white rounded-xl text-sm font-medium"
            >
              Add a place
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => {
            const cat = CATEGORY_INFO[item.category];
            return (
              <button
                key={item.id}
                onClick={() => onSelectItem(item.id)}
                className="w-full text-left bg-white rounded-xl p-4 border border-gray-100 hover:border-teal-200 transition flex items-start gap-3"
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                  style={{ backgroundColor: cat.color + '15' }}
                >
                  {cat.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm truncate">{item.name}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-gray-500">
                      {item.transportMode === 'car' ? '🚗' : '🚶'} {item.travelTimeMinutes} min
                    </span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-500">
                      {item.weatherSuitability === 'good_weather' ? '☀️' : item.weatherSuitability === 'bad_weather_ideal' ? '☔' : '🌤️'}
                    </span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-500">{DURATION_LABELS[item.durationEstimate]}</span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-500">{COST_LABELS[item.costLevel]}</span>
                  </div>
                  {item.status === 'done' && item.completionRating && (
                    <div className="mt-1 text-xs text-amber-500">
                      {'⭐'.repeat(item.completionRating)}
                    </div>
                  )}
                </div>
                {item.priority === 'high' && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                    High
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
