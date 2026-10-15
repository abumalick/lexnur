package com.lexnur.nativeplugin;

import android.content.Context;
import android.net.ConnectivityManager;

public final class JobRules {
    private JobRules() {}

    public static boolean isInFlight(String state) {
        return "downloading".equals(state) || "verifying".equals(state) || "installing".equals(state);
    }

    public static boolean isTerminal(String state) {
        return "done".equals(state) || "failed".equals(state);
    }

    /** The state of a job that is waiting for the network rather than running. */
    public static String waitingState(boolean allowCellular, boolean hasNetwork, boolean metered) {
        if (!allowCellular && (!hasNetwork || metered)) return "waiting_wifi";
        return hasNetwork ? "queued" : "waiting_network";
    }

    /** Persisted in-flight states are stale when no worker is running (for example after a force-stop). */
    public static String normalise(String state, boolean allowCellular, boolean workerRunning) {
        if (!isInFlight(state) || workerRunning) return state;
        return allowCellular ? "waiting_network" : "waiting_wifi";
    }

    /** Copies a worker's progress onto the stored job; false when the record is paused or belongs to another version. */
    public static boolean applyProgress(InstallJob stored, InstallJob job) {
        if (!stored.version.equals(job.version)) return false;
        if ("paused".equals(stored.state) && !"done".equals(job.state)) return false;
        stored.state = job.state;
        stored.bytesDownloaded = job.bytesDownloaded;
        stored.error = job.error;
        stored.httpStatus = job.httpStatus;
        stored.relativePath = job.relativePath;
        return true;
    }

    public static String waitingState(Context c, boolean allowCellular) {
        ConnectivityManager cm = c.getSystemService(ConnectivityManager.class);
        boolean has = cm != null && cm.getActiveNetwork() != null;
        boolean metered = cm != null && cm.isActiveNetworkMetered();
        return waitingState(allowCellular, has, metered);
    }
}
