import { useCallback, useEffect, useState } from "react";
import type { Take } from "./take.ts";

const DATABASE = "mediant";
const TAKES = "takes";
/** Recorded sound, kept apart from takes so listing takes doesn't load every recording. */
const AUDIO = "audio";

let database: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TAKES)) db.createObjectStore(TAKES, { keyPath: "id" });
      if (!db.objectStoreNames.contains(AUDIO)) db.createObjectStore(AUDIO);
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab with a newer version of the app needs to upgrade the database: step aside.
      db.onversionchange = () => {
        db.close();
        database = undefined;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
  return database;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void database?.then((db) => db.close());
    database = undefined;
  });
}

async function run<T>(store: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = work(db.transaction(store, mode).objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const saveAudio = (id: string, blob: Blob) => run(AUDIO, "readwrite", (store) => store.put(blob, id));
export const loadAudio = (id: string) => run<Blob | undefined>(AUDIO, "readonly", (store) => store.get(id));

/**
 * Asks the browser to keep this site's storage when disk space runs low. Without it, the
 * browser can delete saved takes. Asked once there is a take worth keeping.
 */
async function keepStorage() {
  if (!navigator.storage?.persist || (await navigator.storage.persisted())) return;
  await navigator.storage.persist();
}

/** Takes saved on this device, newest first. */
export function useTakes() {
  const [takes, setTakes] = useState<Take[]>([]);

  useEffect(() => {
    run<Take[]>(TAKES, "readonly", (store) => store.getAll())
      .then((all) => setTakes(all.sort((a, b) => b.createdAt - a.createdAt)))
      .catch(() => setTakes([]));
  }, []);

  const add = useCallback((take: Take) => {
    setTakes((current) => [take, ...current]);
    void run(TAKES, "readwrite", (store) => store.put(take));
    void keepStorage();
  }, []);

  const remove = useCallback((id: string) => {
    setTakes((current) => current.filter((take) => take.id !== id));
    void run(TAKES, "readwrite", (store) => store.delete(id));
    void run(AUDIO, "readwrite", (store) => store.delete(id));
  }, []);

  return { takes, add, remove };
}
