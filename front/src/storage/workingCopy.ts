// Working copy of the open project in the browser's private origin storage (OPFS, with IndexedDB
// as fallback), so a closed tab does not lose work. It never leaves the machine.
import { idbDelete, idbGet, idbSet } from "./idb";

export interface WorkingCopyMeta {
  /** Name of the project file this copy belongs to, "" for a new unsaved project. */
  fileName: string;
  /** True when the copy has changes not yet saved to the project file. */
  dirty: boolean;
  updatedAt: string;
  /** True for the sample project, which is never saved to a file. */
  sample?: boolean;
}

const DATA = "working.fire.sqlite";
const META = "working.json";

async function opfsDir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return navigator.storage && "getDirectory" in navigator.storage ? await navigator.storage.getDirectory() : null;
  } catch {
    return null;
  }
}

async function opfsWrite(dir: FileSystemDirectoryHandle, name: string, data: Uint8Array | string): Promise<boolean> {
  const handle = await dir.getFileHandle(name, { create: true });
  if (!("createWritable" in handle)) return false;
  const w = await handle.createWritable();
  await w.write(typeof data === "string" ? data : new Blob([data as BlobPart]));
  await w.close();
  return true;
}

async function opfsRead(dir: FileSystemDirectoryHandle, name: string): Promise<File | null> {
  try {
    return await (await dir.getFileHandle(name)).getFile();
  } catch {
    return null;
  }
}

export async function saveWorkingCopy(bytes: Uint8Array, meta: WorkingCopyMeta): Promise<void> {
  const dir = await opfsDir();
  if (dir) {
    try {
      if ((await opfsWrite(dir, DATA, bytes)) && (await opfsWrite(dir, META, JSON.stringify(meta)))) return;
    } catch {
      // fall through to IndexedDB
    }
  }
  await idbSet(DATA, bytes);
  await idbSet(META, meta);
}

export async function loadWorkingCopy(): Promise<{ bytes: Uint8Array; meta: WorkingCopyMeta } | null> {
  const dir = await opfsDir();
  if (dir) {
    const [data, meta] = await Promise.all([opfsRead(dir, DATA), opfsRead(dir, META)]);
    if (data && meta && data.size > 0) {
      return { bytes: new Uint8Array(await data.arrayBuffer()), meta: JSON.parse(await meta.text()) as WorkingCopyMeta };
    }
  }
  const bytes = await idbGet<Uint8Array>(DATA).catch(() => undefined);
  const meta = await idbGet<WorkingCopyMeta>(META).catch(() => undefined);
  return bytes && meta ? { bytes, meta } : null;
}

export async function clearWorkingCopy(): Promise<void> {
  const dir = await opfsDir();
  if (dir) {
    for (const name of [DATA, META]) await dir.removeEntry(name).catch(() => undefined);
  }
  await idbDelete(DATA).catch(() => undefined);
  await idbDelete(META).catch(() => undefined);
}
