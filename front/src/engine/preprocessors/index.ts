// Registry of built-in preprocessors: functions `file bytes -> table` for exports that are not tables.
// Each lives in a file named <source>_<report>.ts (e.g. nordnet_portfolio.ts). A new one needs
// an anonymised fixture and a test beside it, and is added to PREPROCESSORS below.
import type { Table } from "../types";
import { nordnetPortfolio } from "./nordnet_portfolio";

export interface Preprocessor {
  id: string;
  name: string;
  run: (bytes: Uint8Array) => Table;
}

export const PREPROCESSORS: Preprocessor[] = [{ id: "nordnet-portfolio", name: "Nordnet salkkuraportti", run: nordnetPortfolio }];

export function getPreprocessor(id: string): Preprocessor | undefined {
  return PREPROCESSORS.find((p) => p.id === id);
}
