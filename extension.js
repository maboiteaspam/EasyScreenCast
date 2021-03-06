/* -*- mode: js; js-basic-offset: 4; indent-tabs-mode: nil -*- */

/*
    Copyright (C) 2013  Borsato Ivano

    The JavaScript code in this page is free software: you can
    redistribute it and/or modify it under the terms of the GNU
    General Public License (GNU GPL) as published by the Free Software
    Foundation, either version 3 of the License, or (at your option)
    any later version.  The code is distributed WITHOUT ANY WARRANTY;
    without even the implied warranty of MERCHANTABILITY or FITNESS
    FOR A PARTICULAR PURPOSE.  See the GNU GPL for more details.
*/

const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const Lang = imports.lang;
const PanelMenu = imports.ui.panelMenu;
const Panel = imports.ui.panel;
const PopupMenu = imports.ui.popupMenu;
const MessageTray = imports.ui.messageTray;
const Slider = imports.ui.slider;
const Main = imports.ui.main;
const LibRecorder = imports.ui.screencast;

const Gettext = imports.gettext.domain(
    'EasyScreenCast@iacopodeenosee.gmail.com');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Lib = Me.imports.convenience;
const Pref = Me.imports.prefs;
const Time = Me.imports.timer;
const UtilRecorder = Me.imports.utilrecorder;
const UtilAudio = Me.imports.utilaudio;
const Selection = Me.imports.selection;


let Indicator;
let timerD = null;
let timerC = null;

let isActive = false;
let pathFile = '';


