package com.pereiranord.tvdrop;

import android.content.Context;
import android.content.Intent;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/** TV side: accepts one mirroring phone at a time (paired devices only) and opens MirrorActivity. */
final class MirrorServer extends Thread {
    private final Context ctx;
    private final Pairing pairing;
    private ServerSocket socket;
    private volatile boolean running = true;
    private static volatile Socket active;

    MirrorServer(Context ctx, Pairing pairing) {
        super("tvdrop-mirror");
        this.ctx = ctx.getApplicationContext();
        this.pairing = pairing;
    }

    boolean open() {
        try {
            ServerSocket s = new ServerSocket();
            s.setReuseAddress(true);
            s.bind(new InetSocketAddress(MirrorProtocol.PORT));
            socket = s;
            return true;
        } catch (IOException e) {
            Events.add("Espelhamento indisponível: porta " + MirrorProtocol.PORT + " ocupada");
            return false;
        }
    }

    void shutdown() {
        running = false;
        stopActive();
        try {
            socket.close();
        } catch (Exception ignored) {
        }
    }

    /** Ends the current mirroring session, if any (TV back button or the web "stop"). */
    static boolean stopActive() {
        Socket s = active;
        active = null;
        if (s == null) return false;
        try {
            s.close();
        } catch (IOException ignored) {
        }
        return true;
    }

    static boolean isActive() {
        Socket s = active;
        return s != null && !s.isClosed();
    }

    @Override
    public void run() {
        while (running) {
            try {
                Socket c = socket.accept();
                new Thread(() -> handshake(c), "tvdrop-mirror-hs").start();
            } catch (IOException e) {
                if (!running) return;
            }
        }
    }

    private void handshake(Socket c) {
        try {
            if (!HttpServer.isLocal(c)) { c.close(); return; }
            c.setSoTimeout(10_000);
            c.setTcpNoDelay(true);
            InputStream in = new BufferedInputStream(c.getInputStream(), 256 * 1024);
            OutputStream out = c.getOutputStream();
            String[] hello = MirrorProtocol.line(in).split(" ");
            Pairing.Device d = hello.length == 3 && "TVDROP-MIRROR".equals(hello[0]) ? pairing.check(hello[2]) : null;
            if (d == null) {
                out.write("NO aparelho não pareado\n".getBytes(StandardCharsets.US_ASCII));
                c.close();
                return;
            }
            stopActive(); // one phone at a time: the newest wins
            out.write("OK\n".getBytes(StandardCharsets.US_ASCII));
            out.flush();
            c.setSoTimeout(15_000);
            active = c;
            MirrorActivity.offer(c, in);
            Intent i = new Intent(ctx, MirrorActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            ctx.startActivity(i);
            Events.add("Espelhando a tela de " + d.name);
        } catch (Exception e) {
            try {
                c.close();
            } catch (IOException ignored) {
            }
        }
    }
}
