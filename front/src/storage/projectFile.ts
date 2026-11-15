// Opening and saving the project file on the user's machine. Chrome and Edge use the File System
// Access API and save straight back to the picked file; other browsers open through a file input
// and save by downloading the file.
import { idbDelete, idbGet, idbSet } from "./idb";

export const EXTENSION = ".fire.sqlite";
const HANDLE_KEY = "projectFileHandle";

interface PickerWindow {
  showOpenFilePicker?: (opts?: object) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (opts?: object) => Promise<FileSystemFileHandle>;
}

interface PermissionHandle {
  queryPermission?: (d: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: "readwrite" }) => Promise<PermissionState>;
}

const PICKER_TYPES = [
  {
    description: "fire project",
    accept: { "application/vnd.sqlite3": [EXTENSION, ".sqlite"] },
  },
];

const BLOCKED_KEY = "fire.saveInPlaceBlocked";

/** An open dialog "cancelled" sooner than this was never shown. */
const PICKER_REFUSED_MS = 300;

/** Remembers that this browser blocked writing to a file the user had just picked, or refused to
 * show the open dialog (the Claude app's pane does both), so the app uses the plain file dialog
 * and saves by download from then on. */
export function markWriteBlocked(): void {
  try {
    localStorage.setItem(BLOCKED_KEY, "1");
  } catch {
    // storage blocked: the next save shows the picker again
  }
}

function writeBlocked(): boolean {
  try {
    return localStorage.getItem(BLOCKED_KEY) === "1";
  } catch {
    return false;
  }
}

export function canSaveInPlace(): boolean {
  const w = window as unknown as PickerWindow;
  return !writeBlocked() && typeof w.showOpenFilePicker === "function" && typeof w.showSaveFilePicker === "function";
}

export interface OpenedFile {
  name: string;
  bytes: Uint8Array;
  handle: FileSystemFileHandle | null;
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

/** Asks the user for a project file. Null when they cancel. */
export async function pickProjectFile(): Promise<OpenedFile | null> {
  if (canSaveInPlace()) {
    const asked = performance.now();
    try {
      const [handle] = await (window as unknown as PickerWindow).showOpenFilePicker!({ types: PICKER_TYPES, multiple: false });
      if (!handle) return null;
      const file = await handle.getFile();
      return {
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        handle,
      };
    } catch (e) {
      if (!isAbort(e)) throw e;
      // A person cannot cancel a dialog this fast: the browser refused to show it (the Claude app's
      // pane does). Remember that, and use the plain file dialog now and from now on.
      if (performance.now() - asked > PICKER_REFUSED_MS) return null;
      markWriteBlocked();
    }
  }
  const file = await pickWithInput(`${EXTENSION},.sqlite`, false).then((f) => f[0] ?? null);
  return file
    ? {
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        handle: null,
      }
    : null;
}

/** Plain file input, also used for importing source files. Resolves with [] when cancelled. */
export function pickWithInput(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.addEventListener("change", () => resolve(Array.from(input.files ?? [])), { once: true });
    input.addEventListener("cancel", () => resolve([]), { once: true });
    input.click();
  });
}

/** The browser did not let the page write to the linked file (the user said no, or was not asked). */
export class WritePermissionError extends Error {
  constructor() {
    super("permission to write the project file was not given");
  }
}

/** Asks for write access where the browser can ask. Best effort: some browsers (the Claude app's
 * pane) answer "denied" without asking, yet let the write through, so the write itself decides. */
async function askWritable(handle: FileSystemFileHandle): Promise<void> {
  const h = handle as unknown as PermissionHandle;
  try {
    if (h.queryPermission && h.requestPermission && (await h.queryPermission({ mode: "readwrite" })) !== "granted")
      await h.requestPermission({ mode: "readwrite" });
  } catch {
    // the write below tells whether access was given
  }
}

function isDenied(e: unknown): boolean {
  return e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
}

export async function writeToHandle(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<void> {
  await askWritable(handle);
  let w: FileSystemWritableFileStream;
  try {
    w = await handle.createWritable();
  } catch (e) {
    throw isDenied(e) ? new WritePermissionError() : e;
  }
  await w.write(new Blob([bytes as BlobPart]));
  await w.close();
}

/** Save as: asks for a location (Chromium) and writes there. Null when cancelled. */
export async function saveAs(bytes: Uint8Array, suggestedName: string): Promise<FileSystemFileHandle | null> {
  try {
    const handle = await (window as unknown as PickerWindow).showSaveFilePicker!({ suggestedName, types: PICKER_TYPES });
    await writeToHandle(handle, bytes);
    return handle;
  } catch (e) {
    if (isAbort(e)) return null;
    throw e;
  }
}

/** Gives the viewer the file to save; the bytes stay in the browser (a blob URL, no request). */
export function downloadFile(bytes: Uint8Array, name: string, type = "application/vnd.sqlite3"): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The handle is kept so the project can be saved in place after a reload (Chromium only). */
export async function rememberHandle(handle: FileSystemFileHandle | null): Promise<void> {
  if (handle) await idbSet(HANDLE_KEY, handle).catch(() => undefined);
  else await idbDelete(HANDLE_KEY).catch(() => undefined);
}

export async function rememberedHandle(): Promise<FileSystemFileHandle | null> {
  return (await idbGet<FileSystemFileHandle>(HANDLE_KEY).catch(() => undefined)) ?? null;
}

export function projectFileName(name: string): string {
  const base = name.trim() || "fire";
  return base.endsWith(EXTENSION) ? base : `${base.replace(/\.sqlite$/, "")}${EXTENSION}`;
}