const EasyScreenCast_Indicator = new Lang.Class({
    Name: 'EasyScreenCast.indicator',
    Extends: PanelMenu.Button,

    _init: function () {
        this.parent(null, 'EasyScreenCast-indicator');

        this.CtrlAudio = new UtilAudio.MixerAudio();

        //add enter/leave event
        this.actor.connect(
            'enter-event', Lang.bind(this, this.refreshIndicator, true));
        this.actor.connect(
            'leave-event', Lang.bind(this, this.refreshIndicator, false));

        //prepare setting var
        this.isDelayActive = Pref.getOption('b', Pref.ACTIVE_DELAY_SETTING_KEY);
        this.isRecAudioActive = (this.CtrlAudio.checkAudio() &&
            !Pref.getOption('b', Pref.ACTIVE_CUSTOM_GSP_SETTING_KEY) &&
            Pref.getOption('b', Pref.ACTIVE_AUDIO_REC_SETTING_KEY));

        //add icon
        this.indicatorBox = new St.BoxLayout;
        this.indicatorIcon = new St.Icon({
            gicon: Lib.ESCoffGIcon,
            icon_size: 16
        });

        this.indicatorBox.add_actor(this.indicatorIcon);
        this.actor.add_actor(this.indicatorBox);

        //init var
        this.recorder = new UtilRecorder.CaptureVideo();
        this.AreaSelected = null;
        this.TimeSlider = null;
        this.notifyCounting;

        //add start/stop menu entry
        this._addMIRecording();

        //add audio option menu entry
        this._addMIAudioRec();

        //add separetor menu
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem);

        //add delay menu entry
        this._addMIDelayRec();

        //add info delay menu entry
        this._addMIInfoDelayRec();

        //add separetor menu
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem);

        //add option menu entry
        this.imOptions = new PopupMenu.PopupMenuItem(_('Options'));
        this.menu.addMenuItem(this.imOptions);
        this.imOptions.connect(
            'activate', Lang.bind(this, this._doExtensionPreferences));

        //enable key binding
        this._enableKeybindings();

        if (!this.isDelayActive) {
            this.DelayTimeTitle.actor.hide;
            this.TimeSlider.actor.hide;
        }
    },

    _addMIRecording: function () {
        this.imRecordAction = new PopupMenu.PopupBaseMenuItem;
        this.RecordingLabel = new St.Label({
            text: _('Start recording'),
            style_class: 'RecordAction-label'
        });
        this.imRecordAction.actor.add_child(this.RecordingLabel, {
            align: St.Align.START
        });

        this.imRecordAction.connect('activate', Lang.bind(this, function () {
            this.isShowNotify = Pref.getOption(
                'b', Pref.SHOW_TIMER_REC_SETTING_KEY);

            this._doRecording();
        }));

        this.menu.addMenuItem(this.imRecordAction);
    },

    _addMIAudioRec: function () {
        this.imAudioRec = new PopupMenu.PopupSwitchMenuItem(_('Record audio'),
            this.isRecAudioActive, {
                style_class: 'popup-subtitle-menu-item'
            });

        this.imAudioRec.connect('toggled', Lang.bind(this, function (item) {
            if (this.CtrlAudio.checkAudio()) {
                Lib.TalkativeLog('normal state audio recording');

                Pref.setOption(Pref.ACTIVE_AUDIO_REC_SETTING_KEY, item.state);

                if (item.state) {
                    Pref.setOption(Pref.ACTIVE_CUSTOM_GSP_SETTING_KEY, 'queue ! videorate ! vp8enc min_quantizer=13 max_quantizer=13 cpu-used=5 deadline=1000000 threads=%T ! queue ! mux. pulsesrc ! queue ! audioconvert ! vorbisenc ! queue ! mux. webmmux name=mux');
                } else {
                    Pref.setOption(Pref.ACTIVE_CUSTOM_GSP_SETTING_KEY, 'vp8enc min_quantizer=13 max_quantizer=13 cpu-used=5 deadline=1000000 threads=%T ! queue ! webmmux');
                }


            } else {
                Lib.TalkativeLog('disable audio recording');

                Pref.setOption(Pref.ACTIVE_AUDIO_REC_SETTING_KEY, false);

                Pref.setOption(Pref.ACTIVE_CUSTOM_GSP_SETTING_KEY, 'vp8enc min_quantizer=13 max_quantizer=13 cpu-used=5 deadline=1000000 threads=%T ! queue ! webmmux');

                item.setToggleState(false);
            }
        }));

        this.menu.addMenuItem(this.imAudioRec);
    },

    _addMIDelayRec: function () {
        this.imDelayRec = new PopupMenu.PopupSwitchMenuItem(
            _('Delay recording'),
            this.isDelayActive, {
                style_class: 'popup-subtitle-menu-item'
            });
        this.imDelayRec.connect('toggled', Lang.bind(this, function (item) {
            if (item.state) {
                this.isDelayActive = true;

                this.DelayTimeTitle.actor.show;
                this.TimeSlider.actor.show;
            } else {
                this.isDelayActive = false;

                this.DelayTimeTitle.actor.hide;
                this.TimeSlider.actor.hide;
            }
            Pref.setOption(Pref.ACTIVE_DELAY_SETTING_KEY, item.state);
        }));

        this.menu.addMenuItem(this.imDelayRec);
    },

    _addMIInfoDelayRec: function () {
        this.DelayTimeTitle = new PopupMenu.PopupMenuItem(_('Delay Time'), {
            reactive: false
        });

        this.DelayTimeLabel = new St.Label({
            text: Math.floor(Pref.getOption('i',
                Pref.TIME_DELAY_SETTING_KEY)).toString() + _(' Sec')
        });
        this.DelayTimeTitle.actor.add_child(this.DelayTimeLabel, {
            align: St.Align.END
        });

        this.imSliderDelay = new PopupMenu.PopupBaseMenuItem({
            activate: false
        });
        this.TimeSlider = new Slider.Slider(Pref.getOption('i',
            Pref.TIME_DELAY_SETTING_KEY) / 100);
        this.TimeSlider.connect(
            'value-changed', Lang.bind(this, function (item) {
                this.DelayTimeLabel.set_text(
                    Math.floor(item.value * 100).toString() + _(' Sec'));
            }));

        this.TimeSlider.connect(
            'drag-end', Lang.bind(this, this._onDelayTimeChanged));
        this.TimeSlider.actor.connect('scroll-event',
            Lang.bind(this, this._onDelayTimeChanged));

        this.imSliderDelay.actor.add(this.TimeSlider.actor, {
            expand: true
        });

        this.menu.addMenuItem(this.DelayTimeTitle);
        this.menu.addMenuItem(this.imSliderDelay);
    },

    _enable: function () {
        this.actor.add_actor(this.indicatorBox);
    },

    _disable: function () {
        this.actor.remove_actor(this.indicatorBox);
    },

    _doDelayAction: function () {

        if (this.isDelayActive) {
            Lib.TalkativeLog('delay recording called | delay= ' + this.TimeSlider.value);
            timerD = new Time.TimerDelay((
                    Math.floor(this.TimeSlider.value * 100)),
                this.recorder.start, this);
            timerD.begin();
        } else {
            Lib.TalkativeLog('instant recording called');
            //start recording
            this.recorder.start();
        }
    },

    _doRecording: function () {
        //start/stop record screen
        if (isActive === false) {
            Lib.TalkativeLog('start recording');

            pathFile = '';

            //get selected area
            var optArea = (Pref.getOption('i', Pref.AREA_SCREEN_SETTING_KEY));
            if (optArea > 1) {
                Lib.TalkativeLog('type of selection of the area to record: ' + optArea);
                switch (optArea) {
                case 2:
                    new Selection.SelectionArea();
                    break;
                case 3:
                    new Selection.SelectionWindow();
                    break;
                case 4:
                    new Selection.SelectionDesktop();
                    break;
                }
            } else {
                Lib.TalkativeLog('recording full area/specific area');
                this._doDelayAction();
            }
        } else {
            Lib.TalkativeLog('stop recording');
            isActive = false;

            this.recorder.stop();

            if (timerC !== null) {
                //stop counting rec
                timerC.halt();
                timerC = null;
            }
        }

        this.refreshIndicator(false);
    },

    doRecResult: function (result, file) {
        if (result) {
            isActive = true;

            Lib.TalkativeLog('record OK');
            //update indicator
            this._replaceStdIndicator(Pref.getOption(
                'b', Pref.REPLACE_INDICATOR_SETTING_KEY));

            if (this.isShowNotify) {
                Lib.TalkativeLog('show notify');
                //create counting notify
                this._createNotify();

                //start counting rec
                timerC = new Time.TimerCounting(refreshNotify, this);
                timerC.begin();
            }

            //update path file video
            pathFile = file;
            Lib.TalkativeLog('update abs file path -> ' + pathFile);

        } else {
            Lib.TalkativeLog('record ERROR');

            pathFile = '';

            this._createAlertNotify();
        }
        this.refreshIndicator(false);
    },

    _doExtensionPreferences: function () {
        Lib.TalkativeLog('open preferences');

        Main.Util.trySpawnCommandLine('gnome-shell-extension-prefs EasyScreenCast@iacopodeenosee.gmail.com');
    },

    _onDelayTimeChanged: function () {
        Pref.setOption(Pref.TIME_DELAY_SETTING_KEY, Math.floor(this.TimeSlider.value * 100));
    },

    _createNotify: function () {
        var source = new MessageTray.SystemNotificationSource();

        this.notifyCounting = new MessageTray.Notification(source,
            _('Start Recording'),
            null, {
                gicon: Lib.ESConGIcon
            });

        this.notifyCounting.setTransient(false);
        this.notifyCounting.setResident(true);

        Main.messageTray.add(source);
        source.notify(this.notifyCounting);
    },

    _createAlertNotify: function () {
        var source = new MessageTray.SystemNotificationSource();

        this.notifyAlert = new MessageTray.Notification(source,
            _('ERROR RECORDER - See logs form more info'),
            null, {
                gicon: Lib.ESCoffGIcon
            });

        this.notifyAlert.setTransient(false);
        this.notifyAlert.setResident(true);
        this.notifyAlert.playSound();

        Main.messageTray.add(source);
        source.notify(this.notifyAlert);
    },

    refreshIndicator: function (param1, param2, focus) {
        Lib.TalkativeLog('refresh indicator -A ' + isActive + ' -F ' + focus);

        if (isActive === true) {
            if (focus === true) {
                this.indicatorIcon.set_gicon(Lib.ESConGIconSel);
            } else {
                this.indicatorIcon.set_gicon(Lib.ESConGIcon);
            }

            this.RecordingLabel.set_text(_('Stop recording'));
        } else {
            if (focus === true) {
                this.indicatorIcon.set_gicon(Lib.ESCoffGIconSel);
            } else {
                this.indicatorIcon.set_gicon(Lib.ESCoffGIcon);
            }
            this.RecordingLabel.set_text(_('Start recording'));
        }
    },

    _replaceStdIndicator: function (OPTtemp) {
        if (OPTtemp) {
            Lib.TalkativeLog('replace STD indicator');
            Main.panel.statusArea['aggregateMenu']
                ._screencast._indicator.visible = false;
        } else {
            Lib.TalkativeLog('use STD indicator');
            Main.panel.statusArea['aggregateMenu']
                ._screencast._indicator.visible = isActive;
        }
    },

    _enableKeybindings: function () {
        if (Pref.getOption('b', Pref.ACTIVE_SHORTCUT_SETTING_KEY)) {
            Lib.TalkativeLog('enable keybinding');

            Main.wm.addKeybinding(
                Pref.SHORTCUT_KEY_SETTING_KEY,
                Pref.settings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL |
                Shell.ActionMode.MESSAGE_TRAY |
                Shell.ActionMode.OVERVIEW |
                Shell.ActionMode.POPUP,
                Lang.bind(this, function () {
                    Lib.TalkativeLog('intercept key combination');
                    this._doRecording();
                })
            );
        }
    },

    _removeKeybindings: function () {
        if (Pref.getOption('b', Pref.ACTIVE_SHORTCUT_SETTING_KEY)) {
            Lib.TalkativeLog('remove keybinding');

            Main.wm.removeKeybinding(Pref.SHORTCUT_KEY_SETTING_KEY);
        }
    },

    destroy: function () {
        Lib.TalkativeLog('destroy indicator called');

        this._removeKeybindings();
        this.parent();
    }
});

