/**
 * EmotionBlock - Custom EditorJS Block
 *
 * A custom block that allows users to express emotions within their content.
 * Displays an emotion picker and renders emotion badges with colors.
 */

/**
 * EmotionBlock Tool for EditorJS
 *
 * @typedef {object} EmotionBlockData
 * @property {string} emotion - Selected emotion name
 * @property {string} color - Selected emotion color
 * @property {string} text - Optional text content
 */
export default class EmotionBlock {
  /**
   * EditorJS Tool configuration
   */
  static get toolbox() {
    return {
      title: 'Emotion',
      icon: '😊',
    };
  }

  /**
   * Allow EmotionBlock to be converted to/from other blocks
   */
  static get conversionConfig() {
    return {
      export: (data) => data.text || '',
      import: (string) => {
        return {
          emotion: 'joy',
          color: 'yellow',
          text: string,
        };
      },
    };
  }

  /**
   * Emotions configuration
   */
  static get EMOTIONS() {
    return [
      { name: 'Joy', color: 'yellow', icon: '😊' },
      { name: 'Trust', color: 'lime', icon: '🤝' },
      { name: 'Feared', color: 'green', icon: '😨' },
      { name: 'Surprised', color: 'aqua', icon: '😲' },
      { name: 'Sad', color: 'blue', icon: '😢' },
      { name: 'Disgust', color: 'pink', icon: '🤢' },
      { name: 'Angry', color: 'red', icon: '😠' },
      { name: 'Anticipated', color: 'orange', icon: '🤔' },
    ];
  }

  /**
   * Constructor
   * @param {object} config - Tool config from EditorJS
   * @param {EmotionBlockData} config.data - Previously saved data
   * @param {object} config.api - EditorJS API
   * @param {boolean} config.readOnly - Read-only mode flag
   */
  constructor({ data, api, readOnly }) {
    this.api = api;
    this.readOnly = readOnly;

    // Initialize data with defaults
    this.data = {
      emotion: data.emotion || 'joy',
      color: data.color || 'yellow',
      text: data.text || '',
    };

    // Create DOM wrapper
    this.wrapper = null;
    this.emotionPicker = null;
    this.textInput = null;
  }

  /**
   * Render the tool's UI
   * @returns {HTMLElement}
   */
  render() {
    this.wrapper = document.createElement('div');
    this.wrapper.classList.add('emotion-block');

    // Create emotion badge
    const badge = this.createBadge();
    this.wrapper.appendChild(badge);

    // Create text input (if not read-only)
    if (!this.readOnly) {
      this.textInput = document.createElement('input');
      this.textInput.type = 'text';
      this.textInput.classList.add('emotion-block__input');
      this.textInput.placeholder = 'Add a note about this emotion...';
      this.textInput.value = this.data.text;
      this.textInput.addEventListener('input', (e) => {
        this.data.text = e.target.value;
      });
      this.wrapper.appendChild(this.textInput);
    } else if (this.data.text) {
      // Display text in read-only mode
      const textDisplay = document.createElement('p');
      textDisplay.classList.add('emotion-block__text');
      textDisplay.textContent = this.data.text;
      this.wrapper.appendChild(textDisplay);
    }

    // Create emotion picker (if not read-only)
    if (!this.readOnly) {
      this.emotionPicker = this.createEmotionPicker();
      this.wrapper.appendChild(this.emotionPicker);
    }

    return this.wrapper;
  }

  /**
   * Create emotion badge display
   * @returns {HTMLElement}
   */
  createBadge() {
    const badge = document.createElement('div');
    badge.classList.add('emotion-block__badge');
    badge.dataset.emotion = this.data.emotion.toLowerCase();

    const currentEmotion = EmotionBlock.EMOTIONS.find(
      (e) => e.name.toLowerCase() === this.data.emotion.toLowerCase()
    ) || EmotionBlock.EMOTIONS[0];

    badge.innerHTML = `
      <span class="emotion-block__icon">${currentEmotion.icon}</span>
      <span class="emotion-block__name">${currentEmotion.name}</span>
    `;

    return badge;
  }

  /**
   * Create emotion picker UI
   * @returns {HTMLElement}
   */
  createEmotionPicker() {
    const picker = document.createElement('div');
    picker.classList.add('emotion-block__picker');

    const title = document.createElement('div');
    title.classList.add('emotion-block__picker-title');
    title.textContent = 'Select Emotion:';
    picker.appendChild(title);

    const grid = document.createElement('div');
    grid.classList.add('emotion-block__picker-grid');

    EmotionBlock.EMOTIONS.forEach((emotion) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.classList.add('emotion-block__picker-button');
      button.dataset.emotion = emotion.name.toLowerCase();

      if (emotion.name.toLowerCase() === this.data.emotion.toLowerCase()) {
        button.classList.add('emotion-block__picker-button--active');
      }

      button.innerHTML = `
        <span class="emotion-block__picker-icon">${emotion.icon}</span>
        <span class="emotion-block__picker-name">${emotion.name}</span>
      `;

      button.addEventListener('click', () => {
        this.selectEmotion(emotion.name.toLowerCase(), emotion.color);
      });

      grid.appendChild(button);
    });

    picker.appendChild(grid);
    return picker;
  }

  /**
   * Select an emotion
   * @param {string} emotion - Emotion name
   * @param {string} color - Emotion color
   */
  selectEmotion(emotion, color) {
    this.data.emotion = emotion;
    this.data.color = color;

    // Update badge
    const badge = this.wrapper.querySelector('.emotion-block__badge');
    if (badge) {
      badge.dataset.emotion = emotion;
      const currentEmotion = EmotionBlock.EMOTIONS.find(
        (e) => e.name.toLowerCase() === emotion
      );
      if (currentEmotion) {
        badge.innerHTML = `
          <span class="emotion-block__icon">${currentEmotion.icon}</span>
          <span class="emotion-block__name">${currentEmotion.name}</span>
        `;
      }
    }

    // Update picker active state
    const buttons = this.emotionPicker.querySelectorAll('.emotion-block__picker-button');
    buttons.forEach((btn) => {
      if (btn.dataset.emotion === emotion) {
        btn.classList.add('emotion-block__picker-button--active');
      } else {
        btn.classList.remove('emotion-block__picker-button--active');
      }
    });
  }

  /**
   * Save data
   * @returns {EmotionBlockData}
   */
  save() {
    return {
      emotion: this.data.emotion,
      color: this.data.color,
      text: this.data.text,
    };
  }

  /**
   * Validate data before saving
   * @param {EmotionBlockData} blockData - Data to validate
   * @returns {boolean}
   */
  validate(blockData) {
    return blockData.emotion && blockData.color;
  }

  /**
   * Sanitizer rules for paste handling
   * @returns {object}
   */
  static get sanitize() {
    return {
      emotion: false,
      color: false,
      text: true,
    };
  }
}
