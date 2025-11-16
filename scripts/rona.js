if (window !== window.parent) {
    throw 'rona.js: should be ran in parent window!';
}

(async () => {
    let search;

    let url = URL.parse(window.location.href);
    let params = url.searchParams;
    let split = url.pathname.split("/");
    if (split.at(-1).includes("RonaAjaxCatalogSearchView")) {
        search = params.get("keywords");
    }

    if (search) {
        await chrome.storage.local.set({upc: search});
    } else if (split[2] === "product") {
        let online = document.getElementsByClassName("page-product__online-only-tag");
        if (online.length === 0) {
            const UPC = document.getElementsByClassName("page-product__sku-infos")[0].children[0].getAttribute("content");
            await chrome.storage.local.set({upc: UPC});
        }
    }
})();