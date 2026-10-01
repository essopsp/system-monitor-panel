UUID      := system-monitor-panel@shlimbo
SRC       := $(CURDIR)
DEST      := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
SCHEMAS   := $(SRC)/schemas
BUILD     := $(SRC)/build

.PHONY: all schemas install uninstall pack check enable disable clean help

all: install

help:
	@echo "Targets:"
	@echo "  install    compile schemas and copy into $(DEST)"
	@echo "  uninstall  remove $(DEST)"
	@echo "  pack       build a zip installable via gnome-extensions"
	@echo "  check      report the installed extension's state"
	@echo "  enable     enable the extension"
	@echo "  disable    disable the extension"
	@echo "  schemas    compile schemas only"
	@echo "  clean      remove build output and compiled schemas"

schemas: $(SCHEMAS)/gschemas.compiled

$(SCHEMAS)/gschemas.compiled: $(wildcard $(SCHEMAS)/*.gschema.xml)
	glib-compile-schemas $(SCHEMAS)

install: schemas
	@mkdir -p $(DEST)/schemas $(DEST)/icons
	@cp -f $(SRC)/extension.js $(SRC)/prefs.js $(SRC)/metadata.json $(SRC)/stylesheet.css $(DEST)/
	@cp -f $(wildcard $(SRC)/icons/*) $(DEST)/icons/
	@cp -f $(SCHEMAS)/*.gschema.xml $(DEST)/schemas/
	@cp -f $(SCHEMAS)/gschemas.compiled $(DEST)/schemas/
	@echo "Installed to $(DEST)"
	@echo ""
	@echo "The running shell caches metadata.json, so a newly installed extension"
	@echo "needs either a restart (log out/in on Wayland) or a forced metadata"
	@echo "refresh:"
	@echo "    gsettings toggle org.gnome.shell disable-extension-version-validation"

uninstall:
	gnome-extensions disable $(UUID) 2>/dev/null || true
	rm -rf $(DEST)
	@echo "Removed $(DEST)"
	@echo "Note: the GSettings schema stays registered until you log out and back in."

pack: schemas
	@mkdir -p $(BUILD)
	@rm -f $(BUILD)/$(UUID).shell-extension.zip
	@cd $(SRC) && zip -q -r $(BUILD)/$(UUID).shell-extension.zip \
		extension.js prefs.js metadata.json stylesheet.css \
		icons schemas -x '*.git*'
	@echo "Built $(BUILD)/$(UUID).shell-extension.zip"

check:
	@gnome-extensions info $(UUID) || echo "Extension not installed"

enable:
	gnome-extensions enable $(UUID)
	@echo "Enabled. Log out and back in if the state does not change."

disable:
	gnome-extensions disable $(UUID)

clean:
	rm -rf $(BUILD)
	rm -f $(SCHEMAS)/gschemas.compiled