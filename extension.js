/*
  Reading Strip, Reading guide on the computer for people with dyslexia.
  Copyright (C) 2021-22 Luigi Pantano

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
'use strict';

import St from 'gi://St'
import Clutter from 'gi://Clutter'
import GObject from 'gi://GObject'
import Meta from 'gi://Meta'
import Shell from 'gi://Shell'
import Gio from 'gi://Gio'
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PointerWatcher from 'resource:///org/gnome/shell/ui/pointerWatcher.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
const pointerWatcher = PointerWatcher.getPointerWatcher();
const interval = 1000 / 60;
const panelButtonIcon_on = Gio.icon_new_for_string(`${Extension.path}/icons/readingstrip-on-symbolic.svg`);
const panelButtonIcon_off = Gio.icon_new_for_string(`${Extension.path}/icons/readingstrip-off-symbolic.svg`);

let panelButton, panelButtonIcon;
let strip_h, strip_v, focus_up, focus_down,  pointerWatch;
let settings, setting_changed_signal_ids = [];
let currentMonitor = Main.layoutManager.currentMonitor;
let num_monitors = Main.layoutManager.monitors.length;
let monitor_change_signal_id = 0;

// panel menu
const ReadingStrip = GObject.registerClass(
	class ReadingStrip extends PanelMenu.Button {
		_init() {
			super._init(null, 'ReadingStrip');
			panelButtonIcon = new St.Icon({
				gicon : panelButtonIcon_off,
				style_class: 'system-status-icon',
				icon_size: '16'
			});

			this.add_actor(panelButtonIcon);
			this.connect('button-press-event', toggleReadingStrip);
		}
	}
);

// follow cursor position, and monitor as well
function syncStrip(monitor_changed = false) {
	const [x, y] = global.get_pointer();
	if (monitor_changed || num_monitors > 1) {
		currentMonitor = Main.layoutManager.currentMonitor;
		strip_h.x = currentMonitor.x;
		strip_h.width = currentMonitor.width;

		strip_v.x = x - strip_v.width;
		strip_v.height = currentMonitor.height;

		focus_up.width = currentMonitor.width;
		focus_up.height = y - strip_h.height / 2;

		focus_down.width = currentMonitor.width;
		focus_down.height = currentMonitor.height - focus_up.height;
	}

	strip_h.y = y - strip_h.height / 2;
	strip_v.y = currentMonitor.y;

	focus_up.x = 0;
	focus_up.y = 0;

	focus_down.x = 0;
	focus_down.y = y + strip_h.height / 2;
}

// toggle strip on or off
function toggleReadingStrip() {
	if (strip_h.visible) {
		panelButtonIcon.gicon = panelButtonIcon_off;
		pointerWatch.remove();
		pointerWatch = null;
	} else {
		panelButtonIcon.gicon = panelButtonIcon_on;
		syncStrip(true);
		pointerWatch = pointerWatcher.addWatch(interval, syncStrip);
	}
	strip_h.visible = !strip_h.visible;
	strip_v.visible = strip_h.visible;
	focus_up.visible = strip_h.visible;
	focus_down.visible = strip_h.visible;
	settings.set_boolean('enabled', strip_h.visible);
}
export default class ReadingStripExt extends Extension {
    enable() {
        settings = this.getSettings();

	// add button to top panel
	panelButton = new ReadingStrip();
	Main.panel.addToStatusArea('ReadingStrip', panelButton);

	// create horizontal strip
	strip_h = new St.Widget({
		reactive: false,
		can_focus: false,
		track_hover: false,
		visible: false
	});
	Main.uiGroup.add_child(strip_h);

	// create vertical strip
	strip_v = new St.Widget({
		reactive: false,
		can_focus: false,
		track_hover: false,
		visible: false
	});
	Main.uiGroup.add_child(strip_v);

	// create  - focus
	focus_up = new St.Widget({
		reactive: false,
		can_focus: false,
		track_hover: false,
		visible: false,
		opacity: 75 * 255/100
	});
	Main.uiGroup.add_child(focus_up);

	focus_down = new St.Widget({
		reactive: false,
		can_focus: false,
		track_hover: false,
		visible: false,
		opacity: 75 * 255/100
	});
	Main.uiGroup.add_child(focus_down);

	// synchronize extension state with current settings
	setting_changed_signal_ids.push(settings.connect('changed', () => {
		strip_h.style = 'background-color : ' + settings.get_string('color-strip');
		strip_h.opacity = settings.get_double('opacity') * 255/100;
		strip_h.height = settings.get_double('height') * currentMonitor.height/100;

		strip_v.visible = strip_h.visible && settings.get_boolean('vertical');
		strip_v.style = strip_h.style;
		strip_v.opacity = strip_h.opacity;
		strip_v.width = strip_h.height / 4;

		focus_up.visible = strip_h.visible && settings.get_boolean('focusmode');
		focus_up.style = 'background-color : ' + settings.get_string('color-focus');

		focus_down.visible = strip_h.visible && settings.get_boolean('focusmode');
		focus_down.style = 'background-color : ' + settings.get_string('color-focus');
	}));

	// load previous state
	if (settings.get_boolean('enabled'))
		toggleReadingStrip();

	// synchronize hot key
	Main.wm.addKeybinding('hotkey', settings,
						  Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
						  Shell.ActionMode.ALL,
						  () => {
							  toggleReadingStrip();
						  }
						 );

	// watch for monitor changes
	monitor_change_signal_id = Main.layoutManager.connect('monitors-changed', () => {
		num_monitors = Main.layoutManager.monitors.length;
	});

	// sync with current monitor
	syncStrip(true);
    }

    disable() {
	// remove monitor change watch
	if (monitor_change_signal_id)
		Main.layoutManager.disconnect(monitor_change_signal_id);

	Main.wm.removeKeybinding('hotkey');
	setting_changed_signal_ids.forEach(id => settings.disconnect(id));
	setting_changed_signal_ids = [];
	settings = null;

	panelButton.destroy();
	panelButton = null;
	Main.uiGroup.remove_child(strip_h);
	Main.uiGroup.remove_child(strip_v);

	if (pointerWatch){
		pointerWatch.remove();
		pointerWatch = null;
	}

	strip_h.destroy();
	strip_h = null;
	strip_v.destroy();
	strip_v = null;

	focus_up.destroy();
	focus_up = null
	focus_down.destroy();
	focus_down = null;
    }
}
