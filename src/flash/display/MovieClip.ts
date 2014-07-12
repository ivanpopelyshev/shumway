/**
 * Copyright 2014 Mozilla Foundation
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 * http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// Class: MovieClip
module Shumway.AVM2.AS.flash.display {
  import assert = Shumway.Debug.assert;
  import assertUnreachable = Shumway.Debug.assertUnreachable;
  import notImplemented = Shumway.Debug.notImplemented;
  import asCoerceString = Shumway.AVM2.Runtime.asCoerceString;
  import isNullOrUndefined = Shumway.isNullOrUndefined;
  import throwError = Shumway.AVM2.Runtime.throwError;
  import clamp = Shumway.NumberUtilities.clamp;
  import Telemetry = Shumway.Telemetry;
  import events = flash.events;
  import Multiname = Shumway.AVM2.ABC.Multiname;

  export class MovieClip extends flash.display.Sprite implements IAdvancable {

    private static _callQueue: MovieClip [];

    // Called whenever the class is initialized.
    static classInitializer: any = function () {
      MovieClip.reset();

    };

    static reset() {
      MovieClip._callQueue = [];
    }

    // Called whenever an instance of the class is initialized.
    static initializer: any = function (symbol: Shumway.Timeline.SpriteSymbol) {
      var self: MovieClip = this;

      self._currentFrame = 0;
      self._totalFrames = 1;
      self._trackAsMenu = false;
      self._scenes = [];
      self._enabled = true;
      self._isPlaying = false;

      self._frames = [];
      self._frameScripts = [];
      self._nextFrame = 1;
      self._stopped = false;
      self._allowFrameNavigation = true;

      if (symbol) {
        self._totalFrames = symbol.numFrames;
        self._currentFrame = 1;
        if (!symbol.isRoot) {
          self.addScene('', symbol.labels, 0, symbol.numFrames);
        }
        self._frames = symbol.frames;

        if (symbol.isAS2Object && symbol.frameScripts) {
          var data = symbol.frameScripts;
          for (var i = 0; i < data.length; i += 2) {
            self.addAS2FrameScript(data[i], data[i + 1]);
          }
        }
      } else {
        self.addScene('', [], 0, self._totalFrames);
      }
    };
    
    // List of static symbols to link.
    static classSymbols: string [] = null; // [];
    
    // List of instance symbols to link.
    static instanceSymbols: string [] = null; // ["currentLabels"];

    static executeAndExitFrame() {
      enterTimeline("MovieClip.executeFrame");
      var queue = MovieClip._callQueue;
      while (queue.length) {
        var instance = queue.shift();
        instance._allowFrameNavigation = false;
        //if (!ignoreFrameScripts) {
          instance.callFrame(instance._currentFrame);
        //}
        instance._allowFrameNavigation = true;
        if (instance._nextFrame !== instance._currentFrame) {
          instance._advanceFrame();
          instance._constructChildren();
        }
      }
      DisplayObject._broadcastFrameEvent(events.Event.EXIT_FRAME);
      leaveTimeline();
    }

    constructor () {
      false && super();
      Sprite.instanceConstructorNoInitialize.call(this);
    }

    _initFrame() {
      if (this._totalFrames > 1 && this._hasFlags(DisplayObjectFlags.Constructed)) {
        if (!this._stopped) {
          this._nextFrame++;
        }
        this._advanceFrame();
      }
    }

    _constructFrame() {
      this._constructChildren();
    }

    // JS -> AS Bindings

    
    // AS -> JS Bindings
    
    private _currentFrame: number;
    private _nextFrame: number;
    private _totalFrames: number;
    private _frames: Shumway.Timeline.FrameDelta[];
    private _frameScripts: any;
    private _scenes: Scene[];

    private _enabled: boolean;
    private _isPlaying: boolean;
    private _stopped: boolean;

    private _trackAsMenu: boolean;
    private _allowFrameNavigation: boolean;

    _as2SymbolClass;
    private _boundExecuteAS2FrameScripts: () => void;
    private _as2FrameScripts: AVM1.AS2ActionsData[][];

    get currentFrame(): number /*int*/ {
      return this._currentFrame - this._sceneForFrameIndex(this._currentFrame).offset;
    }

    get framesLoaded(): number /*int*/ {
      return this._frames.length;
    }

    get totalFrames(): number /*int*/ {
      return this._totalFrames;
    }

    get trackAsMenu(): boolean {
      return this._trackAsMenu;
    }

    set trackAsMenu(value: boolean) {
      this._trackAsMenu = !!value;
    }

    get scenes(): Scene[] {
      return this._scenes.map(function (scene: Scene) {
        return scene.clone();
      });
    }

    get currentScene(): Scene {
      var scene = this._sceneForFrameIndex(this._currentFrame);
      return scene.clone();
    }

    get currentLabel(): string {
      var label: FrameLabel = this._labelForFrame(this.currentFrame);
      return label ? label.name : null;
    }

    get currentFrameLabel(): string {
      var currentFrame = this.currentFrame;
      var label: FrameLabel = this._labelForFrame(currentFrame);
      return label && label.frame === currentFrame ? label.name : null;
    }

    get enabled(): boolean {
      return this._enabled;
    }

    set enabled(value: boolean) {
      this._enabled = !!value;
    }

    get isPlaying(): boolean {
      return this._isPlaying;
    }

    play(): void {
      if (this._totalFrames > 1) {
        this._isPlaying = true;
      }
      this._stopped = false;
    }

    stop(): void {
      this._isPlaying = false;
      this._stopped = true;
    }

    /**
     * Implementation for both gotoAndPlay and gotoAndStop.
     *
     * Technically, we should throw all errors from those functions directly so the stack is
     * correct.
     * We might at some point do that by explicitly inlining this function using some build step.
     */
    private _gotoFrame(frame: string, sceneName: string = null): void {
      var scene: Scene;
      if (sceneName !== null) {
        sceneName = asCoerceString(sceneName);
        var scenes = this._scenes;
        release || assert (scenes.length, "There should be at least one scene defined.");
        for (var i = 0; i < scenes.length; i++) {
          scene = scenes[i];
          if (scene.name === sceneName) {
            break;
          }
        }
        if (i === scenes.length) {
          throwError('ArgumentError', Errors.SceneNotFoundError, sceneName);
        }
      } else {
        scene = this._sceneForFrameIndex(this._currentFrame);
      }

      // Amazingly, the `frame` argument, while first coerced to string, is then interpreted as a
      // frame index even if a label with the same name exists.
      var frameNum = parseInt(frame);
      if (<any>frameNum != frame) { // TypeScript doesn't like using `==` for number,string vars.
        var labels = scene.labels;
        for (var i = 0; i < labels.length; i++) {
          var label = labels[i];
          if (label.name === frame) {
            frameNum = label.frame;
            break;
          }
        }
        if (i === labels.length) {
          throwError('ArgumentError', Errors.FrameLabelNotFoundError, frame, sceneName);
        }
      }

      this._gotoFrameAbs(scene.offset + frameNum);
    }

    private _gotoFrameAbs(frame: number): void {
      if (frame < 1) {
        frame = 1;
      } else if (frame > this._totalFrames) {
        frame = this._totalFrames;
      }
      if (frame === this._nextFrame) {
        return;
      }

      this._nextFrame = frame;

      if (this._allowFrameNavigation) { // TODO: also check if ActionScriptVersion < 3
        // TODO test inter-frame navigation behaviour for SWF versions < 10
        this._advanceFrame();
        DisplayObject.constructFrame();
        MovieClip.executeAndExitFrame();
      }
    }

    private _advanceFrame(): void {
      var currentFrame = this._currentFrame;
      var nextFrame = this._nextFrame;

      if (nextFrame > this._totalFrames) {
        nextFrame = 1;
      }

      if (currentFrame === nextFrame) {
        // If nextFrame was > this._totalFrames, it has to be written back here, otherwise it'll
        // just be incremented ever further.
        this._nextFrame = nextFrame;
        return;
      }

      //if (this._buttonMode && this._enabled) {
      //  var buttonState = '_up';
      //  if (this._mouseOver) {
      //    buttonState = this._mouseDown ? '_down' : '_over';
      //  }
      //  var currentScene = scenes[this._sceneIndex];
      //  var labels = currentScene.labels;
      //  for (var j = 0; j < labels.length; j++) {
      //    var label = labels[j];
      //    if (label.name === buttonState) {
      //      // this.stop();
      //      nextFrame = offset + label.frame;
      //      break;
      //    }
      //  }
      //}

      if (nextFrame > this.framesLoaded) {
        // If nextFrame was > this._totalFrames, it has to be written back here, otherwise it'll
        // just be incremented ever further.
        this._nextFrame = nextFrame;
        // TODO
        return;
      }

      var frames = this._frames;
      var startIndex = currentFrame;
      if (nextFrame < currentFrame) {
        var frame = frames[0];
        release || assert (frame, "FrameDelta is not defined.");
        var stateAtDepth = frame.stateAtDepth;
        var children = this._children.slice();
        for (var i = 0; i < children.length; i++) {
          var child = children[i];
          if (child._depth) {
            var state = stateAtDepth[child._depth];
            if (!state || !state.canBeAnimated(child)) {
              this._removeAnimatedChild(child);
            }
          }
        }
        startIndex = 0;
      }
      for (var i = startIndex; i < nextFrame; i++) {
        var frame = frames[i];
        release || assert (frame, "FrameDelta is not defined.");
        var stateAtDepth = frame.stateAtDepth;
        for (var depth in stateAtDepth) {
          var child = this.getChildAtDepth(depth);
          var state = stateAtDepth[depth];
          if (child) {
            if (state && state.canBeAnimated(child)) {
              if (state.symbol && !state.symbol.dynamic) {
                // TODO: Handle http://wahlers.com.br/claus/blog/hacking-swf-2-placeobject-and-ratio/.
                child._setStaticContentFromSymbol(state.symbol);
              }
              child._animate(state);
              continue;
            }
            this._removeAnimatedChild(child);
          }
          if (state && state.symbol) {
            var character = DisplayObject.createAnimatedDisplayObject(state, false);
            this.addChildAtDepth(character, state.depth);
            if (state.symbol.isAS2Object) {
              this._initAvm1Bindings(character, state);
            }
          }
        }
      }

      if (this._frameScripts[nextFrame]) {
        MovieClip._callQueue.push(this);
      }

      this._currentFrame = this._nextFrame = nextFrame;
    }

    /**
     * Because that's how it's mostly used, the current frame is stored as an offset into the
     * entire timeline. Sometimes, we need to know which scene it falls into. This utility
     * function answers that.
     */
    private _sceneForFrameIndex(frameIndex: number) : Scene {
      var scenes = this._scenes;
      for (var i = 0; i < scenes.length; i++) {
        var scene = scenes[i];
        if (scene.offset < frameIndex && scene.offset + scene.numFrames >= frameIndex) {
          return scene;
        }
      }
      release || assertUnreachable("Must have at least one scene covering all frames.");
    }

    /**
     * Frame indices are stored as offsets into the entire timline, whereas labels are stored
     * in their scenes. This utility function iterates over scenes and their labels to find
     * the label clostest to, but not after the target frame.
     */
    private _labelForFrame(frame: number): FrameLabel {
      var scenes = this._scenes;
      var label: FrameLabel = null;
      for (var i = 0; i < scenes.length; i++) {
        var scene = scenes[i];
        if (scene.offset > frame) {
          return label;
        }
        var labels = scene.labels;
        for (var j = 0; j < labels.length; j++) {
          var currentLabel = labels[j];
          if (currentLabel.frame > frame - scene.offset) {
            return label;
          }
          label = currentLabel;
        }
      }
      return label;
    }

    private _removeAnimatedChild(child: flash.display.DisplayObject) {
      this.removeChild(child);
      child._removeReference();
      if (child._name) {
        var mn = Multiname.getPublicQualifiedName(child._name);
        if (this[mn] === child) {
          this[mn] = null;
        }
        //child._removeReference();
      }
    }

    callFrame(frame: number): void {
      frame = frame | 0;
      var frameScript = this._frameScripts[frame];
      if (!frameScript) {
        return;
      }
      try {
        frameScript.call(this);
      } catch (e) {
        Telemetry.instance.reportTelemetry({ topic: 'error', error: Telemetry.ErrorTypes.AVM2_ERROR });

        //if ($DEBUG) {
        //  console.error('error ' + e + ', stack: \n' + e.stack);
        //}

        this.stop();
        throw e;
      }
    }

    nextFrame(): void {
      this.gotoAndStop(this._currentFrame + 1);
    }

    prevFrame(): void {
      this.gotoAndStop(this._currentFrame - 1);
    }

    gotoAndPlay(frame: any, scene: string = null): void {
      // Argument handling for gotoAnd* is a bit peculiar:
      // - too many arguments throw just as too few do
      // - the `sceneName` argument is coerced first
      // - the `frame` argument is coerced to string, but `undefined` results in `"null"`
      if (arguments.length === 0 || arguments.length > 2) {
        throwError('ArgumentError', Errors.WrongArgumentCountError,
                   'flash.display::MovieClip/gotoAndPlay()', 1, arguments.length);
      }
      scene = asCoerceString(scene);
      frame = asCoerceString(frame) + ''; // The asCoerceString returns `null` for `undefined`.
      this.play();
      this._gotoFrame(frame, scene);
    }

    gotoAndStop(frame: any, scene: string = null): void {
      // See comment in gotoAndPlay for an explanation of the arguments handling stuff.
      if (arguments.length === 0 || arguments.length > 2) {
        throwError('ArgumentError', Errors.WrongArgumentCountError,
                   'flash.display::MovieClip/gotoAndPlay()', 1, arguments.length);
      }
      scene = asCoerceString(scene);
      frame = asCoerceString(frame) + ''; // The asCoerceString returns `null` for `undefined`.
      this.stop();
      this._gotoFrame(frame, scene);
    }

    /**
     * Takes pairs of `frameIndex`, `script` arguments and adds the `script`s to the `_frameScripts`
     * Array.
     *
     * Undocumented method used to implement the old timeline concept in AS3.
     */
    addFrameScript(frameIndex: number, script: (any?)=>any /*, ...*/): void {
      if (!this._currentFrame) {
        return;
      }
      // arguments are pairs of frameIndex and script/function
      // frameIndex is in range 0..totalFrames-1
      var numArgs = arguments.length;
      if (numArgs & 1) {
        throwError('ArgumentError', Errors.TooFewArgumentsError, numArgs, numArgs + 1);
      }
      var frameScripts = this._frameScripts;
      var totalFrames = this._totalFrames;
      for (var i = 0; i < numArgs; i += 2) {
        var frameNum = (arguments[i]|0) + 1;
        if (frameNum < 1 || frameNum > totalFrames) {
          continue;
        }
        frameScripts[frameNum] = arguments[i + 1];
        if (frameNum === this._currentFrame) {
          MovieClip._callQueue.push(this);
        }
      }
    }

    addAS2FrameScript(frameIndex: number, actionsBlock: Uint8Array): void {
      var frameScripts = this._as2FrameScripts;
      if (!frameScripts) {
        release || assert(!this._boundExecuteAS2FrameScripts);
        this._boundExecuteAS2FrameScripts = this._executeAS2FrameScripts.bind(this);
        frameScripts = this._as2FrameScripts = [];
      }
      var scripts: AVM1.AS2ActionsData[] = frameScripts[frameIndex + 1];
      if (!scripts) {
        scripts = frameScripts[frameIndex + 1] = [];
        this.addFrameScript(frameIndex, this._boundExecuteAS2FrameScripts);
      }
      var actionsData = new AVM1.AS2ActionsData(actionsBlock,
                                                'f' + frameIndex + 'i' + scripts.length);
      scripts.push(actionsData);
    }

    private _executeAS2FrameScripts() {
      var avm1Context = this.loaderInfo._avm1Context;
      var as2Object = Shumway.AVM1.getAS2Object(this);
      var scripts: AVM1.AS2ActionsData[] = this._as2FrameScripts[this._currentFrame];
      release || assert(scripts && scripts.length);
      for (var i = 0; i < scripts.length; i++) {
        var actionsData = scripts[i];
        avm1Context.executeActions(actionsData, this.stage, as2Object);
      }
    }

    addScene(name: string, labels: any [], offset: number, numFrames: number): void {
      this._scenes.push(new Scene(name, labels, offset, numFrames));
    }

    addFrameLabel(name: string, frame: number): void {
      this._sceneForFrameIndex(frame)._labels.push(new flash.display.FrameLabel(name, frame));
    }

    prevScene(): void {
      var currentScene = this._sceneForFrameIndex(this._currentFrame);
      if (currentScene.offset === 0) {
        return;
      }
      // Since scene offsets are 0-based, the current scene's offset, treated as a frame index,
      // is the previous scene's last frame.
      this._gotoFrameAbs(this._sceneForFrameIndex(currentScene.offset).offset + 1);
    }

    nextScene(): void {
      var currentScene = this._sceneForFrameIndex(this._currentFrame);
      this._gotoFrameAbs(currentScene.offset + currentScene.numFrames + 1);
    }
  }
}