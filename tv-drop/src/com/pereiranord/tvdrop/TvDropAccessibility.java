package com.pereiranord.tvdrop;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

/**
 * Optional accessibility service on the TV. It gives TV Drop what a normal app
 * can't do: a mouse cursor (touchpad mode) that taps where it points, Back/Home
 * on any Android version, D-pad keys on Android 13+, and typing into the focused
 * text field. It reads nothing from the screen except the focused text field when
 * asked to type, and stores nothing.
 *
 * Turn it on once with:
 *   adb shell settings put secure enabled_accessibility_services com.pereiranord.tvdrop/.TvDropAccessibility
 *   adb shell settings put secure accessibility_enabled 1
 */
public class TvDropAccessibility extends AccessibilityService {
    private static volatile TvDropAccessibility instance;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private CursorView cursor;
    private WindowManager wm;
    private float x, y;
    private int width, height;
    private final Runnable hideCursor = this::removeCursor;

    public static TvDropAccessibility get() {
        return instance;
    }

    @Override
    protected void onServiceConnected() {
        instance = this;
        wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        DisplayMetrics dm = getResources().getDisplayMetrics();
        width = dm.widthPixels;
        height = dm.heightPixels;
        x = width / 2f;
        y = height / 2f;
        Events.add("Acessibilidade do TV Drop ativa (touchpad e teclas)");
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
    }

    @Override
    public void onInterrupt() {
    }

    @Override
    public void onDestroy() {
        instance = null;
        removeCursor();
        super.onDestroy();
    }

    // ---- keys ----

    /** Runs a global action (Back, Home, D-pad on 13+...). Returns false if the system refused. */
    public boolean global(int action) {
        return performGlobalAction(action);
    }

    // ---- text ----

    /** Types into the focused editable field. Returns null on success or the reason it failed. */
    public String setText(String text, boolean replace) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return "Não encontrei a tela ativa da TV.";
        AccessibilityNodeInfo node = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (node == null || !node.isEditable()) return "Nenhum campo de texto está selecionado na TV.";
        String value = text;
        if (!replace && node.getText() != null && !isHint(node)) value = node.getText().toString() + text;
        Bundle args = new Bundle();
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value);
        boolean ok = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
        return ok ? null : "O app da TV não aceitou o texto.";
    }

    private static boolean isHint(AccessibilityNodeInfo n) {
        return Build.VERSION.SDK_INT >= 26 && n.isShowingHintText();
    }

    /** Presses Enter / "search" on the focused field (IME action), if the app supports it. */
    public boolean submit() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        AccessibilityNodeInfo node = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (node == null) return false;
        if (Build.VERSION.SDK_INT >= 30) {
            return node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId());
        }
        return false;
    }

    // ---- pointer (touchpad) ----

    /** move: relative movement; tap / longpress at the cursor; scroll: swipe by dy; hide. */
    public String pointer(String action, float dx, float dy) {
        ui.post(() -> {
            switch (action) {
                case "move":
                    showCursor();
                    x = clamp(x + dx, 0, width - 1);
                    y = clamp(y + dy, 0, height - 1);
                    cursor.moveTo(x, y);
                    break;
                case "tap":
                    showCursor();
                    gesture(x, y, x, y, 60);
                    cursor.pulse();
                    break;
                case "longpress":
                    showCursor();
                    gesture(x, y, x, y, 700);
                    break;
                case "scroll": {
                    float dist = clamp(dy, -height / 2f, height / 2f);
                    float y0 = clamp(y, height * 0.2f, height * 0.8f);
                    gesture(x, y0, x, clamp(y0 - dist, 1, height - 1), 250);
                    break;
                }
                case "hide":
                    removeCursor();
                    break;
                default:
                    break;
            }
        });
        return null;
    }

    private void gesture(float x0, float y0, float x1, float y1, long ms) {
        Path p = new Path();
        p.moveTo(x0, y0);
        if (x0 != x1 || y0 != y1) p.lineTo(x1, y1);
        GestureDescription g = new GestureDescription.Builder()
                .addStroke(new GestureDescription.StrokeDescription(p, 0, ms))
                .build();
        dispatchGesture(g, null, null);
    }

    private void showCursor() {
        ui.removeCallbacks(hideCursor);
        ui.postDelayed(hideCursor, 6000);
        if (cursor != null) return;
        cursor = new CursorView(this);
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.START;
        try {
            wm.addView(cursor, lp);
            cursor.moveTo(x, y);
        } catch (Exception e) {
            cursor = null;
        }
    }

    private void removeCursor() {
        if (cursor == null) return;
        try {
            wm.removeView(cursor);
        } catch (Exception ignored) {
        }
        cursor = null;
    }

    private static float clamp(float v, float lo, float hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    /** A white arrow-like dot with a dark outline, visible on any background. */
    private static final class CursorView extends View {
        private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG), ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        private float cx, cy, pulse;

        CursorView(Context c) {
            super(c);
            fill.setColor(Color.WHITE);
            ring.setColor(0xCC000000);
            ring.setStyle(Paint.Style.STROKE);
            ring.setStrokeWidth(5);
        }

        void moveTo(float x, float y) {
            cx = x;
            cy = y;
            invalidate();
        }

        void pulse() {
            pulse = 1f;
            invalidate();
        }

        @Override
        protected void onDraw(Canvas c) {
            float r = 16;
            if (pulse > 0) {
                Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
                p.setColor(Color.argb((int) (120 * pulse), 61, 220, 132));
                c.drawCircle(cx, cy, r + 30 * (1 - pulse) + 10, p);
                pulse -= 0.12f;
                postInvalidateOnAnimation();
            }
            c.drawCircle(cx, cy, r, fill);
            c.drawCircle(cx, cy, r, ring);
        }
    }
}
