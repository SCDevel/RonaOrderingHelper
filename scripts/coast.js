if (window !== window.parent) {
    throw 'coast.js: should be ran in parent window!';
}

(async () => {
    let search;

    let url = URL.parse(window.location.href);
    let params = url.searchParams;
    let split = url.pathname.split("/");
    if (split[1] === "search") {
        search = params.get("controls[1]");
    }

    if (search) {
        await chrome.storage.local.set({upc: search});
    } else if (split.length === 3) {
        const UPC = document.getElementsByClassName("product-upc")[0].children[0].children[0].innerText;
        await chrome.storage.local.set({upc: UPC});
    }
})();