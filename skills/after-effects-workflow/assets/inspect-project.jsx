#target aftereffects

/* Local report only: does not change layers, save the AEP, or render. */
(function () {
    var CONFIG = {
        outputPath: "", // Empty: choose a new JSON file in a save dialog.
        compositionId: null, // null: inspect all compositions up to the limits.
        includeMediaPaths: false,
        maxItems: 500,
        maxLayersPerComp: 500
    };

    function quote(value) {
        return '"' + String(value).replace(/[\u0000-\u001f\\"]/g, function (ch) {
            if (ch === '"') { return '\\"'; }
            if (ch === "\\") { return "\\\\"; }
            var hex = ch.charCodeAt(0).toString(16);
            return "\\u" + ("0000" + hex).slice(-4);
        }) + '"';
    }

    function encode(value) {
        if (value === null || typeof value === "undefined") { return "null"; }
        if (typeof value === "string") { return quote(value); }
        if (typeof value === "number") { return isFinite(value) ? String(value) : "null"; }
        if (typeof value === "boolean") { return value ? "true" : "false"; }
        var values = [], i, key;
        if (value instanceof Array) {
            for (i = 0; i < value.length; i++) { values.push(encode(value[i])); }
            return "[" + values.join(",") + "]";
        }
        for (key in value) {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                values.push(quote(key) + ":" + encode(value[key]));
            }
        }
        return "{" + values.join(",") + "}";
    }

    function read(getter) {
        try {
            var result = getter();
            return typeof result === "undefined" ? null : result;
        } catch (error) { return null; }
    }

    function layerInfo(layer) {
        var result = {
            id: read(function () { return layer.id; }),
            index: layer.index,
            name: layer.name,
            inPoint: layer.inPoint,
            outPoint: layer.outPoint,
            startTime: layer.startTime,
            stretch: read(function () { return layer.stretch; }),
            enabled: layer.enabled,
            locked: layer.locked,
            sourceId: read(function () { return layer.source ? layer.source.id : null; }),
            hasAudio: read(function () { return layer.hasAudio; }),
            audioEnabled: read(function () { return layer.audioEnabled; }),
            timeRemapEnabled: read(function () { return layer.timeRemapEnabled; })
        };
        result.text = read(function () {
            var group = layer.property("ADBE Text Properties");
            if (!group) { return null; }
            var document = group.property("ADBE Text Document").value;
            return {text: document.text, font: document.font, fontSize: document.fontSize};
        });
        return result;
    }

    function itemInfo(item) {
        var result = {id: item.id, name: item.name, kind: "item"}, i;
        if (item instanceof CompItem) {
            result.kind = "composition";
            result.width = item.width;
            result.height = item.height;
            result.frameRate = item.frameRate;
            result.duration = item.duration;
            result.displayStartTime = item.displayStartTime;
            result.workAreaStart = item.workAreaStart;
            result.workAreaDuration = item.workAreaDuration;
            result.numLayers = item.numLayers;
            result.layers = [];
            for (i = 1; i <= Math.min(item.numLayers, CONFIG.maxLayersPerComp); i++) {
                result.layers.push(layerInfo(item.layer(i)));
            }
            result.layersTruncated = item.numLayers > CONFIG.maxLayersPerComp;
        } else if (item instanceof FootageItem) {
            result.kind = "footage";
            result.width = item.width;
            result.height = item.height;
            result.duration = item.duration;
            result.frameRate = item.frameRate;
            result.footageMissing = read(function () { return item.footageMissing; });
            if (CONFIG.includeMediaPaths) {
                result.path = read(function () { return item.file ? item.file.fsName : null; });
            }
        } else if (item instanceof FolderItem) {
            result.kind = "folder";
        }
        return result;
    }

    try {
        if (!app.project) { throw new Error("Open an After Effects project first."); }
        if (typeof CONFIG.maxItems !== "number" || !isFinite(CONFIG.maxItems) || CONFIG.maxItems < 1 || CONFIG.maxItems % 1 ||
                typeof CONFIG.maxLayersPerComp !== "number" || !isFinite(CONFIG.maxLayersPerComp) || CONFIG.maxLayersPerComp < 1 || CONFIG.maxLayersPerComp % 1) {
            throw new Error("Report limits must be positive integers.");
        }
        var target = CONFIG.outputPath ? new File(CONFIG.outputPath) : File.saveDialog("Save a new local AE report", "*.json");
        if (!target) { return; }
        if (target.exists) { throw new Error("Report already exists. Choose a new filename."); }
        if (!target.parent.exists) { throw new Error("Report directory does not exist."); }

        var project = app.project;
        var report = {
            schemaVersion: 1,
            afterEffectsVersion: app.version,
            projectHasFile: project.file !== null,
            projectDirty: read(function () { return project.dirty; }),
            activeItemId: read(function () { return project.activeItem ? project.activeItem.id : null; }),
            requestedCompositionId: CONFIG.compositionId,
            includeMediaPaths: CONFIG.includeMediaPaths,
            numItems: project.numItems,
            itemsTruncated: false,
            items: [],
            errors: [],
            renderQueue: []
        };
        if (CONFIG.includeMediaPaths) { report.projectPath = project.file ? project.file.fsName : null; }
        var i, item, included = 0, matchedComposition = false;
        for (i = 1; i <= project.numItems; i++) {
            item = project.item(i);
            if (CONFIG.compositionId !== null && (!(item instanceof CompItem) || item.id !== CONFIG.compositionId)) { continue; }
            if (included >= CONFIG.maxItems) { report.itemsTruncated = true; break; }
            try {
                report.items.push(itemInfo(item));
                if (item instanceof CompItem) { matchedComposition = true; }
            } catch (error) {
                report.errors.push({itemId: item.id, message: String(error)});
            }
            included++;
        }
        if (CONFIG.compositionId !== null && !matchedComposition) {
            throw new Error("Requested composition ID was not found or could not be inspected.");
        }
        var queue = project.renderQueue;
        report.renderQueueCount = queue.numItems;
        report.renderQueueTruncated = queue.numItems > CONFIG.maxItems;
        for (i = 1; i <= Math.min(queue.numItems, CONFIG.maxItems); i++) {
            var queued = queue.item(i);
            report.renderQueue.push({
                compositionId: queued.comp.id,
                status: String(queued.status),
                render: queued.render,
                timeSpanStart: queued.timeSpanStart,
                timeSpanDuration: queued.timeSpanDuration
            });
        }
        target.encoding = "UTF-8";
        if (!target.open("w")) { throw new Error("Cannot open report for writing: " + target.error); }
        try {
            if (!target.write(encode(report))) { throw new Error("Cannot write report: " + target.error); }
        } finally { target.close(); }
        alert("Saved local AE report: " + target.fsName);
    } catch (error) {
        alert("AE report failed: " + String(error));
        throw error;
    }
}());
