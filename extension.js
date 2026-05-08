'use strict';

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GTop from 'gi://GTop';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

let _instance = null;

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes.toFixed(0)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatSpeed(bytesPerSec) {
    if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
}

function parseNetDev() {
    let totalRx = 0;
    let totalTx = 0;

    try {
        const file = Gio.File.new_for_path('/proc/net/dev');
        const [ok, contents] = file.load_contents(null);
        if (!ok) return { rx: 0, tx: 0 };

        const text = new TextDecoder().decode(contents);
        const lines = text.split('\n');

        for (let i = 2; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const colonIndex = line.indexOf(':');
            if (colonIndex === -1) continue;

            const iface = line.substring(0, colonIndex).trim();

            if (iface === 'lo' ||
                iface.startsWith('docker') ||
                iface.startsWith('veth') ||
                iface.startsWith('br-') ||
                iface.startsWith('virbr') ||
                iface.startsWith('flannel') ||
                iface.startsWith('cni')) {
                continue;
            }

            const fields = line.substring(colonIndex + 1).trim().split(/\s+/);
            if (fields.length >= 9) {
                totalRx += parseInt(fields[0], 10) || 0;
                totalTx += parseInt(fields[8], 10) || 0;
            }
        }
    } catch (e) {
        return { rx: 0, tx: 0 };
    }

    return { rx: totalRx, tx: totalTx };
}

class SystemMetrics {
    constructor() {
        this._cpu = new GTop.glibtop_cpu();
        this._lastCpu = new GTop.glibtop_cpu();
        this._mem = new GTop.glibtop_mem();
        this._disk = new GTop.glibtop_fsusage();
        this._prevNetwork = { rx: 0, tx: 0, time: 0 };

        GTop.glibtop_get_cpu(this._lastCpu);
        this.refresh();
    }

    getCpu() {
        const deltaTotal = this._cpu.total - this._lastCpu.total;
        const deltaIdle = this._cpu.idle - this._lastCpu.idle;

        if (deltaTotal <= 0) return 0;

        return Math.min(100, Math.max(0, ((deltaTotal - deltaIdle) / deltaTotal) * 100));
    }

    getMemory() {
        const total = this._mem.total;
        const used = this._mem.used;
        if (total === 0) return { percent: 0, used: 0, total: 0 };
        return {
            percent: (used / total) * 100,
            used: used,
            total: total
        };
    }

    getDisk() {
        try {
            const total = this._disk.blocks * this._disk.blocksize;
            const free = this._disk.bavail * this._disk.blocksize;
            const used = total - free;
            if (total === 0) return { percent: 0, used: 0, total: 0 };
            return {
                percent: (used / total) * 100,
                used: used,
                total: total
            };
        } catch (e) {
            return { percent: 0, used: 0, total: 0 };
        }
    }

    getNetwork() {
        const now = GLib.get_monotonic_time() / 1000000;
        const current = parseNetDev();

        if (this._prevNetwork.time === 0) {
            this._prevNetwork = { rx: current.rx, tx: current.tx, time: now };
            return { rx: 0, tx: 0 };
        }

        const timeDiff = now - this._prevNetwork.time;
        if (timeDiff <= 0) return { rx: 0, tx: 0 };

        const rxSpeed = (current.rx - this._prevNetwork.rx) / timeDiff;
        const txSpeed = (current.tx - this._prevNetwork.tx) / timeDiff;

        this._prevNetwork = { rx: current.rx, tx: current.tx, time: now };

        return {
            rx: Math.max(0, rxSpeed),
            tx: Math.max(0, txSpeed)
        };
    }

    refresh() {
        this._lastCpu.total = this._cpu.total;
        this._lastCpu.idle = this._cpu.idle;

        GTop.glibtop_get_cpu(this._cpu);
        GTop.glibtop_get_mem(this._mem);
        GTop.glibtop_get_fsusage(this._disk, '/');
    }
}

