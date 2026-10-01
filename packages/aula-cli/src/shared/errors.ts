// Only exact local labels/numeric statuses are safe to surface. Never forward arbitrary
// fetch, browser, parser, filesystem, or remote error strings (they may contain secrets).
export const safeErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : "";
  if (/^(Request failed: \d{3}|Attachment download failed \(\d{3}\)|Aula token exchange failed: \d{3})$/.test(message)) return message;
  const safe = new Set([
    "State directory must already be private (0700); existing permissions were not changed.",
    "Output directory must be private (0700) and not symlinked",
    "Symlink output directory rejected",
    "Discovery capture is disabled in this private read-only installation.",
    "Aula network request failed or timed out; details suppressed to protect credentials.",
    "Attachment request failed; signed URL suppressed",
    "Attachment download interrupted or exceeded size limit; partial file removed",
    "Attachment too large",
    "Attachment download could not start; no output file created",
    "Attachment download failed; partial file cleanup could not be confirmed",
    "Document extraction failed; PDF requires Poppler pdftotext and DOCX requires Python 3",
    "Expected one available attachment with no reported scan block with this ID in the refreshed parent",
    "Message not found within the scanned pages",
    "Message pagination repeated a page",
    "Pagination repeated existing rows; refusing to claim completeness",
    "Pagination returned an empty page while reporting more results",
    "Pagination limit reached before an empty page; increase --max-pages"
  ]);
  if (safe.has(message)) return message;
  return "Aula command failed. Check private state, arguments, network, or login expiry; sensitive error details suppressed.";
};
