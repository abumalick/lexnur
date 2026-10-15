package com.lexnur.nativeplugin;

import android.content.Context;
import java.io.File;
import java.io.IOException;

public final class Paths {
    private Paths() {}

    public static File packagesDir(Context context) {
        File dir = new File(context.getNoBackupFilesDir(), "packages");
        if (!dir.isDirectory()) dir.mkdirs();
        return dir;
    }

    /** Resolves a relative package path, refusing anything that escapes the packages directory. */
    public static File resolve(File packagesDir, String relativePath) throws IOException {
        File f = new File(packagesDir, relativePath).getCanonicalFile();
        if (!f.getPath().startsWith(packagesDir.getCanonicalPath() + File.separator)) throw new IOException("outside packages dir: " + relativePath);
        return f;
    }
}
