const photoshop = require("photoshop");
const app = photoshop.app;
const core = photoshop.core;
const action = photoshop.action;

let out = null;
let amount = null;
let amountValue = null;

const printSetupPresets = {
  a3_positive_300: {
    label: "A3 Positive — 300 DPI",
    artworkMaxWidth: 2800,
    artworkMaxHeight: 4300,
    positionX: 50,
    positionY: 48,
  },
  a4_tile_300: {
    label: "A4 Tiled Positive — 300 DPI",
    artworkMaxWidth: 2100,
    artworkMaxHeight: 3000,
    positionX: 50,
    positionY: 48,
  },
  oversize_back_300: {
    label: "Oversize Back Print — 300 DPI",
    artworkMaxWidth: 3200,
    artworkMaxHeight: 4400,
    positionX: 50,
    positionY: 46,
  },
  chest_badge_300: {
    label: "Chest Badge — 300 DPI",
    artworkMaxWidth: 900,
    artworkMaxHeight: 900,
    positionX: 50,
    positionY: 32,
  },
  sleeve_print_300: {
    label: "Sleeve Print — 300 DPI",
    artworkMaxWidth: 850,
    artworkMaxHeight: 2200,
    positionX: 50,
    positionY: 46,
  },
};

const jobState = {
  garment: "tee",
  zone: "full_front",
  ink: "1c_dark",
  printSetup: "a3_positive_300",
  distressLevel: "level_0_clean",
};

function setStatus(msg) {
  if (out) out.textContent = msg;
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (value && typeof value.value === "number") return value.value;
  if (value && typeof value._value === "number") return value._value;
  return Number(value) || 0;
}

function readSelectValue(id, fallback) {
  const el = document.getElementById(id);
  if (!el) return fallback;
  const v = (el.value || "").toString().trim();
  return v !== "" ? v : fallback;
}

function safeTag(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "");
}

function syncJobState() {
  jobState.garment = readSelectValue("garment", jobState.garment);
  jobState.zone = readSelectValue("zone", jobState.zone);
  jobState.ink = readSelectValue("ink", jobState.ink);
  jobState.printSetup = readSelectValue("printSetup", jobState.printSetup);
  jobState.distressLevel = readSelectValue(
    "distressLevel",
    jobState.distressLevel,
  );
}

function getActivePrintSetup() {
  return (
    printSetupPresets[jobState.printSetup] || printSetupPresets.a3_positive_300
  );
}

function prepWorkingName() {
  return `03_ARTWORK_WORKING__${safeTag(jobState.garment)}__${safeTag(jobState.zone)}__${safeTag(jobState.ink)}__${safeTag(jobState.printSetup)}__${safeTag(jobState.distressLevel)}`;
}

function isPrepLayerName(name) {
  const n = String(name || "");
  return n.includes("__PREP__") || n.includes("PLACEMENT_WORKING");
}

async function findTopGroupByName(doc, name) {
  const layers = doc.layers || [];
  for (const l of layers) {
    if (l.kind === "group" && l.name === name) return l;
  }
  return null;
}

async function findChildGroupByName(parentGroup, name) {
  const layers = parentGroup.layers || [];
  for (const l of layers) {
    if (l.kind === "group" && l.name === name) return l;
  }
  return null;
}

async function createChildGroup(doc, parentGroup, name, constants) {
  const g = await doc.createLayerGroup({ name });
  g.move(parentGroup, constants.ElementPlacement.PLACEINSIDE);
  return g;
}

async function getOrCreateRootPrep(doc) {
  const existing = await findTopGroupByName(doc, "PRINT_PREP");
  if (existing) return existing;
  return await doc.createLayerGroup({ name: "PRINT_PREP" });
}

async function getOrCreateChildGroup(doc, parentGroup, name, constants) {
  const existing = await findChildGroupByName(parentGroup, name);
  if (existing) return existing;
  return await createChildGroup(doc, parentGroup, name, constants);
}

async function removeGroupChildren(group) {
  const children = group.layers ? [...group.layers] : [];
  for (const c of children) {
    await c.delete();
  }
}

async function getOrCreateWorkingGroup(doc, prepRoot, constants) {
  await getOrCreateChildGroup(doc, prepRoot, "00_JOB_INFO", constants);
  await getOrCreateChildGroup(doc, prepRoot, "01_PLACEMENT_GUIDES", constants);
  await getOrCreateChildGroup(
    doc,
    prepRoot,
    "02_REGISTRATION_MARKS",
    constants,
  );

  let working = null;
  const kids = prepRoot.layers || [];
  for (const k of kids) {
    if (k.kind !== "group") continue;
    if (
      k.name.startsWith("03_ARTWORK_WORKING__") ||
      k.name.startsWith("03_DISTRESS_WORKING__") ||
      k.name === "03_DISTRESS_WORKING"
    ) {
      working = k;
      break;
    }
  }

  if (!working) {
    working = await createChildGroup(
      doc,
      prepRoot,
      prepWorkingName(),
      constants,
    );
  } else {
    working.name = prepWorkingName();
  }

  return working;
}