function refreshNotify(sec, alertEnd) {
    if (Indicator.notifyCounting !== null ||
        Indicator.notifyCounting !== undefined) {
        if (alertEnd) {
            Indicator.notifyCounting.update(_('EasyScreenCast -> Finish Recording / Seconds : ' + sec),
                null, {
                    gicon: Lib.ESCoffGIcon
                });

            Indicator.notifyCounting.addAction(_('Open in the filesystem'),
                Lang.bind(this, function (self, action) {
                    Lib.TalkativeLog('button notification pressed');
                    var pathFolder = Pref.getOption(
                        's', Pref.FILE_FOLDER_SETTING_KEY)
                    if (pathFolder === "") {
                        Main.Util.trySpawnCommandLine('xdg-open "$(xdg-user-dir VIDEOS)"');
                    } else {
                        Main.Util.trySpawnCommandLine('xdg-open ' + pathFolder);
                    }
                }));

            if (Pref.getOption('b', Pref.ACTIVE_POST_CMD_SETTING_KEY)) {
                Lib.TalkativeLog('execute post command');

                //launch cmd after registration
                var re = /AbsFilePath/gi;
                var tmpCmd = Pref.getOption('s', Pref.POST_CMD_SETTING_KEY);
                var Cmd = tmpCmd.replace(re, pathFile);
                Lib.TalkativeLog('post command:' + Cmd);

                Main.Util.trySpawnCommandLine(Cmd);
            }

            Indicator.notifyCounting.playSound();

        } else {
            Indicator.notifyCounting.update(_('EasyScreenCast -> Recording in progress / Seconds passed : ') + sec,
                null, {
                    gicon: Lib.ESConGIcon
                });
        }
    }
}




function init(meta) {
    Lib.TalkativeLog('initExtension called');

    Lib.initTranslations('EasyScreenCast@iacopodeenosee.gmail.com');
}


function enable() {
    Lib.TalkativeLog('enableExtension called');

    if (Indicator === null || Indicator === undefined) {
        Lib.TalkativeLog('create indicator');

        Indicator = new EasyScreenCast_Indicator();
        Main.panel.addToStatusArea('EasyScreenCast-indicator', Indicator);
    }

    Indicator._enable();
}

function disable() {
    Lib.TalkativeLog('disableExtension called');

    if (timerD !== null) {
        Lib.TalkativeLog('timerD stoped');
        timerD.stop();
    }

    if (Indicator !== null) {
        Lib.TalkativeLog('indicator call destroy');

        Indicator._disable();
        Indicator.destroy();
        Indicator = null;
    }
}
