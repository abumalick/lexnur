package com.lexnur.nativeplugin;

import android.Manifest;
import android.os.Build;
import android.os.StatFs;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.IOException;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "LexnurNative", permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) })
public class LexnurNativePlugin extends Plugin {
    private JobStore store;
    private File packagesDir;

    @Override
    public void load() {
        packagesDir = Paths.packagesDir(getContext());
        store = new JobStore(packagesDir);
        new Thread(this::reconcile).start();
        ProgressBus.setListener(job -> notifyListeners("installProgress", job.toJs()));
    }

    @PluginMethod public void paths(PluginCall call) {
        JSObject r = new JSObject();
        r.put("packagesDir", packagesDir.getAbsolutePath());
        call.resolve(r);
    }

    @PluginMethod public void freeSpace(PluginCall call) {
        JSObject r = new JSObject();
        r.put("bytes", new StatFs(packagesDir.getPath()).getAvailableBytes());
        call.resolve(r);
    }

    @PluginMethod public void systemColors(PluginCall call) {
        JSObject r = new JSObject();
        if (Build.VERSION.SDK_INT >= 31) r.put("seed", String.format("#%06X", 0xFFFFFF & getContext().getColor(android.R.color.system_accent1_500)));
        else r.put("seed", JSObject.NULL);
        call.resolve(r);
    }

