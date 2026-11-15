// Opening and saving the project file, with a fake browser: the file pickers of Chrome and Edge, a
// browser that refuses to show them (the Claude app's pane), and browsers without them (Firefox,
// Safari), which use a plain file input and save by download.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canSaveInPlace,
  markWriteBlocked,
  pickProjectFile,
  projectFileName,
  saveAs,
  WritePermissionError,
  writeToHandle,
} from "./projectFile";

const BLOCKED_KEY = "fire.saveInPlaceBlocked";

/** localStorage as a Map; `broken` makes every call throw, as with blocked site data. */
function fakeStorage(broken = false) {
  const m = new Map<string, string>();
  const guard = () => {
    if (broken) throw new DOMException("blocked", "SecurityError");
  };
  return {
    map: m,
    getItem: (k: string) => (guard(), m.get(k) ?? null),
    setItem: (k: string, v: string) => (guard(), void m.set(k, v)),
  };
}

/** A file input that answers its click with `files`, or with a cancel when null. */
function fakeDocument(files: File[] | null) {
  const inputs: { accept: string; multiple: boolean }[] = [];
  const document = {
    createElement: () => {
      const listeners: Record<string, () => void> = {};
      const input = {
        type: "",
        accept: "",
        multiple: false,
        files: null as File[] | null,
        addEventListener: (name: string, fn: () => void) => (listeners[name] = fn),
        click: () => {
          inputs.push({ accept: input.accept, multiple: input.multiple });
          if (files) {
            input.files = files;
            listeners.change?.();
          } else listeners.cancel?.();
        },
      };
      return input;
    },
  };
  return { document, inputs };
}

function fakeHandle(name: string, bytes: number[]) {
  const written: Blob[] = [];
  return {
    written,
    name,
    getFile: async () => new File([new Uint8Array(bytes)], name),
    createWritable: vi.fn(async () => ({
      write: async (b: Blob) => void written.push(b),
      close: async () => undefined,
    })),
  };
}

const abort = () => new DOMException("The user aborted a request.", "AbortError");
const asHandle = (h: unknown) => h as FileSystemFileHandle;

let storage: ReturnType<typeof fakeStorage>;
let now: number[];

/** The browser: pickers given or left out, the file input answering with `inputFiles`. */
function browser(opts: {
  open?: () => Promise<unknown[]>;
  save?: () => Promise<unknown>;
  inputFiles?: File[] | null;
  storage?: typeof storage;
}) {
  storage = opts.storage ?? fakeStorage();
  const doc = fakeDocument(opts.inputFiles ?? null);
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("document", doc.document);
  vi.stubGlobal("window", {
    ...(opts.open ? { showOpenFilePicker: vi.fn(opts.open) } : {}),
    ...(opts.save ? { showSaveFilePicker: vi.fn(opts.save) } : {}),
  });
  return doc;
}

