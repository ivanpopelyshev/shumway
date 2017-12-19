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

/**
 * Lets you run Shumway from the command line.
 */

declare let scriptArgs;
declare let arguments;
declare let load;
declare let quit;
declare let read;
declare let help;
declare let printErr;

// Number of errors thrown, used for shell scripting to return non-zero exit codes.
let errors = 0;

let homePath = "";
//load(homePath + "build/libs/relooper.js");
let builtinABCPath = homePath + "build/libs/builtin.abc";
let shellABCPath = homePath + "build/libs/shell.abc";
let playerglobalInfo = {
  abcs: homePath + "build/playerglobal/playerglobal.abcs",
  catalog: homePath + "build/playerglobal/playerglobal.json"
};

declare let readFile, readBinaryFile, readbuffer;
let isV8 = typeof readbuffer !== 'undefined';
let isJSC = typeof readFile !== 'undefined';
if (isV8) {
  let oldread = read;
  read = function (path, type) {
    return type === 'binary' ? new Uint8Array(readbuffer(path)) : oldread(path);
  }
} else if (isJSC) {
  if (typeof readBinaryFile === 'undefined') {
    throw new Error('readBinaryFile was not found');
  }
  read = function (path, type) {
    return type === 'binary' ? new Uint8Array(readBinaryFile(path)) : readFile(path);
  }
}
if (typeof read === 'undefined') {
  throw new Error('Unable to simulate read()');
}

if (isV8 || isJSC) {
  // v8 and jsc will fail for Promises
  this.Promise = undefined;
}

/**
 * Global unitTests array, unit tests add themselves to this. The list may have numbers, these indicate the
 * number of times to run the test following it. This makes it easy to disable test by pushing a zero in
 * front.
 */
let unitTests = [];

declare let microTaskQueue: Shumway.Shell.MicroTasksQueue;

let commandLineArguments: string [];
// SpiderMonkey
if (typeof scriptArgs === "undefined") {
  commandLineArguments = arguments;
} else {
  commandLineArguments = scriptArgs;
}

let disableBundleSelection;
try {
  disableBundleSelection = read('build/ts/shell.conf') === 'dist';
} catch (e) {
  disableBundleSelection = false;
}

// The command line parser isn't yet available, so do a rough manual check for whether the bundled
// player source should be used.
if (disableBundleSelection || commandLineArguments.indexOf('--bundle') >= 0) {
  load('build/bundles/shumway.player.js');
} else if (commandLineArguments.indexOf('-b') >= 0 || commandLineArguments.indexOf('--closure-bundle') >= 0) {
  load('build/bundles-cc/shumway.player.js');
} else {
  /* Autogenerated player references: base= */

  load("build/ts/base.js");
  load("build/ts/tools.js");

  load("build/ts/avm2.js");

  load("build/ts/swf.js");

  load("build/ts/flash.js");

  load("build/ts/avm1.js");

  load("build/ts/gfx-base.js");
  load("build/ts/player.js");

  /* Autogenerated player references end */
}

module Shumway.Shell {
  import assert = Shumway.Debug.assert;
  import ABCFile = Shumway.AVMX.ABCFile;
  import WriterFlags = Shumway.AVMX.WriterFlags;

  import Option = Shumway.Options.Option;
  import OptionSet = Shumway.Options.OptionSet;
  import ArgumentParser = Shumway.Options.ArgumentParser;

  import SwfTagCode = Shumway.SWF.Parser.SwfTagCode;
  import DataBuffer = Shumway.ArrayUtilities.DataBuffer;

  import Compiler = Shumway.AVM2.Compiler;

  class ShellGFXServer implements Shumway.Remoting.IGFXService {
    addObserver(observer: Shumway.Remoting.IGFXServiceObserver) {
      // Ignoring
    }

    removeObserver(observer: Shumway.Remoting.IGFXServiceObserver) {
      // Ignoring
    }

    update(updates: DataBuffer, assets: any[]): void {
      let bytes = updates.getBytes();
      // console.log('Updates sent');
      return null;
    }

    updateAndGet(updates: DataBuffer, assets: any[]): any {
      let bytes = updates.getBytes();

      // Simulating text field metrics
      let buffer = new DataBuffer();
      buffer.write2Ints(1, 1); // textWidth, textHeight
      buffer.writeInt(0); // offsetX
      buffer.writeInt(0); // numLines
      buffer.position = 0;
      return buffer;
    }

    frame(): void {
      // console.log('Frame');
    }

