package com.lexnur.nativeplugin;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;

public final class JobStore {
    private static final Object LOCK = new Object();
    private final File file;

    public JobStore(File packagesDir) { this.file = new File(packagesDir, "jobs.json"); }

    public List<InstallJob> all() {
        synchronized (LOCK) {
            List<InstallJob> out = new ArrayList<>();
            if (!file.exists()) return out;
            try {
                JSONArray a = new JSONArray(new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
                for (int i = 0; i < a.length(); i++) out.add(InstallJob.fromJson(a.getJSONObject(i)));
            } catch (Exception e) {
                out.clear();
            }
            return out;
        }
    }

    public InstallJob get(String id) {
        for (InstallJob j : all()) if (j.id.equals(id)) return j;
        return null;
    }

    public void put(InstallJob job) {
        synchronized (LOCK) {
            List<InstallJob> jobs = all();
            jobs.removeIf(j -> j.id.equals(job.id));
            jobs.add(job);
            write(jobs);
        }
    }

    public interface Mutator { boolean apply(InstallJob stored); }

    /** Compare-and-set: re-reads the stored job under the lock and writes it back only if the mutator returns true. Returns the written job, or null when the job is missing or the mutator declined. */
    public InstallJob update(String id, Mutator m) {
        synchronized (LOCK) {
            List<InstallJob> jobs = all();
            for (InstallJob j : jobs) {
                if (!j.id.equals(id)) continue;
                if (!m.apply(j)) return null;
                write(jobs);
                return j;
            }
            return null;
        }
    }

    public void remove(String id) {
        synchronized (LOCK) {
            List<InstallJob> jobs = all();
            jobs.removeIf(j -> j.id.equals(id));
            write(jobs);
        }
    }

    private void write(List<InstallJob> jobs) {
        try {
            JSONArray a = new JSONArray();
            for (InstallJob j : jobs) a.put(j.toJson());
            File tmp = new File(file.getPath() + ".tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(a.toString().getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            }
            if (!tmp.renameTo(file)) throw new IllegalStateException("rename jobs.json");
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
