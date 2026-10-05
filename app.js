const YEAR = 2026;
const RATE = 0.15;
const KEY = "pebble-rental-tax-2026-v1";
const BACKUP_SCHEMA_VERSION = 1;
const PARSER_VERSION = "parser-v4";
const APP_BUILD_VERSION = "2026.10.05.3";

const emptyState = () => ({
  master: {
    acquisitionDate: "",
    acquisitionValue: "",
    depreciationBasis: "",
    depreciationRate: "",
    rentalStart: "",
    rentalEnd: "",
    wholeApartment: false,
    wholeApartmentKnown: false,
    rentedShare: ""
  },
  documents: [],
  payments: [],
  candidates: [],
  approvedCandidateIds: [],
  testSampleIds: [],
  commonCostStates: []
});

function normalizeState(value) {
  const base = emptyState();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("STATE_INVALID: az állapot nem objektum");
  }
  const master = value.master === undefined ? {} : value.master;
  if (!master || typeof master !== "object" || Array.isArray(master)) {
    throw new Error("STATE_MASTER_INVALID: hibás törzsadat blokk");
  }
  const arrayField = name => {
    const current = value[name];
    if (current === undefined) return [];
    if (!Array.isArray(current)) throw new Error("STATE_FIELD_INVALID: " + name);
    return current;
  };
  const objectArrayField = (name, requiredFields) => {
    const items = arrayField(name);
    items.forEach(item => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error("STATE_ITEM_INVALID: " + name);
      }
      requiredFields.forEach(field => {
        if (item[field] === undefined || item[field] === null || item[field] === "") {
          throw new Error("STATE_ITEM_FIELD_MISSING: " + name + "." + field);
        }
      });
    });
    return items;
  };
  const stringArrayField = name => {
    const items = arrayField(name);
    if (items.some(item => typeof item !== "string" || !item)) {
      throw new Error("STATE_ITEM_INVALID: " + name);
    }
    return items;
  };
  return {
    master: { ...base.master, ...master },
    documents: objectArrayField(
      "documents",
      ["documentId", "sourceName", "amount", "taxDate", "serviceStart", "serviceEnd"]
    ),
    payments: objectArrayField("payments", ["paymentId", "paidAt", "amount"]),
    candidates: objectArrayField("candidates", ["candidateId", "sourceName"]),
    approvedCandidateIds: stringArrayField("approvedCandidateIds"),
    testSampleIds: stringArrayField("testSampleIds"),
    commonCostStates: objectArrayField(
      "commonCostStates",
      ["effectiveFrom", "monthlyAmount", "sourceDocumentId"]
    )
  };
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeState(JSON.parse(raw)) : emptyState();
  } catch {
    return emptyState();
  }
}
function saveState() {
  localStorage.setItem(KEY, JSON.stringify(state));
}
function resetDocumentDerivedState() {
  state.documents = [];
  state.candidates = [];
  state.approvedCandidateIds = [];
  state.testSampleIds = [];
  state.commonCostStates = [];
}
function backupPayload() {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    state
  };
}
function parseBackupPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("BACKUP_INVALID: hibás mentési formátum");
  }
  if (value.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error("BACKUP_SCHEMA_UNSUPPORTED: nem támogatott mentési verzió");
  }
  return normalizeState(value.state);
}
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("BACKUP_FILE_MISSING: nincs kiválasztott fájl"));
      return;
    }
    if (typeof file.text === "function") {
      file.text().then(resolve).catch(() => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("BACKUP_READ_FAILED"));
        reader.readAsText(file);
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("BACKUP_READ_FAILED"));
    reader.readAsText(file);
  });
}
function huf(value) {
  return new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 }).format(value || 0);
}
function dateValue(value) {
  return value ? new Date(value + "T12:00:00") : null;
}
function daysInclusive(a, b) {
  return Math.round((b - a) / 86400000) + 1;
}
function overlapDays(start, end, left, right) {
  const a = new Date(Math.max(start, left));
  const b = new Date(Math.min(end, right));
  return b < a ? 0 : daysInclusive(a, b);
}
function quarter(dateStr) {
  const month = dateValue(dateStr).getMonth() + 1;
  return Math.floor((month - 1) / 3) + 1;
}

function missingMaster() {
  const m = state.master;
  const out = [];
  if (!m.acquisitionDate) out.push(["acquisitionDate", "Szerzés dátuma", "Az ÉCS-nyilvántartáshoz szükséges."]);
  if (!m.acquisitionValue) out.push(["acquisitionValue", "Vételár", "Az ÉCS-alap ellenőrzéséhez szükséges."]);
  if (!m.depreciationBasis) out.push(["depreciationBasis", "ÉCS-alap", "A rendszer ezt nem vezeti le automatikusan a vételárból."]);
  if (!m.depreciationRate) out.push(["depreciationRate", "ÉCS-kulcs", "A jogilag alkalmazandó kulcsot nem találjuk ki."]);
  if (!m.rentalStart) out.push(["rentalStart", "Bérbeadás kezdete", "A 2026-os időarányos ÉCS-hez szükséges."]);
  if (!m.rentalEnd) out.push(["rentalEnd", "Bérbeadás vége", "A 2026-os időarányos ÉCS-hez szükséges."]);
  if (!m.wholeApartmentKnown) out.push(["wholeApartment", "Teljes lakás bérbeadása", "Az ÉCS arányosításához szükséges."]);
  if (m.wholeApartmentKnown && !m.wholeApartment && !m.rentedShare) {
    out.push(["rentedShare", "Bérbeadott hányad", "Részleges bérbeadásnál szükséges."]);
  }
  if (m.rentalStart && m.rentalEnd && m.rentalEnd < m.rentalStart) {
    out.unshift(["rentalEnd", "Bérbeadás vége", "Nem lehet korábbi a kezdő dátumnál."]);
  }
  return out;
}