async function runPrep({ rebuild }) {
  syncJobState();

  const garment = jobState.garment;
  const zone = jobState.zone;
  const ink = jobState.ink;
  const setup = getActivePrintSetup();

  await core.executeAsModal(
    async () => {
      const doc = app.activeDocument;
      if (!doc) throw new Error("No active document found.");

      const selectedLayers = doc.activeLayers;
      if (!selectedLayers || selectedLayers.length === 0) {
        throw new Error("No selected layers found.");
      }

      for (const s of selectedLayers) {
        if (isPrepLayerName(s.name)) {
          throw new Error(
            "You selected a PREP output layer. Select ORIGINAL artwork layer(s) first.",
          );
        }
      }

      const constants = photoshop.constants;

      // Duplicate first (so rebuild clear never deletes source before copy)
      const incoming = [];
      for (const s of selectedLayers) {
        const dup = await s.duplicate();
        dup.name = `${s.name}__PREP__${garment}__${zone}__${ink}__${jobState.distressLevel}`;
        incoming.push(dup);
      }

      // Build/rebuild working container
      const prepRoot = await getOrCreateRootPrep(doc);
      const working = await getOrCreateWorkingGroup(doc, prepRoot, constants);

      // Clear previous working content on both Run and Rebuild (single-source behavior)
      await removeGroupChildren(working);

      const placement = await createChildGroup(
        doc,
        working,
        "PLACEMENT_WORKING",
        constants,
      );

      for (const dup of incoming) {
        dup.move(placement, constants.ElementPlacement.PLACEINSIDE);
      }

      // Scale + place
      const b = placement.bounds;
      const left = toNumber(b.left);
      const right = toNumber(b.right);
      const top = toNumber(b.top);
      const bottom = toNumber(b.bottom);

      const w = right - left;
      const h = bottom - top;

      if (w > 0 && h > 0) {
        const docW = toNumber(doc.width);
        const docH = toNumber(doc.height);

        const scaleByW = setup.artworkMaxWidth / w;
        const scaleByH = setup.artworkMaxHeight / h;
        const scalePercent = Math.min(scaleByW, scaleByH) * 100;

        const curCX = left + w / 2;
        const curCY = top + h / 2;

        const targetCX = docW * (setup.positionX / 100);
        const targetCY = docH * (setup.positionY / 100);

        const dx = targetCX - curCX;
        const dy = targetCY - curCY;

        await action.batchPlay(
          [
            {
              _obj: "select",
              _target: [{ _ref: "layer", _id: placement.id }],
              makeVisible: false,
              _isCommand: true,
            },
            {
              _obj: "transform",
              _target: [
                { _ref: "layer", _enum: "ordinal", _value: "targetEnum" },
              ],
              freeTransformCenterState: {
                _enum: "quadCenterState",
                _value: "QCSAverage",
              },
              offset: {
                _obj: "offset",
                horizontal: { _unit: "pixelsUnit", _value: dx },
                vertical: { _unit: "pixelsUnit", _value: dy },
              },
              width: { _unit: "percentUnit", _value: scalePercent },
              height: { _unit: "percentUnit", _value: scalePercent },
              interfaceIconFrameDimmed: {
                _enum: "interpolationType",
                _value: "bicubicAutomatic",
              },
              _isCommand: true,
            },
          ],
          { synchronousExecution: true },
        );
      }

      // Hide original selected source
      for (const s of selectedLayers) {
        s.visible = false;
      }
    },
    { commandName: rebuild ? "Imperial Print Rebuild" : "Imperial Print Prep" },
  );

  setStatus(
    `${rebuild ? "Rebuild complete ✅" : "Prep complete ✅"}
garment: ${jobState.garment}
zone: ${jobState.zone}
ink: ${jobState.ink}
distress: ${jobState.distressLevel}
print setup: ${setup.label}
root: PRINT_PREP
working: ${prepWorkingName()}
mode: single working group, replaced each run`,
  );
}

document.addEventListener("DOMContentLoaded", () => {
  out = document.getElementById("out");
  amount = document.getElementById("amount");
  amountValue = document.getElementById("amountValue");

  if (amount && amountValue) {
    amount.addEventListener("input", () => {
      amountValue.textContent = amount.value;
    });
  }

  const watch = ["garment", "zone", "ink", "printSetup", "distressLevel"];
  for (const id of watch) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", syncJobState);
      el.addEventListener("input", syncJobState);
    }
  }

  const runPrepBtn = document.getElementById("runPrep");
  const rebuildBtn = document.getElementById("rebuildPrep");
  const previewBtn = document.getElementById("previewDistress");

  syncJobState();

  if (runPrepBtn) {
    runPrepBtn.addEventListener("click", async () => {
      try {
        await runPrep({ rebuild: false });
      } catch (e) {
        setStatus(`Prep failed ❌\n${e && e.message ? e.message : String(e)}`);
      }
    });
  }

  if (rebuildBtn) {
    rebuildBtn.addEventListener("click", async () => {
      try {
        await runPrep({ rebuild: true });
      } catch (e) {
        setStatus(
          `Rebuild failed ❌\n${e && e.message ? e.message : String(e)}`,
        );
      }
    });
  }

  if (previewBtn) {
    previewBtn.addEventListener("click", () => {
      syncJobState();
      const val = amount ? amount.value : "n/a";
      setStatus(
        `Distress preview\nlevel: ${jobState.distressLevel}\namount: ${val}`,
      );
    });
  }

  setStatus("Ready. Select ORIGINAL artwork layers, then Run Prep.");
});
