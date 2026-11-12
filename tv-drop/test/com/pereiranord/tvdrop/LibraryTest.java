package com.pereiranord.tvdrop;

import org.json.JSONObject;
import org.junit.Test;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class LibraryTest {
    private final AtomicLong now = new AtomicLong(1_000_000);
    private final KeyValueStore store = new KeyValueStore.Memory();

    private Library lib() {
        return new Library(store, now::get);
    }

    private static Library.Item it(String name) {
        return new Library.Item("https://x/" + name + ".mp4", null);
    }

    @Test
    public void queueAddsAtEndNextAndNow() {
        Library l = lib();
        l.add(it("a"), "end");
        l.add(it("b"), "end");
        assertEquals("a.mp4", l.play(0).title);
        l.add(it("c"), "next");          // right after the current one
        assertEquals("c.mp4", l.queue().get(1).title);
        int at = l.add(it("d"), "now");  // after current, and becomes current
        assertEquals(1, at);
        assertEquals(1, l.current());
        assertEquals("[a.mp4, d.mp4, c.mp4, b.mp4]", titles(l));
    }

    @Test
    public void autoAdvanceFollowsRepeatModes() {
        Library l = lib();
        l.add(it("a"), "end");
        l.add(it("b"), "end");
        assertNull("not active yet: a finished single video must not start the queue", l.next(true));
        l.play(0);
        assertEquals("b.mp4", l.next(true).title);
        assertNull(l.next(true));        // end of queue
        assertFalse(l.queueActive());
        l.setRepeat("all");
        l.play(1);
        assertEquals("a.mp4", l.next(true).title);
        l.setRepeat("one");
        assertEquals("a.mp4", l.next(true).title);
        assertEquals("manual next moves on even with repeat one", "b.mp4", l.next(false).title);
        assertEquals("a.mp4", l.previous().title);
    }

    @Test
    public void somethingElsePlayingStopsTheQueue() {
        Library l = lib();
        l.add(it("a"), "end");
        l.add(it("b"), "end");
        l.play(0);
        l.setQueueActive(false);
        assertNull(l.next(true));
    }

    @Test
    public void removeAndMoveKeepTheCurrentItem() {
        Library l = lib();
        for (String n : new String[]{"a", "b", "c", "d"}) l.add(it(n), "end");
        l.play(2); // c
        assertTrue(l.move(3, 0));      // d to the top
        assertEquals("c.mp4", l.queue().get(l.current()).title);
        assertTrue(l.remove(0));
        assertEquals("c.mp4", l.queue().get(l.current()).title);
        assertTrue(l.move(l.current(), 0));
        assertEquals(0, l.current());
        assertFalse(l.remove(9));
        l.clear();
        assertEquals(-1, l.current());
    }

    @Test
    public void queueAndPlaylistsSurviveRestart() throws Exception {
        Library l = lib();
        l.add(it("a"), "end");
        l.add(it("b"), "end");
        l.setRepeat("all");
        l.saveQueueAs("Filmes");
        l.clear();
        Library again = lib();
        assertEquals("all", again.queueJson().getString("repeat"));
        assertTrue(again.loadPlaylist("Filmes"));
        assertEquals("[a.mp4, b.mp4]", titles(again));
        assertEquals(1, again.playlistsJson().getJSONArray("playlists").length());
        assertTrue(again.deletePlaylist("Filmes"));
        assertFalse(again.loadPlaylist("Filmes"));
        try {
            again.clear();
            again.saveQueueAs("vazia");
            fail("empty queue must not be saved");
        } catch (IllegalStateException expected) {
        }
    }

    @Test
    public void historyRecordsAndResumes() throws Exception {
        Library l = lib();
        l.recordStart("inbox:Filme.mkv", null);
        l.recordProgress("inbox:Filme.mkv", 20_000, 7_200_000);
        assertEquals("too early to resume", 0, l.resumePosition("inbox:Filme.mkv"));
        now.addAndGet(20_000);
        l.recordProgress("inbox:Filme.mkv", 1_800_000, 7_200_000);
        assertEquals(1_800_000, l.resumePosition("inbox:Filme.mkv"));
        l.recordProgress("inbox:Filme.mkv", 7_180_000, 7_200_000);
        assertEquals("almost finished: start over", 0, l.resumePosition("inbox:Filme.mkv"));
        JSONObject first = l.historyJson().getJSONArray("items").getJSONObject(0);
        assertEquals("Filme.mkv", first.getString("title"));
    }

    @Test
    public void historyKeepsMostRecentFirstAndFavourites() throws Exception {
        Library l = lib();
        l.recordStart("https://x/fav.mp4", null);
        assertTrue(l.toggleFavorite("https://x/fav.mp4"));
        for (int i = 0; i < Library.MAX_HISTORY + 10; i++) {
            now.addAndGet(1000);
            l.recordStart("https://x/" + i + ".mp4", null);
        }
        org.json.JSONArray items = l.historyJson().getJSONArray("items");
        assertEquals(Library.MAX_HISTORY, items.length());
        assertTrue(items.getJSONObject(0).getString("src").endsWith((Library.MAX_HISTORY + 9) + ".mp4"));
        boolean favKept = false;
        for (int i = 0; i < items.length(); i++) favKept |= items.getJSONObject(i).getBoolean("favorite");
        assertTrue("favourites are never pushed out", favKept);
    }

    @Test
    public void historyCanBeTurnedOff() throws Exception {
        Library l = lib();
        l.recordStart("https://x/a.mp4", null);
        l.setHistoryEnabled(false);
        assertEquals(0, l.historyJson().getJSONArray("items").length());
        l.recordStart("https://x/b.mp4", null);
        assertEquals(0, l.historyJson().getJSONArray("items").length());
        assertFalse(lib().historyEnabled());
    }

    @Test
    public void titlesComeFromTheSrc() {
        assertEquals("Filme.mkv", Library.titleOf("inbox:Filme.mkv"));
        assertEquals("video x.mp4", Library.titleOf("https://h/a/video%20x.mp4?t=1"));
    }

    @Test
    public void sleepTimerFiresOnceAndCanBeCancelled() throws Exception {
        ScheduledExecutorService ex = Executors.newSingleThreadScheduledExecutor();
        AtomicReference<String> fired = new AtomicReference<>();
        SleepTimer t = new SleepTimer(ex, now::get, fired::set);
        t.set(30, "pause");
        JSONObject st = t.state();
        assertTrue(st.getBoolean("active"));
        assertEquals("pause", st.getString("action"));
        assertEquals(30 * 60_000, st.getLong("remainingMs"));
        assertTrue(t.cancel());
        assertFalse(t.state().getBoolean("active"));
        try {
            t.set(0, "pause");
            fail();
        } catch (IllegalArgumentException expected) {
        }
        try {
            t.set(5, "explode");
            fail();
        } catch (IllegalArgumentException expected) {
        }
        assertNull(fired.get());
        ex.shutdownNow();
    }

    private static String titles(Library l) {
        StringBuilder sb = new StringBuilder("[");
        for (Library.Item i : l.queue()) sb.append(sb.length() > 1 ? ", " : "").append(i.title);
        return sb.append(']').toString();
    }
}
