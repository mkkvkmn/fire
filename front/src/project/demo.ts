// Demo data: a two-adult household over the 24 months before `end`, generated so the demo is always
// current. Finnish shops and companies for fi, international ones for en. Files come in the formats a
// real bank, card company and broker export (semicolon CSV, comma CSV, balances), so the guided import
// teaches the real steps. Deterministic (seeded), no DOM.
//
// The report measures key on a few Finnish category names (sijoitusvarallisuus, ansiotulot,
// pääomatulot, osinkotulot), so those stay Finnish in both languages.
import { addMonths } from "../analytics/period";
import { defaultProfile } from "../engine/profiles";
import type { Rule, SourceProfile, Split, Target } from "../engine/types";

export type DemoLang = "fi" | "en";

export interface DemoData {
  files: { name: string; bytes: Uint8Array }[];
  profiles: SourceProfile[];
  rules: Rule[];
  splits: Split[];
  targets: Target[];
  /** First member (default) and second member. */
  members: [string, string];
  /** The profile id the guided import leaves out (the card file), and the food category. */
  guidedProfile: string;
  guidedCategory: string;
}

/** mulberry32: small seeded random numbers. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Tx {
  date: string;
  amount: number;
  who: string;
  what: string;
}

const L = {
  fi: {
    members: ["Aino", "Eero"] as [string, string],
    joint: "Yhteinen tili",
    employer1: "Kesko Oyj",
    employer2: "Wärtsilä Finland Oy",
    salary: "PALKKA",
    holiday: "LOMARAHA",
    childBenefit: ["Kela", "LAPSILISÄ"],
    housing: ["As Oy Kotikallio", "HOITOVASTIKE"],
    loanPay: ["Nordea Rahoitus", "LAINAN LYHENNYS"],
    loanInterest: ["Nordea Rahoitus", "LAINAN KORKO"],
    electricity: ["Helen Oy", "SÄHKÖLASKU"],
    phone: ["Elisa Oyj", "LASKU"],
    insurance: ["If Vahinkovakuutus", "VAKUUTUSMAKSU"],
    groceries: ["K-Citymarket", "Prisma", "S-market", "Lidl", "K-Market"],
    card: "KORTTIOSTO",
    transport: ["HSL", "Neste"],
    pharmacy: "Yliopiston Apteekki",
    daycare: ["Helsingin kaupunki", "VARHAISKASVATUSMAKSU"],
    gym: ["Elixia", "JÄSENMAKSU"],
    hobby: ["Helsingin Jalkapalloklubi", "KAUSIMAKSU"],
    car: ["Veho Huolto", "HUOLTO"],
    toInvest: ["Nordnet", "OMA SIIRTO"],
    cardBill: ["Nordea Luottokortti", "LASKUN MAKSU"],
    cardShops: [
      ["Netflix", "Streaming", 13.99],
      ["Spotify", "Streaming", 17.99],
      ["Zalando", "Clothing", 0],
      ["Verkkokauppa.com", "Electronics", 0],
      ["Fazer Café", "Restaurants", 0],
      ["Ravintola Sea Horse", "Restaurants", 0],
      ["Hesburger", "Restaurants", 0],
      ["Finnair", "Travel", 0],
      ["Stockmann", "Clothing", 0],
    ] as [string, string, number][],
    stocks: ["Nordea Bank Abp", "Sampo Oyj", "Kone Oyj", "UPM-Kymmene Oyj", "Fortum Oyj"],
    house: "Asunto",
    mortgage: "Asuntolaina",
    portfolio: "Osakesäästötili",
    funds: "Rahastot",
    files: { bank: "pankki_yhteinen.csv", card: "luottokortti.csv", divs: "osingot.csv", balances: "saldot.csv" },
    head: { bank: "Kirjauspäivä;Summa;Saaja/Maksaja;Viesti", divs: "Maksupäivä;Arvopaperi;Kpl;Summa", balances: "Päivä;Tili;Saldo" },
    profileNames: { bank: "Pankki: yhteinen tili", divs: "Osingot", balances: "Saldot kuun lopussa", card: "Luottokortti" },
    cat: {
      salary: ["ansiotulot", "palkka"],
      holiday: ["ansiotulot", "lomaraha"],
      benefit: ["tuet", "lapsilisä"],
      rent: ["asuminen", "vastike"],
      interest: ["asuminen", "lainan korko"],
      electricity: ["asuminen", "sähkö"],
      phone: ["asuminen", "puhelin ja netti"],
      insurance: ["asuminen", "vakuutukset"],
      food: ["ruoka", "ruokakauppa"],
      restaurants: ["ruoka", "ravintolat"],
      public: ["liikkuminen", "julkinen liikenne"],
      fuel: ["liikkuminen", "polttoaine"],
      health: ["terveys", "apteekki"],
      daycare: ["lapset", "päivähoito"],
      gym: ["harrastukset", "kuntosali"],
      hobby: ["lapset", "harrastukset"],
      car: ["liikkuminen", "auton huolto"],
      streaming: ["viihde", "suoratoisto"],
      clothing: ["vaatteet", ""],
      electronics: ["muut", "elektroniikka"],
      travel: ["matkat", ""],
      transfer: ["sisäinen siirto", ""],
      loan: ["lainan lyhennys", ""],
      house: ["asunto", ""],
      mortgage: ["asuntolaina", ""],
      cash: ["käteinen", "pankkitili"],
      stocks: ["sijoitusvarallisuus", "osakkeet"],
      funds: ["sijoitusvarallisuus", "rahastot"],
      dividends: ["pääomatulot", "osinkotulot"],
    },
    target: "Säästötavoite",
  },
  en: {
    members: ["Alex", "Sam"] as [string, string],
    joint: "Joint account",
    employer1: "Siemens AG",
    employer2: "Unilever plc",
    salary: "SALARY",
    holiday: "HOLIDAY PAY",
    childBenefit: ["Child benefit office", "CHILD BENEFIT"],
    housing: ["Greenhill Housing Co", "MAINTENANCE FEE"],
    loanPay: ["Home Loans Bank", "LOAN REPAYMENT"],
    loanInterest: ["Home Loans Bank", "LOAN INTEREST"],
    electricity: ["Vattenfall", "ELECTRICITY BILL"],
    phone: ["Vodafone", "INVOICE"],
    insurance: ["Allianz", "INSURANCE PREMIUM"],
    groceries: ["Lidl", "Aldi", "Carrefour", "Lidl", "Aldi"],
    card: "CARD PURCHASE",
    transport: ["City Transit", "Shell"],
    pharmacy: "Boots Pharmacy",
    daycare: ["Little Stars Nursery", "NURSERY FEE"],
    gym: ["PureGym", "MEMBERSHIP"],
    hobby: ["City Football Club", "SEASON FEE"],
    car: ["Kwik Fit", "CAR SERVICE"],
    toInvest: ["Interactive Brokers", "OWN TRANSFER"],
    cardBill: ["Visa Card", "CARD BILL PAYMENT"],
    cardShops: [
      ["Netflix", "Streaming", 13.99],
      ["Spotify", "Streaming", 17.99],
      ["H&M", "Clothing", 0],
      ["Amazon", "Electronics", 0],
      ["Starbucks", "Restaurants", 0],
      ["Pizza Express", "Restaurants", 0],
      ["McDonald's", "Restaurants", 0],
      ["Ryanair", "Travel", 0],
      ["Zara", "Clothing", 0],
    ] as [string, string, number][],
    stocks: ["Apple Inc", "Microsoft Corp", "Coca-Cola Co", "Nestlé SA", "Unilever plc"],
    house: "Home",
    mortgage: "Mortgage",
    portfolio: "Stock account",
    funds: "Index funds",
    files: { bank: "bank_joint.csv", card: "credit_card.csv", divs: "dividends.csv", balances: "balances.csv" },
    head: {
      bank: "Booking date,Amount,Payee/Payer,Message",
      divs: "Payment date,Security,Shares,Amount",
      balances: "Date,Account,Balance",
    },
    profileNames: { bank: "Bank: joint account", divs: "Dividends", balances: "Month-end balances", card: "Credit card" },
    cat: {
      salary: ["ansiotulot", "salary"],
      holiday: ["ansiotulot", "holiday pay"],
      benefit: ["benefits", "child benefit"],
      rent: ["housing", "maintenance fee"],
      interest: ["housing", "loan interest"],
      electricity: ["housing", "electricity"],
      phone: ["housing", "phone and internet"],
      insurance: ["housing", "insurance"],
      food: ["food", "groceries"],
      restaurants: ["food", "restaurants"],
      public: ["transport", "public transport"],
      fuel: ["transport", "fuel"],
      health: ["health", "pharmacy"],
      daycare: ["children", "daycare"],
      gym: ["hobbies", "gym"],
      hobby: ["children", "hobbies"],
      car: ["transport", "car service"],
      streaming: ["entertainment", "streaming"],
      clothing: ["clothing", ""],
      electronics: ["other", "electronics"],
      travel: ["travel", ""],
      transfer: ["own transfer", ""],
      loan: ["loan repayment", ""],
      house: ["home", ""],
      mortgage: ["mortgage", ""],
      cash: ["cash", "bank account"],
      stocks: ["sijoitusvarallisuus", "stocks"],
      funds: ["sijoitusvarallisuus", "index funds"],
      dividends: ["pääomatulot", "osinkotulot"],
    },
    target: "Savings target",
  },
};

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
const iso = (month: string, day: number) => `${month}-${pad(Math.min(day, daysIn(month)))}`;
const round2 = (v: number) => Math.round(v * 100) / 100;

export function demoData(lang: DemoLang, end: string): DemoData {
  const T = L[lang];
  const r = rng(lang === "fi" ? 2026 : 2027);
  const between = (a: number, b: number) => a + (b - a) * r();
  const months = Array.from({ length: 24 }, (_, i) => addMonths(end, i - 23));
  const fiNum = (v: number) => (lang === "fi" ? v.toFixed(2).replace(".", ",") : v.toFixed(2));
  const dmy = (d: string) =>
    lang === "fi" ? `${Number(d.slice(8))}.${Number(d.slice(5, 7))}.${d.slice(0, 4)}` : `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

  const bank: Tx[] = [];
  const card: { date: string; shop: string; cat: string; amount: number }[] = [];
  const divs: { date: string; stock: string; n: number; amount: number }[] = [];
  const balances: { date: string; account: string; amount: number }[] = [];

  let cash = 6200;
  let stocks = 24000;
  let funds = 18000;
  let house = 318000;
  let mortgage = -212000;
  months.forEach((m, i) => {
    const raise = 1 + 0.025 * Math.floor(i / 12);
    const add = (day: number, amount: number, who: string, what: string) => {
      bank.push({ date: iso(m, day), amount: round2(amount), who, what });
      cash += amount;
    };
    add(15, 3420 * raise, T.employer1, T.salary);
    add(25, 2960 * raise, T.employer2, T.salary);
    if (m.endsWith("-06")) add(15, 1710 * raise, T.employer1, T.holiday);
    if (m.endsWith("-07")) add(25, 1480 * raise, T.employer2, T.holiday);
    add(26, 94.88, T.childBenefit[0]!, T.childBenefit[1]!);
    add(2, -486, T.housing[0]!, T.housing[1]!);
    const interest = round2((-mortgage * 0.031) / 12);
    add(5, -interest, T.loanInterest[0]!, T.loanInterest[1]!);
    add(5, -820, T.loanPay[0]!, T.loanPay[1]!);
    const winter = [0, 1, 2, 10, 11].includes(Number(m.slice(5, 7)) - 1);
    add(12, -(winter ? between(95, 140) : between(38, 62)), T.electricity[0]!, T.electricity[1]!);
    add(18, -49.9, T.phone[0]!, T.phone[1]!);
    if (i % 3 === 0) add(20, -186.4, T.insurance[0]!, T.insurance[1]!);
    for (let w = 0; w < 5; w++) {
      const day = 2 + w * 6 + Math.floor(between(0, 3));
      if (day > daysIn(m)) continue;
      const shop = T.groceries[Math.floor(between(0, T.groceries.length))]!;
      add(day, -between(95, 190), shop, T.card);
      if (r() < 0.6) add(Math.min(daysIn(m), day + 3), -between(9, 34), T.groceries[4]!, T.card);
    }
    add(1, -64.7 * 2, T.transport[0]!, T.card);
    if (r() < 0.7) add(Math.floor(between(3, 27)), -between(55, 85), T.transport[1]!, T.card);
    if (r() < 0.5) add(Math.floor(between(3, 27)), -between(12, 48), T.pharmacy, T.card);
    if (!m.endsWith("-07")) add(8, -311, T.daycare[0]!, T.daycare[1]!);
    add(3, -2 * 49.9, T.gym[0]!, T.gym[1]!);
    add(14, -135, T.hobby[0]!, T.hobby[1]!);
    if (i % 4 === 1) add(19, -between(240, 520), T.car[0]!, T.car[1]!);
    // savings to investments and paying the card
    add(27, -1900, T.toInvest[0]!, T.toInvest[1]!);

    // credit card (first member)
    let cardTotal = 0;
    const buy = (shop: string, cat: string, amount: number, day: number) => {
      card.push({ date: iso(m, day), shop, cat, amount: round2(-amount) });
      cardTotal += round2(amount);
    };
    buy(T.cardShops[0]![0], T.cardShops[0]![1], 13.99, 9);
    buy(T.cardShops[1]![0], T.cardShops[1]![1], 17.99, 11);
    for (let k = 0; k < 9; k++) {
      const s = T.cardShops[2 + Math.floor(between(0, T.cardShops.length - 2))]!;
      const amount =
        s[1] === "Travel"
          ? r() < 0.45
            ? between(220, 640)
            : 0
          : s[1] === "Electronics"
            ? r() < 0.3
              ? between(40, 260)
              : 0
            : s[1] === "Clothing"
              ? between(25, 90)
              : between(6, 48);
      if (amount > 0) buy(s[0], s[1], amount, Math.floor(between(2, 28)));
    }
    add(22, -round2(cardTotal), T.cardBill[0]!, T.cardBill[1]!);

    // dividends: two or three payments in spring, one in autumn
    const mm = Number(m.slice(5, 7));
    if ([3, 4, 5, 10].includes(mm)) {
      const n = mm === 10 ? 1 : 2;
      for (let k = 0; k < n; k++) {
        const stock = T.stocks[(mm + k + i) % T.stocks.length]!;
        const shares = 50 + Math.floor(between(0, 150));
        divs.push({ date: iso(m, 8 + k * 9), stock, n: shares, amount: round2(shares * between(0.45, 1.6)) });
      }
    }

    // month-end balances
    stocks = stocks * (1 + between(-0.035, 0.05)) + 950;
    funds = funds * (1 + between(-0.02, 0.03)) + 950;
    house = house * (1 + between(-0.002, 0.004));
    mortgage += 820;
    const last = iso(m, 31);
    balances.push({ date: last, account: T.house, amount: Math.round(house) });
    balances.push({ date: last, account: T.mortgage, amount: Math.round(mortgage) });
    balances.push({ date: last, account: T.portfolio, amount: Math.round(stocks) });
    balances.push({ date: last, account: T.funds, amount: Math.round(funds) });
    balances.push({ date: last, account: T.joint, amount: Math.round(cash) });
  });

  const enc = (lines: string[]) => new TextEncoder().encode(lines.join("\n") + "\n");
  const delim = lang === "fi" ? ";" : ",";
  bank.sort((a, b) => a.date.localeCompare(b.date));
  card.sort((a, b) => a.date.localeCompare(b.date));
  const files = [
    { name: T.files.bank, bytes: enc([T.head.bank, ...bank.map((x) => [dmy(x.date), fiNum(x.amount), x.who, x.what].join(delim))]) },
    {
      name: T.files.card,
      bytes: enc(["Date,Merchant,Category,Amount", ...card.map((x) => [x.date, x.shop, x.cat, x.amount.toFixed(2)].join(","))]),
    },
    { name: T.files.divs, bytes: enc([T.head.divs, ...divs.map((x) => [dmy(x.date), x.stock, x.n, fiNum(x.amount)].join(delim))]) },
    {
      name: T.files.balances,
      bytes: enc([T.head.balances, ...balances.map((x) => [dmy(x.date), x.account, String(x.amount)].join(delim))]),
    },
  ];

  const dateFmt = lang === "fi" ? "%d.%m.%Y" : "%d/%m/%Y";
  const dec = lang === "fi" ? "," : ".";
  const cols = (h: string) => h.split(/[;,]/);
  const bankH = cols(T.head.bank);
  const divsH = cols(T.head.divs);
  const balH = cols(T.head.balances);
  const stem = (f: string) => f.replace(/\.csv$/, "").replace(/[.]/g, "\\.");
  const profiles: SourceProfile[] = [
    defaultProfile({
      id: "demo-bank",
      name: T.profileNames.bank,
      filePattern: stem(T.files.bank),
      account: T.joint,
      delimiter: delim,
      dateFormats: dateFmt,
      decimalSeparator: dec,
      columns: { date: bankH[0]!, amount: bankH[1]!, description: [bankH[2]!], info: [bankH[3]!] },
    }),
    defaultProfile({
      id: "demo-card",
      name: T.profileNames.card,
      filePattern: stem(T.files.card),
      account: T.profileNames.card,
      delimiter: ",",
      dateFormats: "%Y-%m-%d",
      dayFirst: false,
      decimalSeparator: ".",
      columns: { date: "Date", amount: "Amount", description: ["Merchant"], info: ["Category"] },
    }),
    defaultProfile({
      id: "demo-divs",
      name: T.profileNames.divs,
      filePattern: stem(T.files.divs),
      account: T.profileNames.divs,
      delimiter: delim,
      dateFormats: dateFmt,
      decimalSeparator: dec,
      columns: { date: divsH[0]!, amount: divsH[3]!, description: [divsH[1]!], info: [] },
    }),
    defaultProfile({
      id: "demo-balances",
      name: T.profileNames.balances,
      filePattern: stem(T.files.balances),
      account: T.profileNames.balances,
      delimiter: delim,
      dateFormats: dateFmt,
      decimalSeparator: dec,
      columns: { date: balH[0]!, amount: balH[2]!, description: [balH[1]!], info: [] },
    }),
  ];

  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").toLowerCase();
  let id = 0;
  const C = T.cat;
  const rule = (match: Partial<Pick<Rule, "account" | "description" | "info" | "amount">>, cls: string, cat: string[]): Rule => ({
    id: String(++id),
    account: match.account ?? "",
    description: match.description ?? "",
    info: match.info ?? "",
    amount: match.amount ?? "any",
    class: cls,
    category: cat[0]!,
    subCategory: cat[1] ?? "",
  });
  const rules: Rule[] = [
    rule({ info: esc(T.salary) }, "tulot", C.salary),
    rule({ info: esc(T.holiday) }, "tulot", C.holiday),
    rule({ info: esc(T.childBenefit[1]!) }, "tulot", C.benefit),
    rule({ description: esc(T.housing[0]!) }, "menot", C.rent),
    rule({ info: esc(T.loanInterest[1]!) }, "menot", C.interest),
    rule({ info: esc(T.loanPay[1]!) }, "pois", C.loan),
    rule({ description: esc(T.electricity[0]!) }, "menot", C.electricity),
    rule({ description: esc(T.phone[0]!) }, "menot", C.phone),
    rule({ description: esc(T.insurance[0]!) }, "menot", C.insurance),
    rule({ description: [...new Set(T.groceries)].map(esc).join("|") }, "menot", C.food),
    rule({ description: esc(T.transport[0]!) }, "menot", C.public),
    rule({ description: esc(T.transport[1]!) }, "menot", C.fuel),
    rule({ description: esc(T.pharmacy) }, "menot", C.health),
    rule({ description: esc(T.daycare[0]!) }, "menot", C.daycare),
    rule({ description: esc(T.gym[0]!) }, "menot", C.gym),
    rule({ description: esc(T.hobby[0]!) }, "menot", C.hobby),
    rule({ description: esc(T.car[0]!) }, "menot", C.car),
    rule({ info: esc(T.toInvest[1]!) }, "pois", C.transfer),
    rule({ info: esc(T.cardBill[1]!) }, "pois", C.transfer),
    rule({ info: "streaming" }, "menot", C.streaming),
    rule({ info: "restaurants" }, "menot", C.restaurants),
    rule({ info: "clothing" }, "menot", C.clothing),
    rule({ info: "electronics" }, "menot", C.electronics),
    rule({ info: "travel" }, "menot", C.travel),
    rule({ account: esc(T.profileNames.divs) }, "tulot", C.dividends),
    rule({ account: esc(T.profileNames.balances), description: `^${esc(T.house)}$` }, "varat", C.house),
    rule({ account: esc(T.profileNames.balances), description: esc(T.mortgage) }, "velat", C.mortgage),
    rule({ account: esc(T.profileNames.balances), description: esc(T.portfolio) }, "varat", C.stocks),
    rule({ account: esc(T.profileNames.balances), description: esc(T.funds) }, "varat", C.funds),
    rule({ account: esc(T.profileNames.balances), description: esc(T.joint) }, "varat", C.cash),
  ];

  const [m1, m2] = T.members;
  const start = `${months[0]}-01`;
  const stop = `${addMonths(end, 120)}-28`;
  const shared = [T.joint, T.profileNames.balances, T.profileNames.divs];
  const splits: Split[] = shared.flatMap((account) => [
    { start, end: stop, account, share: 0.5, owner: m1 },
    { start, end: stop, account, share: 0.5, owner: m2 },
  ]);
  const targets: Target[] = [
    { name: T.target, start, end: stop, owner: m1, monthlyAmount: 7000, class: "tulot", category: "", subCategory: "" },
    { name: T.target, start, end: stop, owner: m1, monthlyAmount: -3300, class: "menot", category: "", subCategory: "" },
  ];
  return { files, profiles, rules, splits, targets, members: T.members, guidedProfile: "demo-card", guidedCategory: C.food[0]! };
}