    @PluginMethod public void startInstall(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "afterNotificationPermission");
            return;
        }
        doStart(call);
    }

    @PermissionCallback
    private void afterNotificationPermission(PluginCall call) { doStart(call); }

    private void doStart(PluginCall call) { guarded(call, () -> startNow(call)); }

    private void startNow(PluginCall call) {
        String id = call.getString("id"), version = call.getString("version");
        if (id == null || version == null || call.getString("url") == null || call.getString("sha256") == null) { call.reject("missing option", "io"); return; }
        InstallJob existing = store.get(id);
        if (existing != null && version.equals(existing.version) && !JobRules.isTerminal(existing.state)) {
            if (!"paused".equals(existing.state) && workActive(id)) { call.resolve(); return; }
            boolean cellular = Boolean.TRUE.equals(call.getBoolean("allowCellular", false));
            InstallJob updated = store.update(id, st -> {
                if (JobRules.isTerminal(st.state)) return false;
                st.allowCellular = cellular;
                st.state = initialState(cellular);
                st.error = null;
                return true;
            });
            if (updated != null) { enqueue(updated, ExistingWorkPolicy.KEEP); ProgressBus.emit(updated); }
            call.resolve();
            return;
        }
        InstallJob job = new InstallJob();
        job.id = id; job.version = version; job.url = call.getString("url"); job.sha256 = call.getString("sha256");
        // PluginCall.getLong only accepts a Long, but org.json parses values below 2^31 as Integer.
        job.sizeBytes = call.getData().optLong("sizeBytes", 0L); job.installedSizeBytes = call.getData().optLong("installedSizeBytes", 0L);
        job.allowCellular = Boolean.TRUE.equals(call.getBoolean("allowCellular", false));
        job.state = initialState(job.allowCellular);
        store.put(job);
        enqueue(job, ExistingWorkPolicy.REPLACE);
        ProgressBus.emit(job);
        call.resolve();
    }

    private String initialState(boolean allowCellular) {
        return JobRules.waitingState(getContext(), allowCellular);
    }

    private boolean workInfo(String id, boolean runningOnly) {
        try {
            for (WorkInfo w : WorkManager.getInstance(getContext()).getWorkInfosForUniqueWork("install-" + id).get()) {
                if (runningOnly ? w.getState() == WorkInfo.State.RUNNING : !w.getState().isFinished()) return true;
            }
        } catch (Exception ignored) { }
        return false;
    }

    private boolean workActive(String id) { return workInfo(id, false); }

    /** Parks stored in-flight jobs whose worker is not running (force-stop, killed process) as waiting. */
    private void reconcile() {
        for (InstallJob j : store.all()) {
            if (!JobRules.isInFlight(j.state)) continue;
            if (workInfo(j.id, true)) continue;
            try {
                InstallJob fixed = store.update(j.id, st -> {
                    String n = JobRules.normalise(st.state, st.allowCellular, false);
                    if (n.equals(st.state)) return false;
                    st.state = n;
                    return true;
                });
                if (fixed != null) ProgressBus.emit(fixed);
            } catch (IllegalStateException ignored) { }
        }
    }

    private void enqueue(InstallJob job, ExistingWorkPolicy policy) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(job.allowCellular ? NetworkType.CONNECTED : NetworkType.UNMETERED)
            .build();
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(InstallWorker.class)
            .setConstraints(constraints)
            .setInputData(new Data.Builder().putString(InstallWorker.KEY_ID, job.id).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
            .build();
        WorkManager.getInstance(getContext()).enqueueUniqueWork("install-" + job.id, policy, req);
    }

    @PluginMethod public void pauseInstall(PluginCall call) { guarded(call, () -> {
        String id = call.getString("id");
        InstallJob job = id == null ? null : store.update(id, st -> {
            if (JobRules.isTerminal(st.state)) return false;
            st.state = "paused";
            return true;
        });
        if (job != null) {
            WorkManager.getInstance(getContext()).cancelUniqueWork("install-" + job.id);
            ProgressBus.emit(job);
        }
        call.resolve();
    }); }

    @PluginMethod public void resumeInstall(PluginCall call) { guarded(call, () -> {
        String id = call.getString("id");
        InstallJob existing = id == null ? null : store.get(id);
        if (existing == null) { call.reject("no such job", "io"); return; }
        boolean cellular = Boolean.TRUE.equals(call.getBoolean("allowCellular", false));
        InstallJob job = store.update(id, st -> {
            if (JobRules.isTerminal(st.state)) return false;
            st.allowCellular = cellular;
            st.state = initialState(cellular);
            st.error = null;
            return true;
        });
        if (job != null) { enqueue(job, ExistingWorkPolicy.REPLACE); ProgressBus.emit(job); }
        call.resolve();
    }); }

    @PluginMethod public void cancelInstall(PluginCall call) { guarded(call, () -> {
        InstallJob job = store.get(call.getString("id"));
        if (job == null) { call.resolve(); return; }
        store.remove(job.id);
        WorkManager.getInstance(getContext()).cancelUniqueWork("install-" + job.id);
        File dir = new File(packagesDir, job.id);
        PackageFetcher.partFile(dir, job.version).delete();
        PackageFetcher.zstFile(dir, job.version).delete();
        PackageFetcher.tmpFile(dir, job.version).delete();
        call.resolve();
    }); }

    @PluginMethod public void removePackage(PluginCall call) {
        try {
            File f = Paths.resolve(packagesDir, call.getString("relativePath", ""));
            if (f.exists() && !f.delete()) { call.reject("delete failed", "io"); return; }
            File parent = f.getParentFile();
            String[] rest = parent == null ? null : parent.list();
            if (rest != null && rest.length == 0) parent.delete();
            call.resolve();
        } catch (IOException e) {
            call.reject(e.getMessage(), "io");
        }
    }

    @PluginMethod public void status(PluginCall call) {
        reconcile();
        JSArray jobs = new JSArray();
        for (InstallJob j : store.all()) jobs.put(j.toJs());
        JSObject r = new JSObject();
        r.put("jobs", jobs);
        call.resolve(r);
    }

    @PluginMethod public void acknowledge(PluginCall call) { guarded(call, () -> {
        InstallJob job = store.get(call.getString("id"));
        if (job != null && ("done".equals(job.state) || "failed".equals(job.state))) store.remove(job.id);
        call.resolve();
    }); }

    private void guarded(PluginCall call, Runnable body) {
        try { body.run(); } catch (IllegalStateException e) { call.reject(e.getMessage(), "io"); }
    }
}
