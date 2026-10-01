# System Monitor Panel

A lightweight GNOME Shell extension that displays real-time system metrics (CPU, RAM, Disk, Network) directly in the top panel.

## Features

- **CPU Usage** - Shows current CPU utilization percentage
- **RAM Usage** - Displays memory usage with used/total values
- **Disk Usage** - Shows root partition disk usage
- **Network Speed** - Real-time download/upload speed monitoring

## Installation

### Manual Installation

```bash
git clone https://github.com/essopsp/system-monitor-panel.git
cd system-monitor-panel
make install
```

Then restart GNOME Shell:

- **X11**: press <kbd>Alt</kbd>+<kbd>F2</kbd>, type `r`, hit <kbd>Enter</kbd>
- **Wayland**: log out and back in — there is no way around this

Verify with `make check`; you want `State: ACTIVE`.

Or manually, without the Makefile:

```bash
glib-compile-schemas schemas/
mkdir -p ~/.local/share/gnome-shell/extensions/system-monitor-panel@shlimbo
cp -r extension.js prefs.js metadata.json stylesheet.css icons schemas \
  ~/.local/share/gnome-shell/extensions/system-monitor-panel@shlimbo/
```

### Requirements

- GNOME Shell 40 – 50 (see `shell-version` in `metadata.json`)
- GLib, Gio, GObject, St, Clutter (bundled with GNOME Shell)

There are **no external library dependencies.** Metrics are read straight from
the kernel and GLib:

| Metric | Source |
|--------|--------|
| CPU | `/proc/stat`, using the delta of jiffy counters between samples |
| RAM | `/proc/meminfo` (`MemTotal`, `MemAvailable`) |
| Swap | `/proc/meminfo` (`SwapTotal`, `SwapFree`) |
| Disk | `Gio.File.query_filesystem_info()` on `/` |
| Network | `/proc/net/dev`, delta between samples, skipping loopback and container interfaces |

Earlier versions depended on libgtop via `gi://GTop`. That was dropped in
commit *"drop GTop dependency"* because the `gir1.2-gtop-2.0` typelib is not a
hard dependency of any package and gets autoremoved during Ubuntu release
upgrades, which silently broke the extension on GNOME 50. It also fixed a live
bug: the code read `fsusage.blocksize`, but the GIR field is `block_size`, so
the disk metric rendered as `Dk:NaN%`.

## Configuration

Right-click on the monitor panel and select **Settings** or use `gnome-extensions prefs system-monitor-panel@shlimbo`.

### Display Options

| Setting | Description | Default |
|---------|-------------|---------|
| CPU Usage | Show CPU percentage | Enabled |
| RAM Usage | Show RAM usage | Enabled |
| Disk Usage | Show disk usage | Enabled |
| Network Speed | Show download/upload speed | Enabled |
| Show Icons | Display icons next to metrics | Enabled |
| Short Format | Compact single-line display | Enabled |

### Timing Options

| Setting | Description | Default |
|---------|-------------|---------|
| Update Interval | Seconds between metric updates | 2 seconds |

## Architecture
```
system-monitor-panel@shlimbo/
├── extension.js      # Main extension code (GNOME Shell integration)
├── prefs.js          # Preferences window (GTK4/Adwaita)
├── stylesheet.css    # Panel styling
├── metadata.json     # Extension metadata
├── Makefile          # install / pack / check targets
├── schemas/         # GSettings schema
│   └── org.gnome.shell.extensions.system-monitor-panel.gschema.xml
└── icons/            # Extension icons
```

### Key Components

- **`SystemMetrics` class** (extension.js) - Reads `/proc` and GLib filesystem info on demand; holds only the previous CPU and network samples needed to compute rates
- **`SystemMonitorPanel` class** (extension.js) - `PanelMenu.Button` subclass holding the panel label and the dropdown menu items
- **`SystemMonitorExtension` class** (extension.js) - Extension lifecycle; installs the indicator and owns the update timeout

## Development

```bash
make install   # compile schemas + deploy to ~/.local/share/gnome-shell/extensions/
make check     # show the installed extension's state
make pack      # build build/<uuid>.shell-extension.zip
make clean     # remove build output
```

`make install` copies only the files that ship, so a stale file left over from
a previous install cannot leak into the extension directory.

### Debug Mode

View extension logs:

```bash
journalctl -f -o cat | grep system-monitor-panel
```

### Enable Debugging

Add to `extension.js`:

```javascript
log('System Monitor: debug message');
```

## License

MIT License

## Contributing

Contributions are welcome! Please open issues and pull requests on GitHub.