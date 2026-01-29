
document.addEventListener("DOMContentLoaded", async load_event => {
  await chrome.storage.local.set({ auto: false })
  const toggle = document.getElementById("toggle");
  toggle.addEventListener("change", async e => {
    if (e.target.checked) {
      await chrome.storage.local.set({ auto: true, trigger: true })
    } else {
      await chrome.storage.local.set({ auto: false, trigger: undefined })
    }
  });

  const button = document.getElementById("webpage-button");
  button.addEventListener("click", async e => {
    await chrome.tabs.create({ url: chrome.runtime.getURL("html/index.html") });
  })
});

(async () => {
  auto_mode = (await chrome.storage.local.get("auto"))["auto"];
  upc = (await chrome.storage.local.get("upc"))["upc"];
  console.log(upc);
})();

chrome.storage.local.onChanged.addListener(async (changes) => {
  let keys = Object.keys(changes);

  if (keys.includes("auto")) {
    auto_mode = changes.auto.newValue;
  }
  if (keys.includes("upc")) {
    upc = changes.upc.newValue;
  }

  if ((keys.includes("upc") || keys.includes("trigger")) && auto_mode) {
    if (upc !== undefined) {
      const qooValue = await getQuantity(upc);

      const container = document.querySelector('.po-item-info');
      const skuSpan = document.getElementById('item-sku');
      const qooSpan = document.getElementById('item-details');

      if (container) {
        if (qooValue !== undefined && qooValue !== null) {
          if (skuSpan) skuSpan.textContent = upc;
          if (qooSpan) qooSpan.textContent = qooValue;
          container.style.display = 'block';
        } else {
          container.style.display = 'none';
        }
      } else {
        console.warn("Inventory display container not found on this page.");
      }
    }
  }
});


async function getQuantity(searchTerm) {
  const result = await chrome.storage.local.get('inventoryData');
  const inventory = result.inventoryData;

  if (inventory && inventory[searchTerm]) {
    console.log(`The QOO for ${searchTerm} is: ${inventory[searchTerm]}`);
    return inventory[searchTerm];
  } else {
    console.log("Item not found.");
    return undefined;
  }
}
