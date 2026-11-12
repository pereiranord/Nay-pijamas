package com.pereiranord.tvdrop;

import android.service.notification.NotificationListenerService;

/**
 * TV: lets TV Drop see which app is playing media (title, artist, cover) and
 * control it (play/pause, next, seek). Android only shares media sessions with
 * apps that have notification access. Turn it on once with:
 *   adb shell cmd notification allow_listener com.pereiranord.tvdrop/com.pereiranord.tvdrop.MediaListener
 * TV Drop doesn't read, store or show notifications.
 */
public class MediaListener extends NotificationListenerService {
}
