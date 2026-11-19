#target aftereffects

/* Copy to the task folder and edit TITLE_CONFIG before running in AE.
   Creates new project items only. Does not save, enqueue, render or write files.
   Empty fontPostScriptName keeps AE's current default; set an approved font. */
var TITLE_CONFIG = {
    name: "Title Card",
    width: 1080,
    height: 1920,
    fps: 30,
    durationFrames: 180,
    startFrame: 15,
    endFrame: 165,
    enterFrames: 10,
    exitFrames: 8,
    staggerFrames: 2,
    layout: "lower-third", // "lower-third" or "center"
    safeMargins: { left: 0.08, right: 0.08, top: 0.10, bottom: 0.15 },
    paddingX: 36,
    paddingY: 24,
    gap: 18,
    roundness: 20,
    travel: 48,
    motionBlur: true,
    backgroundColor: [0.08, 0.08, 0.08],
    backgroundOpacity: 94,
    title: { text: "Заголовок", fontPostScriptName: "", fontSize: 84, minFontSize: 38, color: [1, 1, 1] },
    subtitle: { text: "Подзаголовок", fontPostScriptName: "", fontSize: 42, minFontSize: 24, color: [0.85, 0.85, 0.85] }
};

(function (cfg) {
    function fail(message) { throw new Error(message); }
    function number(value, name, min, max) {
        if (typeof value !== "number" || !isFinite(value) || value < min || value > max) {
            fail("Invalid " + name);
        }
    }
    function integer(value, name, min, max) {
        number(value, name, min, max);
        if (Math.floor(value) !== value) { fail(name + " must be an integer frame count"); }
    }
    function color(value, name) {
        if (!value || value.length !== 3) { fail("Invalid " + name); }
        for (var i = 0; i < 3; i++) { number(value[i], name, 0, 1); }
    }
    function validateText(spec, name, required) {
        if (!spec || typeof spec.text !== "string" || (required && !/\S/.test(spec.text))) {
            fail("Missing " + name + " text");
        }
        number(spec.fontSize, name + ".fontSize", 1, 1296);
        number(spec.minFontSize, name + ".minFontSize", 1, spec.fontSize);
        if (typeof spec.fontPostScriptName !== "string") { fail("Invalid font name"); }
        color(spec.color, name + ".color");
    }
    function validate() {
        if (typeof cfg.name !== "string" || !/\S/.test(cfg.name)) { fail("Missing composition name"); }
        integer(cfg.width, "width", 4, 30000);
        integer(cfg.height, "height", 4, 30000);
        number(cfg.fps, "fps", 1, 99);
        integer(cfg.durationFrames, "durationFrames", 1, 10000000);
        if (cfg.durationFrames / cfg.fps > 10800) { fail("Composition duration exceeds 10800 seconds"); }
        integer(cfg.startFrame, "startFrame", 0, cfg.durationFrames - 1);
        integer(cfg.endFrame, "endFrame", cfg.startFrame + 1, cfg.durationFrames);
        integer(cfg.enterFrames, "enterFrames", 1, cfg.durationFrames);
        integer(cfg.exitFrames, "exitFrames", 1, cfg.durationFrames);
        integer(cfg.staggerFrames, "staggerFrames", 0, cfg.durationFrames);
        if (cfg.layout !== "lower-third" && cfg.layout !== "center") { fail("Unknown layout"); }
        var m = cfg.safeMargins;
        if (!m) { fail("Missing safeMargins"); }
        number(m.left, "safe left", 0, 0.49);
        number(m.right, "safe right", 0, 0.49);
        number(m.top, "safe top", 0, 0.49);
        number(m.bottom, "safe bottom", 0, 0.49);
        number(cfg.paddingX, "paddingX", 0, cfg.width / 2);
        number(cfg.paddingY, "paddingY", 0, cfg.height / 2);
        number(cfg.gap, "gap", 0, cfg.height);
        number(cfg.roundness, "roundness", 0, Math.min(cfg.width, cfg.height));
        number(cfg.travel, "travel", 0, cfg.height);
        number(cfg.backgroundOpacity, "backgroundOpacity", 0, 100);
        if (typeof cfg.motionBlur !== "boolean") { fail("motionBlur must be boolean"); }
        color(cfg.backgroundColor, "backgroundColor");
        validateText(cfg.title, "title", true);
        validateText(cfg.subtitle, "subtitle", false);
        var stagger = /\S/.test(cfg.subtitle.text) ? cfg.staggerFrames : 0;
        if (cfg.startFrame + stagger + cfg.enterFrames + 1 > cfg.endFrame - cfg.exitFrames) {
            fail("Not enough frames for entry, hold and exit");
        }
    }
    function uniqueName(project, base) {
        var candidate = base, suffix = 2, found = true;
        while (found) {
            found = false;
            for (var i = 1; i <= project.numItems; i++) {
                if (project.item(i).name === candidate) { found = true; break; }
            }
            if (found) { candidate = base + " " + suffix++; }
        }
        return candidate;
    }
    function transform(layer, matchName) {
        return layer.property("ADBE Transform Group").property(matchName);
    }
    function setText(layer, spec, fontSize) {
        var source = layer.property("ADBE Text Properties").property("ADBE Text Document");
        var doc = source.value;
        doc.resetCharStyle();
        doc.resetParagraphStyle();
        doc.text = spec.text.replace(/\r?\n/g, "\r");
        doc.fontSize = fontSize;
        if (spec.fontPostScriptName !== "") { doc.font = spec.fontPostScriptName; }
        doc.applyFill = true;
        doc.fillColor = spec.color;
        doc.applyStroke = false;
        doc.justification = ParagraphJustification.LEFT_JUSTIFY;
        source.setValue(doc);
        return layer.sourceRectAtTime(0, false);
    }
    function animate(layer, position, maxOpacity, offsetFrames, travel) {
        var first = (cfg.startFrame + offsetFrames) / cfg.fps;
        var enter = first + cfg.enterFrames / cfg.fps;
        var last = cfg.endFrame / cfg.fps;
        var exit = last - cfg.exitFrames / cfg.fps;
        var pos = transform(layer, "ADBE Position");
        var opacity = transform(layer, "ADBE Opacity");
        var shifted = [position[0], position[1] - travel];
        var times = [first, enter, exit, last];
        var positions = [shifted, position, position, shifted];
        var opacities = [0, maxOpacity, maxOpacity, 0];
        layer.inPoint = first;
        layer.outPoint = last;
        layer.motionBlur = cfg.motionBlur;
        for (var i = 0; i < times.length; i++) {
            pos.setValueAtTime(times[i], positions[i]);
            opacity.setValueAtTime(times[i], opacities[i]);
        }
        for (var k = 1; k <= 4; k++) {
            pos.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
            opacity.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
            pos.setTemporalEaseAtKey(k, [new KeyframeEase(0, 65)], [new KeyframeEase(0, 65)]);
            opacity.setTemporalEaseAtKey(k, [new KeyframeEase(0, 65)], [new KeyframeEase(0, 65)]);
            pos.setSpatialTangentsAtKey(k, [0, 0], [0, 0]);
        }
    }
    var folder = null, comp = null, undoStarted = false;
    try {
        validate();
        if (!app.project) { app.newProject(); }
        app.beginUndoGroup("Create title card");
        undoStarted = true;
        var project = app.project;
        folder = project.items.addFolder(uniqueName(project, "Titles - " + cfg.name));
        comp = project.items.addComp(uniqueName(project, cfg.name), cfg.width, cfg.height, 1, cfg.durationFrames / cfg.fps, cfg.fps);
        comp.parentFolder = folder;
        comp.motionBlur = cfg.motionBlur;
        comp.shutterAngle = 180;
        var title = comp.layers.addText("");
        title.name = "Title";
        var subtitle = /\S/.test(cfg.subtitle.text) ? comp.layers.addText("") : null;
        if (subtitle) { subtitle.name = "Subtitle"; }
        var safeLeft = cfg.width * cfg.safeMargins.left;
        var safeTop = cfg.height * cfg.safeMargins.top;
        var safeWidth = cfg.width * (1 - cfg.safeMargins.left - cfg.safeMargins.right);
        var safeHeight = cfg.height * (1 - cfg.safeMargins.top - cfg.safeMargins.bottom);
        var maxTextWidth = safeWidth - 2 * cfg.paddingX;
        if (maxTextWidth <= 0 || safeHeight <= 2 * cfg.paddingY) { fail("Padding leaves no space for text"); }
        var titleSize = cfg.title.fontSize, subtitleSize = cfg.subtitle.fontSize;
        var titleRect, subtitleRect, textWidth, textHeight, gap = subtitle ? cfg.gap : 0;
        var fit = false;
        for (var attempt = 0; attempt < 16; attempt++) {
            titleRect = setText(title, cfg.title, titleSize);
            subtitleRect = subtitle ? setText(subtitle, cfg.subtitle, subtitleSize) : { width: 0, height: 0, left: 0, top: 0 };
            textWidth = Math.max(titleRect.width, subtitleRect.width);
            textHeight = titleRect.height + gap + subtitleRect.height;
            if (textWidth > 0 && textWidth <= maxTextWidth + 0.01 && textHeight <= safeHeight - 2 * cfg.paddingY + 0.01) { fit = true; break; }
            var scale = Math.min(0.95, maxTextWidth / Math.max(1, textWidth), (safeHeight - 2 * cfg.paddingY - gap) / Math.max(1, textHeight - gap));
            var nextTitle = Math.max(cfg.title.minFontSize, titleSize * scale);
            var nextSubtitle = Math.max(cfg.subtitle.minFontSize, subtitleSize * scale);
            if (nextTitle === titleSize && (!subtitle || nextSubtitle === subtitleSize)) { break; }
            titleSize = nextTitle;
            subtitleSize = nextSubtitle;
        }
        if (!fit) { fail("Text does not fit at minimum font size; change line breaks, copy or layout"); }
        var cardWidth = textWidth + 2 * cfg.paddingX;
        var cardHeight = textHeight + 2 * cfg.paddingY;
        var cardLeft = cfg.layout === "center" ? safeLeft + (safeWidth - cardWidth) / 2 : safeLeft;
        var cardTop = cfg.layout === "center" ? safeTop + (safeHeight - cardHeight) / 2 : safeTop + safeHeight - cardHeight;
        var travel = Math.min(cfg.travel, Math.max(0, cardTop - safeTop));
        transform(title, "ADBE Anchor Point").setValue([titleRect.left, titleRect.top]);
        animate(title, [cardLeft + cfg.paddingX, cardTop + cfg.paddingY], 100, 0, travel);
        if (subtitle) {
            transform(subtitle, "ADBE Anchor Point").setValue([subtitleRect.left, subtitleRect.top]);
            animate(subtitle, [cardLeft + cfg.paddingX, cardTop + cfg.paddingY + titleRect.height + gap], 100, cfg.staggerFrames, travel);
        }
        var card = comp.layers.addShape();
        card.name = "Card Background";
        var vectors = card.property("ADBE Root Vectors Group");
        var rect = vectors.addProperty("ADBE Vector Shape - Rect");
        rect.property("ADBE Vector Rect Size").setValue([cardWidth, cardHeight]);
        rect.property("ADBE Vector Rect Position").setValue([0, 0]);
        rect.property("ADBE Vector Rect Roundness").setValue(Math.min(cfg.roundness, cardWidth / 2, cardHeight / 2));
        var fill = card.property("ADBE Root Vectors Group").addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue(cfg.backgroundColor);
        animate(card, [cardLeft + cardWidth / 2, cardTop + cardHeight / 2], cfg.backgroundOpacity, 0, travel);
        card.moveToEnd();
        comp.comment = "Generated title card. Fonts: " + title.property("ADBE Text Properties").property("ADBE Text Document").value.font + (subtitle ? ", " + subtitle.property("ADBE Text Properties").property("ADBE Text Document").value.font : "") + ". Review glyphs and layout in AE before delivery.";
        alert("Created composition: " + comp.name + "\nReview fonts, text and animation in AE. Project was not saved; render was not started.");
    } catch (error) {
        var cleanupNotes = [];
        if (comp) {
            var failedCompName = comp.name;
            try { comp.remove(); }
            catch (cleanupCompError) { cleanupNotes.push("Check composition " + failedCompName + ": " + cleanupCompError.toString()); }
        }
        if (folder) {
            var failedFolderName = folder.name;
            try { folder.remove(); }
            catch (cleanupFolderError) { cleanupNotes.push("Check folder " + failedFolderName + ": " + cleanupFolderError.toString()); }
        }
        alert("Title creation failed: " + error.toString() + (cleanupNotes.length ? "\nCleanup warnings:\n" + cleanupNotes.join("\n") : ""));
    } finally {
        if (undoStarted) { app.endUndoGroup(); }
    }
}(TITLE_CONFIG));
