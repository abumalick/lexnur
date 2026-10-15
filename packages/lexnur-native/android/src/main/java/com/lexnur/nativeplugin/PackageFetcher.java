package com.lexnur.nativeplugin;

import com.github.luben.zstd.ZstdInputStream;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

public final class PackageFetcher {
    public interface Listener {
        void onProgress(long downloaded, long total);
        void onPhase(String state);
        boolean isStopped();
    }

    public interface SpaceProbe { long availableBytes(File dir); }

    public static final class FetchException extends Exception {
        public final String code;
        public final int httpStatus;
        FetchException(String code, int httpStatus, String message) { super(message); this.code = code; this.httpStatus = httpStatus; }
    }

    public static final class StoppedException extends Exception {}

    static final long SPACE_MARGIN = 16L * 1024 * 1024;

    /** Bytes the volume must offer to finish a package, counting what is already in the .part. */
    static long spaceNeeded(long sizeBytes, long partBytes, long installedSizeBytes) {
        return Math.max(0, sizeBytes - partBytes) + installedSizeBytes + SPACE_MARGIN;
    }
    private static final int BUFFER = 64 * 1024;
    private static final long REPORT_EVERY = 256 * 1024;
    private final SpaceProbe space;

    public PackageFetcher(SpaceProbe space) { this.space = space; }

    public static File partFile(File dir, String version) { return new File(dir, version + ".sqlite.zst.part"); }
    public static File zstFile(File dir, String version) { return new File(dir, version + ".sqlite.zst"); }
    public static File tmpFile(File dir, String version) { return new File(dir, version + ".sqlite.tmp"); }
    public static File finalFile(File dir, String version) { return new File(dir, version + ".sqlite"); }

    public File fetch(URL url, File dir, String version, String sha256, long sizeBytes, long installedSizeBytes, Listener l)
            throws FetchException, StoppedException {
        if (!dir.isDirectory() && !dir.mkdirs()) throw new FetchException("io", 0, "cannot create " + dir);
        File part = partFile(dir, version);
        File zst = zstFile(dir, version);
        if (!zst.exists()) {
            download(url, part, sizeBytes, installedSizeBytes, dir, l);
            if (!part.renameTo(zst)) throw new FetchException("io", 0, "rename " + part);
        }
        l.onPhase("verifying");
        String actual = sha256Hex(zst, l);
        if (l.isStopped()) throw new StoppedException();
        if (!actual.equalsIgnoreCase(sha256)) {
            zst.delete();
            throw new FetchException("checksum", 0, "sha256 " + actual);
        }
        l.onPhase("installing");
        File tmp = tmpFile(dir, version);
        File fin = finalFile(dir, version);
        decompress(zst, tmp, l);
        if (fin.exists()) fin.delete();
        if (!tmp.renameTo(fin)) { tmp.delete(); throw new FetchException("io", 0, "rename " + tmp); }
        zst.delete();
        return fin;
    }

    private void download(URL url, File part, long size, long installed, File dir, Listener l) throws FetchException, StoppedException {
        long have = part.exists() ? part.length() : 0;
        if (have > size) { part.delete(); have = 0; }
        long need = spaceNeeded(size, have, installed);
        if (space.availableBytes(dir) < need) throw new FetchException("no_space", 0, "need " + need);
        if (have == size) return;
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) url.openConnection();
            c.setConnectTimeout(15_000);
            c.setReadTimeout(30_000);
            c.setRequestProperty("Accept-Encoding", "identity");
            if (have > 0) c.setRequestProperty("Range", "bytes=" + have + "-");
            int code = c.getResponseCode();
            boolean append;
            if (code == 206 && have > 0) append = true;
            else if (code == 200) { append = false; have = 0; }
            else if (code == 416 && have == size) return;
            else throw new FetchException("http", code, "HTTP " + code);
            try (InputStream in = new BufferedInputStream(c.getInputStream(), BUFFER);
                 OutputStream out = new FileOutputStream(part, append)) {
                byte[] buf = new byte[BUFFER];
                long done = have, reported = have;
                int n;
                while ((n = in.read(buf)) != -1) {
                    out.write(buf, 0, n);
                    done += n;
                    if (done - reported >= REPORT_EVERY) { l.onProgress(done, size); reported = done; }
                    if (l.isStopped()) throw new StoppedException();
                }
                l.onProgress(done, size);
            }
            if (part.length() != size) throw new FetchException("network", 0, "short body " + part.length() + "/" + size);
        } catch (IOException e) {
            throw new FetchException("network", 0, e.toString());
        } finally {
            if (c != null) c.disconnect();
        }
    }

    static String sha256Hex(File f, Listener l) throws FetchException, StoppedException {
        try (InputStream in = new BufferedInputStream(new FileInputStream(f), BUFFER)) {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[BUFFER];
            int n;
            while ((n = in.read(buf)) != -1) {
                md.update(buf, 0, n);
                if (l.isStopped()) throw new StoppedException();
            }
            StringBuilder s = new StringBuilder();
            for (byte b : md.digest()) s.append(String.format("%02x", b));
            return s.toString();
        } catch (IOException | NoSuchAlgorithmException e) {
            throw new FetchException("io", 0, e.toString());
        }
    }

    private static void decompress(File zst, File tmp, Listener l) throws FetchException, StoppedException {
        try (InputStream in = new ZstdInputStream(new BufferedInputStream(new FileInputStream(zst), BUFFER));
             FileOutputStream out = new FileOutputStream(tmp)) {
            byte[] buf = new byte[BUFFER];
            int n;
            while ((n = in.read(buf)) != -1) {
                out.write(buf, 0, n);
                if (l.isStopped()) { tmp.delete(); throw new StoppedException(); }
            }
            out.getFD().sync();
        } catch (IOException e) {
            tmp.delete();
            throw new FetchException(e.getMessage() != null && e.getMessage().contains("ENOSPC") ? "no_space" : "decompress", 0, e.toString());
        }
    }
}
