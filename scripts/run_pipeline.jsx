#target photoshop

(function () {
  function parseJSON(text) { return eval("(" + text + ")"); }

  function readJSON(path) {
    var f = new File(path);
    if (!f.exists) throw new Error("Missing file: " + path);
    f.open("r");
    var txt = f.read();
    f.close();
    return parseJSON(txt);
  }

  function ensureFolder(path) {
    var folder = new Folder(path);
    if (!folder.exists) folder.create();
    return folder;
  }

  function inchesToPx(inches, dpi) { return Math.round(inches * dpi); }

  function openArtwork(path) {
    var f = new File(path);
    if (!f.exists) throw new Error("Artwork not found: " + path);
    return app.open(f);
  }

  function fitActiveLayerToBounds(maxWpx, maxHpx) {
    var doc = app.activeDocument;
    var layer = doc.activeLayer;
    var b = layer.bounds;
    var w = b[2].as("px") - b[0].as("px");
    var h = b[3].as("px") - b[1].as("px");
    var scale = Math.min((maxWpx / w) * 100.0, (maxHpx / h) * 100.0);
    layer.resize(scale, scale, AnchorPosition.MIDDLECENTER);
  }

  function centerActiveLayer() {
    var doc = app.activeDocument;
    var b = doc.activeLayer.bounds;
    var cxLayer = (b[0].as("px") + b[2].as("px")) / 2;
    var cyLayer = (b[1].as("px") + b[3].as("px")) / 2;
    var cxDoc = doc.width.as("px") / 2;
    var cyDoc = doc.height.as("px") / 2;
    doc.activeLayer.translate(cxDoc - cxLayer, cyDoc - cyLayer);
  }

  function addSimpleRegMarks(offsetPx, sizePx) {
    var doc = app.activeDocument;
    var black = new SolidColor();
    black.rgb.red = 0; black.rgb.green = 0; black.rgb.blue = 0;
    app.foregroundColor = black;

    function drawCross(x, y, size) {
      var half = size / 2;
      var mark = doc.artLayers.add();
      mark.name = "REG_MARK";

      doc.selection.select([[x-half, y-1], [x+half, y-1], [x+half, y+1], [x-half, y+1]]);
      doc.selection.fill(app.foregroundColor);
      doc.selection.select([[x-1, y-half], [x+1, y-half], [x+1, y+half], [x-1, y+half]]);
      doc.selection.fill(app.foregroundColor);
      doc.selection.deselect();
    }

    var w = doc.width.as("px"), h = doc.height.as("px");
    drawCross(offsetPx, offsetPx, sizePx);
    drawCross(w - offsetPx, offsetPx, sizePx);
    drawCross(offsetPx, h - offsetPx, sizePx);
    drawCross(w - offsetPx, h - offsetPx, sizePx);
  }

  function savePSD(outPath) {
    var f = new File(outPath);
    var opts = new PhotoshopSaveOptions();
    opts.layers = true;
    opts.embedColorProfile = true;
    app.activeDocument.saveAs(f, opts, true, Extension.LOWERCASE);
  }

  try {
    var root = Folder.selectDialog("Select imperial-print-os project root");
    if (!root) throw new Error("No project root selected.");

    var job = readJSON(root.fsName + "/jobs/test_front_1c_dark.json");
    var press = readJSON(root.fsName + "/presets/press/" + job.press_profile + ".json");
    var zone = readJSON(root.fsName + "/presets/zones/" + job.zone + ".json");
    var ink = readJSON(root.fsName + "/presets/inks/" + job.ink_profile + ".json");

    if (ink.max_channels > press.max_screens) {
      throw new Error("Profile exceeds screen limit: " + ink.max_channels + " > " + press.max_screens);
    }

    var sourceDoc = openArtwork(job.artwork_path);
    var dpi = press.default_dpi;

    var workDoc = app.documents.add(
      inchesToPx(14, dpi),
      inchesToPx(18, dpi),
      dpi,
      job.job_name,
      NewDocumentMode.RGB,
      DocumentFill.WHITE
    );

    app.activeDocument = sourceDoc;
    sourceDoc.activeLayer.copy();
    sourceDoc.close(SaveOptions.DONOTSAVECHANGES);

    app.activeDocument = workDoc;
    workDoc.paste();
    workDoc.activeLayer.name = "ARTWORK";

    fitActiveLayerToBounds(inchesToPx(zone.max_width_in, dpi), inchesToPx(zone.max_height_in, dpi));
    centerActiveLayer();

    if (press.registration && press.registration.enabled) {
      addSimpleRegMarks(
        inchesToPx(press.registration.offset_in, dpi),
        inchesToPx(press.registration.size_in, dpi)
      );
    }

    var outDir = root.fsName + "/exports/" + job.job_name;
    ensureFolder(outDir);
    savePSD(outDir + "/" + job.job_name + ".psd");

    alert("Done. Output: " + outDir);
  } catch (e) {
    alert("Pipeline failed:\n" + e.message);
  }
})();