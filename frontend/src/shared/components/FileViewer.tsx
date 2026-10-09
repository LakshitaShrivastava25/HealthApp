import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Minus, Plus, X } from 'lucide-react';
import { useBackToClose } from '../hooks/useBackToClose';

/**
 * Shows an uploaded file (prescription photo, report PDF, policy, licence)
 * inside the app.
 *
 * Opening the signed file link in a new tab used to hand PDFs to the
 * browser, which on phones means "download" or "open with another app"
 * rather than showing the document. Photos are shown as-is; PDFs are drawn
 * page by page with pdf.js (loaded only when a PDF is opened), which works
 * the same on desktop and phone browsers and needs nothing beyond the
 * site's existing Content-Security-Policy (connect-src already allows the API).
 *
 * `type` is the API's file_type: 'pdf' | 'image' | 'heic' | 'other' | ''.
 */
export type FileKind = 'pdf' | 'image' | 'heic' | 'other' | '';

const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2, 3];

export default function FileViewer({
  url,
  type,
  title,
  onClose,
}: {
  url: string;
  type: FileKind | string | undefined;
  title?: string;
  onClose: () => void;
}) {
  const [zoomIndex, setZoomIndex] = useState(1);
  const zoom = ZOOM_STEPS[zoomIndex];
  useBackToClose(true, onClose);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const kind = (type || '') as FileKind;
  const zoomable = kind === 'pdf' || kind === 'image';

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/85" role="dialog" aria-modal="true" aria-label={title || 'Document'}>
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 text-white" style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}>
        <p className="flex-1 min-w-0 truncate text-sm font-medium">{title || 'Document'}</p>
        {zoomable && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
              disabled={zoomIndex === 0}
              className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-40"
              aria-label="Zoom out"
            >
              <Minus size={16} />
            </button>
            <span className="w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-40"
              aria-label="Zoom in"
            >
              <Plus size={16} />
            </button>
          </div>
        )}
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="p-2 rounded-lg hover:bg-white/10"
          aria-label="Open in a new tab"
          title="Open in a new tab"
        >
          <ExternalLink size={16} />
        </a>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {kind === 'image' && (
          <div className="min-h-full flex items-center justify-center p-3">
            <img
              src={url}
              alt={title || 'Uploaded photo'}
              style={{ width: `${zoom * 100}%`, maxWidth: zoom <= 1 ? '100%' : 'none' }}
              className="h-auto rounded-md bg-white object-contain"
            />
          </div>
        )}
        {kind === 'pdf' && <PdfPages url={url} zoom={zoom} />}
        {kind !== 'image' && kind !== 'pdf' && (
          <Unsupported url={url} message={
            kind === 'heic'
              ? 'This photo is in HEIC format, which most browsers cannot display.'
              : 'This file type cannot be shown here.'
          } />
        )}
      </div>
    </div>,
    document.body
  );
}

function Unsupported({ url, message }: { url: string; message: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
      <p className="text-sm max-w-sm">{message}</p>
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-4 py-2 text-sm font-medium hover:bg-white/25">
        <ExternalLink size={14} /> Open the file
      </a>
    </div>
  );
}

type PdfDocument = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
};
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvas: HTMLCanvasElement; viewport: unknown }) => { promise: Promise<void>; cancel: () => void };
};

/** Every page of a PDF, each on its own canvas, re-drawn when the zoom changes. */
function PdfPages({ url, zoom }: { url: string; zoom: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let loaded: PdfDocument | null = null;
    (async () => {
      try {
        const [pdfjs, worker] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        // The file endpoint sends the whole file at once; range and stream
        // requests would only add round-trips.
        const doc = (await pdfjs.getDocument({ url, disableRange: true, disableStream: true }).promise) as unknown as PdfDocument;
        if (cancelled) {
          void doc.destroy();
          return;
        }
        loaded = doc;
        setPdf(doc);
      } catch {
        if (!cancelled) setError('This PDF could not be shown here.');
      }
    })();
    return () => {
      cancelled = true;
      if (loaded) void loaded.destroy();
    };
  }, [url]);

  if (error) return <Unsupported url={url} message={error} />;
  if (!pdf) {
    return <p className="p-6 text-center text-sm text-white/80">Loading document…</p>;
  }
  return (
    <div ref={containerRef} className="flex flex-col items-center gap-3 p-3">
      {Array.from({ length: pdf.numPages }, (_, i) => (
        <PdfPageCanvas key={i} pdf={pdf} pageNumber={i + 1} zoom={zoom} containerRef={containerRef} />
      ))}
    </div>
  );
}

function PdfPageCanvas({
  pdf,
  pageNumber,
  zoom,
  containerRef,
}: {
  pdf: PdfDocument;
  pageNumber: number;
  zoom: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let task: { promise: Promise<void>; cancel: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      // Fit the page to the available width at 100%, then apply the zoom.
      const available = Math.min((containerRef.current?.clientWidth ?? 800) - 24, 1100);
      const base = page.getViewport({ scale: 1 });
      const cssScale = (available / base.width) * zoom;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: cssScale * pixelRatio });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / pixelRatio)}px`;
      canvas.style.height = `${Math.floor(viewport.height / pixelRatio)}px`;
      task = page.render({ canvas, viewport });
      await task.promise.catch(() => undefined);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, zoom, containerRef]);

  return <canvas ref={canvasRef} className="bg-white shadow-lg rounded-sm max-w-none" aria-label={`Page ${pageNumber}`} />;
}
