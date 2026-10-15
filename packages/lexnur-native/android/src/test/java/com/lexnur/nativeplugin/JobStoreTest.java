package com.lexnur.nativeplugin;

import static org.junit.Assert.*;

import java.io.File;
import java.nio.file.Files;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class JobStoreTest {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();

    private static InstallJob job(String id, String state) {
        InstallJob j = new InstallJob();
        j.id = id; j.version = "20261011.1"; j.url = "https://dl.lexnur.com/x"; j.sha256 = "ab";
        j.sizeBytes = 10; j.installedSizeBytes = 20; j.state = state; j.allowCellular = true;
        return j;
    }

    @Test public void putGetRemovePersist() throws Exception {
        File dir = tmp.newFolder();
        JobStore a = new JobStore(dir);
        a.put(job("oewn-2025", "queued"));
        a.put(job("wiktionary-en", "downloading"));
        JobStore b = new JobStore(dir);
        assertEquals(2, b.all().size());
        assertEquals("downloading", b.get("wiktionary-en").state);
        b.remove("oewn-2025");
        assertNull(new JobStore(dir).get("oewn-2025"));
    }

    @Test public void putReplacesById() throws Exception {
        JobStore s = new JobStore(tmp.newFolder());
        s.put(job("a", "queued"));
        InstallJob j = job("a", "done"); j.relativePath = "a/20261011.1.sqlite";
        s.put(j);
        assertEquals(1, s.all().size());
        assertEquals("a/20261011.1.sqlite", s.get("a").relativePath);
    }

    @Test public void corruptFileReadsAsEmpty() throws Exception {
        File dir = tmp.newFolder();
        Files.write(new File(dir, "jobs.json").toPath(), "{not json".getBytes());
        assertTrue(new JobStore(dir).all().isEmpty());
    }

    @Test public void updateWritesOnlyWhenMutatorAccepts() throws Exception {
        JobStore s = new JobStore(tmp.newFolder());
        s.put(job("a", "paused"));
        assertNull(s.update("a", st -> { st.state = "downloading"; return false; }));
        assertEquals("paused", s.get("a").state);
        InstallJob w = s.update("a", st -> { st.state = "queued"; return true; });
        assertEquals("queued", w.state);
        assertEquals("queued", s.get("a").state);
    }

    @Test public void updateOnMissingJobDoesNotResurrectIt() throws Exception {
        JobStore s = new JobStore(tmp.newFolder());
        s.put(job("a", "downloading"));
        s.remove("a");
        boolean[] called = {false};
        assertNull(s.update("a", st -> { called[0] = true; return true; }));
        assertFalse(called[0]);
        assertTrue(s.all().isEmpty());
    }
}
