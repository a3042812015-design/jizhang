const STORAGE_KEY = "payday-budget-records-v1";
const SETTLED_KEY = "payday-budget-settled-cycles-v1";
const PAYDAY = 20;

const formatter = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
});

const els = {
  form: document.querySelector("#entryForm"),
  type: document.querySelector("#typeInput"),
  amount: document.querySelector("#amountInput"),
  date: document.querySelector("#dateInput"),
  category: document.querySelector("#categoryInput"),
  note: document.querySelector("#noteInput"),
  filter: document.querySelector("#filterInput"),
  records: document.querySelector("#recordsList"),
  empty: document.querySelector("#emptyState"),
  exportButton: document.querySelector("#exportButton"),
  settleButton: document.querySelector("#settleButton"),
  todayText: document.querySelector("#todayText"),
  periodText: document.querySelector("#periodText"),
  remaining: document.querySelector("#remainingAmount"),
  remainingHint: document.querySelector("#remainingHint"),
  income: document.querySelector("#incomeAmount"),
  expense: document.querySelector("#expenseAmount"),
  savings: document.querySelector("#savingsAmount"),
  settlementText: document.querySelector("#settlementText"),
};

let records = readJson(STORAGE_KEY, []);
let settledCycles = readJson(SETTLED_KEY, []);

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  localStorage.setItem(SETTLED_KEY, JSON.stringify(settledCycles));
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, date.getDate());
}

function getCycleForDate(date) {
  const start = date.getDate() >= PAYDAY
    ? new Date(date.getFullYear(), date.getMonth(), PAYDAY)
    : new Date(date.getFullYear(), date.getMonth() - 1, PAYDAY);
  const end = addMonths(start, 1);
  end.setDate(PAYDAY - 1);
  return {
    id: toDateInputValue(start),
    start,
    end,
  };
}

function isInCycle(record, cycle) {
  const date = parseDate(record.date);
  return date >= cycle.start && date <= cycle.end;
}

function getCycleRecords(cycle) {
  return records.filter((record) => isInCycle(record, cycle));
}

function getTotals(cycle) {
  return getCycleRecords(cycle).reduce(
    (totals, record) => {
      totals[record.type] += Number(record.amount);
      return totals;
    },
    { income: 0, expense: 0 }
  );
}

function getClosedCycles() {
  const currentCycle = getCycleForDate(new Date());
  const cycleIds = new Set(records.map((record) => getCycleForDate(parseDate(record.date)).id));
  return [...cycleIds]
    .map((id) => getCycleForDate(parseDate(id)))
    .filter((cycle) => cycle.end < currentCycle.start)
    .sort((a, b) => a.start - b.start);
}

function getSavingsTotal() {
  return settledCycles.reduce((sum, cycleId) => {
    const totals = getTotals(getCycleForDate(parseDate(cycleId)));
    return sum + Math.max(totals.income - totals.expense, 0);
  }, 0);
}

function autoSettlePastCycles() {
  const ids = new Set(settledCycles);
  getClosedCycles().forEach((cycle) => ids.add(cycle.id));
  settledCycles = [...ids].sort();
  saveState();
}

function settlePastCycles() {
  autoSettlePastCycles();
  render();
}

function formatDateRange(cycle) {
  return `${toDateInputValue(cycle.start)} 至 ${toDateInputValue(cycle.end)}`;
}

function renderSummary() {
  const cycle = getCycleForDate(new Date());
  const totals = getTotals(cycle);
  const remaining = totals.income - totals.expense;
  const unsettledCount = getClosedCycles().filter((cycleItem) => !settledCycles.includes(cycleItem.id)).length;

  els.todayText.textContent = toDateInputValue(new Date());
  els.periodText.textContent = `当前账期：${formatDateRange(cycle)}`;
  els.remaining.textContent = formatter.format(remaining);
  els.remainingHint.textContent = remaining >= 0 ? "可以继续支配" : "已超出本账期收入";
  els.income.textContent = formatter.format(totals.income);
  els.expense.textContent = formatter.format(totals.expense);
  els.savings.textContent = formatter.format(getSavingsTotal());
  els.settlementText.textContent = unsettledCount
    ? `有 ${unsettledCount} 个过往账期可以结转到储蓄。`
    : "过往账期都已处理。";
}

function getVisibleRecords() {
  const filter = els.filter.value;
  const currentCycle = getCycleForDate(new Date());
  return records
    .filter((record) => {
      if (filter === "cycle") return isInCycle(record, currentCycle);
      if (filter === "all") return true;
      return record.type === filter;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

function renderRecords() {
  const visible = getVisibleRecords();
  els.records.innerHTML = "";
  els.empty.hidden = visible.length > 0;

  visible.forEach((record) => {
    const row = document.createElement("article");
    row.className = "record-row";

    const date = document.createElement("div");
    date.className = "record-date";
    date.textContent = record.date;

    const main = document.createElement("div");
    main.className = "record-main";

    const category = document.createElement("strong");
    category.textContent = record.category || (record.type === "expense" ? "消费" : "收入");

    const note = document.createElement("span");
    note.textContent = record.note || "无备注";

    const amount = document.createElement("div");
    amount.className = `record-amount ${record.type}`;
    amount.textContent = `${record.type === "expense" ? "-" : "+"}${formatter.format(record.amount)}`;

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.type = "button";
    deleteButton.title = "删除";
    deleteButton.textContent = "x";
    deleteButton.addEventListener("click", () => {
      records = records.filter((item) => item.id !== record.id);
      saveState();
      render();
    });

    main.append(category, note);
    row.append(date, main, amount, deleteButton);
    els.records.append(row);
  });
}

function render() {
  renderSummary();
  renderRecords();
}

function downloadExport() {
  const lines = [
    "日期,类型,金额,分类,备注",
    ...records
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((record) => [
        record.date,
        record.type === "expense" ? "消费" : "收入",
        record.amount,
        record.category,
        record.note,
      ].map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `记账记录-${toDateInputValue(new Date())}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

els.date.value = toDateInputValue(new Date());

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = Number(els.amount.value);
  if (!Number.isFinite(amount) || amount <= 0) return;

  records.push({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    type: els.type.value,
    amount: Math.round(amount * 100) / 100,
    date: els.date.value,
    category: els.category.value.trim(),
    note: els.note.value.trim(),
    createdAt: Date.now(),
  });

  els.amount.value = "";
  els.category.value = "";
  els.note.value = "";
  saveState();
  render();
});

els.filter.addEventListener("change", renderRecords);
els.exportButton.addEventListener("click", downloadExport);
els.settleButton.addEventListener("click", settlePastCycles);

autoSettlePastCycles();
registerServiceWorker();
render();
