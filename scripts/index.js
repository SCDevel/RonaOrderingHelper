

document.addEventListener("DOMContentLoaded", async load_event => {
  document.querySelector('form#rona-password').addEventListener('submit', (async (event) => {
    await event.preventDefault(); // Prevent the default form submission

    let pass = await document.getElementById('ronaPasswordInput');
    if (pass.value.length > 8) {
      await chrome.storage.local.set({ password: pass.value });
      pass.value = '';
    }
  }));

  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (e) => {
      const csvData = e.target.result;
      const rows = csvData.split('\n').filter(row => row.trim() !== '');
      const headers = rows[0].split(',').map(h => h.trim());

      const skuIdx = headers.indexOf('SKU');
      const upcIdx = headers.indexOf('UPC+');
      const qooIdx = headers.indexOf('QOO (Stk)');
      const umIdx = headers.indexOf('U/M (Stk)');
      const costIdx = headers.indexOf('Cost (Stk)');
      const retailIdx = headers.indexOf('Current Retail');

      const inventoryMap = {};
      let rowCount = 0;

      rows.slice(1).forEach(row => {
        const columns = row.split(',');

        const sku = columns[skuIdx]?.trim();
        const upc = columns[upcIdx]?.trim();

        // Helper function to handle N/A and trailing zeros
        const formatValue = (val) => {
          const trimmed = val?.trim();
          // If empty, null, or undefined, return N/A
          if (!trimmed || trimmed === "") return "N/A";
          // Convert to number to strip trailing zeros, then back to string
          return Number(trimmed).toString();
        };

        const qoo = formatValue(columns[qooIdx]);
        const um = columns[umIdx]?.trim() || "N/A";
        const cost = formatValue(columns[costIdx]);
        const retail = formatValue(columns[retailIdx]);

        const detailString = `${qoo} ${um} @ ${cost} (${retail})`;

        if (sku && sku !== "") {
          inventoryMap[sku] = detailString;
          rowCount++;
        }
        if (upc && upc !== "" && upc !== sku) {
          inventoryMap[upc] = detailString;
        }
      });

      // Save to storage
      await chrome.storage.local.set({ inventoryData: inventoryMap });

      // Alert the user
      alert(`Success! Updated ${rowCount} items from "${file.name}".`);
      console.log("Inventory synced with details!");
    };

    reader.readAsText(file);
  });
});
