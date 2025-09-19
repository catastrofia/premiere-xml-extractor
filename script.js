// Parse XML, extract clips, and export CSV

document.getElementById("processBtn").addEventListener("click", handleXML);
document.getElementById("downloadBtn").addEventListener("click", downloadCSV);

let csvContent = "";

function handleXML() {
  const fileInput = document.getElementById("xmlFile");
  if (!fileInput.files.length) {
    alert("Please upload a Premiere XML file first.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(e.target.result, "application/xml");
    processPremiereXML(xmlDoc);
  };
  reader.readAsText(fileInput.files[0]);
}

function processPremiereXML(xmlDoc) {
  const frameRate = 25; // adjust if needed
  const tracks = xmlDoc.querySelectorAll("sequence > media > video > track, sequence > media > audio > track");

  let rows = [["Track Type", "Clip Name", "Timeline In", "Timeline Out"]];

  tracks.forEach(track => {
    const isVideo = track.parentNode.nodeName === "video";
    const trackType = isVideo ? "Video" : "Audio";

    track.querySelectorAll("clipitem").forEach(clip => {
      const name = clip.querySelector("name")?.textContent || "Unnamed";
      const start = roundTime(clip.querySelector("start")?.textContent, frameRate);
      const end = roundTime(clip.querySelector("end")?.textContent, frameRate);

      rows.push([trackType, name, start, end]);
    });
  });

  // Convert to CSV
  csvContent = rows.map(r => r.join(",")).join("\n");

  document.getElementById("output").innerText = "Parsed " + (rows.length - 1) + " clips.";
  document.getElementById("downloadBtn").disabled = false;
}

function roundTime(frameValue, frameRate) {
  if (!frameValue) return "";
  const frame = parseInt(frameValue, 10);
  const seconds = Math.floor(frame / frameRate);
  const remainder = frame % frameRate;
  return remainder >= 13 ? seconds + 1 : seconds;
}

function downloadCSV() {
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "premiere_sequence.csv";
  a.click();
  URL.revokeObjectURL(url);
}
