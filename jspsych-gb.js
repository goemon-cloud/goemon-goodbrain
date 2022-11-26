/**
 * 与えられたテキストを一定間隔で表示します。
 */
 class SequentialTexts {
  
    constructor(jsPsych) {
      this.jsPsych = jsPsych;
    }
    
    trial(display_element, trial) {
      const events = [];
      const labels = Object.keys(trial.texts);
      const samplesPerLabels = parseInt(trial.samples / labels.length);
      var words = [];
      for(var i = 0; i < labels.length; i ++) {
        const label = labels[i];
        const labeledWords = this.jsPsych.randomization.sampleWithoutReplacement(
          trial.texts[label].split(' '),
          i === 0 ? (trial.samples - samplesPerLabels * (labels.length - 1)) : samplesPerLabels
        );
        words = words.concat(labeledWords.map((w) => ({
          word: w,
          label: label,
        })));
        console.log('Words', label, labeledWords.length);
      }
      words = this.jsPsych.randomization.repeat(words, trial.repeats);
      console.log('Words', words.length);
      const panelHeight = trial.panelHeight || '70vh';
      display_element.innerHTML = '<div style="height: ' + panelHeight + '; position: relative;"><div style="margin: 0; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);"><span class="word" style="font-weight: bold; font-size: 2em;"></span></div></div>';
      this.runTrial(display_element, trial, words, events);
    }
    
    runTrial(display_element, trial, words, events) {
      if (words.length === 0) {
        $(display_element).find('.word').text('');
        events.push({
          time: Date.now(),
          text: null,
        });
        setTimeout(() => {
          this.jsPsych.finishTrial({
            finished: Date.now(),
            events: events,
          });
        }, trial.blankDuration);
        return;
      }
      
      const word = words.splice(0, 1)[0];
      console.log('Blank', word, trial.blankDuration);
      $(display_element).find('.word').text('');
      events.push({
        time: Date.now(),
        text: null,
        label: null,
      });
      
      setTimeout(() => {
        console.log('Word', word, trial.textDuration);
        $(display_element).find('.word').text(word.word);
        const st = Date.now();
        events.push({
          time: st,
          text: word.word,
          label: word.label,
        });
        setTimeout(() => {
          // 次の単語
          if (trial.onShown) {
            trial.onShown({
              startTime: st,
              endTime: st + trial.textDuration,
              text: word.word,
              label: word.label,
            });
          }
          this.runTrial(display_element, trial, words, events);
        }, trial.textDuration);
      }, trial.blankDuration);
    }
  
  }
  
  SequentialTexts.info = {
    name: 'sequential-texts-plugin',
    parameters: { 
      texts: {
        type: jsPsychModule.ParameterType.OBJECT,
        default: undefined,
      },
      samples: {
        type: jsPsychModule.ParameterType.INT,
        default: 10,
      },
      repeats: {
        type: jsPsychModule.ParameterType.INT,
        default: 10,
      },
      blankDuration: {
        type: jsPsychModule.ParameterType.INT,
        default: 500,
      },
      textDuration: {
        type: jsPsychModule.ParameterType.INT,
        default: 1000,
      },
      panelHeight: {
        type: jsPsychModule.ParameterType.STRING,
        default: null,
      },
      onShown: {
        type: jsPsychModule.ParameterType.FUNCTION,
        default: undefined,
      },
    }
  };
  
  /**
   * GoodBrainとの連携処理のラッパーです。
   */
  class GoodBrain {
  
    constructor() {
      this.onEEG = null;
      
      window.sendEEG = (data) => {
        if (!this.onEEG) {
          return;
        }
        this.onEEG(data);
      };
    }
    
    start() {
      const webkit = window.webkit;
      if (!webkit) {
        const userAgent = window.navigator.userAgent;
        if (
          userAgent.match(/Android/i) ||
          userAgent.match(/iPhone/i)
        ) {
          let currentURL = window.location.href;
          window.location.href = 'goodbrain://goemon?task=' + encodeURIComponent(currentURL);
          return;
        }
        // No webkit global object
        console.warn('webkitグローバルオブジェクトが見つかりません。GoodBrainアプリ内で実行してください。');
        return;
      }
      webkit.messageHandlers.startTask.postMessage("Start task");
    }
    
    stop() {
      window.webkit.messageHandlers.finishTask.postMessage("Finish task");
    }
  
  }
  
  const MAX_EEG_WAIT = 3;
  const goodbrain = new GoodBrain();
  
  /**
   * GoodBrainのjsPsych実装です。
   */
  class JSPsychGB {
    
    constructor(jsPsych) {
      this.jsPsych = jsPsych;
    }
    
    trial(display_element, trial) {
      const panelHeight = trial.panelHeight || '70vh';
      display_element.innerHTML = '<div style="height: ' + panelHeight + '; position: relative;"><div style="margin: 0; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);"><span class="eeg" style="font-weight: bold; font-size: 2em;"></span></div></div>';
      let count = 0;
      goodbrain.onEEG = (data) => {
        const valid = data
          .filter((elem) => elem.eeg)
          .every((elem) => this.isValidEEG(elem.eeg.split(';').map((value) => parseFloat(value))));
        const maxValues = data
          .filter((elem) => elem.eeg)
          .map((elem) => Math.max(...elem.eeg.split(';').map((value) => Math.abs(parseFloat(value)))));
        if (!valid) {
          this.notifyEEG(trial, 'prepare-invalid', data);
          $(display_element).find('.eeg').text('EEG値が不安定: ' + Math.max(...maxValues).toFixed(2));
          count = 0;
          return;
        }
        count ++;
        this.notifyEEG(trial, 'prepare-valid', data);
        $(display_element).find('.eeg').text('EEG値が安定: ' + Math.max(...maxValues).toFixed(2) + ': ' + count + '/' + MAX_EEG_WAIT);
        if (count <= MAX_EEG_WAIT) {
          return;
        }
        $(display_element).find('.eeg').html(trial.startMessage);
        goodbrain.onEEG = (data) => {
          // 開始
          this.notifyEEG(trial, 'running', data);
        };
        setTimeout(() => {
          console.log('EEG開始');
          this.jsPsych.finishTrial({
            finished: Date.now(),
            value: Math.max(...maxValues),
          });
        }, trial.startInterval);
      };
      
      $(display_element).find('.eeg').text('EEG開始中...');
      goodbrain.start();
    }
    
    isValidEEG(values) {
      const valid = 80; // ±80μv
      return values.every((v) => Math.abs(v) < valid);
    }
    
    notifyEEG(trial, phase, data) {
      if (!trial.onReceived) {
        return;
      }
      trial.onReceived({
        time: Date.now(),
        phase: phase,
      }, data);
    }
    
  }
  
  JSPsychGB.info = {
    name: 'goodbrain-plugin',
    parameters: { 
      onReceived: {
        type: jsPsychModule.ParameterType.FUNCTION,
        default: undefined,
      },
      startMessage: {
        type: jsPsychModule.ParameterType.STRING,
        default: 'EEGの設定が完了しました。',
      },
      startInterval: {
        type: jsPsychModule.ParameterType.INT,
        default: 1000,
      },
      panelHeight: {
        type: jsPsychModule.ParameterType.STRING,
        default: null,
      },
    },
  };
  
  /**
   * GoodBrainデータのロガーです。
   */
  class GBLogger {
    
    constructor(context, config) {
      this.context = context;
      this.bufferOffset = null;
      this.buffer = [];
      this.maxInterval = config.maxInterval || 0;
      this.maxSize = config.maxSize || 0;
      this.disabled = false;
    }
    
    setDisabled(disabled) {
      this.disabled = disabled;
    }
    
    log(data) {
      if (this.disabled) {
        return;
      }
      if (!this.bufferOffset) {
        this.bufferOffset = data.meta.time;
      }
      data.meta.time -= this.bufferOffset;
      this.buffer.push(data);
      this.flush(false);
      console.log('Buffer added', this.buffer.length, data);
    }
    
    flush(force, handler) {
      if (!this.bufferOffset) {
        if (handler) {
          handler(null);
        }
        return;
      }
      const interval = Date.now() - this.bufferOffset;
      const size = this.buffer.length;
      if (!force && this.remain(interval, size)) {
        if (handler) {
          handler(null);
        }
        return;
      }
      const buffer = this.buffer;
      this.buffer = [];
      this.bufferOffset = null;
      this.context.log('EEGデータを受信', {
        logs: buffer,
      }, () => {
        console.log('Flushed');
        if (!handler) {
          return;
        }
        handler();
      });
    }
    
    remain(interval, size) {
      if ((!this.maxInterval || interval <= this.maxInterval) && (!this.maxSize || size <= this.maxSize)) {
        return true;
      }
      return false;
    }
  
  }

  window._SequentialTexts = SequentialTexts;
  window._JSPsychGB = JSPsychGB;
  window._GBLogger = GBLogger;
  window._goodbrain = goodbrain;