package com.lexnur.nativeplugin;

import static org.junit.Assert.*;

import org.junit.Test;

public class JobRulesTest {
    @Test public void staleInFlightStatesBecomeWaiting() {
        assertEquals("waiting_wifi", JobRules.normalise("downloading", false, false));
        assertEquals("waiting_network", JobRules.normalise("verifying", true, false));
        assertEquals("waiting_network", JobRules.normalise("installing", true, false));
    }

    @Test public void runningOrNonInFlightStatesAreUntouched() {
        assertEquals("downloading", JobRules.normalise("downloading", false, true));
        for (String s : new String[] {"queued", "paused", "done", "failed", "waiting_wifi", "waiting_network"})
            assertEquals(s, JobRules.normalise(s, false, false));
    }

    @Test public void waitingStateFollowsNetworkAndCellularChoice() {
        assertEquals("queued", JobRules.waitingState(false, true, false));
        assertEquals("waiting_wifi", JobRules.waitingState(false, true, true));
        assertEquals("waiting_wifi", JobRules.waitingState(false, false, false));
        assertEquals("queued", JobRules.waitingState(true, true, true));
        assertEquals("waiting_network", JobRules.waitingState(true, false, false));
    }

    private static InstallJob job(String version, String state) {
        InstallJob j = new InstallJob();
        j.id = "a"; j.version = version; j.state = state;
        return j;
    }

    @Test public void progressOfAnOldVersionNeverLandsOnANewerRecord() {
        InstallJob stored = job("v2", "queued");
        InstallJob worker = job("v1", "downloading");
        assertFalse(JobRules.applyProgress(stored, worker));
        assertEquals("queued", stored.state);
    }

    @Test public void progressLandsOnTheSameVersionUnlessPaused() {
        InstallJob stored = job("v1", "queued");
        InstallJob worker = job("v1", "downloading");
        worker.bytesDownloaded = 7;
        assertTrue(JobRules.applyProgress(stored, worker));
        assertEquals("downloading", stored.state);
        assertEquals(7, stored.bytesDownloaded);

        InstallJob paused = job("v1", "paused");
        assertFalse(JobRules.applyProgress(paused, worker));
        worker.state = "done";
        assertTrue(JobRules.applyProgress(paused, worker));
        assertEquals("done", paused.state);
    }
}