    videoControl(id: number, eventType: Shumway.Remoting.VideoControlEvent, data: any): any {
      // console.log('videoControl');
    }

    registerFont(syncId: number, data: any): Promise<any> {
      // console.log('registerFont');
      return Promise.resolve(undefined);
    }

    registerImage(syncId: number, symbolId: number, data: any, alphaData: any): Promise<any> {
      // console.log('registerImage');
      return Promise.resolve({width: 100, height: 50});
    }

    fscommand(command: string, args: string): void {
      if (command === 'quit') {
        // console.log('Player quit');
        microTaskQueue.stop();
      }
    }
  }

  export let verbose = false;
  let writer = new IndentingWriter();

  let parseOption: Option;
  let scanParseOption: Option;
  let disassembleOption: Option;
  let compileOption: Option;
  let verboseOption: Option;
  let profileOption: Option;
  let releaseOption: Option;
  let deterministicOption: Option;
  let executeOption: Option;
  let freshSecurityDomainOption: Option;
  let printABCFileNameOption: Option;
  let interpreterOption: Option;
  let symbolFilterOption: Option;
  let microTaskDurationOption: Option;
  let microTaskCountOption: Option;
  let maxFrameCountOption: Option;
  let repeatOption: Option;
  let loadPlayerGlobalCatalogOption: Option;
  let loadShellLibOption: Option;
  let porcelainOutputOption: Option;
  let usePlayerBundleOption: Option;
  let usePlayerClosureBundleOption: Option;

  let fuzzMillOption: Option;
  let writersOption: Option;

