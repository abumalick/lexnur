package com.lexnur.nativeplugin;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.StatFs;
import android.os.SystemClock;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.ForegroundInfo;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.File;
import java.net.URL;
import java.util.concurrent.ConcurrentHashMap;

public final class InstallWorker extends Worker {
    public static final String KEY_ID = "id";
    private static final String CHANNEL = "lexnur-downloads";
    private static final int MAX_NETWORK_RETRIES = 8;
    private static final ConcurrentHashMap<String, Object> LOCKS = new ConcurrentHashMap<>();

    private volatile boolean abandoned;

    public InstallWorker(@NonNull Context context, @NonNull WorkerParameters params) { super(context, params); }

    @NonNull
    @Override
    public Result doWork() {
        String id = getInputData().getString(KEY_ID);
        if (id == null) return Result.failure();
        // A replaced worker may still be blocked in a read; the next one must not touch the same .part until it is gone.
        synchronized (LOCKS.computeIfAbsent(id, k -> new Object())) {
            return run(id);
        }
    }

    private Result run(String id) {
        File packagesDir = Paths.packagesDir(getApplicationContext());
        JobStore store = new JobStore(packagesDir);
        InstallJob job = store.get(id);
        if (job == null || JobRules.isTerminal(job.state) || "paused".equals(job.state)) return Result.success();
        try { setForegroundAsync(foregroundInfo(0, false)).get(); } catch (Exception ignored) { }
        job.state = "downloading";
        job.error = null;
        if (!publish(store, job)) return Result.success();
        PackageFetcher fetcher = new PackageFetcher(d -> new StatFs(d.getPath()).getAvailableBytes());
        File dir = new File(packagesDir, job.id);
        try {
            File fin = fetcher.fetch(new URL(job.url), dir, job.version, job.sha256,
                job.sizeBytes, job.installedSizeBytes, new PackageFetcher.Listener() {
                    long lastEmit;
                    @Override public void onProgress(long done, long total) {
                        job.bytesDownloaded = done;
                        long now = SystemClock.elapsedRealtime();
                        if (now - lastEmit >= 250 || done == total) {
                            lastEmit = now;
                            if (publish(store, job)) setForegroundAsync(foregroundInfo((int) (100 * done / Math.max(1, total)), false));
                        }
                    }
                    @Override public void onPhase(String state) {
                        job.state = state;
                        if (publish(store, job)) setForegroundAsync(foregroundInfo(100, true));
                    }
                    @Override public boolean isStopped() { return abandoned || InstallWorker.this.isStopped(); }
                });
            job.state = "done";
            job.bytesDownloaded = job.sizeBytes;
            job.relativePath = job.id + "/" + fin.getName();
            publish(store, job);
            return Result.success();
        } catch (PackageFetcher.StoppedException e) {
            // The plugin's pause/cancel owns the stored state; only a system stop is parked as waiting.
            InstallJob parked = store.update(id, stored -> {
                if (!JobRules.isInFlight(stored.state)) return false;
                String w = JobRules.waitingState(getApplicationContext(), stored.allowCellular);
                stored.state = "queued".equals(w) ? "waiting_network" : w;
                return true;
            });
            if (parked != null) ProgressBus.emit(parked);
            return abandoned || store.get(id) == null ? Result.success() : Result.retry();
        } catch (PackageFetcher.FetchException e) {
            // The fetcher reports local write errors on the .part (full disk) as "network".
            String code = "network".equals(e.code) && outOfSpace(dir, job) ? "no_space" : e.code;
            if ("network".equals(code) && getRunAttemptCount() < MAX_NETWORK_RETRIES) {
                job.state = JobRules.waitingState(getApplicationContext(), job.allowCellular);
                if ("queued".equals(job.state)) job.state = "waiting_network";
                publish(store, job);
                return Result.retry();
            }
            job.state = "failed";
            job.error = code;
            job.httpStatus = e.httpStatus;
            publish(store, job);
            return Result.failure();
        } catch (java.net.MalformedURLException e) {
            job.state = "failed";
            job.error = "io";
            publish(store, job);
            return Result.failure();
        }
    }

    private static boolean outOfSpace(File dir, InstallJob job) {
        long part = PackageFetcher.partFile(dir, job.version).length();
        long need = PackageFetcher.spaceNeeded(job.sizeBytes, part, job.installedSizeBytes);
        return new StatFs(dir.getParentFile().getPath()).getAvailableBytes() < need;
    }

    /**
     * Writes the worker's progress onto the stored job only if the plugin has not paused or removed it meanwhile.
     * Returns false (and stops the worker) when the job is gone or paused; a finished install still lands.
     */
    private boolean publish(JobStore store, InstallJob job) {
        if (!"done".equals(job.state) && InstallWorker.this.isStopped()) return false;
        InstallJob written;
        try {
            written = store.update(job.id, stored -> JobRules.applyProgress(stored, job));
        } catch (IllegalStateException e) {
            written = job;
        }
        if (written == null) { abandoned = true; return false; }
        ProgressBus.emit(written);
        return true;
    }

    private ForegroundInfo foregroundInfo(int percent, boolean indeterminate) {
        Context c = getApplicationContext();
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, c.getString(R.string.lexnur_download_channel), NotificationManager.IMPORTANCE_LOW));
        }
        Notification n = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(c.getString(indeterminate ? R.string.lexnur_download_installing : R.string.lexnur_download_title))
            .setProgress(100, percent, indeterminate)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build();
        return Build.VERSION.SDK_INT >= 29
            ? new ForegroundInfo(4201, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
            : new ForegroundInfo(4201, n);
    }
}
