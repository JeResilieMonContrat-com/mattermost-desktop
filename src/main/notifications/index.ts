// Copyright (c) 2016-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {shell, Notification} from 'electron';
import log from 'electron-log';

import {getDoNotDisturb as getDarwinDoNotDisturb} from 'macos-notification-state';

import {MentionData} from 'types/notification';

import {PLAY_SOUND} from 'common/communication';
import {TAB_MESSAGING} from 'common/tabs/TabView';

import WindowManager from '../windows/windowManager';

import {Mention} from './Mention';
import {DownloadNotification} from './Download';
import {NewVersionNotification, UpgradeNotification} from './Upgrade';
import getLinuxDoNotDisturb from './dnd-linux';
import getWindowsDoNotDisturb from './dnd-windows';

function getDoNotDisturb() {
    if (process.platform === 'win32') {
        return getWindowsDoNotDisturb();
    }

    if (process.platform === 'darwin') {
        return getDarwinDoNotDisturb();
    }

    if (process.platform === 'linux') {
        return getLinuxDoNotDisturb();
    }

    return false;
}

export const currentNotifications = new Map();

export function displayMention(title: string, body: string, channel: {id: string}, teamId: string, url: string, silent: boolean, webcontents: Electron.WebContents, data: MentionData) {
    log.debug('Notifications.displayMention', {title, body, channel, teamId, url, silent, data});

    if (!Notification.isSupported()) {
        log.error('notification not supported');
        return;
    }

    if (getDoNotDisturb()) {
        return;
    }

    const serverName = WindowManager.getServerNameByWebContentsId(webcontents.id);

    const options = {
        title: `${serverName}: ${title}`,
        body,
        silent,
        data,
    };

    const mention = new Mention(options, channel, teamId);
    const mentionKey = `${mention.teamId}:${mention.channel.id}`;

    mention.on('show', () => {
        log.debug('Notifications.displayMention.show');

        // On Windows, manually dismiss notifications from the same channel and only show the latest one
        if (process.platform === 'win32') {
            if (currentNotifications.has(mentionKey)) {
                log.debug(`close ${mentionKey}`);
                currentNotifications.get(mentionKey).close();
                currentNotifications.delete(mentionKey);
            }
            currentNotifications.set(mentionKey, mention);
        }
        const notificationSound = mention.getNotificationSound();
        if (notificationSound) {
            WindowManager.sendToRenderer(PLAY_SOUND, notificationSound);
        }
        WindowManager.flashFrame(true);
    });

    mention.on('click', () => {
        log.debug('notification click', serverName, mention);
        if (serverName) {
            WindowManager.switchTab(serverName, TAB_MESSAGING);
            webcontents.send('notification-clicked', {channel, teamId, url});
        }
    });
    mention.show();
}

export function displayDownloadCompleted(fileName: string, path: string, serverName: string) {
    log.debug('Notifications.displayDownloadCompleted', {fileName, path, serverName});

    if (!Notification.isSupported()) {
        log.error('notification not supported');
        return;
    }

    if (getDoNotDisturb()) {
        return;
    }

    const download = new DownloadNotification(fileName, serverName);

    download.on('show', () => {
        WindowManager.flashFrame(true);
    });

    download.on('click', () => {
        shell.showItemInFolder(path.normalize());
    });
    download.show();
}

let upgrade: NewVersionNotification;

export function displayUpgrade(version: string, handleUpgrade: () => void): void {
    if (!Notification.isSupported()) {
        log.error('notification not supported');
        return;
    }
    if (getDoNotDisturb()) {
        return;
    }

    if (upgrade) {
        upgrade.close();
    }
    upgrade = new NewVersionNotification();
    upgrade.on('click', () => {
        log.info(`User clicked to upgrade to ${version}`);
        handleUpgrade();
    });
    upgrade.show();
}

let restartToUpgrade;
export function displayRestartToUpgrade(version: string, handleUpgrade: () => void): void {
    if (!Notification.isSupported()) {
        log.error('notification not supported');
        return;
    }
    if (getDoNotDisturb()) {
        return;
    }

    restartToUpgrade = new UpgradeNotification();
    restartToUpgrade.on('click', () => {
        log.info(`User requested perform the upgrade now to ${version}`);
        handleUpgrade();
    });
    restartToUpgrade.show();
}

export function sendTestNotification(): void {
    log.debug('Notifications.sendTestNotification');

    if (!Notification.isSupported()) {
        log.error('notification not supported');
        return;
    }

    if (getDoNotDisturb()) {
        return;
    }

    if (process.platform === 'darwin') {
        const testNotification = new Notification({
            title: 'Test Notification',
            body: 'Body of the notification',
            actions: [{
                type: 'button',
                text: 'Sounds good',
            }],
        });
        testNotification.on('action', (event, index) => {
            log.debug('Notifications.sendTestNotification action event.', {event, index});
        });
        testNotification.show();
    } else if (process.platform === 'win32') {
        const testNotification = new Notification({
            toastXml: `
            <toast>
                <visual>
                    <binding template="ToastText02">
                        <text id="1">The counter needs to be updated</text>
                        <text id="2">You can count down or up.</text>
                    </binding>
                </visual>
                <actions>
                    <action content="Count up" activationType="protocol" arguments="mattermost://replyOk" />
                </actions>
            </toast>`,
        });
        testNotification.show();
    }
}
