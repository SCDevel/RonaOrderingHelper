if (window === window.parent) {
    throw 'ecat.js: should be ran in iframe!';
}

let password
let auto_mode = false;
let upc;

(async () => {
    password = (await chrome.storage.local.get("password"))["password"];

    // I don't remember if these are actually useful
    auto_mode = (await chrome.storage.local.get("auto"))["auto"];
    upc = (await chrome.storage.local.get("upc"))["upc"];
    console.log(upc);

    // login to ecat.rona.ca
    const login_form = document.getElementsByClassName("d-block")[0];
    if (login_form) {
        const login_inputs = login_form.getElementsByTagName("input");
        if (login_inputs.length >= 3) {
            imitateKeyInput(login_inputs[0], "REPLACE_ME_RONA_STORE_NUMBER");
            imitateKeyInput(login_inputs[1], "REPLACE_ME_RONA_USERNAME");
            imitateKeyInput(login_inputs[2], password);
            login_form.requestSubmit();
        } else {
            console.warn(`login_form: ${login_form}`);
        }
    }
})();


// search ecat.rona.ca when upc changes to a non-undefined
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
            const form = document.getElementsByClassName("search-box")[0]; // Get the first form
            console.log(form);

            if (form) {
                const input = form.getElementsByClassName("form-control")[0]; // Get the first input field
                console.log(input);

                const button = form.getElementsByClassName("search-btn")[0];
                console.log(button);

                if (input) {
                    imitateKeyInput(input, upc);
                    //await sleep(100);
                    form.requestSubmit(button);
                }
            }
            await chrome.storage.local.remove("trigger");
        }
    }
});

function imitateKeyInput(el, keyChar) {
    if (el) {
        const keyboardEventInit = {
            bubbles: false,
            cancelable: false,
            composed: false,
            key: '',
            code: '',
            location: 0
        };
        el.dispatchEvent(new KeyboardEvent("keydown", keyboardEventInit));
        el.value = keyChar;
        el.dispatchEvent(new KeyboardEvent("keyup", keyboardEventInit));
        el.dispatchEvent(new Event('change', {bubbles: true})); // usually not needed
    } else {
        console.log("el is null");
    }
}