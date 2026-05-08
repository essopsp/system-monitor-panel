# System Monitor Panel

A lightweight GNOME Shell extension that displays real-time system metrics (CPU, RAM, Disk, Network) directly in the top panel.

## Features

- **CPU Usage** - Shows current CPU utilization percentage
- **RAM Usage** - Displays memory usage with used/total values
- **Disk Usage** - Shows root partition disk usage
- **Network Speed** - Real-time download/upload speed monitoring

## Installation

### From GNOME Extensions Website

1. Visit the [extension page](https://extensions.gnome.org/extension/XXXXX/system-monitor-panel/)
2. Toggle the switch to enable the extension
3. Click "Install" when prompted

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/shlimbo/system-monitor-panel.git
cd system-monitor-panel

# Install schema (requires root)
sudo glib-compile-schemas schemas/

# Copy extension to GNOME extensions directory
mkdir -p ~/.local/share/gnome-shell/extensions/system-monitor-panel@shlimbo
cp -r * ~/.local/share/gnome-shell/extensions/system-monitor-panel@shlimbo/

# Restart GNOME Shell (Alt+F2, type "r", Enter)
# Or log out and back in
```

### Requirements

- GNOME Shell 40+
- libgtop2 (system library)
- GLib, GObject, GTK4, Adwaita (bundled with GNOME)

**Install libgtop on your distribution:**

| Distribution | Command |
|--------------|---------|
| Ubuntu/Debian | `sudo apt install libgtop2-dev` |
| Fedora | `sudo dnf install libgtop2` |
| Arch Linux | `sudo pacman -S libgtop` |

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
├── schemas/         # GSettings schema
│   └── org.gnome.shell.extensions.system-monitor-panel.gschema.xml
└── icons/            # Extension icons
```

### Key Components

- **SystemMetrics class** (extension.js:74-153) - Collects system data using GTop
- **SystemMonitorPanel class** (extension.js:155-285) - UI component for panel
- **SystemMonitorExtension class** (extension.js:287-320) - Extension lifecycle management

## Development

### Build Schema

```bash
glib-compile-schemas schemas/
```

### Debug Mode

View extension logs:

```bash
journalctl -f -o cat | grep "system-monitor-panel"
```

### Enable Debugging

Add to `extension.js`:
```javascript
global.log('System Monitor: debug message');
```

## License

MIT License

## Contributing

Contributions are welcome! Please open issues and pull requests on GitHub.