if (window !== window.parent) {
    throw 'orgill.js: should be ran in parent window!';
}

(async () => {
    let url = URL.parse(window.location.href);
    let params = url.searchParams;
    let ddlhQ = params.get("ddlhQ");
    let sku = params.get("sku");
    if (ddlhQ) {
        await chrome.storage.local.set({upc: ddlhQ});
    } else if (sku) {
        const UPC = document.getElementById("cphMainContent_ctl00_lblRetailUpc").innerText;
        await chrome.storage.local.set({upc: UPC});
    }
})();


/* TODO: Turn this into a button press
const _URL = new URL(window.location.href);
const SKU = _URL.searchParams.get("sku");
console.log(`SKU: ${SKU}`);

const UPC = document.getElementById("cphMainContent_ctl00_lblRetailUpc").innerText;
console.log(`UPC: ${UPC}`);

(async () => await chrome.storage.local.set({upc: UPC}))();
*/