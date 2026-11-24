package com.pereiranord.tvdrop;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.junit.Assume;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * Not a regular test: the real updater against the real GitHub release (update.json, redirects, download, SHA-256),
 * as an installed TV Drop would do it. Runs only with TVDROP_REAL_FEED=1:
 *   TVDROP_REAL_FEED=1 gradle testTvReleaseUnitTest --tests '*RealFeedCheck*'
 */
public class RealFeedCheck {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();

    @Test
    public void downloadsAndChecksTheNewestReleaseFromGithub() throws Exception {
        Assume.assumeTrue(System.getenv("TVDROP_REAL_FEED") != null);
        for (String kind : new String[]{"tv", "celular"}) {
            List<File> got = new ArrayList<>();
            Updater u = new Updater(Updater.FEED, tmp.newFolder(), 1, "0", kind, got::add, System::currentTimeMillis);
            assertNotNull("GitHub has a newer release than version 1", u.check());
            u.install();
            assertEquals(1, got.size());
            assertTrue(got.get(0).length() > 1_000_000);
            System.out.println("REAL FEED " + kind + ": " + u.status().getString("latest") + " downloaded and SHA-256 checked, "
                    + got.get(0).length() + " bytes");
        }
    }
}