const SystemMonitorPanel = GObject.registerClass(
class SystemMonitorPanel extends PanelMenu.Button {
    constructor() {
        super(0.0, 'System Monitor Panel', false);
        _instance = this;

        this._metrics = new SystemMetrics();
        this._settings = null;
        this._timeout = null;
        this._labels = {};

        this._buildUI();
    }

    _buildUI() {
        const container = new St.BoxLayout({
            style_class: 'system-monitor-container',
            x_align: Clutter.ActorAlign.CENTER,
        });

        this._mainIcon = new St.Icon({
            icon_name: 'utilities-system-monitor-symbolic',
            style_class: 'system-status-icon',
            icon_size: 14,
        });
        container.add_child(this._mainIcon);

        this._statusLabel = new St.Label({
            text: 'Loading...',
            style_class: 'system-monitor-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        container.add_child(this._statusLabel);

        this.add_child(container);
        this._buildMenu();
    }

    _buildMenu() {
        this.menu.removeAll();

        const header = new PopupMenu.PopupMenuItem('System Monitor', { reactive: false });
        header.header = true;
        this.menu.addMenuItem(header);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._cpuItem = new PopupMenu.PopupMenuItem('CPU: --');
        this.menu.addMenuItem(this._cpuItem);

        this._ramItem = new PopupMenu.PopupMenuItem('RAM: --');
        this.menu.addMenuItem(this._ramItem);

        this._diskItem = new PopupMenu.PopupMenuItem('Disk: --');
        this.menu.addMenuItem(this._diskItem);

        this._netItem = new PopupMenu.PopupMenuItem('Network: --');
        this.menu.addMenuItem(this._netItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const settingsItem = new PopupMenu.PopupMenuItem('Settings...');
        settingsItem.connect('activate', () => {
            Gio.Subprocess.new(['gnome-extensions', 'prefs', 'system-monitor-panel@shlimbo'], null);
        });
        this.menu.addMenuItem(settingsItem);
    }

    setSettings(settings) {
        this._settings = settings;
    }

    start() {
        this._update();
        this._timeout = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            this._settings ? this._settings.get_int('update-interval') : 2,
            () => {
                this._update();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    stop() {
        if (this._timeout) {
            GLib.source_remove(this._timeout);
            this._timeout = null;
        }
    }

    _update() {
        if (!this._metrics) return;

        this._metrics.refresh();

        const cpu = this._metrics.getCpu();
        const mem = this._metrics.getMemory();
        const disk = this._metrics.getDisk();
        const net = this._metrics.getNetwork();

        const showCpu = this._settings ? this._settings.get_boolean('show-cpu') : true;
        const showRam = this._settings ? this._settings.get_boolean('show-ram') : true;
        const showDisk = this._settings ? this._settings.get_boolean('show-disk') : true;
        const showNet = this._settings ? this._settings.get_boolean('show-network') : true;
        const shortFormat = this._settings ? this._settings.get_boolean('short-format') : true;
        const showIcons = this._settings ? this._settings.get_boolean('show-icons') : true;

        this._mainIcon.visible = showIcons;

        const parts = [];
        if (showCpu) parts.push(`CPU:${Math.round(cpu)}%`);
        if (showRam) parts.push(`RAM:${Math.round(mem.percent)}%`);
        if (showDisk) parts.push(`Dk:${Math.round(disk.percent)}%`);
        if (showNet) parts.push(`↓${formatSpeed(net.rx)}`);

        this._statusLabel.text = parts.join(' ') || '--';

        if (showCpu) {
            this._cpuItem.label = `CPU: ${Math.round(cpu)}%`;
        }
        if (showRam) {
            this._ramItem.label = `RAM: ${Math.round(mem.percent)}% (${formatBytes(mem.used)} / ${formatBytes(mem.total)})`;
        }
        if (showDisk) {
            this._diskItem.label = `Disk: ${Math.round(disk.percent)}% (${formatBytes(disk.used)} / ${formatBytes(disk.total)})`;
        }
        if (showNet) {
            this._netItem.label = `↓ ${formatSpeed(net.rx)}  ↑ ${formatSpeed(net.tx)}`;
        }
    }
});

export default class SystemMonitorExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._indicator = null;
    }

    enable() {
        this._settings = this.getSettings();
        this._indicator = new SystemMonitorPanel();
        this._indicator.setSettings(this._settings);

        Main.panel.addToStatusArea(this.uuid, this._indicator);
        this._indicator.start();

        this._settingsSignal = this._settings.connect('changed', () => {
            if (this._indicator)
                this._indicator._update();
        });
    }

    disable() {
        if (this._settingsSignal) {
            this._settings.disconnect(this._settingsSignal);
            this._settingsSignal = null;
        }

        if (this._indicator) {
            this._indicator.stop();
            this._indicator.destroy();
            this._indicator = null;
        }
        this._settings = null;
    }
}