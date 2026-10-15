package com.lexnur.nativeplugin;

public final class ProgressBus {
    public interface Listener { void onJob(InstallJob job); }
    private static volatile Listener listener;
    private ProgressBus() {}
    public static void setListener(Listener l) { listener = l; }
    public static void emit(InstallJob job) { Listener l = listener; if (l != null) l.onJob(job); }
}