  export function main(commandLineArguments: string []) {
    let systemOptions: Shumway.Options.OptionSet = Shumway.Settings.shumwayOptions;
    let shellOptions = systemOptions.register(new Shumway.Options.OptionSet("Shell Options"));

    parseOption = shellOptions.register(new Option("p", "parse", "boolean", false, "Parse File(s)"));
    scanParseOption = shellOptions.register(new Option("sp", "scanParse", "boolean", false, "Scan/Parse File(s)"));
    disassembleOption = shellOptions.register(new Option("d", "disassemble", "boolean", false, "Disassemble File(s)"));
    compileOption = shellOptions.register(new Option("c", "compile", "boolean", false, "Compile File(s)"));
    verboseOption = shellOptions.register(new Option("v", "verbose", "boolean", false, "Verbose"));
    profileOption = shellOptions.register(new Option("o", "profile", "boolean", false, "Profile"));
    releaseOption = shellOptions.register(new Option("r", "release", "boolean", false, "Release mode"));
    deterministicOption = shellOptions.register(new Option("det", "deterministic", "boolean", false, "Deterministic execution, with rigged timers and random generator"));
    if (!disableBundleSelection) {
      usePlayerClosureBundleOption = shellOptions.register(new Option('b', "closure-bundle", "boolean", false, "Use bundled and closure compiled source file for the player."));
      usePlayerBundleOption = shellOptions.register(new Option('', "bundle", "boolean", false, "Use bundled source file for the player."));
    }
    executeOption = shellOptions.register(new Option("x", "execute", "boolean", false, "Execute File(s)"));
    freshSecurityDomainOption = shellOptions.register(new Option("fsd", "freshSecurityDomain", "boolean", false, "Creates a fresh security domain for each ABC file."));
    printABCFileNameOption = shellOptions.register(new Option("", "printABCFileName", "boolean", false, "Print each ABC filename before running it."));
    interpreterOption = shellOptions.register(new Option("i", "interpreter", "boolean", false, "Interpreter Only"));
    symbolFilterOption = shellOptions.register(new Option("f", "filter", "string", "", "Symbol Filter"));
    microTaskDurationOption = shellOptions.register(new Option("md", "duration", "number", 0, "Maximum micro task duration."));
    microTaskCountOption = shellOptions.register(new Option("mc", "count", "number", 64 * 1024, "Maximum micro task count."));
    maxFrameCountOption = shellOptions.register(new Option("fc", "frameCount", "number", 0, "Frame count."));
    repeatOption = shellOptions.register(new Option("rp", "rp", "number", 1, "Repeat count."));
    loadPlayerGlobalCatalogOption = shellOptions.register(new Option("g", "playerGlobal", "boolean", false, "Load Player Global"));
    loadShellLibOption = shellOptions.register(new Option("s", "shell", "boolean", false, "Load Shell Global"));
    porcelainOutputOption = shellOptions.register(new Option('', "porcelain", "boolean", false, "Keeps outputs free from the debug messages."));

    fuzzMillOption = shellOptions.register(new Option('', "fuzz", "string", "", "Generates random SWFs XML."));

    writersOption = shellOptions.register(new Option("w", "writers", "string", "", "Writers Filter [r: runtime, e: execution, i: interpreter]"));

    let argumentParser = new ArgumentParser();
    argumentParser.addBoundOptionSet(systemOptions);

    function printUsage() {
      writer.enter("Shumway Command Line Interface");
      systemOptions.trace(writer);
      writer.leave("");
    }

    argumentParser.addArgument("h", "help", "boolean", {parse: function (x) {
      printUsage();
    }});

    let files = [];

    // Try and parse command line arguments.

    try {
      argumentParser.parse(commandLineArguments).filter(function (value, index, array) {
        if (value[0] === "@" || value.endsWith(".abc") || value.endsWith(".swf") || value.endsWith(".js") || value.endsWith(".json")) {
          files.push(value);
        } else {
          return true;
        }
      });
    } catch (x) {
      writer.writeLn(x.message);
      quit();
    }

    initializePlayerServices();

    microTaskQueue = new Shumway.Shell.MicroTasksQueue();

    if (porcelainOutputOption.value) {
      console.info = console.log = console.warn = console.error = function () {};
      writer.suppressOutput = true;
    }

    profile = profileOption.value;
    release = releaseOption.value;
    verbose = verboseOption.value;

    if (!verbose) {
      IndentingWriter.logLevel = Shumway.LogLevel.Error | Shumway.LogLevel.Warn;
    }

    if (fuzzMillOption.value) {
      let fuzzer = new Shumway.Shell.Fuzz.Mill(new IndentingWriter(), fuzzMillOption.value);
      fuzzer.fuzz();
    }

    Shumway.Unit.writer = new IndentingWriter();

    let writerFlags = WriterFlags.None;
    if (writersOption.value.indexOf("r") >= 0) {
      writerFlags |= WriterFlags.Runtime;
    }
    if (writersOption.value.indexOf("e") >= 0) {
      writerFlags |= WriterFlags.Execution;
    }
    if (writersOption.value.indexOf("i") >= 0) {
      writerFlags |= WriterFlags.Interpreter;
    }
    Shumway.AVMX.setWriters(writerFlags);

    if (compileOption.value) {
      let buffers = [];
      files.forEach(function (file) {
        let buffer = new Uint8Array(read(file, "binary"));
        if (file.endsWith(".abc")) {
          buffers.push(buffer);
        } else if (file.endsWith(".swf")) {
          buffers.push.apply(buffers, extractABCsFromSWF(buffer));
        }
      });
      verbose && writer.writeLn("Loading " + buffers.length + " ABCs");
      release || Shumway.Debug.notImplemented("Compile");
      if (Shumway.AVMX.timelineBuffer) {
        Shumway.AVMX.timelineBuffer.createSnapshot().trace(new IndentingWriter());
      }
    }

    if (parseOption.value) {
      files.forEach(function (file) {
        let start = Date.now();
        writer.debugLn("Parsing: " + file);
        profile && SWF.timelineBuffer.reset();
        try {
          parsingCounter.clear();
          parseFile(file, symbolFilterOption.value.split(","));
          let elapsed = Date.now() - start;
          if (verbose) {
            writer.writeLn("Total Parse Time: " + (elapsed).toFixed(2) + " ms.");
            profile && SWF.timelineBuffer.createSnapshot().trace(writer);
          }
        } catch (e) {
          writer.writeLn("EXCEPTED: " + file);
        }
      });
    }

    if (executeOption.value) {
      let shouldLoadPlayerGlobalCatalog = loadPlayerGlobalCatalogOption.value;
      if (!shouldLoadPlayerGlobalCatalog) {
        // We need to load player globals if any swfs need to be executed.
        files.forEach(file => {
          if (file.endsWith(".swf")) {
            shouldLoadPlayerGlobalCatalog = true;
          }
        });
      }
      executeFiles(files);
    } else if (disassembleOption.value) {
      let sec = createSecurityDomain(builtinABCPath, null, null);
      files.forEach(function (file) {
        if (file.endsWith(".abc")) {
          disassembleABCFile(sec, file);
        }
      });
    }
    if (errors) {
      quit(1);
    }
    if (Shumway.Unit.everFailed) {
      writer.errorLn('Some unit tests failed');
      quit(1);
    }
  }

