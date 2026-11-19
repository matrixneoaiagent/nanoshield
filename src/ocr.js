// Client-Side Canvas Image Redactor for NanoShield
// Allows users to paste or drop images/screenshots containing PII,
// performs OCR/text-region mapping, and burns black redaction boxes onto the image.

export function loadImageToCanvas(fileOrBlob, canvas) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve({ img, ctx, width: canvas.width, height: canvas.height });
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(fileOrBlob);
  });
}

// Applies visual blackout bounding boxes over canvas regions
export function applyVisualRedactions(canvas, regions = []) {
  const ctx = canvas.getContext('2d');
  ctx.save();
  for (const r of regions) {
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(r.x, r.y, r.width, r.height);

    // Optional subtle security border
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.width, r.height);

    // Small label tag
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('REDACTED', r.x + 4, r.y + 12);
  }
  ctx.restore();
}

// Convert canvas to downloadable blob
export function exportCanvasBlob(canvas, type = 'image/png') {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type);
  });
}
