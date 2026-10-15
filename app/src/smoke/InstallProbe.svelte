<script lang="ts">
  import { onMount } from 'svelte';
  import { Capacitor } from '@capacitor/core';
  import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
  import { LexnurNative, type InstallJob, type StartInstallOptions } from '@lexnur/native';

  const cfg = JSON.parse(import.meta.env.VITE_SMOKE_INSTALL!) as StartInstallOptions & { script?: 'pause-resume' | 'download-now' | 'pause-download-now' };
  const dataDir = Capacitor.getPlatform() === 'ios' ? Directory.Library : Directory.Data;
  const log: { t: number; job: InstallJob }[] = [];
  let last = $state<InstallJob | null>(null);
  let paused = false;
  let step = 0;

  function mark(label: string, job: InstallJob) {
    log.push({ t: Date.now(), job: { id: 'mark', version: label, state: job.state, bytesDownloaded: job.bytesDownloaded, totalBytes: job.totalBytes } });
  }

  // Switches a Wi-Fi-only download to "Download now" mid-transfer, as the UI does; the second call must not replace
  // the task again. 'pause-download-now' first pauses and resumes Wi-Fi-only, so the switched task came from resume data.
  async function downloadNowScript(job: InstallJob) {
    if (job.state !== 'downloading') return;
    const at = (f: number) => job.bytesDownloaded > job.totalBytes * f;
    if (cfg.script === 'pause-download-now' && step === 0 && at(0.2)) {
      step = 1;
      mark('pause', job);
      await LexnurNative.pauseInstall({ id: cfg.id });
      setTimeout(() => LexnurNative.resumeInstall({ id: cfg.id, allowCellular: false }), 5000);
    } else if (step === (cfg.script === 'pause-download-now' ? 1 : 0) && at(0.45)) {
      step = 2;
      mark('download-now', job);
      await LexnurNative.resumeInstall({ id: cfg.id, allowCellular: true });
      setTimeout(() => LexnurNative.resumeInstall({ id: cfg.id, allowCellular: true }), 4000);
    }
  }

  async function save() {
    await Filesystem.writeFile({ path: 'install-log.json', directory: dataDir, encoding: Encoding.UTF8, data: JSON.stringify(log) });
  }

  onMount(async () => {
    await LexnurNative.addListener('installProgress', async (job) => {
      log.push({ t: Date.now(), job });
      last = job;
      if (cfg.script === 'pause-resume' && !paused && job.state === 'downloading' && job.bytesDownloaded > job.totalBytes * 0.3) {
        paused = true;
        await LexnurNative.pauseInstall({ id: cfg.id });
        setTimeout(() => LexnurNative.resumeInstall({ id: cfg.id, allowCellular: true }), 5000);
      }
      if (cfg.script === 'download-now' || cfg.script === 'pause-download-now') await downloadNowScript(job);
      await save();
    });
    const { jobs } = await LexnurNative.status();
    log.push({ t: Date.now(), job: { id: 'status', version: '', state: 'queued', bytesDownloaded: jobs.length, totalBytes: 0 } });
    if (!jobs.some((j) => j.id === cfg.id && j.state === 'done')) await LexnurNative.startInstall(cfg);
    await save();
  });
</script>

<section data-testid="install-probe">
  <h2>Install probe</h2>
  <pre>{JSON.stringify(last, null, 1)}</pre>
</section>
