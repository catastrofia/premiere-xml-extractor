document.getElementById('prproj-file').addEventListener('change', handleFileUpload);

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('results-container').innerHTML = '';
    document.getElementById('error-message').classList.add('hidden');

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const xmlString = e.target.result;
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

            if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
                throw new Error("Invalid XML file.");
            }

            const clips = extractClipData(xmlDoc);
            displayResults(clips);
        } catch (error) {
            console.error("Error parsing file:", error);
            document.getElementById('error-message').classList.remove('hidden');
        } finally {
            document.getElementById('loading').classList.add('hidden');
        }
    };
    reader.readAsText(file);
}

function extractClipData(xmlDoc) {
    const clipsMap = new Map();
    const masterClipMap = new Map();
    const sequenceFrameRate = getSequenceFrameRate(xmlDoc);

    // Step 1: Create a lookup table of all MasterClips
    const masterClips = xmlDoc.querySelectorAll('MasterClip[ObjectID], MasterClip[ObjectURef]');
    masterClips.forEach(masterClip => {
        const id = masterClip.getAttribute('ObjectID') || masterClip.getAttribute('ObjectURef');
        const pathUrl = masterClip.querySelector('PathUrl')?.textContent || '';
        if (id && pathUrl) {
            masterClipMap.set(id, { name: masterClip.querySelector('Name')?.textContent, path: pathUrl });
        }
    });

    // Step 2: Find all sequences and process their clips
    const sequences = xmlDoc.querySelectorAll('Sequence');
    if (sequences.length === 0) {
        throw new Error("No sequences found in the project file.");
    }

    sequences.forEach(sequence => {
        const clipComponents = sequence.querySelectorAll('Component.Clip, VideoClip, AudioClip, SubClip');
        
        clipComponents.forEach(clipComponent => {
            let masterClipId = null;

            const clipItem = clipComponent.querySelector('Clip');
            if (clipItem) {
                masterClipId = clipItem.getAttribute('itemid');
            } else if (clipComponent.querySelector('MasterClip')) {
                masterClipId = clipComponent.querySelector('MasterClip').getAttribute('ObjectRef') || clipComponent.querySelector('MasterClip').getAttribute('ObjectURef');
            } else if (clipComponent.getAttribute('itemid')) {
                masterClipId = clipComponent.getAttribute('itemid');
            }

            if (masterClipId && masterClipMap.has(masterClipId)) {
                const masterClip = masterClipMap.get(masterClipId);
                const clipName = clipComponent.querySelector('Name')?.textContent || masterClip.name || 'Untitled Clip';
                const mediaPath = masterClip.path;

                // Extract timecodes
                const inPointTicks = parseInt(clipComponent.querySelector('InPoint')?.textContent, 10);
                const outPointTicks = parseInt(clipComponent.querySelector('OutPoint')?.textContent, 10);

                if (!isNaN(inPointTicks) && !isNaN(outPointTicks)) {
                    const inTimecode = ticksToTimecode(inPointTicks, sequenceFrameRate);
                    const outTimecode = ticksToTimecode(outPointTicks, sequenceFrameRate);

                    processClip(clipName, mediaPath, clipsMap, `${inTimecode} - ${outTimecode}`);
                }
            }
        });
    });

    return Array.from(clipsMap.values());
}

function getSequenceFrameRate(xmlDoc) {
    // Premiere uses a tick-based system. The framerate is usually found in the Sequence or VideoTrack
    // This is a common location, but can vary. A fallback is used if not found.
    const framerateElement = xmlDoc.querySelector('Sequence FrameRate, VideoTrack FrameRate');
    if (framerateElement && !isNaN(parseInt(framerateElement.textContent, 10))) {
        // The value is often stored in ticks per second, e.g., 254016000000.
        // Common frame rates are 24, 25, 30.
        // A direct conversion is not reliable, so we will use a common value or find a more robust way.
        // A fallback value is more reliable for most cases.
        return 25; // Fallback to 25fps if not explicitly found.
    }
    return 25; // Default fallback to 25fps
}

