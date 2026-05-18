import { useState } from 'react';
import type { BucketListItem, Category, Setting, WeatherSuitability, DurationEstimate, CostLevel, Season, TimeOfDay, GroupType, Priority } from '../types';
import { CATEGORY_INFO, DURATION_LABELS, COST_LABELS, SEASON_LABELS, TIME_OF_DAY_LABELS } from '../types';
import { formatOpeningHours } from '../utils/openingHours';
import {
  NavigationArrow,
  Sun, CloudRain, CloudSun,
  Clock, Coins, Users, Dog, Wheelchair, Baby,
  Flower, SunHorizon, MapPin, Star, ArrowRight, Trash, Check, PencilSimple, X,
  Buildings, TreeEvergreen, ArrowsClockwise,
} from '@phosphor-icons/react';

interface Props {
  item: BucketListItem;
  onBack: () => void;
  onSave: (item: BucketListItem) => void;
  onDelete: (id: string) => void;
}

const weatherIconEl = (suitability: string) => {
  switch (suitability) {
    case 'good_weather': return <Sun size={16} />;
    case 'bad_weather_ideal': return <CloudRain size={16} />;
    default: return <CloudSun size={16} />;
  }
};

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="block text-xs font-medium text-sand-600 mb-2 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

export default function ItemDetail({ item, onBack, onSave, onDelete }: Props) {
  const [showComplete, setShowComplete] = useState(false);
  const [rating, setRating] = useState(0);
  const [completionNotes, setCompletionNotes] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BucketListItem>({ ...item });

  const cat = CATEGORY_INFO[item.category];

  const handleMarkDone = () => {
    onSave({ ...item, status: 'done', completedAt: new Date().toISOString(),
      completionRating: rating || undefined, completionNotes: completionNotes || undefined });
    setShowComplete(false);
  };

  const handleNavigate = () => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}`, '_blank');
  };

  const startEditing = () => {
    setDraft({ ...item });
    setEditing(true);
  };

  const handleSaveEdit = () => {
    onSave(draft);
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraft({ ...item });
    setEditing(false);
  };

  const updateDraft = (updates: Partial<BucketListItem>) => {
    setDraft(prev => ({ ...prev, ...updates }));
  };

  const toggleGroupType = (g: GroupType) => {
    const current = draft.groupSuitability || [];
    updateDraft({ groupSuitability: current.includes(g) ? current.filter(x => x !== g) : [...current, g] });
  };

  const toggleSeason = (s: Season) => {
    const current = draft.bestSeasons || [];
    if (s === 'any') {
      updateDraft({ bestSeasons: current.includes('any') ? [] : ['any'] });
    } else {
      const withoutAny = current.filter(x => x !== 'any');
      const updated = withoutAny.includes(s) ? withoutAny.filter(x => x !== s) : [...withoutAny, s];
      updateDraft({ bestSeasons: updated });
    }
  };

  const toggleTimeOfDay = (t: TimeOfDay) => {
    const current = draft.bestTimesOfDay || [];
    if (t === 'any') {
      updateDraft({ bestTimesOfDay: current.includes('any') ? [] : ['any'] });
    } else {
      const withoutAny = current.filter(x => x !== 'any');
      const updated = withoutAny.includes(t) ? withoutAny.filter(x => x !== t) : [...withoutAny, t];
      updateDraft({ bestTimesOfDay: updated });
    }
  };

  // ── EDIT MODE ──
  if (editing) {
    return (
      <div className="page-enter pb-24">
        {/* Hero */}
        <div className="relative">
          {draft.photoUrl ? (
            <div className="place-img-container h-48 rounded-none">
              <img src={draft.photoUrl} alt={draft.name} className="place-img"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          ) : (
            <div className="h-32 bg-sand-200 flex items-center justify-center text-sm font-medium text-sand-500">
              {CATEGORY_INFO[draft.category].label}
            </div>
          )}
          <button onClick={cancelEdit}
            className="absolute top-4 left-4 z-10 w-9 h-9 rounded-full bg-white/80 backdrop-blur flex items-center justify-center text-sand-700 text-sm shadow-sm">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 pt-5">
          <h2 className="text-lg font-semibold text-sand-900 mb-1">Edit: {draft.name}</h2>
          <p className="text-xs text-sand-700 mb-5">{draft.address?.split(',').slice(0, 3).join(',')}</p>

          <Section label="Category">
            <div className="toggle-group">
              {(Object.entries(CATEGORY_INFO) as [Category, { label: string; icon: string; color: string }][]).map(([key, info]) => (
                <button key={key} className={`toggle-btn text-xs ${draft.category === key ? 'active' : ''}`}
                  onClick={() => updateDraft({ category: key })}>{info.label}</button>
              ))}
            </div>
          </Section>

          <Section label="Setting">
            <div className="toggle-group">
              {([
                { val: 'indoor' as Setting, label: 'Indoor', icon: <Buildings size={16} /> },
                { val: 'outdoor' as Setting, label: 'Outdoor', icon: <TreeEvergreen size={16} /> },
                { val: 'mixed' as Setting, label: 'Mixed', icon: <ArrowsClockwise size={16} /> },
              ]).map(({ val, label, icon }) => (
                <button key={val} className={`toggle-btn ${draft.setting === val ? 'active' : ''}`}
                  onClick={() => updateDraft({ setting: val })}>
                  <span className="inline-flex items-center gap-1.5">{icon} {label}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section label="Weather">
            <div className="toggle-group">
              {([
                { val: 'any' as WeatherSuitability, label: 'Any weather', icon: <CloudSun size={16} /> },
                { val: 'good_weather' as WeatherSuitability, label: 'Good weather only', icon: <Sun size={16} /> },
                { val: 'bad_weather_ideal' as WeatherSuitability, label: 'Great for bad weather', icon: <CloudRain size={16} /> },
              ]).map(({ val, label, icon }) => (
                <button key={val} className={`toggle-btn ${draft.weatherSuitability === val ? 'active' : ''}`}
                  onClick={() => updateDraft({ weatherSuitability: val })}>
                  <span className="inline-flex items-center gap-1.5">{icon} {label}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section label="Activity duration">
            <div className="toggle-group">
              {(Object.entries(DURATION_LABELS) as [DurationEstimate, string][]).map(([key, label]) => (
                <button key={key} className={`toggle-btn ${draft.durationEstimate === key ? 'active' : ''}`}
                  onClick={() => updateDraft({ durationEstimate: key })}>{label}</button>
              ))}
            </div>
          </Section>

          <Section label="Cost">
            <div className="toggle-group">
              {(Object.entries(COST_LABELS) as [CostLevel, string][]).map(([key, label]) => (
                <button key={key} className={`toggle-btn ${draft.costLevel === key ? 'active' : ''}`}
                  onClick={() => updateDraft({ costLevel: key })}>{label}</button>
              ))}
            </div>
          </Section>

          <Section label="Best seasons">
            <div className="toggle-group">
              {(Object.entries(SEASON_LABELS) as [Season, string][]).map(([key, label]) => (
                <button key={key} className={`toggle-btn ${(draft.bestSeasons || []).includes(key) ? 'active' : ''}`}
                  onClick={() => toggleSeason(key)}>{label}</button>
              ))}
            </div>
          </Section>

          <Section label="Best times of day">
            <div className="toggle-group">
              {(Object.entries(TIME_OF_DAY_LABELS) as [TimeOfDay, string][]).map(([key, label]) => (
                <button key={key} className={`toggle-btn ${(draft.bestTimesOfDay || []).includes(key) ? 'active' : ''}`}
                  onClick={() => toggleTimeOfDay(key)}>{label}</button>
              ))}
            </div>
          </Section>

          <Section label="Good for">
            <div className="toggle-group">
              {(['solo', 'couple', 'friends', 'family', 'kids'] as GroupType[]).map((val) => (
                <button key={val} className={`toggle-btn ${(draft.groupSuitability || []).includes(val) ? 'active' : ''}`}
                  onClick={() => toggleGroupType(val)}>{val.charAt(0).toUpperCase() + val.slice(1)}</button>
              ))}
            </div>
          </Section>

          <Section label="Accessibility">
            <div className="toggle-group">
              <button className={`toggle-btn ${draft.dogFriendly === true ? 'active' : ''}`}
                onClick={() => updateDraft({ dogFriendly: draft.dogFriendly === true ? undefined : true })}>
                <span className="inline-flex items-center gap-1.5"><Dog size={16} /> Dog-friendly</span>
              </button>
              <button className={`toggle-btn ${draft.wheelchairAccessible === true ? 'active' : ''}`}
                onClick={() => updateDraft({ wheelchairAccessible: draft.wheelchairAccessible === true ? undefined : true })}>
                <span className="inline-flex items-center gap-1.5"><Wheelchair size={16} /> Wheelchair</span>
              </button>
              <button className={`toggle-btn ${draft.strollerFriendly === true ? 'active' : ''}`}
                onClick={() => updateDraft({ strollerFriendly: draft.strollerFriendly === true ? undefined : true })}>
                <span className="inline-flex items-center gap-1.5"><Baby size={16} /> Stroller</span>
              </button>
            </div>
          </Section>

          <Section label="Priority">
            <div className="toggle-group">
              {([['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] as const).map(([val, label]) => (
                <button key={val} className={`toggle-btn ${draft.priority === val ? 'active' : ''}`}
                  onClick={() => updateDraft({ priority: val as Priority })}>{label}</button>
              ))}
            </div>
          </Section>

          <Section label="Personal notes">
            <textarea value={draft.personalNotes || ''} onChange={(e) => updateDraft({ personalNotes: e.target.value })}
              placeholder="Any notes about this place..."
              rows={2}
              className="w-full px-4 py-3 border border-sand-200 rounded-[12px] text-sm text-sand-900 placeholder:text-sand-400 focus:outline-none focus:border-sand-500 resize-none bg-white" />
          </Section>

          <div className="flex gap-2 mt-2 mb-4">
            <button onClick={cancelEdit}
              className="flex-1 py-3.5 rounded-full bg-sand-100 text-sand-600 font-medium text-sm">Cancel</button>
            <button onClick={handleSaveEdit}
              className="flex-1 py-3.5 rounded-full bg-sand-900 text-sand-100 font-medium text-sm hover:bg-sand-800 transition">Save changes</button>
          </div>
        </div>
      </div>
    );
  }

  // ── VIEW MODE ──
  const seasonsDisplay = (item.bestSeasons || []).map(s => SEASON_LABELS[s]).join(', ') || 'Any season';
  const timesDisplay = (item.bestTimesOfDay || []).map(t => TIME_OF_DAY_LABELS[t]).join(', ') || 'Any time';

  const infoRows: { icon: React.ReactNode; label: string }[] = [
    { icon: <NavigationArrow size={16} />,
      label: `${item.travelDistanceKm} km away` },
    { icon: weatherIconEl(item.weatherSuitability),
      label: item.weatherSuitability === 'good_weather' ? 'Best in good weather' : item.weatherSuitability === 'bad_weather_ideal' ? 'Great for bad weather' : 'Any weather' },
    { icon: <Clock size={16} />, label: DURATION_LABELS[item.durationEstimate] },
    { icon: <Coins size={16} />, label: COST_LABELS[item.costLevel] + (item.specificCost ? ` (~${item.specificCost})` : '') },
    { icon: <Users size={16} />, label: item.groupSuitability.map(g => g.charAt(0).toUpperCase() + g.slice(1)).join(', ') },
    ...(item.dogFriendly !== undefined ? [{ icon: <Dog size={16} />, label: item.dogFriendly ? 'Dog-friendly' : 'Not dog-friendly' }] : []),
    ...(item.wheelchairAccessible !== undefined ? [{ icon: <Wheelchair size={16} />, label: item.wheelchairAccessible ? 'Wheelchair accessible' : 'Not accessible' }] : []),
    ...(item.strollerFriendly !== undefined ? [{ icon: <Baby size={16} />, label: item.strollerFriendly ? 'Stroller-friendly' : 'Not stroller-friendly' }] : []),
    { icon: <Flower size={16} />, label: seasonsDisplay },
    ...(timesDisplay !== 'Any time' ? [{ icon: <SunHorizon size={16} />, label: timesDisplay }] : []),
  ];

  return (
    <div className="page-enter pb-24">
      {/* Hero */}
      <div className="relative">
        {item.photoUrl ? (
          <div className="place-img-container h-56 rounded-none">
            <img src={item.photoUrl} alt={item.name} className="place-img"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
        ) : (
          <div className="h-40 bg-sand-200 flex items-center justify-center text-sm font-medium text-sand-500">{cat.label}</div>
        )}
        <button onClick={onBack}
          className="absolute top-4 left-4 z-10 w-9 h-9 rounded-full bg-white/80 backdrop-blur flex items-center justify-center text-sand-700 text-sm shadow-sm">
          ←
        </button>
      </div>

      <div className="px-6 -mt-6 relative z-10">
        {/* Title card */}
        <div className="bg-white rounded-[20px] p-5 shadow-sm border border-sand-100 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="badge text-xs" style={{ backgroundColor: cat.color + '15', color: cat.color }}>{cat.label}</span>
              <span className="badge bg-sand-100 text-sand-600 text-xs">{item.priority} priority</span>
            </div>
            <button onClick={startEditing}
              className="w-8 h-8 rounded-full bg-sand-100 flex items-center justify-center text-sand-500 hover:text-sand-700 hover:bg-sand-200 transition">
              <PencilSimple size={14} />
            </button>
          </div>
          <h2 className="text-xl font-semibold text-sand-900">{item.name}</h2>
          <p className="text-xs text-sand-700 mt-1 inline-flex items-center gap-1">
            <MapPin size={12} /> {item.address?.split(',').slice(0, 3).join(',')}
          </p>
        </div>

        {/* Info rows */}
        <div className="bg-white rounded-[20px] p-4 border border-sand-100 mb-4">
          <div className="space-y-3">
            {infoRows.map((row, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-6 flex justify-center text-sand-500">{row.icon}</span>
                <span className="text-sm text-sand-700">{row.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Opening hours */}
        {item.openingHours && (
          <div className="bg-sand-100 rounded-[20px] p-4 mb-4">
            <p className="text-[10px] font-medium text-sand-700 uppercase tracking-wider mb-2">Opening hours</p>
            <div className="space-y-1">
              {formatOpeningHours(item.openingHours).split('\n').map((line, i) => (
                <p key={i} className="text-sm text-sand-800">{line}</p>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {item.personalNotes && (
          <div className="bg-sand-100 rounded-[20px] p-4 mb-4">
            <p className="text-[10px] font-medium text-sand-700 uppercase tracking-wider mb-1">Notes</p>
            <p className="text-sm text-sand-800">{item.personalNotes}</p>
          </div>
        )}

        {/* Completion */}
        {item.status === 'done' && (
          <div className="bg-forest-50 rounded-[20px] p-4 mb-4">
            <p className="text-[10px] font-medium text-forest-600 uppercase tracking-wider mb-1">
              Completed {item.completedAt ? new Date(item.completedAt).toLocaleDateString() : ''}
            </p>
            {item.completionRating && (
              <div className="flex gap-1 mb-1">
                {Array.from({ length: item.completionRating }).map((_, i) => (
                  <Star key={i} size={14} className="text-amber-500 fill-amber-500" />
                ))}
              </div>
            )}
            {item.completionNotes && <p className="text-sm text-sand-700">{item.completionNotes}</p>}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2 mt-4">
          <button onClick={handleNavigate}
            className="w-full py-3.5 rounded-full font-medium text-sm bg-sand-900 text-sand-100 hover:bg-sand-800 transition inline-flex items-center justify-center gap-2">
            Navigate <ArrowRight size={16} />
          </button>
          {item.status === 'want_to_do' && (
            <button onClick={() => setShowComplete(true)}
              className="w-full py-3.5 rounded-full font-medium text-sm bg-forest-500 text-white hover:bg-forest-600 transition inline-flex items-center justify-center gap-2">
              Mark as done <Check size={16} />
            </button>
          )}
          <button onClick={startEditing}
            className="w-full py-3.5 rounded-full font-medium text-sm text-sand-700 border border-sand-200 hover:bg-sand-50 transition inline-flex items-center justify-center gap-2">
            <PencilSimple size={16} /> Edit details
          </button>
          <button onClick={() => setConfirmDelete(true)}
            className="w-full py-3.5 rounded-full font-medium text-sm text-terra-500 border border-terra-500/20 hover:bg-terra-500/5 transition inline-flex items-center justify-center gap-2">
            <Trash size={16} /> Delete
          </button>
        </div>
      </div>

      {/* Mark as done modal */}
      {showComplete && (
        <div className="fixed inset-0 bg-sand-900/50 flex items-end z-50">
          <div className="bg-white w-full max-w-[480px] mx-auto rounded-t-3xl p-6 pb-24">
            <h3 className="text-lg font-semibold text-sand-900 mb-4">How was it?</h3>
            <div className="mb-4">
              <label className="text-xs font-medium text-sand-600 mb-2 block uppercase tracking-wider">Rating</label>
              <div className="flex gap-2">
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => setRating(n)}
                    className={`transition ${n <= rating ? 'text-amber-500' : 'text-sand-300'}`}>
                    <Star size={24} className={n <= rating ? 'fill-amber-500' : ''} />
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-5">
              <label className="text-xs font-medium text-sand-600 mb-2 block uppercase tracking-wider">Notes (optional)</label>
              <textarea value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder="How was the experience?"
                rows={2}
                className="w-full px-4 py-3 border border-sand-200 rounded-[12px] text-sm focus:outline-none focus:border-sand-500 resize-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowComplete(false)}
                className="flex-1 py-3 rounded-full bg-sand-100 text-sand-600 font-medium text-sm">Cancel</button>
              <button onClick={handleMarkDone}
                className="flex-1 py-3 rounded-full bg-forest-500 text-white font-medium text-sm">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-sand-900/50 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-sand-900 mb-2">Delete this place?</h3>
            <p className="text-sm text-sand-700 mb-5">This can't be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 rounded-full bg-sand-100 text-sand-600 font-medium text-sm">Cancel</button>
              <button onClick={() => onDelete(item.id)}
                className="flex-1 py-2.5 rounded-full bg-terra-500 text-white font-medium text-sm">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
