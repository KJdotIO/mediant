import { useCallback, useEffect, useState } from "react";
import type { Take } from "./take.ts";

const DATABASE = "mediant";
const STORE = "takes";

let database: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = work(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Takes saved on this device, newest first. */
export function useTakes() {
  const [takes, setTakes] = useState<Take[]>([]);

  useEffect(() => {
    run<Take[]>("readonly", (store) => store.getAll())
      .then((all) => setTakes(all.sort((a, b) => b.createdAt - a.createdAt)))
      .catch(() => setTakes([]));
  }, []);

  const add = useCallback((take: Take) => {
    setTakes((current) => [take, ...current]);
    void run("readwrite", (store) => store.put(take));
  }, []);

  const remove = useCallback((id: string) => {
    setTakes((current) => current.filter((take) => take.id !== id));
    void run("readwrite", (store) => store.delete(id));
  }, []);

  return { takes, add, remove };
}
