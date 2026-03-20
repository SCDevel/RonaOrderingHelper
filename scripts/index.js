import * as pdfjsLib from "./lib/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("scripts/lib/pdf.worker.min.mjs");

// ── DOM Ready ─────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {

  // ── Password form ───────────────────────────────────────────────────────
  document.querySelector("form#rona-password").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pass = document.getElementById("ronaPasswordInput");
    if (pass.value.length > 8) {
      await chrome.storage.local.set({ password: pass.value });
      pass.value = "";
    }
  });

  // ── Export form ─────────────────────────────────────────────────────────
  document.querySelector("form#export-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await exportUPCLogCSV();
  });

  // ── Inventory CSV upload ────────────────────────────────────────────────
  document.getElementById("fileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const label = document.getElementById("fileInputName");
    label.textContent = file.name;
    e.target.closest("label").classList.add("has-file");

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const rows = ev.target.result.split("\n").filter(r => r.trim());
      const headers = rows[0].split(",").map(h => h.trim());

      const idx = (name) => headers.indexOf(name);
      const skuIdx = idx("SKU");
      const upcIdx = idx("UPC+");
      const qooIdx = idx("QOO (Stk)");
      const umIdx = idx("U/M (Stk)");
      const costIdx = idx("Cost (Stk)");
      const retailIdx = idx("Current Retail");

      const fmt = (val) => {
        const t = val?.trim();
        if (!t) return "N/A";
        return Number(t).toString();
      };

      const inventoryMap = {};
      let rowCount = 0;

      rows.slice(1).forEach(row => {
        const c = row.split(",");
        const sku = c[skuIdx]?.trim();
        const upc = c[upcIdx]?.trim();
        const str = `${fmt(c[qooIdx])} ${c[umIdx]?.trim() || "N/A"} @ ${fmt(c[costIdx])} (${fmt(c[retailIdx])})`;
        if (sku) { inventoryMap[sku] = str; rowCount++; }
        if (upc && upc !== sku) inventoryMap[upc] = str;
      });

      await chrome.storage.local.set({ inventoryData: inventoryMap });
      alert(`Success! Updated ${rowCount} items from "${file.name}".`);
    };
    reader.readAsText(file);
  });

  // ── Invoice comparison ──────────────────────────────────────────────────
  let receivingCsvFile = null;
  let invoicePdfFile = null;

  const csvInput = document.getElementById("receivingCsvInput");
  const pdfInput = document.getElementById("invoicePdfInput");
  const compareBtn = document.getElementById("compareBtn");
  const statusEl = document.getElementById("compareStatus");
  const resultsEl = document.getElementById("compareResults");
  const resultsBody = document.getElementById("resultsBody");
  const summaryEl = document.getElementById("compareSummary");

  csvInput.addEventListener("change", (e) => {
    receivingCsvFile = e.target.files[0] ?? null;
    if (receivingCsvFile) {
      document.getElementById("csvInputName").textContent = receivingCsvFile.name;
      e.target.closest("label").classList.add("has-file");
    }
    updateCompareBtn();
  });

  pdfInput.addEventListener("change", (e) => {
    invoicePdfFile = e.target.files[0] ?? null;
    if (invoicePdfFile) {
      document.getElementById("pdfInputName").textContent = invoicePdfFile.name;
      e.target.closest("label").classList.add("has-file");
    }
    updateCompareBtn();
  });

  function updateCompareBtn() {
    compareBtn.disabled = !(receivingCsvFile && invoicePdfFile);
  }

  compareBtn.addEventListener("click", async () => {
    compareBtn.disabled = true;
    resultsEl.style.display = "none";
    resultsBody.innerHTML = "";
    summaryEl.innerHTML = "";

    try {
      setStatus("📄 Parsing receiving CSV…");
      const csvData = await parseCsv(receivingCsvFile);

      setStatus("📑 Extracting invoice data…");
      const invoicePages = await extractPdfPages(invoicePdfFile);

      setStatus("🔢 Parsing invoice costs…");
      const invoiceData = parseInvoiceText(invoicePages);

      setStatus("✅ Comparing…");
      renderResults(csvData, invoiceData);
      setStatus("");

    } catch (err) {
      setStatus(`❌ ${err.message}`);
      console.error(err);
    } finally {
      compareBtn.disabled = false;
    }
  });

  // ── Helpers ─────────────────────────────────────────────────────────────
  function setStatus(msg) { statusEl.textContent = msg; }
});

// ── UPC Log Export ────────────────────────────────────────────────────────────
async function exportUPCLogCSV() {
  const { upcLog } = await chrome.storage.local.get("upcLog");
  if (!upcLog) return;

  const rows = [["UPC", "QOO?", "Datetime"]];
  for (const id of upcLog.index) {
    const r = upcLog.records[id];
    rows.push([r.upc, r.value, new Date(r.datetime).toISOString()]);
  }

  const csv = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: "upc_log.csv" });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── CSV Parser ────────────────────────────────────────────────────────────────
