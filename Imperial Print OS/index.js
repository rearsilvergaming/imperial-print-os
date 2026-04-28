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
    registrationOffset: 160,
    registrationSize: 150,
    registrationStroke: 10,
  },
  a4_positive_300: {
    label: "A4 Positive — 300 DPI",
    registrationOffset: 130,
    registrationSize: 135,
    registrationStroke: 9,
  },
  a4_tiled_300: {
    label: "A4 Tiled Positive — 300 DPI",
    registrationOffset: 130,
    registrationSize: 135,
    registrationStroke: 9,
  },
};

const zonePresets = {
  full_front: {
    label: "Full Front",
    artworkMaxWidth: 2800,
    artworkMaxHeight: 4300,
    positionX: 50,
    positionY: 48,
  },
  full_back: {
    label: "Full Back",
    artworkMaxWidth: 3200,
    artworkMaxHeight: 4400,
    positionX: 50,
    positionY: 46,
  },
  left_chest: {
    label: "Left Chest",
    artworkMaxWidth: 900,
    artworkMaxHeight: 900,
    positionX: 50,
    positionY: 32,
  },
  sleeve_left: {
    label: "Left Sleeve",
    artworkMaxWidth: 850,
    artworkMaxHeight: 2200,
    positionX: 50,
    positionY: 46,
  },
  sleeve_right: {
    label: "Right Sleeve",
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

function getActiveZonePreset() {
  return zonePresets[jobState.zone] || zonePresets.full_front;
}

function prepWorkingName() {
  return `03_ARTWORK_WORKING__${safeTag(jobState.garment)}__${safeTag(
    jobState.zone,
  )}__${safeTag(jobState.ink)}__${safeTag(jobState.printSetup)}__${safeTag(
    jobState.distressLevel,
  )}`;
}

function isPrepLayerName(name) {
  const n = String(name || "");
  return (
    n === "PRINT_PREP" ||
    n.includes("__PREP__") ||
    n.includes("PLACEMENT_WORKING") ||
    n.includes("REGISTRATION_MARKS") ||
    n.startsWith("00_JOB_INFO") ||
    n.startsWith("01_PLACEMENT_GUIDES") ||
    n.startsWith("02_REGISTRATION_MARKS") ||
    n.startsWith("03_ARTWORK_WORKING__") ||
    n.startsWith("03_DISTRESS_WORKING__")
  );
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

async function deleteLayerById(layerId) {
  await action.batchPlay(
    [
      {
        _obj: "delete",
        _target: [
          {
            _ref: "layer",
            _id: layerId,
          },
        ],
        _isCommand: true,
      },
    ],
    { synchronousExecution: true },
  );
}

async function clearGroupChildren(group) {
  const children = group.layers ? [...group.layers] : [];

  for (const child of children) {
    await deleteLayerById(child.id);
  }
}

async function findExistingWorkingGroup(prepRoot) {
  const children = prepRoot.layers ? [...prepRoot.layers] : [];

  for (const child of children) {
    const name = String(child.name || "");

    if (
      name.startsWith("03_ARTWORK_WORKING__") ||
      name.startsWith("03_DISTRESS_WORKING__") ||
      name === "03_DISTRESS_WORKING"
    ) {
      return child;
    }
  }

  return null;
}

async function createFreshWorkingGroup(doc, prepRoot, constants) {
  await getOrCreateChildGroup(doc, prepRoot, "00_JOB_INFO", constants);
  await getOrCreateChildGroup(doc, prepRoot, "01_PLACEMENT_GUIDES", constants);
  await getOrCreateChildGroup(
    doc,
    prepRoot,
    "02_REGISTRATION_MARKS",
    constants,
  );

  const existingWorking = await findExistingWorkingGroup(prepRoot);

  if (existingWorking) {
    existingWorking.name = prepWorkingName();
    await clearGroupChildren(existingWorking);
    return existingWorking;
  }

  return await createChildGroup(doc, prepRoot, prepWorkingName(), constants);
}

function rectSelectionCommand(left, top, right, bottom) {
  return {
    _obj: "set",
    _target: [
      {
        _ref: "channel",
        _property: "selection",
      },
    ],
    to: {
      _obj: "rectangle",
      top: {
        _unit: "pixelsUnit",
        _value: top,
      },
      left: {
        _unit: "pixelsUnit",
        _value: left,
      },
      bottom: {
        _unit: "pixelsUnit",
        _value: bottom,
      },
      right: {
        _unit: "pixelsUnit",
        _value: right,
      },
    },
    _isCommand: true,
  };
}

function fillBlackCommand() {
  return {
    _obj: "fill",
    using: {
      _enum: "fillContents",
      _value: "black",
    },
    opacity: {
      _unit: "percentUnit",
      _value: 100,
    },
    mode: {
      _enum: "blendMode",
      _value: "normal",
    },
    _isCommand: true,
  };
}

function deselectCommand() {
  return {
    _obj: "set",
    _target: [
      {
        _ref: "channel",
        _property: "selection",
      },
    ],
    to: {
      _enum: "ordinal",
      _value: "none",
    },
    _isCommand: true,
  };
}

function addCross(commands, cx, cy, size, stroke) {
  const half = size / 2;
  const halfStroke = stroke / 2;

  commands.push(
    rectSelectionCommand(
      cx - half,
      cy - halfStroke,
      cx + half,
      cy + halfStroke,
    ),
  );
  commands.push(fillBlackCommand());

  commands.push(
    rectSelectionCommand(
      cx - halfStroke,
      cy - half,
      cx + halfStroke,
      cy + half,
    ),
  );
  commands.push(fillBlackCommand());
}

async function createRegistrationMarks(doc, prepRoot, constants, setup) {
  const regGroup = await getOrCreateChildGroup(
    doc,
    prepRoot,
    "02_REGISTRATION_MARKS",
    constants,
  );

  await clearGroupChildren(regGroup);

  await action.batchPlay(
    [
      {
        _obj: "make",
        _target: [
          {
            _ref: "layer",
          },
        ],
        using: {
          _obj: "layer",
          name: `REGISTRATION_MARKS__${safeTag(jobState.printSetup)}`,
        },
        _isCommand: true,
      },
    ],
    { synchronousExecution: true },
  );

  const regLayer = app.activeDocument.activeLayers[0];
  regLayer.visible = true;
  regLayer.move(regGroup, constants.ElementPlacement.PLACEINSIDE);

  const docW = toNumber(doc.width);
  const docH = toNumber(doc.height);

  const offset = setup.registrationOffset || 150;
  const size = setup.registrationSize || 120;
  const stroke = setup.registrationStroke || 8;

  const commands = [];

  addCross(commands, offset, offset, size, stroke);
  addCross(commands, docW - offset, offset, size, stroke);
  addCross(commands, offset, docH - offset, size, stroke);
  addCross(commands, docW - offset, docH - offset, size, stroke);

  addCross(commands, docW / 2, offset, size * 0.75, stroke);
  addCross(commands, docW / 2, docH - offset, size * 0.75, stroke);

  commands.push(deselectCommand());

  await action.batchPlay(commands, { synchronousExecution: true });
}

function addRectangleOutline(commands, left, top, right, bottom, stroke) {
  commands.push(rectSelectionCommand(left, top, right, top + stroke));
  commands.push(fillBlackCommand());

  commands.push(rectSelectionCommand(left, bottom - stroke, right, bottom));
  commands.push(fillBlackCommand());

  commands.push(rectSelectionCommand(left, top, left + stroke, bottom));
  commands.push(fillBlackCommand());

  commands.push(rectSelectionCommand(right - stroke, top, right, bottom));
  commands.push(fillBlackCommand());
}

async function createPlacementGuides(doc, prepRoot, constants, zonePreset) {
  const guidesGroup = await getOrCreateChildGroup(
    doc,
    prepRoot,
    "01_PLACEMENT_GUIDES",
    constants,
  );

  await clearGroupChildren(guidesGroup);

  await action.batchPlay(
    [
      {
        _obj: "make",
        _target: [
          {
            _ref: "layer",
          },
        ],
        using: {
          _obj: "layer",
          name: `PLACEMENT_GUIDES__${safeTag(jobState.zone)}`,
        },
        _isCommand: true,
      },
    ],
    { synchronousExecution: true },
  );

  const guideLayer = app.activeDocument.activeLayers[0];
  guideLayer.visible = true;
  guideLayer.move(guidesGroup, constants.ElementPlacement.PLACEINSIDE);

  const docW = toNumber(doc.width);
  const docH = toNumber(doc.height);

  const centreX = docW * (zonePreset.positionX / 100);
  const centreY = docH * (zonePreset.positionY / 100);

  const boxW = zonePreset.artworkMaxWidth;
  const boxH = zonePreset.artworkMaxHeight;

  const left = centreX - boxW / 2;
  const right = centreX + boxW / 2;
  const top = centreY - boxH / 2;
  const bottom = centreY + boxH / 2;

  const guideStroke = 5;
  const safeStroke = 4;
  const tapeStroke = 3;
  const centreStroke = 4;

  const commands = [];

  // MAX BOUNDARY (existing)
  addRectangleOutline(commands, left, top, right, bottom, guideStroke);

  // SAFE AREA (slightly inside)
  const safeMargin = 0.9; // 90%
  const safeW = boxW * safeMargin;
  const safeH = boxH * safeMargin;

  const safeLeft = centreX - safeW / 2;
  const safeRight = centreX + safeW / 2;
  const safeTop = centreY - safeH / 2;
  const safeBottom = centreY + safeH / 2;

  addRectangleOutline(
    commands,
    safeLeft,
    safeTop,
    safeRight,
    safeBottom,
    safeStroke,
  );

  // TAPE / FRAME MARGIN (bigger than artwork)
  const tapePadding = 120; // px – adjustable later

  addRectangleOutline(
    commands,
    left - tapePadding,
    top - tapePadding,
    right + tapePadding,
    bottom + tapePadding,
    tapeStroke,
  );
  commands.push(
    rectSelectionCommand(
      centreX - centreStroke / 2,
      0,
      centreX + centreStroke / 2,
      docH,
    ),
  );
  commands.push(fillBlackCommand());

  commands.push(
    rectSelectionCommand(
      0,
      centreY - centreStroke / 2,
      docW,
      centreY + centreStroke / 2,
    ),
  );
  commands.push(fillBlackCommand());

  commands.push(deselectCommand());

  await action.batchPlay(commands, { synchronousExecution: true });

  guidesGroup.visible = false;
}

async function createJobInfo(doc, prepRoot, constants, setup, zonePreset) {
  const infoGroup = await getOrCreateChildGroup(
    doc,
    prepRoot,
    "00_JOB_INFO",
    constants,
  );

  await clearGroupChildren(infoGroup);

  const timestamp = new Date()
    .toISOString()
    .replace("T", "__")
    .replace(/:/g, "-")
    .replace(/\..+$/, "");

  const infoNames = [
    `INFO__GARMENT__${safeTag(jobState.garment)}`,
    `INFO__ZONE__${safeTag(zonePreset.label)}`,
    `INFO__INK__${safeTag(jobState.ink)}`,
    `INFO__SETUP__${safeTag(setup.label)}`,
    `INFO__DISTRESS__${safeTag(jobState.distressLevel)}`,
    `INFO__ARTWORK_MAX__${zonePreset.artworkMaxWidth}x${zonePreset.artworkMaxHeight}px`,
    `INFO__GENERATED__${timestamp}`,
  ];

  for (const name of infoNames) {
    await createChildGroup(doc, infoGroup, name, constants);
  }

  infoGroup.visible = false;
}

async function runPrep({ rebuild }) {
  syncJobState();

  const garment = jobState.garment;
  const zone = jobState.zone;
  const ink = jobState.ink;
  const setup = getActivePrintSetup();
  const zonePreset = getActiveZonePreset();

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
            "You selected a PREP output layer/group. Select ORIGINAL artwork layer(s) first.",
          );
        }
      }

      const constants = photoshop.constants;

      const prepRoot = await getOrCreateRootPrep(doc);
      await createRegistrationMarks(doc, prepRoot, constants, setup);
      await createPlacementGuides(doc, prepRoot, constants, zonePreset);
      await createJobInfo(doc, prepRoot, constants, setup, zonePreset);

      const working = await createFreshWorkingGroup(doc, prepRoot, constants);

      const placement = await createChildGroup(
        doc,
        working,
        "PLACEMENT_WORKING",
        constants,
      );

      for (const s of selectedLayers) {
        const dup = await s.duplicate();

        dup.name = `${s.name}__PREP__${garment}__${zone}__${ink}__${jobState.distressLevel}`;
        dup.visible = true;
        dup.move(placement, constants.ElementPlacement.PLACEINSIDE);
      }

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

        const scaleByW = zonePreset.artworkMaxWidth / w;
        const scaleByH = zonePreset.artworkMaxHeight / h;
        const scalePercent = Math.min(scaleByW, scaleByH) * 100;

        const curCX = left + w / 2;
        const curCY = top + h / 2;

        const targetCX = docW * (zonePreset.positionX / 100);
        const targetCY = docH * (zonePreset.positionY / 100);

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

      for (const s of selectedLayers) {
        s.visible = false;
      }
    },
    { commandName: rebuild ? "Imperial Print Rebuild" : "Imperial Print Prep" },
  );

  setStatus(
    `${rebuild ? "Rebuild complete ✅" : "Prep complete ✅"}
garment: ${jobState.garment}
zone: ${zonePreset.label}
ink: ${jobState.ink}
distress: ${jobState.distressLevel}
print setup: ${setup.label}
artwork max: ${zonePreset.artworkMaxWidth} x ${zonePreset.artworkMaxHeight}
registration: ${setup.registrationSize}px / stroke ${setup.registrationStroke}px
root: PRINT_PREP
marks: 02_REGISTRATION_MARKS
guides: 01_PLACEMENT_GUIDES hidden by default
working: ${prepWorkingName()}
mode: film marks + zone placement guides`,
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
  const toggleBtn = document.getElementById("toggleOriginals");
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
        `Distress preview
level: ${jobState.distressLevel}
amount: ${val}`,
      );
    });
  }

  if (toggleBtn) {
    toggleBtn.addEventListener("click", async () => {
      try {
        await core.executeAsModal(async () => {
          const doc = app.activeDocument;
          if (!doc) return;

          const allLayers = doc.layers || [];

          function isPrep(name) {
            return (
              name === "PRINT_PREP" ||
              name.includes("__PREP__") ||
              name.includes("PLACEMENT_WORKING") ||
              name.includes("REGISTRATION_MARKS") ||
              name.startsWith("00_") ||
              name.startsWith("01_") ||
              name.startsWith("02_") ||
              name.startsWith("03_")
            );
          }

          async function toggleGroup(layers) {
            for (const layer of layers) {
              if (layer.kind === "group") {
                await toggleGroup(layer.layers || []);
                continue;
              }

              if (!isPrep(layer.name)) {
                layer.visible = !layer.visible;
              }
            }
          }

          await toggleGroup(allLayers);
        });

        setStatus("Toggled original layer visibility");
      } catch (e) {
        setStatus(`Toggle failed ❌\n${e.message}`);
      }
    });
  }

  setStatus("Ready. Select ORIGINAL artwork layer(s), then run prep.");
});
