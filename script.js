document.getElementById('prproj-file').addEventListener('change', handleFileUpload);

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) {
        console.warn('No file selected.');
        return;
    }

    // Show loading message, hide previous results and errors
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('results-container').innerHTML = '';
    document.getElementById('error-message').classList.add('hidden');
    console.clear();
    console.log('--- Starting file processing ---');

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const xmlString = e.target.result;
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

            if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
                const errorText = 'Invalid XML file. Please ensure you have uploaded a valid .prproj file.';
                console.error('Parser Error:', errorText, xmlDoc.getElementsByTagName('parsererror')[0]);
                document.getElementById('error-message').innerHTML = `<p>${errorText}</p>`;
                document.getElementById('error-message').classList.remove('hidden');
                throw new Error(errorText);
            }

            console.log('File successfully parsed as XML.');
            const clips = extractClipData(xmlDoc);
            displayResults(clips);
        } catch (error) {
            console.error("An error occurred during file processing:", error);
            document.getElementById('error-message').innerHTML = `<p>An error occurred: ${error.message}</p>`;
            document.getElementById('error-message').classList.remove('hidden');
        } finally {
            document.getElementById('loading').classList.add('hidden');
            console.log('--- Finished file processing ---');
        }
    };
    reader.readAsText(file);
}

function extractClipData(xmlDoc) {
    const clipsMap = new Map();
    const masterClipMap = new Map();
    const sequenceFrameRate = getSequenceFrameRate(xmlDoc);

    console.log('Step 1: Building MasterClip lookup table...');
    const masterClips = xmlDoc.querySelectorAll('MasterClip[ObjectID], MasterClip[ObjectURef]');
    console.log(`Found ${masterClips.length} potential MasterClips.`);
    masterClips.forEach(masterClip => {
        const id = masterClip.getAttribute('ObjectID') || masterClip.getAttribute('ObjectURef');
        const pathUrl = masterClip.querySelector('PathUrl')?.textContent || '';
        if (id && pathUrl) {
            masterClipMap.set(id, { name: masterClip.querySelector('Name')?.textContent, path: pathUrl });
        }
    });
    console.log(`MasterClip lookup table built with ${masterClipMap.size} valid entries.`);

    console.log('Step 2: Finding Sequences...');
    const sequences = xmlDoc.querySelectorAll('Sequence');
    if (sequences.length === 0) {
        throw new Error("No sequences found in the project file. The file may be corrupt or an unsupported format.");
    }
    console.log(`Found ${sequences.length} sequences.`);

    sequences.forEach((sequence, index) => {
        console.log(`Processing Sequence #${index + 1}...`);
        const clipComponents = sequence.querySelectorAll('Component.Clip, VideoClip, AudioClip, SubClip');
        console.log(`Found ${clipComponents.length} clip components in this sequence.`);
        
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
                const inPointTicks = parseInt(clipComponent.querySelector('InPoint')?.textContent, 10);
                const outPointTicks = parseInt(clipComponent.querySelector('OutPoint')?.textContent, 10);

                if (!isNaN(inPointTicks) && !isNaN(outPointTicks)) {
                    const inTimecode = ticksToTimecode(inPointTicks, sequenceFrameRate);
                    const outTimecode = ticksToTimecode(outPointTicks, sequenceFrameRate);

                    processClip(clipName, mediaPath, clipsMap, `${inTimecode} - ${outTimecode}`);
                } else {
                    console.warn(`Skipping clip '${clipName}' due to missing timecode data.`);
                }
            } else {
                console.warn(`Skipping a clip component as its master clip reference was not found.`);
            }
        });
    });

    return Array.from(clipsMap.values());
}

function getSequenceFrameRate(xmlDoc) {
    const framerateElement = xmlDoc.querySelector('Sequence FrameRate, VideoTrack FrameRate');
    if (framerateElement && !isNaN(parseInt(framerateElement.textContent, 10))) {
        // This value is not the direct frame rate, but a tick value.
        // A common practice is to assume a standard rate and calculate from there.
        console.log('Found FrameRate element, assuming standard 25fps for calculations.');
        return 25;
    }
    console.warn('Could not find FrameRate in sequence. Assuming a default of 25fps.');
    return 25;
}

function ticksToTimecode(ticks, framerate) {
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
        resultsContainer.innerHTML = '<p>No clips found in any sequence.</p>';
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