beforeEach(() => {
  now = [];
  vi.spyOn(performance, "now").mockImplementation(() => now.shift() ?? 0);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("opening a project file", () => {
  it("uses the browser's file picker and keeps the handle, so saving writes back to the file", async () => {
    const handle = fakeHandle("koti.fire.sqlite", [1, 2, 3]);
    const doc = browser({ open: async () => [handle], save: async () => handle });
    const opened = await pickProjectFile();
    expect(opened?.name).toBe("koti.fire.sqlite");
    expect([...opened!.bytes]).toEqual([1, 2, 3]);
    expect(opened?.handle).toBe(handle);
    expect(doc.inputs).toEqual([]);
  });

  it("does nothing when the user cancels the picker", async () => {
    now = [0, 2000];
    const doc = browser({ open: async () => Promise.reject(abort()), save: async () => null });
    expect(await pickProjectFile()).toBeNull();
    expect(doc.inputs).toEqual([]);
    expect(storage.map.has(BLOCKED_KEY)).toBe(false);
  });

  it("uses the plain file dialog on the same click when the browser refuses to show the picker", async () => {
    now = [0, 5];
    const file = new File([new Uint8Array([9])], "koti.fire.sqlite");
    const doc = browser({ open: async () => Promise.reject(abort()), save: async () => null, inputFiles: [file] });
    const opened = await pickProjectFile();
    expect(opened?.name).toBe("koti.fire.sqlite");
    expect([...opened!.bytes]).toEqual([9]);
    expect(opened?.handle).toBeNull();
    expect(doc.inputs).toEqual([{ accept: ".fire.sqlite,.sqlite", multiple: false }]);
    expect(storage.map.get(BLOCKED_KEY)).toBe("1");
  });

  it("goes straight to the plain file dialog once the browser is known to refuse", async () => {
    const file = new File([new Uint8Array([9])], "koti.fire.sqlite");
    const doc = browser({ open: async () => Promise.reject(abort()), save: async () => null, inputFiles: [file] });
    markWriteBlocked();
    expect((await pickProjectFile())?.name).toBe("koti.fire.sqlite");
    expect((window as unknown as { showOpenFilePicker: () => void }).showOpenFilePicker).not.toHaveBeenCalled();
    expect(doc.inputs).toHaveLength(1);
  });

  it("returns null when the plain file dialog is cancelled", async () => {
    browser({ inputFiles: null });
    expect(await pickProjectFile()).toBeNull();
  });

  it("uses the plain file dialog in browsers without the picker", async () => {
    const file = new File([new Uint8Array([7])], "koti.sqlite");
    const doc = browser({ inputFiles: [file] });
    expect((await pickProjectFile())?.handle).toBeNull();
    expect(doc.inputs).toHaveLength(1);
  });

  it("passes on other picker errors", async () => {
    browser({ open: async () => Promise.reject(new DOMException("busy", "NotAllowedError")), save: async () => null });
    await expect(pickProjectFile()).rejects.toThrow("busy");
  });
});

describe("saving a project file", () => {
  it("saves in place only where both pickers exist and the browser has not blocked it", () => {
    browser({ open: async () => [], save: async () => null });
    expect(canSaveInPlace()).toBe(true);
    markWriteBlocked();
    expect(canSaveInPlace()).toBe(false);
    browser({ open: async () => [] });
    expect(canSaveInPlace()).toBe(false);
  });

  it("still offers the picker when site storage is blocked", () => {
    browser({ open: async () => [], save: async () => null, storage: fakeStorage(true) });
    markWriteBlocked();
    expect(canSaveInPlace()).toBe(true);
  });

  it("writes the bytes to the picked file", async () => {
    const handle = fakeHandle("koti.fire.sqlite", []);
    await writeToHandle(asHandle(handle), new Uint8Array([4, 5]));
    expect(handle.written).toHaveLength(1);
    expect([...new Uint8Array(await handle.written[0]!.arrayBuffer())]).toEqual([4, 5]);
  });

  it("reports a refused write, so the app can download instead", async () => {
    const handle = fakeHandle("koti.fire.sqlite", []);
    handle.createWritable.mockRejectedValueOnce(new DOMException("no", "NotAllowedError"));
    await expect(writeToHandle(asHandle(handle), new Uint8Array([1]))).rejects.toBeInstanceOf(WritePermissionError);
  });

  it("returns null when the user cancels save as", async () => {
    browser({ open: async () => [], save: async () => Promise.reject(abort()) });
    expect(await saveAs(new Uint8Array([1]), "koti.fire.sqlite")).toBeNull();
  });

  it("names the file with the project extension", () => {
    expect(projectFileName("koti")).toBe("koti.fire.sqlite");
    expect(projectFileName("koti.sqlite")).toBe("koti.fire.sqlite");
    expect(projectFileName("koti.fire.sqlite")).toBe("koti.fire.sqlite");
    expect(projectFileName("  ")).toBe("fire.fire.sqlite");
  });
});
