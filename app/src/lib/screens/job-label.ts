import type { InstallJob } from '@lexnur/native';
import type { Lang, Translate } from '../i18n';
import { formatBytes, formatPercent } from '../data/format';
import type { StartResult } from '../data/package-installer';

export interface JobLabel { text: string; error: boolean; progress: number | null; indeterminate: boolean }

export function jobLabel(job: InstallJob, t: Translate, lang: Lang): JobLabel {
  const frac = job.totalBytes > 0 ? job.bytesDownloaded / job.totalBytes : 0;
  const plain = (text: string, progress: number | null = frac): JobLabel => ({ text, error: false, progress, indeterminate: false });
  switch (job.state) {
    case 'queued': return plain(t('job.queued'), 0);
    case 'downloading':
      return plain(t('job.downloading', { percent: formatPercent(frac, lang), done: formatBytes(job.bytesDownloaded, lang), total: formatBytes(job.totalBytes, lang) }));
    case 'waiting_network': return plain(t('job.waiting_network'));
    case 'waiting_wifi': return plain(t('job.waiting_wifi', { size: formatBytes(job.totalBytes - job.bytesDownloaded, lang) }));
    case 'paused': return plain(t('job.paused'));
    case 'verifying': return { text: t('job.verifying'), error: false, progress: null, indeterminate: true };
    case 'installing': return { text: t('job.installing'), error: false, progress: null, indeterminate: true };
    case 'done': return plain(t('job.done'), 1);
    case 'failed': {
      const text = job.error === 'network' ? t('job.failed_network')
        : job.error === 'http' ? t('job.failed_http', { status: String(job.httpStatus ?? '') })
        : job.error === 'checksum' ? t('job.failed_checksum')
        : job.error === 'no_space' ? t('job.failed_no_space')
        : t('job.failed_other');
      return { text, error: true, progress: null, indeterminate: false };
    }
  }
}

// Reinstall removes the broken package before it queues the download, so a download that does not
// start leaves the dictionary gone. 'nothing' means a job for it already exists and is shown.
export function reinstallNotice(r: StartResult, title: string, t: Translate, lang: Lang): string | null {
  if (r.kind === 'no_space') return t('reinstall.no_space', { title, needed: formatBytes(r.needed, lang), free: formatBytes(r.free, lang) });
  if (r.kind === 'cancelled') return t('reinstall.not_started', { title });
  return null;
}
