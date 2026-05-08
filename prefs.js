'use strict';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

export default class SystemMonitorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(450, 400);

        const page = new Adw.PreferencesPage({
            title: 'Display',
            icon_name: 'utilities-system-monitor-symbolic',
        });
        window.add(page);

        const displayGroup = new Adw.PreferencesGroup({
            title: 'Metrics to Display',
            description: 'Choose which system metrics to show in the panel',
        });
        page.add(displayGroup);

        const settings = this.getSettings();

        const cpuSwitch = new Adw.SwitchRow({
            title: 'CPU Usage',
            subtitle: 'Show CPU percentage in the panel',
            active: settings.get_boolean('show-cpu'),
        });
        settings.bind('show-cpu', cpuSwitch, 'active', 0);
        displayGroup.add(cpuSwitch);

        const ramSwitch = new Adw.SwitchRow({
            title: 'RAM Usage',
            subtitle: 'Show RAM usage in the panel',
            active: settings.get_boolean('show-ram'),
        });
        settings.bind('show-ram', ramSwitch, 'active', 0);
        displayGroup.add(ramSwitch);

        const diskSwitch = new Adw.SwitchRow({
            title: 'Disk Usage',
            subtitle: 'Show disk usage in the panel',
            active: settings.get_boolean('show-disk'),
        });
        settings.bind('show-disk', diskSwitch, 'active', 0);
        displayGroup.add(diskSwitch);

        const netSwitch = new Adw.SwitchRow({
            title: 'Network Speed',
            subtitle: 'Show download/upload speed in the panel',
            active: settings.get_boolean('show-network'),
        });
        settings.bind('show-network', netSwitch, 'active', 0);
        displayGroup.add(netSwitch);

        const appearanceGroup = new Adw.PreferencesGroup({
            title: 'Appearance',
            description: 'Configure how metrics are displayed',
        });
        page.add(appearanceGroup);

        const iconSwitch = new Adw.SwitchRow({
            title: 'Show Icons',
            subtitle: 'Display an icon next to metrics in the panel',
            active: settings.get_boolean('show-icons'),
        });
        settings.bind('show-icons', iconSwitch, 'active', 0);
        appearanceGroup.add(iconSwitch);

        const formatSwitch = new Adw.SwitchRow({
            title: 'Short Format',
            subtitle: 'Use compact single-line format in the panel',
            active: settings.get_boolean('short-format'),
        });
        settings.bind('short-format', formatSwitch, 'active', 0);
        appearanceGroup.add(formatSwitch);

        const timingGroup = new Adw.PreferencesGroup({
            title: 'Timing',
            description: 'Configure update frequency',
        });
        page.add(timingGroup);

        const intervalSpin = new Adw.SpinRow({
            title: 'Update Interval',
            subtitle: 'Seconds between metric updates',
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 60,
                step_increment: 1,
            }),
            value: settings.get_int('update-interval'),
        });
        settings.bind('update-interval', intervalSpin, 'value', 0);
        timingGroup.add(intervalSpin);
    }
}