async function parseCsv(file) {
  const text = await file.text();

  // Collapse embedded newlines inside quoted fields
  const normalized = text.replace(/"([^"]*)"/g, (_, inner) =>
    `"${inner.replace(/\r?\n/g, " ")}"`
  );

  const lines = normalized.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim().toLowerCase());

  const itemIdx = headers.findIndex(h => /description/i.test(h));
  const costIdx = headers.findIndex(h => /last extd rcvd cost/i.test(h));

  if (itemIdx === -1 || costIdx === -1) {
    throw new Error(`Could not find required columns. Found: ${headers.join(" | ")}`);
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length <= Math.max(itemIdx, costIdx)) continue;
    const item = cols[itemIdx].replace(/"/g, "").trim();
    const cost = parseDollar(cols[costIdx]);
    if (item && !isNaN(cost)) rows.push({ item, cost });
  }
  return rows;
}

function splitCsvLine(line) {
  const result = [];
  let cur = "", inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === "," && !inQuote) { result.push(cur); cur = ""; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

// ── PDF Text Extraction ───────────────────────────────────────────────────────
async function extractPdfPages(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allPages = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const lineMap = new Map();
    for (const item of textContent.items) {
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      let bucket = null;
      for (const [key] of lineMap) {
        if (Math.abs(key - y) <= 3) { bucket = key; break; }
      }
      if (bucket === null) { lineMap.set(y, []); bucket = y; }
      lineMap.get(bucket).push({ x, str: item.str.trim() });
    }

    const sorted = [...lineMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) => items.sort((a, b) => a.x - b.x).filter(i => i.str));

    allPages.push(sorted);
  }
  return allPages;
}

// ── Invoice Parser ────────────────────────────────────────────────────────────
function parseInvoiceText(pages) {
  const COL_TOLERANCE = 25;
  const results = [];

  for (const lines of pages) {
    let netAmountX = null;
    let foundHeader = false;

    for (const line of lines) {
      const lineText = line.map(i => i.str).join(" ").trim();
      if (!lineText) continue;

      if (!foundHeader) {
        if (/net\s*amount/i.test(lineText)) {
          const hit = line.find(i => /^amount$/i.test(i.str))
            ?? line.find(i => /^net\s+amount$/i.test(i.str));
          if (hit) { netAmountX = hit.x; foundHeader = true; }
        }
        continue;
      }

      // Skip visible ecofees (keep invisible ones)
      if (/visible\s*ecofee/i.test(lineText) && !/invisible/i.test(lineText)) continue;

      const netItem = line.find(i => Math.abs(i.x - netAmountX) < COL_TOLERANCE);
      if (!netItem) continue;

      const cost = parseDollar(netItem.str);
      if (isNaN(cost) || cost <= 0) continue;

      // Roll invisible ecofee into previous item
      if (/invisible\s*ecofee/i.test(lineText)) {
        if (results.length > 0) {
          results[results.length - 1].cost = parseFloat(
            (results[results.length - 1].cost + cost).toFixed(2)
          );
        }
        continue;
      }

      const desc = line
        .filter(i => i.x < netAmountX - COL_TOLERANCE)
        .map(i => i.str)
        .join(" ")
        .replace(/^[\s\-]+/, "")
        .trim();

      if (desc.length > 2) results.push({ item: desc, cost });
    }
    // Pages without a Net Amount header are silently skipped
  }

  return results;
}

