document.getElementById('prproj-file').addEventListener('change', handleFileUpload);

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Show loading message, hide previous results and errors
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
    const clipsData = [];
    const masterClipMap = new Map();

    // Step 1: Create a lookup table of all MasterClips and their file paths
    const masterClips = xmlDoc.querySelectorAll('MasterClip[ObjectID], MasterClip[ObjectURef]');
    masterClips.forEach(masterClip => {
        const id = masterClip.getAttribute('ObjectID') || masterClip.getAttribute('ObjectURef');
        const pathUrl = masterClip.querySelector('PathUrl')?.textContent || '';
        if (id && pathUrl) {
            masterClipMap.set(id, { name: masterClip.querySelector('Name')?.textContent, path: pathUrl });
        }
    });

    // Step 2: Find all sequences
    const sequences = xmlDoc.querySelectorAll('Sequence');
    if (sequences.length === 0) {
        throw new Error("No sequences found in the project file.");
    }

    // Process all sequences to find clips
    sequences.forEach(sequence => {
        // Step 3: Find all clips within the sequence's timeline
        const clipComponents = sequence.querySelectorAll('Component.Clip, VideoClip, AudioClip, SubClip');
        
        clipComponents.forEach(clipComponent => {
            let masterClipId = null;

            // Handle different types of clip components
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

                // Step 4: Process the clip data
                processClip(clipName, mediaPath, clipsData);
            }
        });
    });

    return clipsData;
}

function processClip(clipName, mediaPath, clipsData) {
    if (!mediaPath) return;

    const fileName = mediaPath.substring(mediaPath.lastIndexOf('/') + 1).split('?')[0];

    // Detect Source and ID
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

    // Detect Type
    let type = 'Graphic Element';
    const ext = fileName.split('.').pop().toLowerCase();
    const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv'];
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'tiff', 'tif', 'bmp', 'svg'];
    
    if (videoExts.includes(ext)) {
        type = 'Video';
    } else if (imageExts.includes(ext)) {
        type = 'Image';
    }

    // Format Clip Name
    const namePart = fileName.split('_').slice(1).join('_').split('.')[0];
    const finalName = namePart || clipName.replace(/\.prproj$/, '');

    clipsData.push({
        name: finalName,
        type: type,
        source: source,
        id: id
    });
}

function displayResults(clips) {
    const resultsContainer = document.getElementById('results-container');
    if (clips.length === 0) {
        resultsContainer.innerHTML = '<p>No clips found in the main sequence.</p>';
        return;
    }

    const table = document.createElement('table');
    table.id = 'results-table';

    // Create table header
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    ['Clip Name', 'Type', 'Source', 'ID'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
    });

    // Create table body
    const tbody = table.createTBody();
    clips.forEach(clip => {
        const row = tbody.insertRow();
        Object.values(clip).forEach(value => {
            const cell = row.insertCell();
            cell.textContent = value;
        });
    });

    resultsContainer.innerHTML = '';
    resultsContainer.appendChild(table);
}
