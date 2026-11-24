import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import ECGProgressBar from './ECGProgressBar';
import { Card } from './ui';
import { colors, spacing, type } from '../theme';

/**
 * One upload, from the moment a file is chosen until the server has it.
 *
 *   preparing  — the photo is being resized on the phone (can take a second
 *                or two for a big camera image, with nothing else on screen)
 *   uploading  — bytes going up; a percentage when the phone reports one
 *   processing — every byte sent, waiting on the server's answer (for an
 *                insurance policy that is the AI reading the whole document)
 *   done       — the server answered; shown briefly while the list reloads
 *
 * Before this, the locker showed a bar stuck at 0% on phones that do not
 * report progress, then "100%" frozen while the server worked, and the
 * insurance tab showed only a spinner inside its button.
 */
export type UploadStage = 'idle' | 'preparing' | 'uploading' | 'processing' | 'done';

export function useUploadStatus() {
  const [stage, setStage] = useState<UploadStage>('idle');
  // 0–1, or null while the size of the work is unknown.
  const [progress, setProgress] = useState<number | null>(0);

  const onProgress = useCallback((pct: number | null) => {
    if (pct === null) {
      setProgress(null);
      return;
    }
    setProgress(pct / 100);
    if (pct >= 100) setStage((s) => (s === 'uploading' ? 'processing' : s));
  }, []);

  return useMemo(
    () => ({
      stage,
      progress,
      busy: stage !== 'idle',
      onProgress,
      preparing: () => {
        setProgress(null);
        setStage('preparing');
      },
      uploading: () => {
        setProgress(0);
        setStage('uploading');
      },
      done: () => setStage('done'),
      reset: () => setStage('idle'),
    }),
    [stage, progress, onProgress]
  );
}

type Copy = { preparing?: string; uploading?: string; processing?: string; done?: string; note?: string };

const DEFAULT_COPY: Required<Omit<Copy, 'note'>> = {
  preparing: 'Preparing your file…',
  uploading: 'Uploading your document…',
  processing: 'Upload complete — saving it…',
  done: 'Uploaded',
};

export function UploadStatusCard({
  stage,
  progress,
  copy,
}: {
  stage: UploadStage;
  progress: number | null;
  copy?: Copy;
}) {
  if (stage === 'idle') return null;
  const text = { ...DEFAULT_COPY, ...copy };

  const barProgress = stage === 'uploading' ? progress : stage === 'done' ? 1 : null;
  const caption =
    stage === 'preparing' ? 'Preparing…' : stage === 'processing' ? 'Processing…' : undefined;

  return (
    <Card style={styles.card}>
      <ECGProgressBar progress={barProgress} isComplete={stage === 'done'} caption={caption} />
      <Text style={styles.title} accessibilityLiveRegion="polite">
        {text[stage]}
      </Text>
      {!!copy?.note && stage !== 'done' && <Text style={styles.note}>{copy.note}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderColor: colors.brandLavender },
  title: { ...type.caption, textAlign: 'center', color: colors.ink700 },
  note: { ...type.micro, textAlign: 'center', marginTop: spacing.xs },
});
