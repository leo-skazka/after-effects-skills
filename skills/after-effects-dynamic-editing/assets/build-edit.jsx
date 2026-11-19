#target aftereffects
/* Copy this file to the job folder, then fill EDIT_CONFIG from the edit plan.
   Local files only. Creates a NEW folder and comp. Never saves or renders.
   All intervals are [in, out). Timeline positions use output-comp frames.
   Example clip shape:
   {path: 'C:/Media/shot.mov', timelineInFrame: 0, durationFrames: 60,
    sourceInSeconds: 1, sourceOutSeconds: 3, fit: 'cover', audio: false}
   Optional retimeKeys: [{frame:0,sourceSeconds:1},
                        {frame:30,sourceSeconds:1.5},
                        {frame:60,sourceSeconds:3}]
*/
var EDIT_CONFIG = {
    name: 'AE_Edit_v001',
    width: 1080,
    height: 1920,
    fps: 30,
    durationFrames: 900,
    backgroundColor: [0, 0, 0],
    bpm: 120,
    beatOffsetFrames: 0,
    beatsPerMarker: 4,
    clips: [],
    music: null
    // music: {path:'C:/Media/music.wav', sourceInSeconds:0,
    //         timelineInFrame:0, gainDb:-12}
};

var AEDynamicEdit = (function () {
    function fail(message) { throw new Error(message); }
    function finite(value) { return typeof value === 'number' && isFinite(value); }
    function integer(value) { return finite(value) && Math.floor(value) === value; }
    function near(a, b) { return Math.abs(a - b) < 0.000001; }
    function absolute(path) { return typeof path === 'string' && /^(?:[A-Za-z]:[\\\/]|\\\\|\/)/.test(path); }

    function validatePlan(config) {
        var i, j, c, k, previousEnd = -1, sorted, keys;
        if (!config || typeof config.name !== 'string' || !config.name.length) { fail('Set a composition name.'); }
        if (!integer(config.width) || !integer(config.height) || config.width < 4 || config.height < 4 || config.width > 30000 || config.height > 30000) { fail('Composition dimensions must be integer pixels, 4..30000.'); }
        if (!finite(config.fps) || config.fps < 1 || config.fps > 99) { fail('Set the actual composition FPS, between 1 and 99.'); }
        if (!integer(config.durationFrames) || config.durationFrames < 1 || config.durationFrames / config.fps > 10800) { fail('Invalid composition duration.'); }
        if (!(config.clips instanceof Array) || !config.clips.length) { fail('Fill EDIT_CONFIG.clips with the approved edit plan.'); }
        if (!(config.backgroundColor instanceof Array) || config.backgroundColor.length !== 3) { fail('backgroundColor requires three 0..1 values.'); }
        for (i = 0; i < 3; i++) { if (!finite(config.backgroundColor[i]) || config.backgroundColor[i] < 0 || config.backgroundColor[i] > 1) { fail('Invalid background color.'); } }
        if (config.bpm !== null && config.bpm !== undefined && (!finite(config.bpm) || config.bpm <= 0 || !finite(config.beatOffsetFrames) || !integer(config.beatsPerMarker) || config.beatsPerMarker < 1)) { fail('Invalid musical grid. Use bpm:null to omit markers.'); }
        sorted = config.clips.slice(0);
        sorted.sort(function (a, b) { return a.timelineInFrame - b.timelineInFrame; });
        for (i = 0; i < sorted.length; i++) {
            c = sorted[i];
            if (!absolute(c.path)) { fail('Clip ' + (i + 1) + ': use an absolute local path.'); }
            if (!integer(c.timelineInFrame) || c.timelineInFrame < 0 || !integer(c.durationFrames) || c.durationFrames < 1 || c.timelineInFrame + c.durationFrames > config.durationFrames) { fail('Clip ' + (i + 1) + ': invalid output frame range.'); }
            if (c.timelineInFrame < previousEnd) { fail('Clips overlap. This template implements hard cuts; plan transitions separately.'); }
            previousEnd = c.timelineInFrame + c.durationFrames;
            if (!finite(c.sourceInSeconds) || !finite(c.sourceOutSeconds) || c.sourceInSeconds < 0 || c.sourceOutSeconds <= c.sourceInSeconds) { fail('Clip ' + (i + 1) + ': invalid source interval.'); }
            if (c.fit !== undefined && c.fit !== 'cover' && c.fit !== 'contain') { fail('Clip fit must be cover or contain.'); }
            keys = c.retimeKeys;
            if (keys !== undefined && keys !== null) {
                if (!(keys instanceof Array) || keys.length < 2) { fail('retimeKeys requires at least two points.'); }
                for (j = 0; j < keys.length; j++) {
                    k = keys[j];
                    if (!integer(k.frame) || !finite(k.sourceSeconds) || k.sourceSeconds < c.sourceInSeconds || k.sourceSeconds > c.sourceOutSeconds || (j < keys.length - 1 && k.sourceSeconds >= c.sourceOutSeconds)) { fail('Invalid retime point.'); }
                    if (j > 0 && (k.frame <= keys[j - 1].frame || k.sourceSeconds < keys[j - 1].sourceSeconds)) { fail('retimeKeys must increase in frame and never reverse source time.'); }
                }
                if (keys[0].frame !== 0 || !near(keys[0].sourceSeconds, c.sourceInSeconds) || keys[keys.length - 1].frame !== c.durationFrames || !near(keys[keys.length - 1].sourceSeconds, c.sourceOutSeconds)) { fail('retimeKeys must cover the exact source/output endpoints.'); }
            }
        }
        if (config.music) {
            if (!absolute(config.music.path) || !finite(config.music.sourceInSeconds) || config.music.sourceInSeconds < 0 || !integer(config.music.timelineInFrame) || config.music.timelineInFrame < 0 || config.music.timelineInFrame >= config.durationFrames) { fail('Invalid music source or range.'); }
            if (config.music.gainDb !== undefined && (!finite(config.music.gainDb) || config.music.gainDb < -192 || config.music.gainDb > 12)) { fail('Music gainDb must be -192..12.'); }
        }
        return sorted;
    }

    // Monotone cubic Hermite source-time map. Values are seconds; x is frames.
    function makeMap(keys) {
        var n = keys.length, h = [], d = [], m = [], i, w1, w2, a, b, radius, tau;
        for (i = 0; i < n - 1; i++) { h[i] = keys[i + 1].frame - keys[i].frame; d[i] = (keys[i + 1].sourceSeconds - keys[i].sourceSeconds) / h[i]; }
        m[0] = d[0]; m[n - 1] = d[n - 2];
        for (i = 1; i < n - 1; i++) {
            if (d[i - 1] === 0 || d[i] === 0) { m[i] = 0; }
            else { w1 = 2 * h[i] + h[i - 1]; w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
        }
        for (i = 0; i < n - 1; i++) {
            if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; }
            else { a = m[i] / d[i]; b = m[i + 1] / d[i]; radius = a * a + b * b; if (radius > 9) { tau = 3 / Math.sqrt(radius); m[i] = tau * a * d[i]; m[i + 1] = tau * b * d[i]; } }
        }
        return function (frame) {
            var s = 0, t, t2, t3, value, low, high;
            if (frame <= keys[0].frame) { return keys[0].sourceSeconds; }
            if (frame >= keys[n - 1].frame) { return keys[n - 1].sourceSeconds; }
            while (s < n - 2 && frame > keys[s + 1].frame) { s++; }
            t = (frame - keys[s].frame) / h[s]; t2 = t * t; t3 = t2 * t;
            value = (2 * t3 - 3 * t2 + 1) * keys[s].sourceSeconds + (t3 - 2 * t2 + t) * h[s] * m[s] + (-2 * t3 + 3 * t2) * keys[s + 1].sourceSeconds + (t3 - t2) * h[s] * m[s + 1];
            low = keys[s].sourceSeconds; high = keys[s + 1].sourceSeconds;
            return Math.max(low, Math.min(high, value));
        };
    }

    function bakeMap(clip, fps) {
        var keys = clip.retimeKeys || [{frame: 0, sourceSeconds: clip.sourceInSeconds}, {frame: clip.durationFrames, sourceSeconds: clip.sourceOutSeconds}];
        var map = makeMap(keys), times = [], values = [], frame, value;
        for (frame = 0; frame < clip.durationFrames; frame++) {
            value = map(frame);
            if (!finite(value) || value < clip.sourceInSeconds || value >= clip.sourceOutSeconds) { fail('A sampled remap time is outside the exclusive source interval.'); }
            times.push((clip.timelineInFrame + frame) / fps); values.push(value);
        }
        return {times: times, values: values};
    }

    function markerFrames(config) {
        var result = [], n = 0, frame, last = -1, step;
        if (config.bpm === null || config.bpm === undefined) { return result; }
        step = 60 * config.fps * config.beatsPerMarker / config.bpm;
        // Jump to the first non-negative phrase instead of iterating negative time.
        n = Math.max(0, Math.ceil(-config.beatOffsetFrames / step));
        while (true) {
            frame = Math.round(config.beatOffsetFrames + n * step);
            if (frame >= config.durationFrames) { break; }
            if (frame >= 0 && frame !== last) { result.push(frame); last = frame; }
            n++;
            if (n > 1000000) { fail('Musical grid has too many markers.'); }
        }
        return result;
    }

    function run(config) {
        var clips, files = [], musicFile, i, folder, comp, footage = [], layer, item, data, remap, j, marks, musicLayer, musicItem, musicStart, musicDuration, audio;
        var createdName = '', createdFolderName = '', undoStarted = false;
        try {
            clips = validatePlan(config);
            marks = markerFrames(config);
            if (app.project) {
                for (i = 1; i <= app.project.numItems; i++) {
                    item = app.project.item(i);
                    if (item instanceof CompItem && item.name === config.name) { fail('Composition already exists: ' + config.name + '. Set a new version name in EDIT_CONFIG.'); }
                }
            }
            for (i = 0; i < clips.length; i++) { files[i] = new File(clips[i].path); if (!files[i].exists) { fail('Missing clip: ' + files[i].fsName); } }
            if (config.music) { musicFile = new File(config.music.path); if (!musicFile.exists) { fail('Missing music: ' + musicFile.fsName); } }
            if (!app.project) { app.newProject(); }
            app.beginUndoGroup('Build dynamic edit'); undoStarted = true;
            folder = app.project.items.addFolder(config.name + '_Sources');
            createdFolderName = folder.name;
            for (i = 0; i < clips.length; i++) {
                item = app.project.importFile(new ImportOptions(files[i])); item.parentFolder = folder;
                if (!(item instanceof FootageItem) || !item.hasVideo || item.mainSource.isStill || !finite(item.frameRate) || item.frameRate <= 0 || item.duration <= 0) { fail('Clip must be moving video with a valid frame rate: ' + files[i].fsName); }
                if (clips[i].sourceOutSeconds > item.duration + 0.000001) { fail('Source range exceeds footage duration: ' + files[i].fsName); }
                footage.push(item);
            }
            if (config.music) {
                musicItem = app.project.importFile(new ImportOptions(musicFile)); musicItem.parentFolder = folder;
                if (!musicItem.hasAudio || config.music.sourceInSeconds >= musicItem.duration) { fail('Music lacks usable audio at the requested source time.'); }
            }
            comp = app.project.items.addComp(config.name, config.width, config.height, 1, config.durationFrames / config.fps, config.fps);
            comp.parentFolder = folder; comp.bgColor = config.backgroundColor; createdName = comp.name;
            for (i = 0; i < clips.length; i++) {
                item = footage[i]; layer = comp.layers.add(item); layer.name = 'Shot_' + (i + 1) + '_' + item.name;
                layer.audioEnabled = clips[i].audio === true && item.hasAudio;
                if (clips[i].retimeKeys || !near(clips[i].sourceOutSeconds - clips[i].sourceInSeconds, clips[i].durationFrames / config.fps)) {
                    if (!layer.canSetTimeRemapEnabled) { fail('Time Remap unavailable: ' + layer.name); }
                    layer.startTime = 0; layer.timeRemapEnabled = true;
                    remap = layer.property('ADBE Time Remapping');
                    while (remap.numKeys > 0) { remap.removeKey(remap.numKeys); }
                    data = bakeMap(clips[i], config.fps); remap.setValuesAtTimes(data.times, data.values);
                    for (j = 1; j <= remap.numKeys; j++) { remap.setInterpolationTypeAtKey(j, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR); }
                } else { layer.startTime = clips[i].timelineInFrame / config.fps - clips[i].sourceInSeconds; }
                layer.inPoint = clips[i].timelineInFrame / config.fps;
                layer.outPoint = (clips[i].timelineInFrame + clips[i].durationFrames) / config.fps;
                var fit = clips[i].fit || 'cover';
                var displayWidth = item.width * item.pixelAspect;
                var scale = (fit === 'contain' ? Math.min(config.width / displayWidth, config.height / item.height) : Math.max(config.width / displayWidth, config.height / item.height)) * 100;
                layer.property('ADBE Transform Group').property('ADBE Anchor Point').setValue([item.width / 2, item.height / 2]);
                layer.property('ADBE Transform Group').property('ADBE Position').setValue([config.width / 2, config.height / 2]);
                layer.property('ADBE Transform Group').property('ADBE Scale').setValue([scale, scale]);
            }
            if (config.music) {
                musicStart = config.music.timelineInFrame / config.fps;
                musicDuration = Math.min(comp.duration - musicStart, musicItem.duration - config.music.sourceInSeconds);
                musicLayer = comp.layers.add(musicItem); musicLayer.name = 'Music';
                musicLayer.startTime = musicStart - config.music.sourceInSeconds; musicLayer.inPoint = musicStart; musicLayer.outPoint = musicStart + musicDuration;
                musicLayer.enabled = false; musicLayer.audioEnabled = true;
                audio = musicLayer.property('ADBE Audio Group').property('ADBE Audio Levels');
                var gain = config.music.gainDb === undefined ? -12 : config.music.gainDb;
                audio.setValue([gain, gain]);
            }
            for (i = 0; i < marks.length; i++) { comp.markerProperty.setValueAtTime(marks[i] / config.fps, new MarkerValue('Phrase ' + (i + 1))); }
            comp.workAreaStart = 0; comp.workAreaDuration = comp.duration; comp.openInViewer();
            alert('Created ' + comp.name + ': ' + clips.length + ' shots, ' + config.durationFrames + ' frames at ' + config.fps + ' fps.\nProject was not saved; no render was started. Inspect framing, cuts, retime and audio.');
            return comp;
        } catch (error) {
            alert('Dynamic edit stopped: ' + error.toString() + (createdName ? '\nPartial composition: ' + createdName : '') + (createdFolderName ? '\nNew source folder: ' + createdFolderName : '') + (undoStarted ? '\nUse Undo once to reverse the script group if needed.' : ''));
            return null;
        } finally { if (undoStarted) { app.endUndoGroup(); } }
    }

    return {run: run, validatePlan: validatePlan, makeMap: makeMap, bakeMap: bakeMap, markerFrames: markerFrames};
}());

// The switch is used by offline validation; leave it undefined for AE execution.
if (typeof AE_DYNAMIC_EDIT_SKIP_RUN === 'undefined' || !AE_DYNAMIC_EDIT_SKIP_RUN) {
    AEDynamicEdit.run(EDIT_CONFIG);
}
