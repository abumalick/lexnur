package com.lexnur.nativeplugin;

import static org.junit.Assert.*;

import com.github.luben.zstd.Zstd;
import java.io.File;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.Random;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import okio.Buffer;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class PackageFetcherTest {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();
    private MockWebServer server;
    private byte[] payload;
    private byte[] zst;
    private String sha;
    private File dir;

    @Before public void setUp() throws Exception {
        server = new MockWebServer();
        server.start();
        payload = new byte[1 << 20];
        new Random(42).nextBytes(payload);
        zst = Zstd.compress(payload, 19);
        sha = hex(MessageDigest.getInstance("SHA-256").digest(zst));
        dir = tmp.newFolder("oewn-2025");
    }

    @After public void tearDown() throws Exception { server.shutdown(); }

    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02x", x));
        return s.toString();
    }

    private PackageFetcher fetcher(long free) { return new PackageFetcher(d -> free); }

    private static class Recorder implements PackageFetcher.Listener {
        int progressCalls; String lastPhase, stopInPhase; int stopAfter = Integer.MAX_VALUE;
        public void onProgress(long done, long total) { progressCalls++; }
        public void onPhase(String state) { lastPhase = state; }
        public boolean isStopped() { return progressCalls >= stopAfter || (stopInPhase != null && stopInPhase.equals(lastPhase)); }
    }

    private File fetch(String sha256, long free, Recorder r) throws Exception {
        return fetcher(free).fetch(server.url("/p.sqlite.zst").url(), dir, "v1", sha256, zst.length, payload.length, r);
    }

    @Test public void downloadsVerifiesAndDecompresses() throws Exception {
        server.enqueue(new MockResponse().setBody(new Buffer().write(zst)));
        File out = fetch(sha, Long.MAX_VALUE, new Recorder());
        assertEquals(new File(dir, "v1.sqlite"), out);
        assertArrayEquals(payload, Files.readAllBytes(out.toPath()));
        assertFalse(new File(dir, "v1.sqlite.zst").exists());
        assertFalse(new File(dir, "v1.sqlite.zst.part").exists());
        assertFalse(new File(dir, "v1.sqlite.tmp").exists());
    }

    @Test public void resumesFromPartialFile() throws Exception {
        Files.write(new File(dir, "v1.sqlite.zst.part").toPath(), java.util.Arrays.copyOf(zst, 100));
        server.enqueue(new MockResponse().setResponseCode(206)
            .setBody(new Buffer().write(java.util.Arrays.copyOfRange(zst, 100, zst.length))));
        File out = fetch(sha, Long.MAX_VALUE, new Recorder());
        RecordedRequest req = server.takeRequest();
        assertEquals("bytes=100-", req.getHeader("Range"));
        assertArrayEquals(payload, Files.readAllBytes(out.toPath()));
    }

    @Test public void restartsWhenServerIgnoresRange() throws Exception {
        Files.write(new File(dir, "v1.sqlite.zst.part").toPath(), new byte[] {1, 2, 3, 4, 5});
        server.enqueue(new MockResponse().setResponseCode(200).setBody(new Buffer().write(zst)));
        File out = fetch(sha, Long.MAX_VALUE, new Recorder());
        assertArrayEquals(payload, Files.readAllBytes(out.toPath()));
    }

    @Test public void checksumMismatchDeletesAndFails() throws Exception {
        server.enqueue(new MockResponse().setBody(new Buffer().write(zst)));
        try { fetch("00" + sha.substring(2), Long.MAX_VALUE, new Recorder()); fail(); }
        catch (PackageFetcher.FetchException e) { assertEquals("checksum", e.code); }
        assertFalse(new File(dir, "v1.sqlite.zst").exists());
        assertFalse(new File(dir, "v1.sqlite").exists());
    }

    @Test public void failsWithNoSpaceBeforeDownloading() throws Exception {
        try { fetch(sha, 1024, new Recorder()); fail(); }
        catch (PackageFetcher.FetchException e) { assertEquals("no_space", e.code); }
        assertEquals(0, server.getRequestCount());
    }

    @Test public void httpErrorReportsStatus() throws Exception {
        server.enqueue(new MockResponse().setResponseCode(404));
        try { fetch(sha, Long.MAX_VALUE, new Recorder()); fail(); }
        catch (PackageFetcher.FetchException e) { assertEquals("http", e.code); assertEquals(404, e.httpStatus); }
    }

    @Test public void stopKeepsPartialFile() throws Exception {
        server.enqueue(new MockResponse().setBody(new Buffer().write(zst)));
        Recorder r = new Recorder(); r.stopAfter = 1;
        try { fetch(sha, Long.MAX_VALUE, r); fail(); } catch (PackageFetcher.StoppedException expected) {}
        File part = new File(dir, "v1.sqlite.zst.part");
        assertTrue(part.exists());
        assertTrue(part.length() > 0 && part.length() < zst.length);
    }

    @Test public void restartsDecompressionAfterAKillLeftATmpFile() throws Exception {
        Files.write(new File(dir, "v1.sqlite.zst").toPath(), zst);
        Files.write(new File(dir, "v1.sqlite.tmp").toPath(), new byte[] {9, 9, 9});
        File out = fetch(sha, Long.MAX_VALUE, new Recorder());
        assertArrayEquals(payload, Files.readAllBytes(out.toPath()));
        assertFalse(new File(dir, "v1.sqlite.tmp").exists());
        assertFalse(new File(dir, "v1.sqlite.zst").exists());
        assertEquals(0, server.getRequestCount());
    }

    @Test public void corruptStreamFailsDecompressAndLeavesNoTmp() throws Exception {
        byte[] garbage = new byte[4096];
        new Random(7).nextBytes(garbage);
        String garbageSha = hex(MessageDigest.getInstance("SHA-256").digest(garbage));
        server.enqueue(new MockResponse().setBody(new Buffer().write(garbage)));
        try {
            fetcher(Long.MAX_VALUE).fetch(server.url("/p").url(), dir, "v1", garbageSha, garbage.length, 10, new Recorder());
            fail();
        } catch (PackageFetcher.FetchException e) { assertEquals("decompress", e.code); }
        assertFalse(new File(dir, "v1.sqlite.tmp").exists());
        assertFalse(new File(dir, "v1.sqlite").exists());
    }

    @Test public void stopDuringVerifyKeepsZstAndNeverReachesInstalling() throws Exception {
        Files.write(new File(dir, "v1.sqlite.zst").toPath(), zst);
        Recorder r = new Recorder(); r.stopInPhase = "verifying";
        try { fetch(sha, Long.MAX_VALUE, r); fail(); } catch (PackageFetcher.StoppedException expected) {}
        assertEquals("verifying", r.lastPhase);
        assertTrue(new File(dir, "v1.sqlite.zst").exists());
        assertFalse(new File(dir, "v1.sqlite").exists());
    }

    @Test public void stopDuringDecompressDeletesTmpAndInstallsNothing() throws Exception {
        Files.write(new File(dir, "v1.sqlite.zst").toPath(), zst);
        Recorder r = new Recorder(); r.stopInPhase = "installing";
        try { fetch(sha, Long.MAX_VALUE, r); fail(); } catch (PackageFetcher.StoppedException expected) {}
        assertFalse(new File(dir, "v1.sqlite.tmp").exists());
        assertFalse(new File(dir, "v1.sqlite").exists());
        assertTrue(new File(dir, "v1.sqlite.zst").exists());
    }

    @Test public void spaceNeededCountsThePartAndTheMargin() {
        assertEquals(60 + 100 + PackageFetcher.SPACE_MARGIN, PackageFetcher.spaceNeeded(100, 40, 100));
        assertEquals(100 + PackageFetcher.SPACE_MARGIN, PackageFetcher.spaceNeeded(10, 50, 100));
    }
}