  function disassembleABCFile(sec: ISecurityDomain, file: string) {
    try {
      let buffer = read(file, "binary");
      let env = {url: file, app: sec.application};
      let abc = new ABCFile(env, new Uint8Array(buffer));
      // We need to load the ABCFile in a |sec| because the parser may
      // throw verifier errors.
      sec.application.loadABC(abc);
      abc.trace(writer);
    } catch (x) {
      writer.redLn('Exception encountered while running ' + file + ': ' + '(' + x + ')');
      writer.redLns(x.stack);
      errors ++;
    }
  }

  function executeFiles(files: string []): boolean {
    // If we're only dealign with .abc files, run them all in the same domain.
    if (files.every(function (file) {
        return file.endsWith(".abc") || file[0] === "@";
      })) {
      executeABCFiles(files);
      return;
    }
    files.forEach(function (file) {
      if (file.endsWith(".js")) {
        executeUnitTestFile(file);
      } else if (file.endsWith(".json")) {
        executeJSONFile(file);
      } else if (file.endsWith(".abc")) {
        executeABCFiles([file]);
      } else if (file.endsWith(".swf")) {
        executeSWFFile(file, microTaskDurationOption.value, microTaskCountOption.value, maxFrameCountOption.value);
      }
    });
    return true;
  }

  function executeSWFFile(file: string, runDuration: number, runCount: number, frameCount: number) {
    if (verbose) {
      writer.writeLn("executeSWF: " + file +
                     ", runDuration: " + runDuration +
                     ", runCount: " + runCount +
                     ", frameCount: " + frameCount);
    }
    function runSWF(file: any) {
      microTaskQueue.clear();
      if (deterministicOption.value) {
        Shumway.Random.reset();
        Shumway.installTimeWarper();
      }

      let sec = createSecurityDomain(builtinABCPath, null, null);
      let player = new Shumway.Player.Player(sec, new ShellGFXServer());
      try {
        let buffer = read(file, 'binary');
      } catch (e) {
        console.log("Error loading SWF: " + e.message);
        quit(127);
      }
      player.load(file, buffer);
      // Set a default size for the stage container.
      player.stage.setStageContainerSize(512, 512, 1);
      return player;
    }

    let player = null;
    let asyncLoading = true;
    // TODO: resolve absolute file path for the base URL.
    (<any>Shumway.FileLoadingService.instance).setBaseUrl('file://' + file);
    if (asyncLoading) {
      player = runSWF(file);
    } else {
      player = runSWF(read(file, 'binary'));
    }

    try {
      let hash = 0;
      let lastFramesPlayed = 0;
      writer.writeLn("RUNNING:  " + file);
      microTaskQueue.run(runDuration, runCount, true, function () {
        if (!frameCount) {
          return true;
        }
        if (lastFramesPlayed < player.framesPlayed) {
          hash = HashUtilities.mixHash(hash, player.stage.hashCode());
          // This dumps too much output and is not all that useful, unless you want to debug something.
          // writer.writeLn("Frame: " + player.framesPlayed + " HASHCODE: " + file + ": " + IntegerUtilities.toHEX(hash));
          // player.stage.debugTrace(writer);
          lastFramesPlayed = player.framesPlayed;
        }
        // Exit if we've executed enough frames.
        return player.framesPlayed <= frameCount;
      });
      if (verbose) {
        writer.writeLn("executeSWF PASS: " + file);
      }
      writer.writeLn("HASHCODE: " + file + ": " + IntegerUtilities.toHEX(hash));
    } catch (x) {
      writer.redLn('Exception: ' + '(' + x + ')');
      writer.redLns(x.stack);
    }
  }

