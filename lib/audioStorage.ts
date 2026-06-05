const DB_NAME = "hum-audio";
const STORE_NAME = "recordings";
const DB_VERSION = 1;
const MAX_RECENT_AUDIO = 20;

type StoredRecording = {
  key: string;
  blob: Blob;
  createdAt: string;
};

let dbPromise: Promise<IDBDatabase> | null = null;

export async function saveRecordingAudio(key: string, blob: Blob, createdAt: string) {
  const db = await openAudioDb();
  await runStoreRequest(
    db,
    "readwrite",
    (store) => store.put({ key, blob, createdAt }),
  );
}

export async function getRecordingAudio(key: string): Promise<Blob | null> {
  const db = await openAudioDb();
  const recording = await runStoreRequest<StoredRecording | undefined>(
    db,
    "readonly",
    (store) => store.get(key),
  );

  return recording?.blob ?? null;
}

export async function pruneRecordingAudio(keepKeys: string[]) {
  const keep = new Set(keepKeys.slice(0, MAX_RECENT_AUDIO));
  const db = await openAudioDb();
  const keys = await runStoreRequest<IDBValidKey[]>(db, "readonly", (store) => store.getAllKeys());
  const staleKeys = keys
    .map(String)
    .filter((key) => !keep.has(key));

  if (!staleKeys.length) return;

  await runStoreTransaction(db, "readwrite", (store) => {
    staleKeys.forEach((key) => store.delete(key));
  });
}

export function clearRecordingAudio() {
  if (typeof indexedDB === "undefined") return Promise.resolve();

  dbPromise = null;

  return new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function openAudioDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function runStoreRequest<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  createRequest: (store: IDBObjectStore) => IDBRequest<T>,
) {
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = createRequest(transaction.objectStore(STORE_NAME));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runStoreTransaction(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    run(transaction.objectStore(STORE_NAME));
  });
}