// ── Result Renderer ───────────────────────────────────────────────────────────
function renderResults(csvRows, invoiceRows) {
  const remainingCsv = csvRows.map((r, i) => ({ ...r, _idx: i }));
  const remainingInv = invoiceRows.map((r, i) => ({ ...r, _idx: i }));

  // Pass 1: invoice → CSV
  for (const invRow of [...remainingInv]) {
    const csvIdx = remainingCsv.findIndex(r => Math.abs(r.cost - invRow.cost) < 0.01);
    if (csvIdx !== -1) {
      remainingCsv.splice(csvIdx, 1);
      const invIdx = remainingInv.findIndex(r => r._idx === invRow._idx);
      remainingInv.splice(invIdx, 1);
    }
  }

  // Pass 2: remaining CSV → remaining invoice
  for (const csvRow of [...remainingCsv]) {
    const invIdx = remainingInv.findIndex(r => Math.abs(r.cost - csvRow.cost) < 0.01);
    if (invIdx !== -1) {
      remainingInv.splice(invIdx, 1);
      const csvIdx = remainingCsv.findIndex(r => r._idx === csvRow._idx);
      remainingCsv.splice(csvIdx, 1);
    }
  }

  const missingFromCsv = remainingInv; // on invoice, not in CSV
  const missingFromInv = remainingCsv; // in CSV, not on invoice

  const resultsBody = document.getElementById("resultsBody");
  const summaryEl = document.getElementById("compareSummary");
  const resultsEl = document.getElementById("compareResults");

  resultsBody.innerHTML = "";

  function groupByCost(items) {
    const map = new Map();
    for (const item of items) {
      const key = item.cost.toFixed(2);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return map;
  }

  // Section: On invoice, not in CSV
  if (missingFromCsv.length > 0) {
    resultsBody.insertAdjacentHTML("beforeend", `
            <tr class="section-header">
                <td colspan="2">📄 On Invoice — Not in CSV (${missingFromCsv.length})</td>
            </tr>`);

    const grouped = groupByCost(missingFromCsv);
    for (const [costKey, group] of grouped) {
      const cost = parseFloat(costKey);
      const sameCostCsv = csvRows.filter(r => Math.abs(r.cost - cost) < 0.01);
      const tags = [
        ...group.map(r => `<span class="tag tag-invoice">${escHtml(r.item)}</span>`),
        ...sameCostCsv.map(r => `<span class="tag tag-csv">${escHtml(r.item)}</span>`)
      ].join("");
      const tr = document.createElement("tr");
      tr.classList.add("row-unmatched");
      tr.innerHTML = `<td>${tags}</td><td>${fmtDollar(cost)}</td>`;
      resultsBody.appendChild(tr);
    }
  }

  // Section: In CSV, not on invoice
  if (missingFromInv.length > 0) {
    resultsBody.insertAdjacentHTML("beforeend", `
            <tr class="section-header">
                <td colspan="2">📋 In CSV — Not on Invoice (${missingFromInv.length})</td>
            </tr>`);

    const grouped = groupByCost(missingFromInv);
    for (const [costKey, group] of grouped) {
      const cost = parseFloat(costKey);
      const sameCostInv = invoiceRows.filter(r => Math.abs(r.cost - cost) < 0.01);
      const tags = [
        ...group.map(r => `<span class="tag tag-csv">${escHtml(r.item)}</span>`),
        ...sameCostInv.map(r => `<span class="tag tag-invoice">${escHtml(r.item)}</span>`)
      ].join("");
      const tr = document.createElement("tr");
      tr.classList.add("row-unmatched");
      tr.innerHTML = `<td>${tags}</td><td>${fmtDollar(cost)}</td>`;
      resultsBody.appendChild(tr);
    }
  }

  if (missingFromCsv.length === 0 && missingFromInv.length === 0) {
    resultsBody.insertAdjacentHTML("beforeend", `
            <tr class="all-matched"><td colspan="2">✔ All items matched!</td></tr>`);
  }

  // Summary
  const csvTotal = csvRows.reduce((s, r) => s + r.cost, 0);
  const invoiceTotal = invoiceRows.reduce((s, r) => s + r.cost, 0);
  const invoiceUnmatchedTotal = missingFromCsv.reduce((s, r) => s + r.cost, 0);
  const csvUnmatchedTotal = missingFromInv.reduce((s, r) => s + r.cost, 0);

  summaryEl.innerHTML = `
        <table class="summary-table">
            <thead>
                <tr>
                    <th></th>
                    <th>Total Cost</th>
                    <th>Lines</th>
                    <th>Missing</th>
                    <th>Missing Total</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>📄 Invoice</td>
                    <td>${fmtDollar(invoiceTotal)}</td>
                    <td>${invoiceRows.length}</td>
                    <td class="${missingFromCsv.length ? "highlight-cell" : ""}">${missingFromCsv.length}</td>
                    <td class="${missingFromCsv.length ? "highlight-cell" : ""}">${fmtDollar(invoiceUnmatchedTotal)}</td>
                </tr>
                <tr>
                    <td>📋 CSV</td>
                    <td>${fmtDollar(csvTotal)}</td>
                    <td>${csvRows.length}</td>
                    <td class="${missingFromInv.length ? "highlight-cell" : ""}">${missingFromInv.length}</td>
                    <td class="${missingFromInv.length ? "highlight-cell" : ""}">${fmtDollar(csvUnmatchedTotal)}</td>
                </tr>
            </tbody>
        </table>`;

  resultsEl.style.display = "block";
}

// ── Shared Helpers ────────────────────────────────────────────────────────────
function parseDollar(str) {
  return parseFloat(String(str).replace(/[$,\s]/g, ""));
}

function fmtDollar(n) {
  return "$" + Math.abs(n).toFixed(2);
}

function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
