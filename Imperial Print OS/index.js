const photoshop = require("photoshop");
const app = photoshop.app;
const core = photoshop.core;

const out = document.getElementById("out");
const amount = document.getElementById("amount");
const amountValue = document.getElementById("amountValue");

function setStatus(msg) {
  if (out) out.textContent = msg;
}

function getVal(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  return el.value;
}

if (amount && amountValue) {
  amount.addEventListener("input", () => {
    amountValue.textContent = amount.value;
  });
}

document.getElementById("runPrep").addEventListener("click", async () => {
  const garment = getVal("garment") || "unknown_garment";
  const zone = getVal("zone") || "unknown_zone";
  const ink = getVal("ink") || "unknown_ink";

  try {
    await core.executeAsModal(
      async () => {
        const doc = app.activeDocument;
        if (!doc) throw new Error("No active document found.");

        const selected = doc.activeLayers && doc.activeLayers[0];
        if (!selected) throw new Error("No selected layer found.");

        const dup = await selected.duplicate();
        dup.name = `PREP__${garment}__${zone}__${ink}`;
      },
      { commandName: "Imperial Print Prep" },
    );

    setStatus(
      `Prep complete ✅
garment: ${garment}
zone: ${zone}
ink: ${ink}`,
    );
  } catch (e) {
    setStatus(`Prep failed ❌\n${e.message}`);
  }
});

document.getElementById("previewDistress").addEventListener("click", () => {
  const level = getVal("distressLevel") || "unknown_level";
  const val = amount ? amount.value : "n/a";

  setStatus(
    `Distress preview
level: ${level}
amount: ${val}`,
  );
});