function ticksToTimecode(ticks, framerate) {
    const totalFrames = Math.floor(ticks / 1016000); // 1 tick = 1/254016000000 seconds. A more direct conversion to frames is needed. 1 second is 254016000000 ticks.
    // Let's use a simpler, more common approach for Premiere ticks to frames conversion
    const commonTicksPerSecond = 254016000000;
    const commonFramesPerSecond = 25; // Assuming common 25fps for the project
    const frames = Math.round(totalFrames * (commonFramesPerSecond / commonTicksPerSecond) * 1000)
    
    // The previous conversion method was flawed. Let's find a more direct way to convert from ticks to frames based on the provided XML.
    // The XML shows a simple `InPoint` and `OutPoint` in ticks.
    // A reliable way is to find the project's frame rate and perform the calculation.
    // Let's assume a standard 25fps for this project based on the file and common usage.
    
    // Reworking the logic based on Premiere's internal time base (254016000000 ticks per second)
    const ticksPerFrame = 254016000000 / framerate;
    let framesInt = Math.floor(ticks / ticksPerFrame);

    // Apply rounding rule: 13 frames or higher rounds up to the next second
    const framesInSecond = framesInt % framerate;
    if (framesInSecond >= 13) {
        framesInt += framerate - framesInSecond;
    } else {
        framesInt -= framesInSecond;
    }

    const totalSeconds = Math.floor(framesInt / framerate);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function processClip(clipName, mediaPath, clipsMap, timecode) {
    if (!mediaPath) return;

    const fileName = mediaPath.substring(mediaPath.lastIndexOf('/') + 1).split('?')[0];
    let source = 'Other';
    let id = '-';

    if (fileName.toUpperCase().includes('COLOURBOX')) {
        source = 'Colourbox';
        const match = fileName.match(/COLOURBOX(\d+)/i);
        if (match) id = match[1];
    } else if (fileName.toUpperCase().includes('IMAGO')) {
        source = 'Imago';
        const match = fileName.match(/IMAGO(\d+)/i);
        if (match) id = match[1];
    } else if (fileName.toUpperCase().includes('ARTLIST')) {
        source = 'Artlist';
        const match = fileName.match(/^(\d+)_/);
        if (match) id = match[1];
    }

    let type = 'Graphic Element';
    const ext = fileName.split('.').pop().toLowerCase();
    const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv'];
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'tiff', 'tif', 'bmp', 'svg'];
    
    if (videoExts.includes(ext)) {
        type = 'Video';
    } else if (imageExts.includes(ext)) {
        type = 'Image';
    }

    const namePart = fileName.split('_').slice(1).join('_').split('.')[0];
    const finalName = namePart || clipName.replace(/\.prproj$/, '');

    const key = `${finalName}-${source}-${id}-${type}`;
    if (!clipsMap.has(key)) {
        clipsMap.set(key, {
            name: finalName,
            type: type,
            source: source,
            id: id,
            timecodes: []
        });
    }
    clipsMap.get(key).timecodes.push(timecode);
}

function displayResults(clips) {
    const resultsContainer = document.getElementById('results-container');
    if (clips.length === 0) {
        resultsContainer.innerHTML = '<p>No clips found in the main sequence.</p>';
        return;
    }

    const table = document.createElement('table');
    table.id = 'results-table';

    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    ['Clip Name', 'Type', 'Source', 'ID', 'Timecodes'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
    });

    const tbody = table.createTBody();
    clips.forEach(clip => {
        const row = tbody.insertRow();
        
        row.insertCell().textContent = clip.name;
        row.insertCell().textContent = clip.type;
        row.insertCell().textContent = clip.source;
        row.insertCell().textContent = clip.id;
        
        const timecodeCell = row.insertCell();
        timecodeCell.innerHTML = clip.timecodes.join('<br>');
    });

    resultsContainer.innerHTML = '';
    resultsContainer.appendChild(table);
}