  function executeJSONFile(file: string) {
    if (verbose) {
      writer.writeLn("executeJSON: " + file);
    }
    // Remove comments
    let json = JSON.parse(read(file, "text").split("\n").filter(function (line) {
      return line.trim().indexOf("//") !== 0;
    }).join("\n"));

    json.forEach(function (run, i) {
      printErr("Running batch " + (i + 1) + " of " + json.length + " (" + run[1].length + " tests)");
      let sec = createSecurityDomain(builtinABCPath, null, null);
      // Run libraries.
      run[0].forEach(function (file) {
        let buffer = new Uint8Array(read(file, "binary"));
        let env = {url: file, app: sec.application};
        let abc = new ABCFile(env, buffer);
        if (verbose) {
          writer.writeLn("executeABC: " + file);
        }
        sec.application.loadAndExecuteABC(abc);
      });
      // Run files.
      run[1].forEach(function (file) {
        try {
          if (verbose) {
            writer.writeLn("executeABC: " + file);
          }
          let buffer = new Uint8Array(read(file, "binary"));
          let env = {url: file, app: sec.application};
          let abc = new ABCFile(env, buffer);
          sec.application.loadABC(abc);
          let t = Date.now();
          sec.application.executeABC(abc);
          let e = (Date.now() - t);
          if (e > 100) {
            printErr("Test: " + file + " is very slow (" + e.toFixed() + " ms), consider disabling it.");
          }
          //if (verbose) {
          //  writer.writeLn("executeABC PASS: " + file);
          //}
        } catch (x) {
          //if (verbose) {
          //  writer.writeLn("executeABC FAIL: " + file);
          //}
          writer.writeLn("EXCEPTED: " + file);
          try {
            writer.redLn('Exception: ' + '(' + x + ')');
            writer.redLns(x.stack);
          } catch (y) {
            writer.writeLn("Error printing error.");
          }
          errors ++;
        }
        resetSecurityDomain(sec);
      });
    });
  }

  function resetSecurityDomain(sec: AVMX.AXSecurityDomain) {
    // Only reset XML settings if AXXML has been initialized.
    if (sec.AXXML.resetSettings) {
      sec.AXXML.resetSettings();
    }
  }

  function executeABCFiles(files: string []) {
    let sec = freshSecurityDomainOption.value ? null : createSecurityDomain(builtinABCPath, null, null);
    files.forEach(function (file) {
      if (file === "@createSecurityDomain") {
        sec = createSecurityDomain(builtinABCPath, null, null);
        return;
      }
      if (freshSecurityDomainOption.value) {
        sec = createSecurityDomain(builtinABCPath, null, null);
      }
      try {
        if (printABCFileNameOption.value) {
          writer.writeLn("::: " + file + " :::");
        }
        let buffer = new Uint8Array(read(file, "binary"));
        let env = {url: file, app: sec.application};
        let abc = new ABCFile(env, buffer);
        sec.application.loadAndExecuteABC(abc);
        if (verbose) {
          writer.writeLn("executeABC PASS: " + file);
        }
      } catch (x) {
        if (verbose) {
          writer.writeLn("executeABC FAIL: " + file);
        }
        try {
          writer.redLn('Exception encountered while running ' + file + ': ' + '(' + x + ')');
          writer.redLns(x.stack);
        } catch (y) {
          writer.writeLn("Error printing error.");
        }
        errors ++;
      }
    });
  }

  function executeUnitTestFile(file: string) {
    let sec = createSecurityDomain(builtinABCPath, null, null);
    Shumway.AVMX.AS.installClassLoaders(sec.application, jsGlobal);

    // Make the sec available on the global object for ease of use
    // in unit tests.
    jsGlobal.sec = sec;

    writer.writeLn("Running test file: " + file + " ...");
    let start = Date.now();
    load(file);
    let testCount = 0;
    while (unitTests.length) {
      let test = unitTests.shift();
      let repeat = 1;
      if (typeof test === "number") {
        repeat = test;
        test = unitTests.shift();
      }
      if (verbose && test.name) {
        writer.writeLn("Test: " + test.name);
      }
      testCount += repeat;
      try {
        for (let i = 0; i < repeat; i++) {
          test();
        }
      } catch (x) {
        writer.redLn('Exception encountered while running ' + file + ':' + '(' + x + ')');
        writer.redLns(x.stack);
      }
    }
    writer.writeLn("Executed JS File: " + file);
    writer.outdent();
  }

  function extractABCsFromSWF(buffer: Uint8Array): Uint8Array [] {
    let abcData = [];
    try {
      let loadListener: ILoadListener = {
        onLoadOpen: function(file: Shumway.SWF.SWFFile) {
          for (let i = 0; i < file.abcBlocks.length; i++) {
            let abcBlock = file.abcBlocks[i];
            abcData.push(abcBlock.data);
          }
        },
        onLoadProgress: function(update: LoadProgressUpdate) {
        },
        onLoadError: function() {
        },
        onLoadComplete: function() {
        },
        onNewEagerlyParsedSymbols(dictionaryEntries: SWF.EagerlyParsedDictionaryEntry[], delta: number): Promise<any> {
          return Promise.resolve();
        },
        onImageBytesLoaded() {}
      };
      let loader = new Shumway.FileLoader(loadListener, null);
      loader.loadBytes(buffer);
    } catch (x) {
      writer.redLn("Cannot parse SWF, reason: " + x);
      return null;
    }
    return abcData;
  }

