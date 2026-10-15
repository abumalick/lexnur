package com.lexnur.nativeplugin;

import com.getcapacitor.JSObject;
import org.json.JSONException;
import org.json.JSONObject;

public final class InstallJob {
    public String id, version, url, sha256, state, error, relativePath;
    public long sizeBytes, installedSizeBytes, bytesDownloaded;
    public boolean allowCellular;
    public int httpStatus;

    JSONObject toJson() throws JSONException {
        JSONObject o = new JSONObject();
        o.put("id", id); o.put("version", version); o.put("url", url); o.put("sha256", sha256);
        o.put("state", state); o.put("error", error); o.put("relativePath", relativePath);
        o.put("sizeBytes", sizeBytes); o.put("installedSizeBytes", installedSizeBytes);
        o.put("bytesDownloaded", bytesDownloaded); o.put("allowCellular", allowCellular); o.put("httpStatus", httpStatus);
        return o;
    }

    static InstallJob fromJson(JSONObject o) {
        InstallJob j = new InstallJob();
        j.id = o.optString("id"); j.version = o.optString("version"); j.url = o.optString("url");
        j.sha256 = o.optString("sha256"); j.state = o.optString("state");
        j.error = o.isNull("error") ? null : o.optString("error", null);
        j.relativePath = o.isNull("relativePath") ? null : o.optString("relativePath", null);
        j.sizeBytes = o.optLong("sizeBytes"); j.installedSizeBytes = o.optLong("installedSizeBytes");
        j.bytesDownloaded = o.optLong("bytesDownloaded"); j.allowCellular = o.optBoolean("allowCellular");
        j.httpStatus = o.optInt("httpStatus");
        return j;
    }

    public JSObject toJs() {
        JSObject o = new JSObject();
        o.put("id", id); o.put("version", version); o.put("state", state);
        o.put("bytesDownloaded", bytesDownloaded); o.put("totalBytes", sizeBytes);
        if (relativePath != null) o.put("relativePath", relativePath);
        if (error != null) o.put("error", error);
        if (httpStatus != 0) o.put("httpStatus", httpStatus);
        return o;
    }
}
