document.getElementById("processBtn").addEventListener("click", () => {
  const fileInput = document.getElementById("xmlFile");
  if (!fileInput.files.length) {
    alert("Please upload an XML file first!");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(e.target.result, "application/xml");

    const fps = 25; // adjust if needed
    const sequences = {};
    xmlDoc.querySelectorAll("sequence").forEach(seq => {
      const name = seq.querySelector("name")?.textContent || "Unnamed Sequence";
      sequences[name] = seq;
    });

    function framesToTime(frames) {
      let seconds = Math.floor(frames / fps);
      const remainder = frames % fps;
      if (remainder >= 13) seconds += 1;

      const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
      const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
      const s = String(seconds % 60).padStart(2, "0");
      return `${h}:${m}:${s}`;
    }

    function getName(clip) {
      let raw = clip.querySelector("name")?.textContent || "";
      if (raw.includes("_")) {
        return raw.split("_").slice(1).join("_"); // descriptive title
      }
      return raw;
    }

    function extractClips(sequence, parentOffset = 0) {
      const data = [];

      function handleTrack(track, type, index) {
        track.querySelectorAll("clipitem").forEach(clip => {
          const start = parseInt(clip.querySelector("start")?.textContent || "0") + parentOffset;
          const end = parseInt(clip.querySelector("end")?.textContent || "0") + parentOffset;
          const seqRef = clip.querySelector("sequence")?.textContent;
          const clipName = getName(clip);

          if (seqRef && sequences[seqRef]) {
            const nested = extractClips(sequences[seqRef], start);
            nested.forEach(c => {
              c.track_type = type;
              c.track_index = `${type[0].toUpperCase()}${index}`;
            });
            data.push(...nested);
          } else {
            data.push({
              name: clipName,
              timeline_in: framesToTime(start),
              timeline_out: framesToTime(end),
              track_type: type,
              track_index: `${type[0].toUpperCase()}${index}`
            });
          }
        });
      }

      sequence.querySelectorAll("media > video > track").forEach((t, i) => handleTrack(t, "video", i+1));
      sequence.querySelectorAll("media > audio > track").forEach((t, i) => handleTrack(t, "audio", i+1));

      return data;
    }

    // Take the first sequence as main (adjust if needed)
    const mainSeq = Object.values(sequences)[0];
    const clips = extractClips(mainSeq);

    // Sort by timeline_in
    clips.sort((a, b) => a.timeline_in.localeCompare(b.timeline_in));

    // Convert to CSV
    const headers = ["name","timeline_in","timeline_out","track_type","track_index"];
    const csv = [headers.join(",")].concat(
      clips.map(c => headers.map(h => `"${c[h]}"`).join(","))
    ).join("\n");

    // Show preview
    const outputDiv = document.getElementById("output");
    outputDiv.innerHTML = `
      <h2>Clips Extracted</h2>
      <pre>${csv.split("\n").slice(0, 10).join("\n")}...</pre>
      <a id="downloadLink">⬇️ Download Full CSV</a>
    `;

    // Download link
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const dl = document.getElementById("downloadLink");
    dl.href = url;
    dl.download = "premiere_timeline.csv";
  };

  reader.readAsText(fileInput.files[0]);
});
