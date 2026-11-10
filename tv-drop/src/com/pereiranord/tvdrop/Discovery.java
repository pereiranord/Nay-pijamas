package com.pereiranord.tvdrop;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.Build;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.Deque;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Finds TVs running TV Drop on the phone's network in two ways at once:
 * mDNS (NSD) and, in case the router blocks it, a quick scan of the /24.
 */
public class Discovery {
    public static final String TYPE = "_tvdrop._tcp.";

    public interface Listener {
        void found(String name, String host, int port);
    }

    private final Context ctx;
    private final Listener listener;
    private NsdManager nsd;
    private NsdManager.DiscoveryListener discovery;
    private final Deque<NsdServiceInfo> toResolve = new ArrayDeque<>();
    private boolean resolving;
    private volatile boolean stopped;
    private ExecutorService scan;

    public Discovery(Context ctx, Listener l) {
        this.ctx = ctx.getApplicationContext();
        this.listener = l;
    }

    public void start() {
        stopped = false;
        startNsd();
        startScan();
    }

    public void stop() {
        stopped = true;
        if (nsd != null && discovery != null) {
            try {
                nsd.stopServiceDiscovery(discovery);
            } catch (Exception ignored) {
            }
        }
        discovery = null;
        if (scan != null) scan.shutdownNow();
    }

    // ---- mDNS ----

    private void startNsd() {
        nsd = ctx.getSystemService(NsdManager.class);
        discovery = new NsdManager.DiscoveryListener() {
            @Override public void onStartDiscoveryFailed(String t, int e) {}
            @Override public void onStopDiscoveryFailed(String t, int e) {}
            @Override public void onDiscoveryStarted(String t) {}
            @Override public void onDiscoveryStopped(String t) {}
            @Override public void onServiceLost(NsdServiceInfo s) {}

            @Override
            public void onServiceFound(NsdServiceInfo s) {
                synchronized (toResolve) {
                    toResolve.add(s);
                }
                resolveNext();
            }
        };
        try {
            nsd.discoverServices(TYPE, NsdManager.PROTOCOL_DNS_SD, discovery);
        } catch (Exception ignored) {
        }
    }

    /** Android resolves one service at a time, so keep a queue. */
    @SuppressWarnings("deprecation")
    private void resolveNext() {
        NsdServiceInfo next;
        synchronized (toResolve) {
            if (resolving || toResolve.isEmpty() || stopped) return;
            next = toResolve.poll();
            resolving = true;
        }
        nsd.resolveService(next, new NsdManager.ResolveListener() {
            @Override
            public void onResolveFailed(NsdServiceInfo s, int e) {
                done();
            }

            @Override
            public void onServiceResolved(NsdServiceInfo s) {
                InetAddress a = Build.VERSION.SDK_INT >= 34 && !s.getHostAddresses().isEmpty()
                        ? pickV4(s) : s.getHost();
                if (a != null && !stopped) listener.found(s.getServiceName(), a.getHostAddress(), s.getPort());
                done();
            }

            private void done() {
                synchronized (toResolve) {
                    resolving = false;
                }
                resolveNext();
            }
        });
    }

    private static InetAddress pickV4(NsdServiceInfo s) {
        if (Build.VERSION.SDK_INT < 34) return s.getHost();
        for (InetAddress a : s.getHostAddresses()) if (a instanceof Inet4Address) return a;
        return s.getHostAddresses().get(0);
    }

    // ---- subnet scan fallback ----

    private void startScan() {
        final String me = myIpv4();
        if (me == null) return;
        final String prefix = me.substring(0, me.lastIndexOf('.') + 1);
        scan = Executors.newFixedThreadPool(48);
        for (int i = 1; i < 255; i++) {
            final String host = prefix + i;
            if (host.equals(me)) continue;
            scan.execute(() -> probe(host, Codes.BASE_PORT));
        }
        scan.shutdown();
    }

    private void probe(String host, int port) {
        if (stopped) return;
        try {
            String r = Net.get("http://" + host + ":" + port + "/api/hello", 700);
            if (r.contains("\"app\":\"tvdrop\"") && !stopped) {
                String name = Net.str(r, "name");
                listener.found(name == null ? host : name, host, port);
            }
        } catch (Exception ignored) {
        }
    }

    static String myIpv4() {
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                String n = ni.getName();
                if (!(n.startsWith("wlan") || n.startsWith("eth") || n.startsWith("ap") || n.startsWith("swlan"))) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) return a.getHostAddress();
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }
}
