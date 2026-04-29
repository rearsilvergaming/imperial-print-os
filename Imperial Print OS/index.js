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

const meshProfiles = {
  "43t_standard": {
    label: "43T — Standard / Bold Detail",
    minLinePx: 5,
    minTextHeightPx: 45,
  },
  "55t_detail": {
    label: "55T — Medium Detail",
    minLinePx: 4,
    minTextHeightPx: 36,
  },
  "77t_fine": {
    label: "77T — Fine Detail",
    minLinePx: 3,
    minTextHeightPx: 28,
  },
};

const jobState = {
  garment: "tee",
  zone: "full_front",
  ink: "1c_dark",
  printSetup: "a3_positive_300",
  meshProfile: "43t_standard",
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
  jobState.meshProfile = readSelectValue("meshProfile", jobState.meshProfile);
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

function getInkScreenCount(ink) {
  if (ink === "1c_dark") return 1;
  if (ink === "2c_dark") return 2;
  if (ink === "3c_dark") return 3;
  if (ink === "4c_dark") return 4;
  return 0;
}

function getActiveMeshProfile() {
  return meshProfiles[jobState.meshProfile] || meshProfiles["43t_standard"];
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

  addRectangleOutline(commands, left, top, right, bottom, guideStroke);

  const safeMargin = 0.95;
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

  const tapePadding = 120;

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

async function runPreflight() {
  syncJobState();

  const setup = getActivePrintSetup();
  const zonePreset = getActiveZonePreset();

  await core.executeAsModal(
    async () => {
      const doc = app.activeDocument;
      if (!doc) {
        throw new Error("No active document found.");
      }

      const selectedLayers = doc.activeLayers;
      if (!selectedLayers || selectedLayers.length === 0) {
        throw new Error("No selected original artwork layer(s).");
      }

      const warnings = [];
      const passes = [];

      for (const layer of selectedLayers) {
        if (isPrepLayerName(layer.name)) {
          warnings.push(
            `Selected layer "${layer.name}" looks like PREP output. Select ORIGINAL artwork instead.`,
          );
        }
      }

      if (warnings.length === 0) {
        passes.push("Selected layer(s) look like ORIGINAL artwork.");
      }

      const screenCount = getInkScreenCount(jobState.ink);
      if (screenCount <= 0) {
        warnings.push(`Unknown ink profile: ${jobState.ink}`);
      } else if (screenCount > 4) {
        warnings.push(`Ink profile exceeds 4-screen cap: ${screenCount}`);
      } else {
        passes.push(`Screen count OK: ${screenCount}/4`);
      }

      const bounds = selectedLayers[0].bounds;
      const left = toNumber(bounds.left);
      const right = toNumber(bounds.right);
      const top = toNumber(bounds.top);
      const bottom = toNumber(bounds.bottom);

      const artworkWidth = right - left;
      const artworkHeight = bottom - top;

      if (artworkWidth <= 0 || artworkHeight <= 0) {
        warnings.push("Selected artwork has empty or unreadable bounds.");
      } else {
        passes.push(
          `Artwork bounds OK: ${Math.round(artworkWidth)} x ${Math.round(
            artworkHeight,
          )} px`,
        );
      }

      if (zonePreset.artworkMaxWidth <= 0 || zonePreset.artworkMaxHeight <= 0) {
        warnings.push("Zone preset has invalid artwork max size.");
      } else {
        passes.push(
          `Zone max OK: ${zonePreset.artworkMaxWidth} x ${zonePreset.artworkMaxHeight} px`,
        );
      }

      if (
        setup.registrationSize <= 0 ||
        setup.registrationStroke <= 0 ||
        setup.registrationOffset <= 0
      ) {
        warnings.push("Registration mark settings are invalid.");
      } else {
        passes.push(
          `Registration OK: ${setup.registrationSize}px mark / ${setup.registrationStroke}px stroke`,
        );
      }

      const result =
        warnings.length === 0 ? "Preflight passed ✅" : "Preflight warnings ⚠️";

      setStatus(
        `${result}

${passes.map((p) => `✅ ${p}`).join("\n")}

${warnings.map((w) => `⚠️ ${w}`).join("\n")}`,
      );
    },
    { commandName: "Imperial Print Preflight" },
  );
}

async function runPostPrepValidation() {
  await core.executeAsModal(
    async () => {
      const doc = app.activeDocument;
      if (!doc) {
        throw new Error("No active document found.");
      }

      const prepRoot = await findTopGroupByName(doc, "PRINT_PREP");
      if (!prepRoot) {
        throw new Error("PRINT_PREP group not found. Run Prep first.");
      }

      const working = await findExistingWorkingGroup(prepRoot);
      if (!working) {
        throw new Error("No 03_ARTWORK_WORKING group found. Run Prep first.");
      }

      let placement = null;

      for (const layer of working.layers || []) {
        if (layer.kind === "group" && layer.name === "PLACEMENT_WORKING") {
          placement = layer;
          break;
        }
      }

      if (!placement) {
        throw new Error("PLACEMENT_WORKING group not found. Run Prep first.");
      }

      syncJobState();

      const zonePreset = getActiveZonePreset();
      const meshProfile = getActiveMeshProfile();

      const warnings = [];
      const passes = [];

      const docW = toNumber(doc.width);
      const docH = toNumber(doc.height);

      const centreX = docW * (zonePreset.positionX / 100);
      const centreY = docH * (zonePreset.positionY / 100);

      const maxLeft = centreX - zonePreset.artworkMaxWidth / 2;
      const maxRight = centreX + zonePreset.artworkMaxWidth / 2;
      const maxTop = centreY - zonePreset.artworkMaxHeight / 2;
      const maxBottom = centreY + zonePreset.artworkMaxHeight / 2;

      const safeMargin = 0.95;
      const safeW = zonePreset.artworkMaxWidth * safeMargin;
      const safeH = zonePreset.artworkMaxHeight * safeMargin;

      const safeLeft = centreX - safeW / 2;
      const safeRight = centreX + safeW / 2;
      const safeTop = centreY - safeH / 2;
      const safeBottom = centreY + safeH / 2;

      const b = placement.bounds;
      const left = toNumber(b.left);
      const right = toNumber(b.right);
      const top = toNumber(b.top);
      const bottom = toNumber(b.bottom);

      const artworkWidth = right - left;
      const artworkHeight = bottom - top;

      if (artworkWidth <= 0 || artworkHeight <= 0) {
        warnings.push("Prepared artwork bounds are empty or unreadable.");
      } else {
        passes.push(
          `Prepared artwork bounds OK: ${Math.round(
            artworkWidth,
          )} x ${Math.round(artworkHeight)} px`,
        );
      }

      if (
        left < maxLeft ||
        right > maxRight ||
        top < maxTop ||
        bottom > maxBottom
      ) {
        warnings.push(
          "Artwork exceeds MAX PRINT AREA. It may clip or exceed the intended print zone.",
        );
      } else {
        passes.push("Artwork is within max print boundary.");
      }
      if (
        left < safeLeft ||
        right > safeRight ||
        top < safeTop ||
        bottom > safeBottom
      ) {
        warnings.push(
          "Review note: artwork extends beyond the SAFE/CAUTION AREA but remains within the max print boundary.",
        );
      } else {
        passes.push("Artwork is inside the safe/caution area.");
      }

      const marginLeft = left - safeLeft;
      const marginRight = safeRight - right;
      const marginTop = top - safeTop;
      const marginBottom = safeBottom - bottom;

      const smallestSafeMargin = Math.min(
        marginLeft,
        marginRight,
        marginTop,
        marginBottom,
      );

      if (smallestSafeMargin < 0) {
        warnings.push(
          `Review note: artwork crosses the safe/caution area by ${Math.abs(
            Math.round(smallestSafeMargin),
          )} px. This is acceptable for intentional full-size prints.`,
        );
      } else if (smallestSafeMargin < 40) {
        warnings.push(
          `Review note: artwork is close to the safe/caution area edge. Smallest caution margin: ${Math.round(
            smallestSafeMargin,
          )} px.`,
        );
      } else {
        passes.push(
          `Safe/caution spacing OK. Smallest caution margin: ${Math.round(
            smallestSafeMargin,
          )} px.`,
        );
      }

      const screenCount = getInkScreenCount(jobState.ink);

      if (screenCount > 4) {
        warnings.push(`Screen count exceeds 4-screen cap: ${screenCount}`);
      } else if (screenCount > 0) {
        passes.push(`Screen count still OK: ${screenCount}/4`);
      } else {
        warnings.push(`Unknown ink profile: ${jobState.ink}`);
      }

      passes.push(`Mesh profile loaded: ${meshProfile.label}`);

      passes.push(
        `Mesh thresholds: min line ${meshProfile.minLinePx}px / min text height ${meshProfile.minTextHeightPx}px`,
      );

      const checkedLayers = [];

      async function collectPrintableLayers(group, result) {
        for (const layer of group.layers || []) {
          if (layer.kind === "group") {
            await collectPrintableLayers(layer, result);
          } else {
            result.push(layer);
          }
        }
      }

      await collectPrintableLayers(placement, checkedLayers);

      if (checkedLayers.length === 0) {
        warnings.push(
          "No printable child layers found inside PLACEMENT_WORKING.",
        );
      } else {
        passes.push(`Printable layer count OK: ${checkedLayers.length}`);
      }

      for (const layer of checkedLayers) {
        const layerName = String(layer.name || "Unnamed Layer");
        const lb = layer.bounds;

        const layerLeft = toNumber(lb.left);
        const layerRight = toNumber(lb.right);
        const layerTop = toNumber(lb.top);
        const layerBottom = toNumber(lb.bottom);

        const layerW = layerRight - layerLeft;
        const layerH = layerBottom - layerTop;

        if (layerW <= 0 || layerH <= 0) {
          warnings.push(`Layer "${layerName}" has unreadable bounds.`);
          continue;
        }

        const smallestSide = Math.min(layerW, layerH);

        if (smallestSide < meshProfile.minLinePx) {
          warnings.push(
            `Layer "${layerName}" has a very thin/short printable dimension (${Math.round(
              smallestSide,
            )}px). Risky for ${meshProfile.label}.`,
          );
        }

        const looksLikeText =
          layerName.toLowerCase().includes("text") ||
          layerName.toLowerCase().includes("tagline") ||
          layerName.toLowerCase().includes("type") ||
          layerName.toLowerCase().includes("copy");

        if (looksLikeText && layerH < meshProfile.minTextHeightPx) {
          warnings.push(
            `Possible small text risk on "${layerName}" (${Math.round(
              layerH,
            )}px high). May not hold cleanly on ${meshProfile.label}.`,
          );
        }
      }

      warnings.push(
        "True pixel-level stroke scanning is not active yet. This pass checks bounds, layer scale, mesh profile, and likely text/detail risks.",
      );

      const result =
        warnings.length === 0
          ? "Print validation passed ✅"
          : "Print validation warnings ⚠️";

      setStatus(
        `${result}

${passes.map((p) => `✅ ${p}`).join("\n")}

${warnings.map((w) => `⚠️ ${w}`).join("\n")}`,
      );
    },
    { commandName: "Imperial Print Validation" },
  );
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

  const watch = [
    "garment",
    "zone",
    "ink",
    "printSetup",
    "meshProfile",
    "distressLevel",
  ];
  for (const id of watch) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", syncJobState);
      el.addEventListener("input", syncJobState);
    }
  }

  const runPrepBtn = document.getElementById("runPrep");
  const preflightBtn = document.getElementById("runPreflight");
  const validateBtn = document.getElementById("validatePrint");
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

  if (preflightBtn) {
    preflightBtn.addEventListener("click", async () => {
      try {
        await runPreflight();
      } catch (e) {
        setStatus(
          `Preflight failed ❌\n${e && e.message ? e.message : String(e)}`,
        );
      }
    });
  }

  if (validateBtn) {
    validateBtn.addEventListener("click", async () => {
      try {
        await runPostPrepValidation();
      } catch (e) {
        setStatus(
          `Validation failed ❌\n${e && e.message ? e.message : String(e)}`,
        );
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
