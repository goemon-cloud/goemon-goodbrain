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
      
      const showText = () => {
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
      };
      var func = showText;
      if (trial.attentionDuration) {
        func = () => {
          $(display_element).find('.word').addClass('word-attention').text('+');
          setTimeout(() => {
            $(display_element).find('.word').removeClass('word-attention').text('');
            setTimeout(showText, trial.blankAfterAttentionDuration);
          }, trial.attentionDuration);
        };
      }
      setTimeout(func, trial.blankDuration);
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
      attentionDuration: {
        type: jsPsychModule.ParameterType.INT,
        default: 0,
      },
      blankAfterAttentionDuration: {
        type: jsPsychModule.ParameterType.INT,
        default: 100,
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

function animateProgress(e, context) {
  var currentContext = context || {
    cancelled: false,
    complete: null,
  };
  e.fadeOut(400, function() {
    e.fadeIn(400, function() {
      if(currentContext.cancelled) {
        if (!currentContext.complete) {
          return;
        }
        currentContext.complete();
        return;
      }
      animateProgress(e, currentContext);
    });
  });
  return function(complete) {
    currentContext.cancelled = true;
    currentContext.complete = complete;
  };
}

  /**
   * GoodBrainのjsPsych実装です。
   */
  class JSPsychGB {
    
    constructor(jsPsych) {
      this.jsPsych = jsPsych;
    }
    
    trial(display_element, trial) {
      const panelHeight = trial.panelHeight || '70vh';
      display_element.innerHTML = '<div style="height: ' + panelHeight + '; position: relative;"><div style="margin: 0; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);"><div class="eeg-container"></div></div></div>';
      $('.eeg-container')
        .append($('<div></div>')
          .append($('<span></span>')
            .addClass('eeg')))
        .append($('<div></div>')
          .append($('<span></span>')
            .addClass('eeg-notice-ok eeg-preparation')
            .text('そのままの姿勢を維持してください。')
            .hide()))
        .append($('<div></div>')
          .append($('<span></span>')
            .addClass('eeg-notice-ng eeg-preparation')
            .text('身体をできるだけ動かさないでください。')))
        .append($('<div></div>')
          .addClass('eeg-preparation')
          .append($('<svg width="700pt" height="700pt" version="1.1" viewBox="0 0 700 700" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><g><path d="m613.2 232.97c0-29.863-15.953-57.562-42.105-73.879-13.883-56.766-67.441-97.234-130.17-97.234-15.094 0-29.824 2.3398-43.938 6.9766-17.5-16.527-41.059-25.816-66.207-25.816-29.055 0-56.609 12.965-74.238 34.41-3.9102-0.46484-7.8398-0.69922-11.762-0.69922-42.582 0-79.012 26.512-90.277 64.32-37.43 12.254-62.797 45.406-62.797 83.582 0 11.316 2.3281 22.605 6.793 33.078-4.457 10.477-6.793 21.766-6.793 33.074 0 32.832 18.844 62.484 49.359 77.984 17.516 16.492 41.523 25.898 66.309 25.898 15.832 0 31.012-3.6328 44.633-10.629 17.672 19.355 43.77 30.918 71.211 30.918 17.109 0 33.422-4.2383 47.836-12.348 15.961 11.691 35.016 19.227 55.105 21.688 33.863 33.98 59.852 77.879 60.109 78.34l8.5391 14.543 42.887-30.742-23.871-68.426c13.445-6.2266 24.574-16.414 31.617-29.18 29.293-15.547 47.945-45.305 47.945-77.254 0-7.1641-0.90234-14.23-2.6836-21.105 14.398-15.938 22.496-36.402 22.496-57.5zm-85.629 130.34-5.3438 2.4414-2.3633 5.3828c-4.957 11.273-15.688 19.512-28.684 22.055l-17.449 3.3984 22.758 65.234c-12.438-17.969-31.062-42.516-52.723-63.398l-4.0078-3.8594-5.543-0.41016c-13.242-0.98047-25.945-4.9609-37.102-11.355l44.34-35.043c11.547-9.1328 27.109-13.109 32.352-11.703l20.324 5.4023 7.6328-28.762-20.328-5.3984c-17.863-4.7617-43.445 5.2812-58.43 17.121l-49.797 39.34-0.11719-0.11328-10.203 7.5898c-11.344 8.457-24.371 12.93-38.988 12.93-20.871 0-40.164-9.7148-51.363-25.484v-44.609c0-11.938 5.5547-23.34 8.832-25.316l16.625-10.27-16.129-26.348-17.051 10.258c-7.9805 4.8203-14.152 13.355-18.266 22.922-3.4609-3.1914-7.1953-6.0352-11.098-8.4062l-49.879-30.234-15.977 26.336 49.168 30.234c11.945 7.2422 20.176 22.98 20.176 32.211v19.816c-11.199 5.6094-20.43 8.5977-32.266 8.5977-17.594 0-34.184-6.8438-46.098-18.754l-1.707-1.8828-2.3203-1.1367c-21.055-9.9922-34.094-29.656-34.094-51.32 0-9.0117 2.2461-17.656 6.6289-25.711l4.0195-7.3711-4.0078-7.3633c-4.3789-8.0352-6.6016-16.684-6.6016-25.703 0-26.773 19.824-49.852 48.199-56.117l10.078-2.2305 1.7695-10.168c4.8984-28.156 31.07-48.59 62.234-48.59 5.0781 0 10.188 0.57031 15.176 1.7031l10.555 2.3867 5.8242-9.1211c11.285-17.684 32.148-28.672 54.449-28.672 14.449 0 28.035 4.4648 39.031 12.477l-11.453 10.684-0.19531-0.21094-8.0234 7.4805c-10.801 8.2656-24.035 12.605-29.082 11.844l-21.836-3.2891-4.5742 30.457 21.816 3.2812c0.72656 0.11328 1.5078 0.10156 2.25 0.16406-3.5234 11.004-4.7891 22.734-3.0078 33.113l5.0234 29.266 30.359-5.2188-5.0234-29.262c-1.8945-11.027 3.6797-27.875 11.711-35.352l12.621-11.781c1.7344-1.3711 3.3828-2.7617 4.8906-4.1602l24.168-22.551c13.133-5.3555 27.07-8.1016 41.453-8.1016 50.449 0 93.09 33.273 101.39 79.121l1.3438 7.4375 6.6992 3.4844c19.75 10.27 32.031 29.535 32.031 50.277 0 10.863-3.3086 21.203-9.3906 30.195l-4.7812-4.7812h0.003906l-19.953-19.953c-8.6758-8.668-17.543-27.855-19-41.047l-3.293-29.977-29.562 3.2461 3.293 29.977c0.94141 8.5977 3.8516 18.328 7.8359 27.703-1.9766-0.24219-3.9492-0.50391-5.8477-0.59375l-66.895-3.1836-1.418 29.715 66.938 3.168c13.699 0.64844 33.746 8.8125 42.074 17.129l15.871 15.875 0.57812 1.4297c2.4961 6.3008 3.7695 12.938 3.7695 19.695-0.015625 22.059-13.434 41.883-35.027 51.734z"/></g></svg>')
            .addClass('brain-progress')
            .css({
              width: '128px',
              height: 'auto',
            })))
        .append($('<div></div>')
          .addClass('brain-progress-container-base eeg-preparation')
          .css({
            width: '128px',
          })
          .append($('<div></div>')
            .addClass('brain-progress-container brain-round-xlarge')
            .append($('<div></div>')
              .addClass('brain-progressbar brain-round-xlarge')
              .css({
                width: '0%',
              }))))
        .append($('<div></div>')
          .addClass('eeg-value-container eeg-preparation')
          .append($('<span></span>')
            .addClass('eeg-value')));
      this.cancelBrainAnimation = animateProgress($('.brain-progress'));
      let count = 0;
      goodbrain.onEEG = (data) => {
        const valid = data
          .filter((elem) => elem.eeg)
          .every((elem) => this.isValidEEG(elem.eeg.split(';').map((value) => parseFloat(value))));
        const maxValues = data
          .filter((elem) => elem.eeg)
          .map((elem) => Math.max(...elem.eeg.split(';').map((value) => Math.abs(parseFloat(value)))));
        $(display_element).find('.eeg-value').text(Math.max(...maxValues).toFixed(2) + 'μV');
        if (!valid) {
          this.notifyEEG(trial, 'prepare-invalid', data);
          $(display_element).find('.eeg').text('計測値が不安定');
          $(display_element).find('.eeg-notice-ng').show();
          $(display_element).find('.eeg-notice-ok').hide();
          count = 0;
          return;
        }
        count ++;
        this.notifyEEG(trial, 'prepare-valid', data);
        $(display_element).find('.eeg').text('計測値が安定');
        $(display_element).find('.eeg-notice-ng').hide();
        $(display_element).find('.eeg-notice-ok').show();
        $(display_element).find('.brain-progressbar').css({
          width: parseInt((count / MAX_EEG_WAIT) * 100) + '%',
        });
        if (count < MAX_EEG_WAIT) {
          return;
        }
        $(display_element).find('.eeg-preparation').hide();
        this.cancelBrainAnimation(function() {
          $(display_element).find('.brain-progress').hide();
          $(display_element).find('.brain-progress-container').hide();
          $(display_element).find('.eeg-notice-ng').hide();
          $(display_element).find('.eeg-notice-ok').hide();
          $(display_element).find('.eeg-value').hide();
        });
        const message = $('<div></div>')
          .append($('<div></div>').html(trial.startMessage))
          .append($('<div></div>').addClass('eeg-countdown'));
        $(display_element).find('.eeg').empty().append(message);

        goodbrain.onEEG = (data) => {
          // 開始
          this.notifyEEG(trial, 'running', data);
        };
        this.updateCountDown(trial, $(display_element).find('.eeg-countdown'), Date.now());
        setTimeout(() => {
          console.log('EEG開始');
          this.jsPsych.finishTrial({
            finished: Date.now(),
            value: Math.max(...maxValues),
          });
        }, trial.startInterval);
      };
      
      $(display_element).find('.eeg').text('データ取得中');
      goodbrain.start();
    }
    
    isValidEEG(values) {
      const valid = 80; // ±80μv
      if (values.every((v) => Math.abs(v) < 0.0001)) {
        // No data
        return false;
      }
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

    updateCountDown(trial, element, start) {
      setTimeout(
        () => {
          const remainMin = (start + trial.startInterval - Date.now()) / 1000;
          if (remainMin < 0) {
            element.text('');
            return;
          }
          element.text(parseInt(remainMin).toString() + ' 秒後に開始します。');
          this.updateCountDown(trial, element, start);
        },
        100
      );
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