// Ready-made source profiles for common Finnish exports, equal to the v2 sample profiles in
// fixtures/v2/config/source_file_reader (a test checks that). The import wizard offers them as starting points.
import { defaultProfile } from "./profiles";
import type { SourceProfile } from "./types";

function preset(p: Partial<SourceProfile> & Pick<SourceProfile, "id" | "name" | "columns">): SourceProfile {
  return defaultProfile({ filePattern: p.name, account: p.name, ...p });
}

const one = (date: string, amount: string, description: string, info: string) => ({
  date,
  amount,
  description: [description],
  info: [info],
});

export const PRESETS: SourceProfile[] = [
  preset({
    id: "preset-s-pankki",
    name: "s-pankki",
    delimiter: ";",
    dateFormats: "%d.%m.%Y",
    columns: one("Kirjauspäivä", "Summa", "Saajan nimi", "Tapahtumalaji"),
  }),
  preset({
    id: "preset-nordea",
    name: "nordea",
    delimiter: ";",
    dateFormats: "%Y/%m/%d",
    columns: one("Kirjauspäivä", "Määrä", "Otsikko", "Maksaja"),
  }),
  preset({
    id: "preset-osingot",
    name: "osingot",
    delimiter: "\\t",
    dateFormats: "%Y-%m-%d",
    dayFirst: false,
    columns: one("Kirjauspäivä", "Summa", "Arvopaperi", "Tapahtumatyyppi"),
  }),
  preset({
    id: "preset-nordnet-salkkuraportti",
    name: "nordnet_salkkuraportti",
    filePattern: "nordnet_salkkuraportti",
    preprocessor: "nordnet-portfolio",
    delimiter: ",",
    dateFormats: "%d.%m.%Y",
    columns: one("date", "market_value", "stock", "account"),
  }),
  preset({
    id: "preset-luottokortti",
    name: "luottokortti",
    delimiter: ",",
    dateFormats: "%Y-%m-%d %H:%M:%S",
    dayFirst: false,
    decimalSeparator: ".",
    columns: one("TransactionDate", "Amount", "Text", "Merchant Category"),
  }),
  preset({
    id: "preset-penno",
    name: "penno",
    delimiter: ";",
    dateFormats: "%Y-%m-%d %H:%M:%S.%f|%Y-%m-%d %H:%M:%S",
    dayFirst: false,
    decimalSeparator: ".",
    columns: one("Päivämäärä", "Summa", "Kategoria", "Selite"),
  }),
  preset({
    id: "preset-fire-standard",
    name: "fire standard CSV",
    filePattern: "fire_",
    account: "",
    accountColumn: "account",
    delimiter: ",",
    dateFormats: "%Y-%m-%d",
    dayFirst: false,
    decimalSeparator: ".",
    columns: one("date", "amount", "description", "info"),
  }),
];
