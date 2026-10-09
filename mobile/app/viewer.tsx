import { Feather } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { getServerRoot } from '../src/lib/config';
import { colors, spacing } from '../src/theme';

/**
 * Shows an uploaded file — prescription photo, report PDF, policy, licence —
 * inside the app.
 *
 * "Open original" used to hand the signed file link to the phone's browser.
 * Android's Chrome does not display PDFs: it downloads them or asks which
 * app to open them with, which is exactly what people saw. Photos left the
 * app too. Here a photo is shown with pinch-to-zoom, and a PDF is drawn page
 * by page with pdf.js inside a WebView.
 *
 * The WebView page is given the API server as its origin, so fetching the
 * signed file is a same-origin request (no CORS involved). pdf.js itself is
 * loaded from jsDelivr, pinned to the same version the website bundles.
 */

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build';

function viewerHtml(url: string, kind: string) {
  // JSON.stringify makes both values safe to embed in the script.
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=6, user-scalable=yes">
<style>
  html, body { margin: 0; background: #1f2430; }
  #pages { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 10px 0 24px; }
  canvas { background: #fff; width: 96vw; height: auto; box-shadow: 0 2px 8px rgba(0,0,0,.45); }
  img { display: block; width: 100vw; height: auto; }
</style>
</head><body>
<div id="pages"></div>
<script type="module">
  const url = ${JSON.stringify(url)};
  const kind = ${JSON.stringify(kind)};
  const post = (msg) => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  const pages = document.getElementById('pages');
  try {
    if (kind === 'image') {
      const img = new Image();
      img.onload = () => post({ type: 'ready' });
      img.onerror = () => post({ type: 'error', reason: 'image' });
      img.alt = 'Uploaded photo';
      img.src = url;
      pages.appendChild(img);
    } else {
      const pdfjs = await import('${PDFJS}/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = '${PDFJS}/pdf.worker.min.mjs';
      const doc = await pdfjs.getDocument({ url, disableRange: true, disableStream: true }).promise;
      post({ type: 'pages', count: doc.numPages });
      const ratio = Math.min(window.devicePixelRatio || 1, 2.5);
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (window.innerWidth * 0.96 / base.width) * ratio });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        pages.appendChild(canvas);
        await page.render({ canvas, viewport }).promise;
        if (n === 1) post({ type: 'ready' });
      }
    }
  } catch (e) {
    post({ type: 'error', reason: String(e && e.message || e) });
  }
</script>
</body></html>`;
}

export default function FileViewerScreen() {
  const { url, type: kind, title } = useLocalSearchParams<{ url: string; type?: string; title?: string }>();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  const viewable = kind === 'pdf' || kind === 'image';
  const html = useMemo(() => (url && viewable ? viewerHtml(url, kind as string) : ''), [url, kind, viewable]);

  function onMessage(event: WebViewMessageEvent) {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === 'ready') setState('ready');
      if (message.type === 'error') setState('error');
    } catch {
      // Not ours.
    }
  }

  const openElsewhere = () => url && Linking.openURL(url);

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: title || 'Document',
          headerRight: () =>
            url ? (
              <Pressable onPress={openElsewhere} hitSlop={10} accessibilityLabel="Open in another app">
                <Feather name="external-link" size={19} color={colors.ink700} />
              </Pressable>
            ) : null,
        }}
      />

      {!url || !viewable ? (
        <Message
          text={
            kind === 'heic'
              ? 'This photo is in HEIC format, which can’t be shown here.'
              : 'This file can’t be shown in the app.'
          }
          action={url ? { label: 'Open in another app', onPress: openElsewhere } : undefined}
        />
      ) : state === 'error' ? (
        <Message
          text="This file couldn’t be shown. Check your connection and try again."
          action={{
            label: 'Try again',
            onPress: () => {
              setState('loading');
              setAttempt((n) => n + 1);
            },
          }}
          secondary={{ label: 'Open in another app', onPress: openElsewhere }}
        />
      ) : (
        <>
          <WebView
            key={attempt}
            originWhitelist={['*']}
            source={{ html, baseUrl: getServerRoot() }}
            onMessage={onMessage}
            onError={() => setState('error')}
            onHttpError={() => setState('error')}
            javaScriptEnabled
            setBuiltInZoomControls
            setDisplayZoomControls={false}
            style={styles.webview}
          />
          {state === 'loading' && (
            <View style={styles.loading} pointerEvents="none">
              <ActivityIndicator color={colors.white} />
              <Text style={styles.loadingText}>Opening…</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

function Message({
  text,
  action,
  secondary,
}: {
  text: string;
  action?: { label: string; onPress: () => void };
  secondary?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.message}>
      <Feather name="file" size={28} color={colors.white} />
      <Text style={styles.messageText}>{text}</Text>
      {action && (
        <Pressable onPress={action.onPress} style={styles.messageButton}>
          <Text style={styles.messageButtonText}>{action.label}</Text>
        </Pressable>
      )}
      {secondary && (
        <Pressable onPress={secondary.onPress} hitSlop={8}>
          <Text style={styles.secondaryText}>{secondary.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#1f2430' },
  webview: { flex: 1, backgroundColor: '#1f2430' },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: { color: colors.white, fontSize: 13 },
  message: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  messageText: { color: colors.white, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  messageButton: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  messageButtonText: { color: colors.white, fontWeight: '600', fontSize: 14 },
  secondaryText: { color: 'rgba(255,255,255,0.75)', fontSize: 13, textDecorationLine: 'underline' },
});
