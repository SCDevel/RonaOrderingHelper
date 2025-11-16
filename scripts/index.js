

document.addEventListener("DOMContentLoaded", async load_event => {
    document.querySelector('form#rona-password').addEventListener('submit', (async (event) => {
        await event.preventDefault(); // Prevent the default form submission

        let pass = await document.getElementById('ronaPasswordInput');
        if (pass.value.length > 8) {
            await chrome.storage.local.set({password: pass.value});
            pass.value = '';
        }
    }));

    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', async (event) => {
        if (fileInput.files.length === 1) {
            const file = fileInput.files[0];
            const reader = new FileReader();
            reader.onload = function () {
                const content = reader.result;
                const lines = content.split('\r\n');
                let newLines = [];
                let i = 0;
                let working = false;
                let InvoiceNumber;
                let PurchaseOrderNumber;
                while (i < lines.length - 1) {
                    if (lines[i].startsWith("INVOICE,,,,,,,,,,")) {
                        working = true;
                        i += 3;
                        InvoiceNumber = lines[i].split(',')[7].replace("Order: ", "");
                        i++;
                        PurchaseOrderNumber = lines[i].split(',')[7].replace("Cust PO: ", "");
                        i += 9
                    }
                    if (working) {
                        let newLine = reformatLineItem(lines[i], PurchaseOrderNumber, InvoiceNumber);
                        if (newLine === null) {
                            working = false;
                            download(PurchaseOrderNumber, newLines);
                            newLines = [];
                        } else {
                            newLines.push(newLine)
                        }
                    }

                    i++;
                }
            };
            reader.readAsText(file);
        }
    });
});

function reformatLineItem(text, PO, invoice) {
    let items = text.split(',')

    // detects if finished
    if (items[1] === "'0000000") {
        return null;
    }

    // deletes unrequired data
    items.splice(3, 3);
    items.splice(4, 2);
    items.splice(5, 1);

    // corrects data
    items[0] = '1';
    items[1] = items[1].replace("'", "OR");
    items[4] = items[4].replace("'", "");

    // inserts PO and Invoice
    items.splice(1, 0, '' + PO)
    items.splice(1, 0, '' + invoice)

    return items.join(",");

}

function download(PurchaseOrderNumber, newLines) {
    var a = window.document.createElement('a');
    a.href = window.URL.createObjectURL(new Blob([newLines.join("\r\n")], {type: 'text/csv'}));
    a.download = 'Orgill-' + PurchaseOrderNumber + '.csv';

    // Append anchor to body.
    document.body.appendChild(a);
    a.click();

    // Remove anchor from body
    document.body.removeChild(a);
}