  let parsingCounter = new Shumway.Metrics.Counter(true);

  /**
   * Parses file.
   */
  function parseFile(file: string, symbolFilters: string []): boolean {
    let fileName = file.replace(/^.*[\\\/]/, '');
    function parseABC(buffer: Uint8Array) {
      let env = {url: fileName, app: null};
      let abcFile = new ABCFile(env, buffer);
      // abcFile.trace(writer);
    }
    let buffers = [];
    if (file.endsWith(".swf")) {
      let fileNameWithoutExtension = fileName.substr(0, fileName.length - 4);
      let SWF_TAG_CODE_DO_ABC = SwfTagCode.CODE_DO_ABC;
      let SWF_TAG_CODE_DO_ABC_ = SwfTagCode.CODE_DO_ABC_DEFINE;
      try {
        let buffer = read(file, "binary");
        if (!((buffer[0] === 'Z'.charCodeAt(0) ||
               buffer[0] === 'F'.charCodeAt(0) ||
               buffer[0] === 'C'.charCodeAt(0)) &&
             buffer[1] === 'W'.charCodeAt(0) &&
             buffer[2] === 'S'.charCodeAt(0))) {
          writer.redLn("Cannot parse: " + file + " because it doesn't have a valid header. " + buffer[0] + " " + buffer[1] + " " + buffer[2]);
          return
        }
        let startSWF = Date.now();
        let swfFile: Shumway.SWF.SWFFile;
        let loadListener: ILoadListener = {
          onLoadOpen: function(swfFile: Shumway.SWF.SWFFile) {
            if (scanParseOption.value) {
              return;
            }
            if (swfFile && swfFile.abcBlocks) {
              for (let i = 0; i < swfFile.abcBlocks.length; i++) {
                parseABC(swfFile.abcBlocks[i].data);
              }
            }
            if (swfFile instanceof Shumway.SWF.SWFFile) {
              let dictionary = swfFile.dictionary;
              for (let i = 0; i < dictionary.length; i++) {
                if (dictionary[i]) {
                  let s = performance.now();
                  let symbol = swfFile.getSymbol(dictionary[i].id);
                  parsingCounter.count(symbol.type, performance.now() - s);
                }
              }
            } else if (swfFile instanceof Shumway.ImageFile) {
              // ...
            }
          },
          onLoadProgress: function(update: LoadProgressUpdate) {
          },
          onLoadError: function() {
          },
          onLoadComplete: function() {
            writer.redLn("Load complete:");
          },
          onNewEagerlyParsedSymbols(dictionaryEntries: SWF.EagerlyParsedDictionaryEntry[],
                                    delta: number): Promise<any> {
            return Promise.resolve();
          },
          onImageBytesLoaded() {}
        };
        let loader = new Shumway.FileLoader(loadListener, null);
        loader.loadBytes(buffer);
      } catch (x) {
        writer.redLn("Cannot parse: " + file + ", reason: " + x);
        if (verbose) {
          writer.redLns(x.stack);
        }
        errors ++;
        return false;
      }
    } else if (file.endsWith(".abc")) {
      parseABC(new Uint8Array(read(file, "binary")));
    }
    return true;
  }

  function createSecurityDomain(builtinABCPath: string, shellABCPath: string, libraryPathInfo): ISecurityDomain {
    let buffer = read(builtinABCPath, 'binary');
    let sec = <ISecurityDomain>new AVMX.AXSecurityDomain();
    let env = {url: builtinABCPath, app: sec.system};
    let builtinABC = new ABCFile(env, new Uint8Array(buffer));
    sec.system.loadABC(builtinABC);
    sec.addCatalog(loadPlayerGlobalCatalog(sec.system));
    sec.initialize();
    sec.system.executeABC(builtinABC);
    return sec;
  }

  function loadPlayerGlobalCatalog(app: AVMX.AXApplicationDomain): AVMX.ABCCatalog {
    let abcs = read(playerglobalInfo.abcs, 'binary');
    let index = JSON.parse(read(playerglobalInfo.catalog));
    return new AVMX.ABCCatalog(app, abcs, index);
  }
}

Shumway.Shell.main(commandLineArguments);
