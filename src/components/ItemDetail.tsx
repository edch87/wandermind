import { useState } from 'react';
import type { BucketListItem } from '../types';
import { CATEGORY_INFO, DURATION_LABELS, COST_LABELS, SEASON_LABELS } from '../types';

interface Props {
  item: BucketListItem;
  onBack: () => void;
  onSave: (item: BucketListItem) => void;
  onDelete: (id: string) => void;
}

export default function ItemDetail({ item, onBack, onSave, onDelete }: Props) {
  const [showComplete, setShowComplete] = useState(false);
  const [rating, setRating] = useState(0);
  const [completionNotes, setCompletionNotes] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cat = CATEGORY_INFO[item.category];

  const handleMarkDone = () => {
    onSave({ ...item, status: 'done', completedAt: new Date().toISOString(),
      completionRating: rating || undefined, completionNotes: completionNotes || undefined });
    setShowComplete(false);
  };

  const handleNavigate = () => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}`, '_blank');
  };

  const infoRows = [
    { icon: item.transportMode === 'car' ? '🚗' : item.transportMode === 'bike' ? '🚲' : item.transportMode === 'transit' ? '🚆' : '🚶',
      label: `${item.travelTimeMinutes} min from home (${item.travelDistanceKm} km)` },
    { icon: item.weatherSuitability === 'good_weather' ? '☀️' : item.weatherSuitability === 'bad_weather_ideal' ? '☔' : '🌤️',
      label: item.weatherSuitability === 'good_weather' ? 'Best in good weather' : item.weatherSuitability === 'bad_weather_ideal' ? 'Great for bad weather' : 'Any weather' },
    { icon: '⏱️', label: DURATION_LABELS[item.durationEstimate] },
    { icon: '💰', label: COST_LABELS[item.costLevel] + (item.specificCost ? ` (~€${item.specificCost})` : '') },
    { icon: '👥', label: item.groupSuitability.map(g => g.charAt(0).toUpperCase() + g.slice(1)).join(', ') },
    ...(item.dogFriendly !== undefined ? [{ icon: '🐕', label: item.dogFriendly ? 'Dog-friendly' : 'Not dog-friendly' }] : []),
    ...(item.wheelchairAccessible !== undefined ? [{ icon: '♿', label: item.wheelchairAccessible ? 'Wheelchair accessible' : 'Not accessible' }] : []),
    { icon: '🌸', label: SEASON_LABELS[item.bestSeason] },
    ...(item.bestTimeOfDay !== 'any' ? [{ icon: '🌅', label: `Best in the ${item.bestTimeOfDay}` }] : []),
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
          <div className="h-40 bg-sand-200 flex items-center justify-center text-5xl">{cat.emoji}</div>
        )}
        <button onClick={onBack}
          className="absolute top-4 left-4 z-10 w-9 h-9 rounded-full bg-white/80 backdrop-blur flex items-center justify-center text-sand-700 text-sm shadow-sm">
          ←
        </button>
      </div>

      <div className="px-6 -mt-6 relative z-10">
        {/* Title card */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-sand-100 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="badge text-xs" style={{ backgroundColor: cat.color + '15', color: cat.color }}>{cat.emoji} {cat.label}</span>
            <span className="badge bg-sand-100 text-sand-600 text-xs">{item.priority} priority</span>
          </div>
          <h2 className="text-xl font-semibold text-sand-900">{item.name}</h2>
          <p className="text-xs text-sand-500 mt-1">{item.address?.split(',').slice(0, 3).join(',')}</p>
        </div>

        {/* Info rows */}
        <div className="bg-white rounded-2xl p-4 border border-sand-100 mb-4">
          <div className="space-y-3">
            {infoRows.map((row, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-base w-6 text-center">{row.icon}</span>
                <span className="text-sm text-sand-700">{row.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Opening hours */}
        {item.openingHours && (
          <div className="bg-sand-100 rounded-2xl p-4 mb-4">
            <p className="text-[10px] font-medium text-sand-500 uppercase tracking-wider mb-1">Opening hours</p>
            <p className="text-sm text-sand-800">{item.openingHours}</p>
          </div>
        )}

        {/* Notes */}
        {item.personalNotes && (
          <div className="bg-sand-100 rounded-2xl p-4 mb-4">
            <p className="text-[10px] font-medium text-sand-500 uppercase tracking-wider mb-1">Notes</p>
            <p className="text-sm text-sand-800">{item.personalNotes}</p>
          </div>
        )}

        {/* Completion */}
        {item.status === 'done' && (
          <div className="bg-forest-50 rounded-2xl p-4 mb-4">
            <p className="text-[10px] font-medium text-forest-600 uppercase tracking-wider mb-1">
              Completed {item.completedAt ? new Date(item.completedAt).toLocaleDateString() : ''}
            </p>
            {item.completionRating && <p className="text-sm mb-1">{'⭐'.repeat(item.completionRating)}</p>}
            {item.completionNotes && <p className="text-sm text-sand-700">{item.completionNotes}</p>}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2 mt-4">
          <button onClick={handleNavigate}
            className="w-full py-3.5 rounded-2xl font-medium text-sm bg-sand-900 text-sand-100 hover:bg-sand-800 transition">
            Navigate →
          </button>
          {item.status === 'want_to_do' && (
            <button onClick={() => setShowComplete(true)}
              className="w-full py-3.5 rounded-2xl font-medium text-sm bg-forest-500 text-white hover:bg-forest-600 transition">
              Mark as done ✓
            </button>
          )}
          <button onClick={() => setConfirmDelete(true)}
            className="w-full py-3.5 rounded-2xl font-medium text-sm text-terra-500 border border-terra-500/20 hover:bg-terra-500/5 transition">
            Delete
          </button>
        </div>
      </div>

      {/* Mark as done modal */}
      {showComplete && (
        <div className="fixed inset-0 bg-sand-900/50 flex items-end z-50">
          <div className="bg-white w-full max-w-[480px] mx-auto rounded-t-3xl p-6">
            <h3 className="text-lg font-semibold text-sand-900 mb-4">How was it?</h3>
            <div className="mb-4">
              <label className="text-xs font-medium text-sand-600 mb-2 block uppercase tracking-wider">Rating</label>
              <div className="flex gap-2">
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => setRating(n)}
                    className={`text-2xl transition ${n <= rating ? '' : 'opacity-25'}`}>⭐</button>
                ))}
              </div>
            </div>
            <div className="mb-5">
              <label className="text-xs font-medium text-sand-600 mb-2 block uppercase tracking-wider">Notes (optional)</label>
              <textarea value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder="How was the experience?"
                rows={2}
                className="w-full px-4 py-3 border border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-sand-500 resize-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowComplete(false)}
                className="flex-1 py-3 rounded-2xl bg-sand-100 text-sand-600 font-medium text-sm">Cancel</button>
              <button onClick={handleMarkDone}
                className="flex-1 py-3 rounded-2xl bg-forest-500 text-white font-medium text-sm">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-sand-900/50 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-sand-900 mb-2">Delete this place?</h3>
            <p className="text-sm text-sand-500 mb-5">This can't be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 rounded-2xl bg-sand-100 text-sand-600 font-medium text-sm">Cancel</button>
              <button onClick={() => onDelete(item.id)}
                className="flex-1 py-2.5 rounded-2xl bg-terra-500 text-white font-medium text-sm">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