function annualDepreciation() {
  if (missingMaster().length) return 0;
  const m = state.master;
  const start = dateValue(m.rentalStart);
  const end = dateValue(m.rentalEnd);
  const ys = new Date(YEAR, 0, 1, 12);
  const ye = new Date(YEAR, 11, 31, 12);
  const rentalDays = overlapDays(start, end, ys, ye);
  const share = m.wholeApartment ? 1 : Number(m.rentedShare) / 100;
  return Math.round(Number(m.depreciationBasis) * Number(m.depreciationRate) / 100 * rentalDays / 365 * share);
}
function depreciationByQuarter() {
  const annual = annualDepreciation();
  if (!annual || missingMaster().length) return [0,0,0,0];
  const start = dateValue(state.master.rentalStart);
  const end = dateValue(state.master.rentalEnd);
  const total = overlapDays(start, end, new Date(YEAR,0,1,12), new Date(YEAR,11,31,12));
  let allocated = 0;
  return [1,2,3,4].map(q => {
    const qs = new Date(YEAR, (q - 1) * 3, 1, 12);
    const qe = new Date(YEAR, q * 3, 0, 12);
    const d = overlapDays(start, end, qs, qe);
    const value = q === 4 ? annual - allocated : Math.round(annual * d / total);
    allocated += value;
    return value;
  });
}
function allocate(doc) {
  const start = dateValue(doc.serviceStart);
  const end = dateValue(doc.serviceEnd);
  const total = daysInclusive(start, end);
  const values = Array(12).fill(0);
  let allocated = 0;
  for (let month=0; month<12; month++) {
    const ms = new Date(YEAR, month, 1, 12);
    const me = new Date(YEAR, month + 1, 0, 12);
    const d = overlapDays(start, end, ms, me);
    if (!d) continue;
    const isLast = month === end.getMonth();
    const amount = isLast ? Number(doc.amount) - allocated : Math.round(Number(doc.amount) * d / total);
    allocated += amount;
    values[month] = amount;
  }
  return values;
}
function quarterSummary() {
  const dep = depreciationByQuarter();
  const rows = [1,2,3,4].map((q,i) => ({
    quarter:q, income:0, expense:0, depreciation:dep[i], profit:0, tax:0, paid:0, delta:0
  }));
  state.documents.forEach(doc => {
    const q = quarter(doc.taxDate) - 1;
    if (doc.treatment === "TAXABLE_INCOME") rows[q].income += Number(doc.amount);
    if (doc.treatment === "DEDUCTIBLE_EXPENSE") rows[q].expense += Number(doc.amount);
  });
  state.payments.forEach(p => {
    const obligationQuarter = Number(p.obligationQuarter);
    if (obligationQuarter >= 1 && obligationQuarter <= 4) {
      rows[obligationQuarter - 1].paid += Number(p.amount);
    }
  });
  rows.forEach(r => {
    r.profit = Math.max(r.income - r.expense - r.depreciation, 0);
    r.tax = Math.round(r.profit * RATE);
    r.delta = r.tax - r.paid;
  });
  return rows;
}
function monthlySummary() {
  const rows = Array.from(
    {length:12},
    () => ({income:0, expense:0, projectedCommonCost:0, net:0})
  );
  const commonCostEvidenceIdsByMonth = Array.from({length:12}, () => new Set());
  state.documents.forEach(doc => {
    const parts = allocate(doc);
    parts.forEach((amount, month) => {
      if (doc.treatment === "TAXABLE_INCOME") rows[month].income += amount;
      if (doc.treatment === "DEDUCTIBLE_EXPENSE") {
        rows[month].expense += amount;
        if (doc.kind === "COMMON_COST_EXPENSE") {
          commonCostEvidenceIdsByMonth[month].add(doc.documentId);
          if (doc.relatedDocumentId) {
            commonCostEvidenceIdsByMonth[month].add(doc.relatedDocumentId);
          }
        }
      }
    });
  });
  commonCostStateByMonth().forEach((entry, month) => {
    if (!entry) return;
    if (commonCostEvidenceIdsByMonth[month].has(entry.sourceDocumentId)) return;
    rows[month].expense += Number(entry.monthlyAmount);
    rows[month].projectedCommonCost = Number(entry.monthlyAmount);
  });
  rows.forEach(r => r.net = r.income - r.expense);
  return rows;
}
function annualSummary() {
  return quarterSummary().reduce((a,r) => ({
    income:a.income+r.income,
    expense:a.expense+r.expense,
    depreciation:a.depreciation+r.depreciation,
    tax:a.tax+r.tax,
    paid:a.paid+r.paid,
    delta:a.delta+r.delta
  }), {income:0,expense:0,depreciation:0,tax:0,paid:0,delta:0});
}


const MONTHS_HU = {
  "január": 1, "február": 2, "március": 3, "április": 4, "május": 5, "június": 6,
  "július": 7, "augusztus": 8, "szeptember": 9, "október": 10, "november": 11, "december": 12
};

