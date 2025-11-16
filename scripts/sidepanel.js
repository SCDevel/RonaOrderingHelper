
document.addEventListener("DOMContentLoaded", async load_event => {
    await chrome.storage.local.set({auto: false})
    const toggle = document.getElementById("toggle");
    toggle.addEventListener("change", async e => {
        if (e.target.checked) {
            await chrome.storage.local.set({auto: true, trigger: true})
        } else {
            await chrome.storage.local.set({auto: false, trigger: undefined})
        }
    });

    const button = document.getElementById("webpage-button");
    button.addEventListener("click", async e => {
        await chrome.tabs.create({url: chrome.runtime.getURL("html/index.html")});
    })
})
