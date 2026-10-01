'use strict';

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
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

const PROC_PATH = '/proc';
const ROOT_PATH = '/';

function _readProcFile(name) {
    try {
        const file = Gio.File.new_for_path(`${PROC_PATH}/${name}`);
        const [ok, contents] = file.load_contents(null);
        if (!ok) return null;
        return new TextDecoder().decode(contents);
    } catch (e) {
        return null;
    }
}

function _readMemInfo(fields) {
    const text = _readProcFile('meminfo');
    if (!text) return null;

    const result = {};
    for (const line of text.split('\n')) {
        for (const key of fields) {
            if (line.startsWith(`${key}:`)) {
                const kb = parseInt(line.split(/\s+/)[1], 10);
                if (!Number.isNaN(kb))
                    result[key] = kb * 1024;
            }
        }
    }
    return result;
}

function _percent(used, total) {
    if (!total || total <= 0) return 0;
    return Math.min(100, Math.max(0, (used / total) * 100));
}

function parseNetDev() {
    let totalRx = 0;
    let totalTx = 0;

    const text = _readProcFile('net/dev');
    if (!text) return { rx: 0, tx: 0 };

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

    return { rx: totalRx, tx: totalTx };
}

class SystemMetrics {
    constructor() {
        this._prevCpu = this._readCpu();
        this._prevNetwork = { rx: 0, tx: 0, time: 0 };
    }

    _readCpu() {
        const text = _readProcFile('stat');
        if (!text) return null;

        const line = text.split('\n')[0];
        if (!line || !line.startsWith('cpu ')) return null;

        const fields = line.trim().split(/\s+/).slice(1).map(v => parseInt(v, 10));
        if (fields.length < 5 || fields.some(Number.isNaN)) return null;

        // Sum every jiffy counter except idle and iowait, which both mean
        // "not doing work" for our purposes.
        let total = 0;
        for (let i = 0; i < fields.length; i++) {
            if (i !== 3 && i !== 4)
                total += fields[i];
        }

        return {total, idle: fields[3] + fields[4]};
    }

    getCpu() {
        const current = this._readCpu();
        if (!current) return 0;

        const previous = this._prevCpu;
        this._prevCpu = current;

        if (!previous) return 0;

        const deltaTotal = current.total - previous.total;
        const deltaIdle = current.idle - previous.idle;

        if (deltaTotal <= 0) return 0;

        return _percent(deltaTotal - deltaIdle, deltaTotal);
    }

    getMemory() {
        const info = _readMemInfo(['MemTotal', 'MemAvailable']);
        if (!info || !info.MemTotal) return { percent: 0, used: 0, total: 0 };

        const total = info.MemTotal;
        const available = info.MemAvailable ?? 0;
        const used = total - available;

        return {
            percent: _percent(used, total),
            used: used,
            total: total,
        };
    }

    getSwap() {
        const info = _readMemInfo(['SwapTotal', 'SwapFree']);
        if (!info || !info.SwapTotal) return { percent: 0, used: 0, total: 0 };

        const total = info.SwapTotal;
        const used = total - (info.SwapFree ?? 0);

        return {
            percent: _percent(used, total),
            used: used,
            total: total,
        };
    }

    getDisk() {
        try {
            const info = Gio.File.new_for_path(ROOT_PATH)
                .query_filesystem_info('filesystem::size,filesystem::free', null);
            const total = info.get_attribute_uint64('filesystem::size');
            const free = info.get_attribute_uint64('filesystem::free');

            if (!total) return { percent: 0, used: 0, total: 0 };

            const used = total - free;
            return {
                percent: _percent(used, total),
                used: used,
                total: total,
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

        this.menu.connect('open-state-changed', (menu, open) => {
            if (open) this._update();
        });
    }

    _buildMenu() {
        this.menu.removeAll();

        const header = new PopupMenu.PopupMenuItem('System Monitor', { reactive: false });
        header.header = true;
        this.menu.addMenuItem(header);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._cpuItem = new PopupMenu.PopupMenuItem('CPU: --');
        this._cpuLabel = this._cpuItem.label_actor;
        this.menu.addMenuItem(this._cpuItem);

        this._ramItem = new PopupMenu.PopupMenuItem('RAM: --');
        this._ramLabel = this._ramItem.label_actor;
        this.menu.addMenuItem(this._ramItem);

        this._diskItem = new PopupMenu.PopupMenuItem('Disk: --');
        this._diskLabel = this._diskItem.label_actor;
        this.menu.addMenuItem(this._diskItem);

        this._swapItem = new PopupMenu.PopupMenuItem('Swap: --');
        this._swapLabel = this._swapItem.label_actor;
        this.menu.addMenuItem(this._swapItem);

        this._netItem = new PopupMenu.PopupMenuItem('Network: --');
        this._netLabel = this._netItem.label_actor;
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

        let cpu, mem, swap, disk, net;
        let showCpu = true, showRam = true, showSwap = true;
        let showDisk = true, showNet = true, showIcons = true;
        try {
            cpu = this._metrics.getCpu();
            mem = this._metrics.getMemory();
            swap = this._metrics.getSwap();
            disk = this._metrics.getDisk();
            net = this._metrics.getNetwork();

            if (this._settings) {
                showCpu = this._settings.get_boolean('show-cpu');
                showRam = this._settings.get_boolean('show-ram');
                showSwap = this._settings.get_boolean('show-swap');
                showDisk = this._settings.get_boolean('show-disk');
                showNet = this._settings.get_boolean('show-network');
                showIcons = this._settings.get_boolean('show-icons');
            }
        } catch (e) {
            log(`System Monitor Panel: metrics read failed: ${e}`);
            return;
        }

        this._mainIcon.visible = showIcons;

        const parts = [];
        if (showCpu) parts.push(`CPU:${Math.round(cpu)}%`);
        if (showRam) parts.push(`RAM:${Math.round(mem.percent)}%`);
        if (showSwap && swap.total > 0) parts.push(`Sw:${Math.round(swap.percent)}%`);
        if (showDisk) parts.push(`Dk:${Math.round(disk.percent)}%`);
        if (showNet) parts.push(`↓${formatSpeed(net.rx)}`);

        this._statusLabel.text = parts.join(' ') || '--';

        try {
            if (showCpu) this._cpuLabel.set_text(`CPU: ${Math.round(cpu)}%`);
            if (showRam) this._ramLabel.set_text(`RAM: ${Math.round(mem.percent)}% (${formatBytes(mem.used)} / ${formatBytes(mem.total)})`);
            if (showSwap) this._swapLabel.set_text(`Swap: ${Math.round(swap.percent)}% (${formatBytes(swap.used)} / ${formatBytes(swap.total)})`);
            if (showDisk) this._diskLabel.set_text(`Disk: ${Math.round(disk.percent)}% (${formatBytes(disk.used)} / ${formatBytes(disk.total)})`);
            if (showNet) this._netLabel.set_text(`↓ ${formatSpeed(net.rx)}  ↑ ${formatSpeed(net.tx)}`);
        } catch (e) {
            log(`System Monitor Panel: menu label update failed: ${e}`);
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