function isoFromHuDate(value) {
  const m = value && value.match(/(\d{4})[.\-](\d{2})[.\-](\d{2})/);
  return m ? m[1] + "-" + m[2] + "-" + m[3] : "";
}
function compactHuf(value) {
  return Number(String(value || "").replace(/[^\d]/g, "")) || 0;
}
function huMonthPeriod(text) {
  const m = text.match(/(\d{4})\.\s*(január|február|március|április|május|június|július|augusztus|szeptember|október|november|december)\s*[-–]\s*(január|február|március|április|május|június|július|augusztus|szeptember|október|november|december)/i);
  if (!m) return ["", ""];
  const year = Number(m[1]);
  const sm = MONTHS_HU[m[2].toLowerCase()];
  const em = MONTHS_HU[m[3].toLowerCase()];
  const start = year + "-" + String(sm).padStart(2, "0") + "-01";
  const endDay = new Date(year, em, 0).getDate();
  const end = year + "-" + String(em).padStart(2, "0") + "-" + String(endDay).padStart(2, "0");
  return [start, end];
}
function sourceKey(file) {
  return [file.name, file.size, file.lastModified].join(":");
}
function candidateId(file, suffix) {
  return sourceKey(file) + ":" + PARSER_VERSION + ":" + suffix;
}
function candidateNeedsAttention(fields) {
  const amount = Number(fields.amount || 0);
  if ((fields.documentFamily || "UNKNOWN") === "UNKNOWN") return true;
  if (amount <= 0) return true;
  if (fields.documentFamily === "COMMON_COST_STATEMENT" && amount < 1000) return true;
  return false;
}
function makeCandidate(file, mode, suffix, fields) {
  const needsAttention = candidateNeedsAttention(fields);
  return {
    candidateId: candidateId(file, suffix),
    sourceKey: sourceKey(file),
    sourceName: file.name,
    mode,
    status: needsAttention ? "ATTENTION_REQUIRED" : "PENDING_REVIEW",
    confidence: needsAttention ? "LOW" : (fields.confidence || "MEDIUM"),
    documentFamily: fields.documentFamily || "UNKNOWN",
    documentId: fields.documentId || suffix,
    label: fields.label || suffix,
    amount: Number(fields.amount || 0),
    observedDate: fields.observedDate || "",
    dueDate: fields.dueDate || "",
    taxDate: fields.taxDate || "",
    serviceStart: fields.serviceStart || "",
    serviceEnd: fields.serviceEnd || "",
    kind: fields.kind || "OTHER_EXPENSE",
    treatment: fields.treatment || "REVIEW_REQUIRED",
    note: fields.note || ""
  };
}
function candidateGroups(candidates) {
  const groups = [];
  const byKey = new Map();
  candidates.forEach(candidate => {
    const key = candidate.sourceKey || candidate.sourceName;
    if (!byKey.has(key)) {
      const group = {key, sourceName:candidate.sourceName, candidates:[]};
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).candidates.push(candidate);
  });
  return groups;
}
function familyLabel(value) {
  return ({
    RENTAL_INVOICE:"Bérleti számla",
    UTILITY_BUNDLE:"Közüzemi számlacsomag",
    COMMON_COST_STATEMENT:"Közös költség elszámolás",
    UNKNOWN:"Nem felismert dokumentum"
  })[value] || value;
}
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("FILE_MISSING: nincs kiválasztott fájl"));
      return;
    }
    const useReader = () => {
      const reader = new FileReader();
      reader.onload = () => {
        if (!(reader.result instanceof ArrayBuffer)) {
          reject(new Error("FILE_READ_INVALID_RESULT: a fájl nem ArrayBufferként olvasható"));
          return;
        }
        resolve(reader.result);
      };
      reader.onerror = () => reject(new Error("FILE_READ_FAILED: " + (reader.error?.message || "ismeretlen FileReader hiba")));
      reader.onabort = () => reject(new Error("FILE_READ_ABORTED: a fájl olvasása megszakadt"));
      try {
        reader.readAsArrayBuffer(file);
      } catch (err) {
        reject(new Error("FILE_READ_FAILED: " + (err?.message || "FileReader indítási hiba")));
      }
    };

    if (typeof file.arrayBuffer === "function") {
      file.arrayBuffer()
        .then(buffer => {
          if (!(buffer instanceof ArrayBuffer) || buffer.byteLength === 0) {
            useReader();
            return;
          }
          resolve(buffer);
        })
        .catch(() => useReader());
      return;
    }
    useReader();
  });
}
function validatePdfBytes(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 5) {
    throw new Error("PDF_BYTES_INVALID: üres vagy túl rövid fájl");
  }
  const head = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 8));
  const signature = String.fromCharCode(...head);
  if (!signature.startsWith("%PDF-")) {
    throw new Error("PDF_SIGNATURE_INVALID: a kiválasztott fájl nem érvényes PDF");
  }
}
async function loadPdfDocument(data) {
  if (!window.pdfjsLib) throw new Error("PDFJS_MISSING: a PDF feldolgozó könyvtár nem töltődött be.");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  try {
    return await window.pdfjsLib.getDocument({data}).promise;
  } catch (err) {
    try {
      return await window.pdfjsLib.getDocument({data, disableWorker:true}).promise;
    } catch (fallbackErr) {
      throw new Error("PDFJS_OPEN_FAILED: " + (fallbackErr?.message || err?.message || "a PDF nem nyitható meg"));
    }
  }
}
async function extractPdfText(file) {
  const buffer = await readFileAsArrayBuffer(file);
  validatePdfBytes(buffer);
  const stableCopy = buffer.slice(0);
  const pdf = await loadPdfDocument(new Uint8Array(stableCopy));
  let text = "";
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    let page;
    try {
      page = await pdf.getPage(pageNo);
    } catch (err) {
      throw new Error("PDF_PAGE_FAILED: " + pageNo + ". oldal: " + (err?.message || "oldalbetöltési hiba"));
    }
    const content = await page.getTextContent();
    let pageText = "";
    content.items.forEach(item => {
      pageText += item.str + (item.hasEOL ? "\n" : " ");
    });
    text += "\n--- PAGE " + pageNo + " ---\n" + pageText;
  }
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
}
function detectDocumentFamily(text) {
  if (/Lakásbérleti díj/i.test(text) && /SZÁMLA/i.test(text)) return "RENTAL_INVOICE";
  const utilityIds = [...new Set(text.match(/(?:FVV|FCS)\/\d+/g) || [])];
  const utilityLeafCue = /Fizetendő összeg:?\s*[0-9 ]+\s*Ft/i.test(text) &&
    /Elszámolási időszak:/i.test(text);
  if (utilityIds.length >= 2 || (utilityIds.length >= 1 && utilityLeafCue)) return "UTILITY_BUNDLE";
  if (/Teljes elszámolás/i.test(text) && /Közösköltség/i.test(text) && /Felúj\.\s*alap/i.test(text)) return "COMMON_COST_STATEMENT";
  return "UNKNOWN";
}
function findLineAmount(text, label) {
  const re = new RegExp(label + "[^\\n]*?AAM\\s+0\\s+([0-9][0-9 ]*)", "i");
  const m = text.match(re);
  return m ? compactHuf(m[1]) : 0;
}
function parseRentalInvoice(text, file, mode) {
  const inv = (text.match(/Sorszám:\s*([A-Z0-9/-]+)/i) || [,""])[1];
  const observedDate = isoFromHuDate(
    (text.match(/Teljesítés dátuma:\s*([0-9.\-]+)/i) || [,""])[1]
  );
  const [serviceStart, serviceEnd] = huMonthPeriod(text);
  const out = [];
  const rent = findLineAmount(text, "Lakásbérleti díj");
  const common = findLineAmount(text, "Közös költség");
  const utility = findLineAmount(text, "Közüzemi díjak");
  if (rent) out.push(makeCandidate(file, mode, "rent", {
    documentFamily:"RENTAL_INVOICE", documentId: inv + "-RENT", label:"Lakásbérleti díj",
    amount:rent, observedDate, taxDate:"", serviceStart, serviceEnd,
    kind:"RENT_INCOME", treatment:"TAXABLE_INCOME", confidence:"HIGH",
    note:"A számla teljesítési dátuma forrásdátumként megmarad; az adózási/pénzmozgási dátumot külön add meg."
  }));
  if (common) out.push(makeCandidate(file, mode, "common-reimbursement", {
    documentFamily:"RENTAL_INVOICE", documentId: inv + "-COMMON", label:"Közös költség megtérítés",
    amount:common, observedDate, taxDate:"", serviceStart, serviceEnd,
    kind:"COMMON_COST_REIMBURSEMENT", treatment:"TAXABLE_INCOME", confidence:"HIGH",
    note:"A számla teljesítési dátuma forrásdátumként megmarad; az adózási/pénzmozgási dátumot külön add meg."
  }));
  if (utility) out.push(makeCandidate(file, mode, "utility-reimbursement", {
    documentFamily:"RENTAL_INVOICE", documentId: inv + "-UTILITY", label:"Közüzemi megtérítés",
    amount:utility, observedDate, taxDate:"", serviceStart, serviceEnd,
    kind:"UTILITY_PASS_THROUGH", treatment:"NON_TAXABLE_PASS_THROUGH",
    confidence:"HIGH",
    note:"Tényleges fogyasztással arányos közüzemi átterhelésként kezelt tétel. Ha a konstrukció ettől eltér, állítsd REVIEW_REQUIRED-ra."
  }));
  return out;
}
function bestInvoiceSegment(text, id) {
  const starts = [];
  let cursor = text.indexOf(id);
  while (cursor >= 0) {
    starts.push(cursor);
    cursor = text.indexOf(id, cursor + id.length);
  }
  let best = "";
  let bestScore = -1;
  starts.forEach(start => {
    const nextIds = [...new Set(text.match(/(?:FVV|FCS)\/\d+/g) || [])]
      .filter(other => other !== id)
      .map(other => text.indexOf(other, start + id.length))
      .filter(value => value > start);
    const end = nextIds.length ? Math.min(...nextIds) : Math.min(text.length, start + 12000);
    const segment = text.slice(start, end);
    let score = 0;
    if (/Fizetendő összeg:?\s*[0-9 ]+\s*Ft/i.test(segment)) score += 4;
    if (/Elszámolási időszak:/i.test(segment)) score += 4;
    if (/Fizetési határidő:/i.test(segment)) score += 2;
    if (/Teljesítés időpontja:/i.test(segment)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = segment;
    }
  });
  return best;
}
function parseUtilityBundle(text, file, mode) {
  const ids = [...new Set((text.match(/(?:FVV|FCS)\/\d+/g) || []))];
  const out = [];
  ids.forEach((id, i) => {
    const segment = bestInvoiceSegment(text, id) || text;
    const amountMatch = segment.match(/Fizetendő összeg:\s*([0-9 ]+)\s*Ft/i);
    const periodMatch = segment.match(/Elszámolási időszak:\s*(\d{4}\.\d{2}\.\d{2})\.?\s*[-–]\s*(\d{4}\.\d{2}\.\d{2})\.?/i);
    const completionMatch = segment.match(/Teljesítés időpontja:\s*([0-9.\-]+)/i);
    const dueMatch = segment.match(/Fizetési határidő:\s*([0-9.\-]+)/i);
    const amount = amountMatch ? compactHuf(amountMatch[1]) : 0;
    if (!amount) return;
    const isWater = id.startsWith("FVV/");
    out.push(makeCandidate(file, mode, "utility-" + i + "-" + id.replace("/","-"), {
      documentFamily:"UTILITY_BUNDLE", documentId:id, label:isWater ? "Víziközmű-szolgáltatás" : "Szennyvízelvezetés",
      amount,
      observedDate: completionMatch ? isoFromHuDate(completionMatch[1]) : "",
      dueDate: dueMatch ? isoFromHuDate(dueMatch[1]) : "",
      taxDate:"",
      serviceStart: periodMatch ? isoFromHuDate(periodMatch[1]) : "",
      serviceEnd: periodMatch ? isoFromHuDate(periodMatch[2]) : "",
      kind:"UTILITY_EXPENSE",
      treatment:"REVIEW_REQUIRED",
      confidence:"HIGH",
      note:"A terhelési összesítő kontrollösszeg; nem külön ledger-tétel. A teljesítési időpont csak forrásdátum; a pénzmozgási/adózási dátumot külön add meg."
    }));
  });
  return out;
}
function parseCommonCostStatement(text, file, mode) {
  const out = [];
  const yearMatch = text.match(/(20\d{2})\.01\.01/);
  const year = yearMatch ? Number(yearMatch[1]) : YEAR;
  text.split(/\n/).forEach(line => {
    const monthMatch = line.match(/^\s*(\d{1,2})\.\s*hó\s+(.+)$/i);
    if (!monthMatch) return;
    const month = Number(monthMatch[1]);
    if (!month || month > 12) return;
    const values = monthMatch[2].match(/\d{1,3}(?: \d{3})*/g) || [];
    if (values.length !== 4) return;
    const [commonCost, renovationFund, waterFee, total] = values.map(compactHuf);
    if (!total || commonCost + renovationFund + waterFee !== total) return;
    const start = year + "-" + String(month).padStart(2,"0") + "-01";
    const endDay = new Date(year, month, 0).getDate();
    const end = year + "-" + String(month).padStart(2,"0") + "-" + String(endDay).padStart(2,"0");
    out.push(makeCandidate(file, mode, "common-cost-" + month, {
      documentFamily:"COMMON_COST_STATEMENT",
      documentId:"COMMON-" + year + "-" + String(month).padStart(2,"0"),
      label:"Társasházi előírás — " + month + ". hó",
      amount:total,
      taxDate:"",
      serviceStart:start,
      serviceEnd:end,
      kind:"COMMON_COST_EXPENSE",
      treatment:"REVIEW_REQUIRED",
      confidence:"HIGH",
      note:"A havi összes előírás a közös költség, felújítási alap és vízdíj komponensek ellenőrzött összege. A befizetési sorokat nem párosítjuk automatikusan."
    }));
  });
  return out;
}
function parseCandidates(text, file, mode) {
  const family = detectDocumentFamily(text);
  if (family === "RENTAL_INVOICE") return parseRentalInvoice(text, file, mode);
  if (family === "UTILITY_BUNDLE") return parseUtilityBundle(text, file, mode);
  if (family === "COMMON_COST_STATEMENT") return parseCommonCostStatement(text, file, mode);
  return [makeCandidate(file, mode, "unknown", {
    documentFamily:"UNKNOWN", label:"Ismeretlen dokumentumtípus", treatment:"REVIEW_REQUIRED",
    confidence:"LOW", note:"A PDF szövege kiolvasható volt, de a dokumentumcsaládot nem ismertük fel."
  })];
}
function treatmentOptions(selected) {
  const values = [
    ["TAXABLE_INCOME","Adóköteles bevétel"],
    ["NON_TAXABLE_PASS_THROUGH","Nem adóköteles pontos közüzemi átterhelés"],
    ["DEDUCTIBLE_EXPENSE","Elszámolható költség"],
    ["NON_DEDUCTIBLE","Nem elszámolható"],
    ["REVIEW_REQUIRED","Ellenőrzést igényel"]
  ];
  return values.map(([value,label]) => '<option value="' + value + '"' + (value===selected ? " selected" : "") + '>' + label + '</option>').join("");
}
function renderCandidates() {
  const panel = document.getElementById("candidate-panel");
  const body = document.getElementById("candidate-table");
  if (!panel || !body) return;
  panel.hidden = !state.candidates.length;
  const groups = candidateGroups(state.candidates);
  const attentionCount = state.candidates.filter(c => c.status === "ATTENTION_REQUIRED").length;
  document.getElementById("candidate-count").textContent =
    groups.length + " dokumentum · " + state.candidates.length + " tétel" +
    (attentionCount ? " · " + attentionCount + " ellenőrzendő" : "");
  body.innerHTML = groups.map(group => {
    const families = [...new Set(group.candidates.map(c => familyLabel(c.documentFamily)))].join(", ");
    const header = '<tr class="candidate-group"><td colspan="9"><strong>' +
      group.sourceName + '</strong><br><span class="muted">' +
      group.candidates.length + ' tétel · ' + families + '</span></td></tr>';
    const rows = group.candidates.map(c => {
      const modeLabel = c.mode === "TEST_SAMPLE" ? "TEST" : "LIVE";
      const attention = c.status === "ATTENTION_REQUIRED";
      const disabled = c.status !== "PENDING_REVIEW" ? " disabled" : "";
      const buttonLabel = c.mode === "TEST_SAMPLE" ? "Teszt rendben" :
        (c.documentFamily === "COMMON_COST_STATEMENT" ? "Állapot jóváhagyása" : "Jóváhagyás");
      const statusLabel = attention ? "ELLENŐRZÉS SZÜKSÉGES" :
        (c.status === "PENDING_REVIEW" ? "Jóváhagyásra vár" : c.status);
      return '<tr class="' + (attention ? 'candidate-attention' : '') + '" data-candidate="' +
        c.candidateId.replace(/"/g,"&quot;") + '">' +
        '<td><strong>' + c.label + '</strong><br><span class="muted">' +
        familyLabel(c.documentFamily) + ' · ' + modeLabel + '</span>' +
        (attention ? '<br><span class="warning">' + c.note + '</span>' : '') + '</td>' +
        '<td>' + huf(c.amount) + '</td>' +
        '<td>' + (c.observedDate || "–") + '</td>' +
        '<td>' + (c.dueDate || "–") + '</td>' +
        '<td><input class="candidate-tax-date" type="date" value="' + (c.taxDate || "") + '"' + disabled + '></td>' +
        '<td>' + (c.serviceStart || "–") + ' → ' + (c.serviceEnd || "–") + '</td>' +
        '<td><select class="candidate-treatment"' + disabled + '>' + treatmentOptions(c.treatment) + '</select></td>' +
        '<td>' + statusLabel + '<br><span class="muted">' + c.confidence + '</span></td>' +
        '<td>' + (attention ? '<span class="muted">Nem jóváhagyható</span>' :
          '<button class="ghost candidate-approve"' + disabled + '>' + buttonLabel + '</button>') + '</td></tr>';
    }).join("");
    return header + rows;
  }).join("");
  body.querySelectorAll(".candidate-approve").forEach(btn => btn.addEventListener("click", approveCandidateFromRow));
}

function approveCandidateFromRow(event) {
  const row = event.currentTarget.closest("tr");
  const id = row.dataset.candidate;
  const cand = state.candidates.find(x => x.candidateId === id);
  if (!cand) return;
  cand.taxDate = row.querySelector(".candidate-tax-date").value;
  cand.treatment = row.querySelector(".candidate-treatment").value;
  if (cand.mode === "TEST_SAMPLE") {
    cand.status = "TEST_ACCEPTED";
    if (!state.testSampleIds.includes(cand.candidateId)) state.testSampleIds.push(cand.candidateId);
    saveState(); render(); return;
  }
  if (cand.documentFamily === "COMMON_COST_STATEMENT") {
    const stateChange = {
      effectiveFrom: cand.serviceStart,
      monthlyAmount: cand.amount,
      sourceName: cand.sourceName,
      sourceDocumentId: cand.documentId
    };
    if (!stateChange.effectiveFrom || !stateChange.effectiveFrom.startsWith("2026-")) {
      alert("A közös költség állapot kezdő hónapja nem állapítható meg.");
      return;
    }
    if (!addCommonCostState(stateChange)) return;
    cand.status = "APPROVED_STATE";
    if (!state.approvedCandidateIds.includes(cand.candidateId)) state.approvedCandidateIds.push(cand.candidateId);
    saveState(); render(); return;
  }
  if (cand.treatment === "REVIEW_REQUIRED") {
    alert("Válassz jóváhagyott adózási kezelést, vagy hagyd review állapotban.");
    return;
  }
  if (![cand.taxDate,cand.serviceStart,cand.serviceEnd].every(x => x && x.startsWith("2026-"))) {
    alert("LIVE_2026 tételnél az adózási dátumnak és az időszaknak 2026-osnak kell lennie.");
    return;
  }
  const doc = {
    documentId:cand.documentId, sourceName:cand.sourceName, amount:cand.amount,
    taxDate:cand.taxDate, serviceStart:cand.serviceStart, serviceEnd:cand.serviceEnd,
    kind:cand.kind, treatment:cand.treatment, relatedDocumentId:"", note:cand.note
  };
  const existing = state.documents.find(x => x.documentId === doc.documentId);
  if (existing && JSON.stringify(existing) !== JSON.stringify(doc)) {
    alert("Azonos dokumentumazonosító eltérő tartalommal már szerepel.");
    return;
  }
  if (!existing) state.documents.push(doc);
  cand.status = "APPROVED";
  if (!state.approvedCandidateIds.includes(cand.candidateId)) state.approvedCandidateIds.push(cand.candidateId);
  saveState(); render();
}


function addCommonCostState(next) {
  const existing = state.commonCostStates.find(x => x.effectiveFrom === next.effectiveFrom);
  if (existing) {
    if (JSON.stringify(existing) === JSON.stringify(next)) return true;
    alert("Erre a hónapra már van eltérő közös költség állapot. Ellenőrzés szükséges.");
    return false;
  }
  state.commonCostStates.push(next);
  state.commonCostStates.sort((a,b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return true;
}
function commonCostStateByMonth() {
  const result = Array(12).fill(null);
  const states = [...state.commonCostStates].sort((a,b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  for (let month = 1; month <= 12; month++) {
    const monthStart = YEAR + "-" + String(month).padStart(2,"0") + "-01";
    const active = states.filter(x => x.effectiveFrom <= monthStart);
    if (active.length) result[month - 1] = active[active.length - 1];
  }
  return result;
}
function renderCommonCostState() {
  const body = document.getElementById("common-cost-state-table");
  if (!body) return;
  const months = ["Jan","Feb","Már","Ápr","Máj","Jún","Júl","Aug","Szept","Okt","Nov","Dec"];
  const states = commonCostStateByMonth();
  body.innerHTML = states.map((entry,i) => {
    if (!entry) return '<tr><td>'+months[i]+'</td><td>–</td><td>–</td><td>nincs ismert adat</td></tr>';
    const exact = entry.effectiveFrom.startsWith(YEAR + "-" + String(i+1).padStart(2,"0"));
    return '<tr><td>'+months[i]+'</td><td>'+huf(entry.monthlyAmount)+'</td><td>'+entry.sourceName+'</td><td>'+(exact ? "forrásból ismert" : "utolsó ismert összeg továbbvive")+'</td></tr>';
  }).join("");
}

function renderQuestion() {
  const panel = document.getElementById("question-content");
  const missing = missingMaster();
  if (!missing.length) {
    panel.innerHTML = '<div class="question ok-state"><strong>A szükséges fix adatok rendelkezésre állnak.</strong><span>Új dokumentumnál csak az új vagy ellentmondó adatot kérjük.</span></div>';
    document.getElementById("master-status").textContent = "Törzsadatok rendben";
    return;
  }
  const [field, label, reason] = missing[0];
  panel.innerHTML = '<div class="question warning"><strong>' + label + '</strong><span>' + reason + '</span><button class="primary" id="answer-next">Megadom</button></div>';
  document.getElementById("master-status").textContent = missing.length + " fix adat hiányzik / ellenőrzendő";
  document.getElementById("answer-next").onclick = () => {
    document.querySelector('[data-tab="master"]').click();
    const input = document.querySelector('[name="' + field + '"]');
    if (input) input.focus();
  };
}
function renderMaster() {
  const f = document.getElementById("master-form");
  const m = state.master;
  f.acquisitionDate.value = m.acquisitionDate || "";
  f.acquisitionValue.value = m.acquisitionValue || "";
  f.depreciationBasis.value = m.depreciationBasis || "";
  f.depreciationRate.value = m.depreciationRate || "";
  f.rentalStart.value = m.rentalStart || "";
  f.rentalEnd.value = m.rentalEnd || "";
  f.wholeApartment.checked = !!m.wholeApartment;
  f.rentedShare.value = m.rentedShare || "";
  document.getElementById("share-wrap").style.display = m.wholeApartment ? "none" : "grid";
}
function renderDocuments() {
  const body = document.getElementById("documents-table");
  body.innerHTML = state.documents.length ? state.documents.map(d =>
    '<tr><td>'+d.documentId+'</td><td>'+d.sourceName+'</td><td>'+d.kind+'</td><td>'+huf(d.amount)+'</td><td>'+d.taxDate+'</td><td>'+d.serviceStart+' → '+d.serviceEnd+'</td><td>'+d.treatment+'</td></tr>'
  ).join("") : '<tr><td colspan="7">Még nincs dokumentum.</td></tr>';
}
function renderPayments() {
  const body = document.getElementById("payments-table");
  body.innerHTML = state.payments.length ? state.payments.map(p => {
    const q = Number(p.obligationQuarter);
    const quarterLabel = q >= 1 && q <= 4
      ? "Q" + q
      : '<span class="warning">NEGYEDÉV ELLENŐRIZENDŐ</span>';
    return '<tr><td>'+p.paymentId+'</td><td>'+quarterLabel+'</td><td>'+p.paidAt+'</td><td>'+huf(p.amount)+'</td></tr>';
  }).join("") : '<tr><td colspan="4">Még nincs rögzített befizetés.</td></tr>';
}
function renderOverview() {
  const annual = annualSummary();
  document.getElementById("annual-income").textContent = huf(annual.income);
  document.getElementById("annual-expense").textContent = huf(annual.expense);
  document.getElementById("annual-dep").textContent = missingMaster().length ? "hiányzó törzsadat" : huf(annual.depreciation);
  document.getElementById("annual-tax").textContent = huf(annual.tax);
  document.getElementById("annual-paid").textContent = huf(annual.paid);
  document.getElementById("annual-delta").textContent = huf(annual.delta);

  const deadlines = ["2026-04-12","2026-07-12","2026-10-12","2027-01-12"];
  document.getElementById("quarter-table").innerHTML = quarterSummary().map((r,i) =>
    '<tr><td>Q'+r.quarter+'</td><td>'+huf(r.income)+'</td><td>'+huf(r.expense)+'</td><td>'+huf(r.depreciation)+'</td><td>'+huf(r.profit)+'</td><td>'+huf(r.tax)+'</td><td>'+huf(r.paid)+'</td><td>'+huf(r.delta)+'</td><td>'+deadlines[i]+'</td></tr>'
  ).join("");

  const months = ["Jan","Feb","Már","Ápr","Máj","Jún","Júl","Aug","Szept","Okt","Nov","Dec"];
  const monthly = monthlySummary();
  const max = Math.max(1, ...monthly.map(r => Math.max(r.income,r.expense)));
  document.getElementById("monthly-bars").innerHTML = monthly.map((r,i) => {
    const width = Math.max(0, Math.round(Math.max(r.income,r.expense) / max * 100));
    return '<div class="bar-row"><span>'+months[i]+'</span><div class="track"><div class="fill" style="width:'+width+'%"></div></div><span>'+huf(r.net)+'</span></div>';
  }).join("");
}
function render() {
  renderQuestion(); renderMaster(); renderDocuments(); renderPayments(); renderOverview(); renderCandidates(); renderCommonCostState();
  const build = document.getElementById("build-version");
  if (build) build.textContent = APP_BUILD_VERSION + " · " + PARSER_VERSION;
}

document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
  document.querySelectorAll(".tab-view").forEach(x => x.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById(btn.dataset.tab).classList.add("active");
}));


const autoDocumentForm = document.getElementById("auto-document-form");
if (autoDocumentForm) {
  autoDocumentForm.addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const files = [...form.files.files];
    const mode = form.mode.value;
    const status = document.getElementById("auto-document-status");
    if (!files.length) return;
    status.textContent = files.length + " PDF feldolgozása…";
    let added = 0;
    const errors = [];
    for (const file of files) {
      try {
        const text = await extractPdfText(file);
        if (text.replace(/\s/g,"").length < 40) {
          errors.push(file.name + ": nincs használható szövegréteg — OCR fallback szükséges.");
          continue;
        }
        const candidates = parseCandidates(text, file, mode);
        candidates.forEach(candidate => {
          const known = state.candidates.some(x => x.candidateId === candidate.candidateId) ||
                        state.approvedCandidateIds.includes(candidate.candidateId) ||
                        state.testSampleIds.includes(candidate.candidateId);
          if (!known) { state.candidates.push(candidate); added += 1; }
        });
      } catch (err) {
        errors.push(file.name + ": " + (err.message || "feldolgozási hiba"));
      }
    }
    saveState(); render();
    status.textContent = added + " új javaslat készült." + (errors.length ? " " + errors.join(" ") : "");
    form.files.value = "";
  });
}

document.getElementById("master-form").addEventListener("submit", e => {
  e.preventDefault();
  const f = e.currentTarget;
  state.master = {
    acquisitionDate: f.acquisitionDate.value,
    acquisitionValue: f.acquisitionValue.value,
    depreciationBasis: f.depreciationBasis.value,
    depreciationRate: f.depreciationRate.value,
    rentalStart: f.rentalStart.value,
    rentalEnd: f.rentalEnd.value,
    wholeApartment: f.wholeApartment.checked,
    wholeApartmentKnown: true,
    rentedShare: f.wholeApartment.checked ? "100" : f.rentedShare.value
  };
  saveState(); render();
});

document.querySelector('[name="wholeApartment"]').addEventListener("change", e => {
  document.getElementById("share-wrap").style.display = e.target.checked ? "none" : "grid";
});

document.getElementById("document-form").addEventListener("submit", e => {
  e.preventDefault();
  const f = e.currentTarget;
  const file = f.file.files[0];
  const next = {
    documentId:f.documentId.value.trim(),
    sourceName:file ? file.name : "kézi rögzítés",
    amount:Number(f.amount.value),
    taxDate:f.taxDate.value,
    serviceStart:f.serviceStart.value,
    serviceEnd:f.serviceEnd.value,
    kind:f.kind.value,
    treatment:f.treatment.value,
    relatedDocumentId:f.relatedDocumentId.value.trim(),
    note:f.note.value.trim()
  };
  if (![next.taxDate,next.serviceStart,next.serviceEnd].every(x => x.startsWith("2026-"))) {
    alert("Ez az MVP kizárólag 2026-os tételeket kezel.");
    return;
  }
  if (next.serviceEnd < next.serviceStart) {
    alert("Az időszak vége nem lehet a kezdete előtt.");
    return;
  }
  const existing = state.documents.find(d => d.documentId === next.documentId);
  if (existing) {
    if (JSON.stringify(existing) === JSON.stringify(next)) return;
    alert("Ez a dokumentumazonosító már létezik eltérő tartalommal. Ellenőrzés szükséges.");
    return;
  }
  state.documents.push(next);
  saveState(); f.reset(); render();
});

document.getElementById("payment-form").addEventListener("submit", e => {
  e.preventDefault();
  const f = e.currentTarget;
  const next = {
    paymentId:f.paymentId.value.trim(),
    obligationQuarter:Number(f.obligationQuarter.value),
    paidAt:f.paidAt.value,
    amount:Number(f.amount.value)
  };
  if (![1,2,3,4].includes(next.obligationQuarter)) {
    alert("Érvényes 2026-os kötelezettségi negyedévet válassz.");
    return;
  }
  const valid2026 = next.paidAt.startsWith("2026-");
  const validQ4January = next.obligationQuarter === 4 && next.paidAt.startsWith("2027-01-");
  if (!valid2026 && !validQ4January) {
    alert("2026-os befizetés vagy a Q4 előleghez 2027. januári befizetés rögzíthető.");
    return;
  }
  const existing = state.payments.find(p => p.paymentId === next.paymentId);
  if (existing) {
    if (JSON.stringify(existing) === JSON.stringify(next)) return;
    alert("Ez a befizetésazonosító már létezik eltérő tartalommal.");
    return;
  }
  state.payments.push(next);
  saveState(); f.reset(); render();
});

document.getElementById("clear-docs").addEventListener("click", () => {
  if (confirm("Törlöd az összes dokumentumból származó helyi adatot? A törzsadatok és SZJA-befizetések megmaradnak.")) {
    resetDocumentDerivedState();
    saveState();
    render();
  }
});

render();