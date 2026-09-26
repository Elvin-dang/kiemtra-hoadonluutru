// Safari can cancel a download whose object URL is revoked in the same tick as the click.
const REVOKE_DELAY_MS = 60_000;

export function saveFile(data: ArrayBuffer, fileName: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
