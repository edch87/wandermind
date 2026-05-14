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
    onSave({
      ...item,
      status: 'done',
      completedAt: new Date().toISOString(),
      completionRating: rating || undefined,
      completionNotes: completionNotes || undefined,
    });
    setShowComplete(false);
  };

  const handleNavigate = () => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}`, '_blank');
  };

  const infoRows = [
    {
      icon: item.transportMode === 'car' ? '🚗' : item.transportMode === 'bike' ? '🚲' : item.transportMode === 'transit' ? '🚆' : '🚶',
      label: `${item.travelTimeMinutes} min from home (${item.travelDistanceKm} km)`,
    },
    {
      icon: item.weatherSuitability === 'good_weather' ? '☀️' : item.weatherSuitability === 'bad_weather_ideal' ? '☔' : '🌤️',
      label: item.weatherSuitability === 'good_weather' ? 'Best in good weather' : item.weatherSuitability === 'bad_weather_ideal' ? 'Great for bad weather' : 'Any weather',
    },
    { icon: '⏱️', label: DURATION_LABELS[item.durationEstimate] },
    { icon: '💰', label: COST_LABELS[item.costLevel] + (item.specificCost ? ` (~€${item.specificCost})` : '') },
    { icon: '👥', label: `Great for: ${item.groupSuitability.map(g => g.charAt(0).toUpperCase() + g.slice(1)).join(', ')}` },
    ...(item.dogFriendly !== undefined ? [{ icon: '🐕', label: item.dogFriendly ? 'Dog-friendly' : 'Not dog-friendly' }] : []),
    ...(item.wheelchairAccessible !== undefined ? [{ icon: '♿', label: item.wheelchairAccessible ? 'Wheelchair accessible' : 'Not wheelchair accessible' }] : []),
    { icon: '🌸', label: SEASON_LABELS[item.bestSeason] },
    ...(item.bestTimeOfDay !== 'any' ? [{ icon: '🌅', label: `Best in the ${item.bestTimeOfDay}` }] : []),
  ];

  return (
    <div className="px-5 py-6 pb-24">
      <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-xl mb-4">&larr;</button>

      {/* Header */}
      <div className="bg-gradient-to-br from-teal-50 to-teal-100/50 rounded-2xl p-6 mb-5 text-center">
        <div className="text-4xl mb-2">{cat.emoji}</div>
        <h2 className="text-xl font-bold text-gray-900">{item.name}</h2>
        <div className="flex items-center justify-center gap-2 mt-2">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: cat.color + '20', color: cat.color }}>
            {cat.label}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
            {item.priority} priority
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-2">{item.address}</p>
      </div>

      {/* Info rows */}
      <div className="space-y-3 mb-6">
        {infoRows.map((row, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-lg w-6 text-center">{row.icon}</span>
            <span className="text-sm text-gray-700">{row.label}</span>
          </div>
        ))}
      </div>

      {/* Opening hours */}
      {item.openingHours && (
        <div className="bg-gray-50 rounded-xl p-4 mb-4">
          <div className="text-xs font-medium text-gray-500 mb-1">Opening hours</div>
          <div className="text-sm text-gray-700">{item.openingHours}</div>
        </div>
      )}

      {/* Notes */}
      {item.personalNotes && (
        <div className="bg-gray-50 rounded-xl p-4 mb-4">
          <div className="text-xs font-medium text-gray-500 mb-1">Notes</div>
          <div className="text-sm text-gray-700">{item.personalNotes}</div>
        </div>
      )}

      {/* Completion info */}
      {item.status === 'done' && (
        <div className="bg-green-50 rounded-xl p-4 mb-4">
          <div className="text-xs font-medium text-green-600 mb-1">Completed {item.completedAt ? new Date(item.completedAt).toLocaleDateString() : ''}</div>
          {item.completionRating && <div className="text-sm mb-1">{'⭐'.repeat(item.completionRating)}</div>}
          {item.completionNotes && <div className="text-sm text-gray-700">{item.completionNotes}</div>}
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        <button onClick={handleNavigate}
          className="w-full py-3 rounded-xl font-medium text-sm bg-teal-500 text-white hover:bg-teal-600 transition">
          🗺️ Navigate
        </button>

        {item.status === 'want_to_do' && (
          <button onClick={() => setShowComplete(true)}
            className="w-full py-3 rounded-xl font-medium text-sm bg-green-500 text-white hover:bg-green-600 transition">
            ✅ Mark as done
          </button>
        )}

        <button onClick={() => setConfirmDelete(true)}
          className="w-full py-3 rounded-xl font-medium text-sm bg-white text-red-500 border border-red-200 hover:bg-red-50 transition">
          🗑️ Delete
        </button>
      </div>

      {/* Mark as done modal */}
      {showComplete && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="bg-white w-full max-w-[480px] mx-auto rounded-t-2xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">How was it?</h3>
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-2 block">Rating</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setRating(n)}
                    className={`text-2xl transition ${n <= rating ? '' : 'opacity-30'}`}>
                    ⭐
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-2 block">Notes (optional)</label>
              <textarea value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder="How was the experience?"
                rows={2}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-teal-500 resize-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowComplete(false)}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-medium text-sm">Cancel</button>
              <button onClick={handleMarkDone}
                className="flex-1 py-3 rounded-xl bg-green-500 text-white font-medium text-sm">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete this place?</h3>
            <p className="text-sm text-gray-500 mb-4">This can't be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-medium text-sm">Cancel</button>
              <button onClick={() => onDelete(item.id)}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-medium text-sm">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
