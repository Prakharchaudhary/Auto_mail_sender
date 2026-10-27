/**
 * Download a file from an authenticated API endpoint.
 * Uses the filename from Content-Disposition when the server sends one.
 */
export async function downloadFile(request, url, fallbackName) {
  const response = await request(url);
  if (!response.ok) {
    let message = 'Download failed.';
    try {
      const data = await response.json();
      message = data.message || message;
    } catch (_error) {
      // Non-JSON error body; keep the generic message.
    }
    throw new Error(message);
  }

  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match ? match[1] : fallbackName;

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
