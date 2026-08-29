// A real offline-first queue for incident reports.
//
// If POSTing an incident fails because the device is offline (or the
// request errors out for a network reason), the incident — including its
// photo, base64-encoded — is written to localStorage instead of being
// silently dropped. It stays "pending" until connectivity returns, at
// which point flushOfflineQueue() replays every queued item against the
// real API and removes it from the queue on success.

const KEY = 'nerOfflineIncidentQueue';

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

function writeQueue(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('Could not persist offline queue (storage full?):', err.message);
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: reader.result, name: file.name, type: file.type });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(entry) {
  if (!entry) return null;
  const [meta, base64] = entry.dataUrl.split(',');
  const mime = /data:(.*);base64/.exec(meta)?.[1] || entry.type || 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], entry.name || 'photo.jpg', { type: mime });
}

// Queues one incident report locally. Returns the queued item's id.
export async function queueOfflineIncident(fields, photoFile) {
  const photo = await fileToDataUrl(photoFile).catch(() => null);
  const item = {
    id: `local-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    fields,
    photo,
    queuedAt: new Date().toISOString(),
    status: 'pending',
    lastError: null,
  };
  const queue = readQueue();
  queue.push(item);
  writeQueue(queue);
  window.dispatchEvent(new CustomEvent('ner:offline-queue-changed'));
  return item.id;
}

export function listOfflineQueue() {
  return readQueue();
}

export function offlineQueueCounts() {
  const queue = readQueue();
  return {
    pendingReports: queue.filter((q) => q.status === 'pending' || q.status === 'failed').length,
    pendingPhotos: queue.filter((q) => q.photo && (q.status === 'pending' || q.status === 'failed')).length,
  };
}

export function removeFromOfflineQueue(id) {
  writeQueue(readQueue().filter((q) => q.id !== id));
  window.dispatchEvent(new CustomEvent('ner:offline-queue-changed'));
}

// Attempts to submit every pending/failed queued item against the real API.
// Successful items are removed; failed ones stay queued with the latest error.
export async function flushOfflineQueue(incidentApiCreate) {
  const queue = readQueue();
  if (!queue.length) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const remaining = [];

  for (const item of queue) {
    try {
      const photoFile = dataUrlToFile(item.photo);
      await incidentApiCreate(item.fields, photoFile);
      synced++;
    } catch (err) {
      failed++;
      remaining.push({ ...item, status: 'failed', lastError: err.message || 'Sync failed' });
    }
  }

  writeQueue(remaining);
  window.dispatchEvent(new CustomEvent('ner:offline-queue-changed'));
  return { synced, failed };
}
